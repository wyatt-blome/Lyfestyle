-- Fast & Move: background reminders (web push). Run once in the Supabase SQL editor.
-- Before running, replace the two placeholders near the bottom:
--   https://YOUR-APP.vercel.app   your deployed app URL
--   YOUR_PUSH_CRON_SECRET         the same value as the PUSH_CRON_SECRET env var in Vercel
-- Safe to re-run.

-- ---------- Tables ----------

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_jobs (
  id         bigint generated always as identity primary key,
  endpoint   text not null references public.push_subscriptions (endpoint) on delete cascade,
  fast_id    text not null,
  kind       text not null check (kind in ('halfway', 'target', 'window')),
  send_at    timestamptz not null,
  title      text not null check (char_length(title) <= 120),
  body       text not null check (char_length(body) <= 120),
  tag        text not null,
  url        text not null default '/fast',
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The dispatcher's query: unsent jobs that are due.
create index if not exists push_jobs_due on public.push_jobs (send_at) where sent_at is null;
create index if not exists push_jobs_endpoint on public.push_jobs (endpoint);

-- Only the service role (used by /api/push/* on the server) may touch these tables: RLS on, no
-- policies, and no grants for the browser-facing roles.
alter table public.push_subscriptions enable row level security;
alter table public.push_jobs enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_jobs from anon, authenticated;

-- ---------- Every-minute trigger (pg_cron + pg_net) ----------
-- Calls /api/push/dispatch once a minute, but only when a job is due, so the app is only woken
-- when there is something to send.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('fast-move-push-dispatch')
where exists (select 1 from cron.job where jobname = 'fast-move-push-dispatch');

select cron.schedule(
  'fast-move-push-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/push/dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_PUSH_CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (select 1 from public.push_jobs where sent_at is null and send_at <= now());
  $$
);

-- To stop it:  select cron.unschedule('fast-move-push-dispatch');
-- To see runs: select * from cron.job_run_details order by start_time desc limit 20;
--              select * from net._http_response order by created desc limit 20;
