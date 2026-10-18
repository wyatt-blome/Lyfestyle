-- Fast & Move optional sync (Phase 4). Run once in the Supabase SQL editor.
-- One table holds every synced record as JSON. Row-level security limits each signed-in user to
-- their own rows. Deletes are soft (deleted_at), so there is no delete policy.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default now(),
  primary key (user_id, tbl, id)
);

-- The pull pages in (synced_at, tbl, id) order, so ties on synced_at can't repeat a page.
drop index if exists public.records_user_synced;
create index if not exists records_user_synced_tbl_id on public.records (user_id, synced_at, tbl, id);

alter table public.records enable row level security;

drop policy if exists "own rows: read" on public.records;
create policy "own rows: read" on public.records for select using (auth.uid() = user_id);
drop policy if exists "own rows: insert" on public.records;
create policy "own rows: insert" on public.records for insert with check (auth.uid() = user_id);
drop policy if exists "own rows: update" on public.records;
create policy "own rows: update" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Last write wins on the record's own updatedAt; an older write never replaces a newer one.
-- synced_at is the server's clock, used as the pull cursor.
create or replace function public.records_lww() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists records_lww on public.records;
create trigger records_lww before insert or update on public.records
for each row execute function public.records_lww();
