// Web Push sender (server only). VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291 +
// RFC 8188) with node:crypto, so no dependency. Also the small helpers the /api/push routes share:
// env config, input validation and a PostgREST client for the Supabase tables in supabase/push.sql.
import {
  createECDH,
  createCipheriv,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";

// ---------- base64url ----------

export function b64u(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

export function fromB64u(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

const B64U = /^[A-Za-z0-9_-]+={0,2}$/;

// ---------- VAPID (RFC 8292) ----------

export interface VapidKeys {
  /** 65-byte uncompressed P-256 point, base64url. */
  publicKey: string;
  /** 32-byte private scalar d, base64url. */
  privateKey: string;
}

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(padTo32(ecdh.getPrivateKey())) };
}

function padTo32(d: Buffer): Buffer {
  return d.length >= 32 ? d : Buffer.concat([Buffer.alloc(32 - d.length), d]);
}

/** A KeyObject for the raw private scalar (the public point is derived from it). */
function privateKeyObject(privateKeyB64u: string): KeyObject {
  const d = fromB64u(privateKeyB64u);
  if (d.length !== 32) throw new Error("VAPID private key must be 32 bytes (base64url).");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
}

const MAX_EXP_S = 24 * 3600;

/** `Authorization: vapid t=<jwt>, k=<public key>` for a push endpoint. `expSeconds` is capped at 24 h. */
export function vapidHeaders(
  endpoint: string,
  subject: string,
  publicKeyB64u: string,
  privateKeyB64u: string,
  expSeconds = 12 * 3600,
  nowMs = Date.now(),
): { Authorization: string } {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(nowMs / 1000) + Math.max(60, Math.min(MAX_EXP_S, Math.floor(expSeconds)));
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(Buffer.from(JSON.stringify({ aud, exp, sub: subject })));
  const input = `${header}.${payload}`;
  const sig = sign("sha256", Buffer.from(input), { key: privateKeyObject(privateKeyB64u), dsaEncoding: "ieee-p1363" });
  return { Authorization: `vapid t=${input}.${b64u(sig)}, k=${publicKeyB64u}` };
}

// ---------- aes128gcm payload encryption (RFC 8291) ----------

export const RECORD_SIZE = 4096;
/** Largest plaintext that fits one 4096-byte record with an 86-byte header (RFC 8291 §4). */
export const MAX_PLAINTEXT = 3993;

function hmac(key: Uint8Array, data: Uint8Array): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** HKDF with a single output block (all lengths here are ≤ 32 bytes). */
function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len);
}

export interface EncryptOptions {
  /** Testing only: fixed 16-byte salt and sender (application server) private key. */
  salt?: Uint8Array;
  senderPrivate?: Uint8Array;
}

/**
 * Encrypts `plaintext` for a subscription: header (salt ‖ rs ‖ idlen ‖ keyid) followed by one
 * AES-128-GCM record holding the plaintext and the 0x02 last-record delimiter.
 */
export function encrypt(
  plaintext: Uint8Array,
  uaPublicB64u: string,
  authSecretB64u: string,
  opts: EncryptOptions = {},
): Buffer {
  if (plaintext.length > MAX_PLAINTEXT) throw new Error("Push payload too large.");
  const uaPublic = fromB64u(uaPublicB64u);
  const authSecret = fromB64u(authSecretB64u);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("p256dh must be an uncompressed P-256 point.");
  if (authSecret.length !== 16) throw new Error("auth must be 16 bytes.");

  const ecdh = createECDH("prime256v1");
  if (opts.senderPrivate) ecdh.setPrivateKey(opts.senderPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ? Buffer.from(opts.salt) : randomBytes(16);

  // RFC 8291 §3.4: combine the ECDH secret with the auth secret, then derive CEK and nonce (RFC 8188).
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// ---------- Sending ----------

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export interface SendResult {
  status: number;
  /** The subscription no longer exists (404/410): delete it. */
  gone: boolean;
}

/** Default per-request timeout. Short enough that a black-holed endpoint can't eat a cron run. */
export const PUSH_TIMEOUT_MS = 8000;

export interface SendOptions {
  /** Per-request timeout (default `PUSH_TIMEOUT_MS`). */
  timeoutMs?: number;
  /** Aborts the request early, e.g. at the dispatcher's overall deadline. */
  signal?: AbortSignal;
}

export async function sendPush(
  sub: PushSubscriptionJSON,
  payload: PushPayload | Record<string, unknown>,
  vapid: VapidConfig,
  ttlSeconds = 3600,
  doFetch: typeof fetch = fetch,
  opts: SendOptions = {},
): Promise<SendResult> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? PUSH_TIMEOUT_MS);
  const body = encrypt(Buffer.from(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth);
  const res = await doFetch(sub.endpoint, {
    method: "POST",
    headers: {
      ...vapidHeaders(sub.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(Math.max(0, Math.floor(ttlSeconds))),
      Urgency: "high",
    },
    body: new Uint8Array(body),
    cache: "no-store",
    signal: opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout,
  });
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}

// ---------- Route helpers: config ----------

export const PUSH_NOT_SET_UP = "Push isn't set up";

/** Apple's push service rejects any other VAPID `sub` claim (RFC 8292 §2.1 allows only these). */
export function validVapidSubject(subject: string): boolean {
  return /^mailto:\S+@\S+$/i.test(subject) || /^https:\/\/\S+$/i.test(subject);
}

export const BAD_VAPID_SUBJECT = 'VAPID_SUBJECT must start with "mailto:" (e.g. mailto:you@example.com) or "https:".';

/** Why `pushEnv` returned null, in words for the server log and a 503 body; null when it's fine. */
export function pushSetupProblem(env: Record<string, string | undefined> = process.env): string | null {
  const missing = [
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((k) => !env[k]?.trim());
  if (missing.length) return `${PUSH_NOT_SET_UP}: missing ${missing.join(", ")}.`;
  if (!validVapidSubject(env.VAPID_SUBJECT!.trim())) return `${PUSH_NOT_SET_UP}: ${BAD_VAPID_SUBJECT}`;
  return null;
}

let warnedSubject = false;

export interface PushEnv {
  vapid: VapidConfig;
  supabaseUrl: string;
  serviceKey: string;
}

/**
 * Everything the push routes need, or null when any of it is missing or VAPID_SUBJECT isn't a
 * mailto:/https: URI (logged once, since the routes only answer the generic 503).
 */
export function pushEnv(env: Record<string, string | undefined> = process.env): PushEnv | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!publicKey || !privateKey || !subject || !supabaseUrl || !serviceKey) return null;
  if (!validVapidSubject(subject)) {
    if (!warnedSubject) console.error(`[push] ${PUSH_NOT_SET_UP}: ${BAD_VAPID_SUBJECT}`);
    warnedSubject = true;
    return null;
  }
  return { vapid: { publicKey, privateKey, subject }, supabaseUrl, serviceKey };
}

/** Constant-time check of `Authorization: Bearer <secret>`. False when the secret isn't configured. */
export function bearerOk(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Route helpers: validation ----------

// Only real push services, so the server can't be pointed at arbitrary URLs.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^(.+\.)?push\.apple\.com$/,
  /^(.+\.)?push\.services\.mozilla\.com$/,
  /^(.+\.)?notify\.windows\.com$/,
];

/**
 * True for a 65-byte uncompressed point that is actually on P-256: ECDH with it succeeds, so
 * `encrypt` won't throw later (e.g. 0x04 followed by 64 zero bytes is rejected here).
 */
export function validP256Point(pub: Uint8Array): boolean {
  if (pub.length !== 65 || pub[0] !== 4) return false;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    ecdh.computeSecret(pub);
    return true;
  } catch {
    return false;
  }
}

export function parseSubscription(v: unknown): PushSubscriptionJSON | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof o.endpoint !== "string" || o.endpoint.length > 1024) return null;
  let url: URL;
  try {
    url = new URL(o.endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((re) => re.test(url.hostname))) return null;
  // Default port (443) only, and no userinfo: nothing but the push service's own HTTPS front door.
  if (url.port !== "" || url.username !== "" || url.password !== "") return null;
  const p256dh = o.keys?.p256dh;
  const auth = o.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 100 || auth.length > 30) return null;
  if (!B64U.test(p256dh) || !B64U.test(auth)) return null;
  if (!validP256Point(fromB64u(p256dh)) || fromB64u(auth).length !== 16) return null;
  return { endpoint: o.endpoint, keys: { p256dh, auth } };
}

export type JobKind = "halfway" | "target" | "window";

export interface PushJobInput {
  fastId: string;
  kind: JobKind;
  sendAt: string;
  title: string;
  body: string;
}

export const MAX_JOBS = 10;
const MAX_AHEAD_MS = 7 * 24 * 3600_000;
const KINDS: JobKind[] = ["halfway", "target", "window"];

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 && v.length <= 120 ? v : null;
}

/** Validates the jobs array: ≤ 10, known kinds, send time from 1 min ago to 7 days ahead. */
export function parseJobs(v: unknown, now = Date.now()): PushJobInput[] | null {
  if (!Array.isArray(v) || v.length > MAX_JOBS) return null;
  const out: PushJobInput[] = [];
  for (const j of v as Record<string, unknown>[]) {
    if (!j || typeof j !== "object") return null;
    const fastId = typeof j.fastId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(j.fastId) ? j.fastId : null;
    const kind = KINDS.includes(j.kind as JobKind) ? (j.kind as JobKind) : null;
    const t = typeof j.sendAt === "string" ? Date.parse(j.sendAt) : NaN;
    const title = text(j.title);
    const body = text(j.body);
    if (!fastId || !kind || !title || !body || !Number.isFinite(t)) return null;
    if (t < now - 60_000 || t > now + MAX_AHEAD_MS) return null;
    out.push({ fastId, kind, sendAt: new Date(t).toISOString(), title, body });
  }
  return out;
}

export function jobTag(fastId: string, kind: string): string {
  return `fast-${fastId}-${kind}`;
}

// ---------- Route helpers: Supabase PostgREST ----------

/** fetch against `<supabase>/rest/v1/<path>` with the service-role key. Throws on non-2xx. */
export async function pg<T = unknown>(
  env: PushEnv,
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<T> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  if (res.status === 204) return undefined as T;
  const t = await res.text();
  return (t ? JSON.parse(t) : undefined) as T;
}

export const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

export const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}
