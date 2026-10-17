import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  b64u,
  bearerOk,
  encrypt,
  fromB64u,
  generateVapidKeys,
  parseJobs,
  parseSubscription,
  pushEnv,
  sendPush,
  vapidHeaders,
} from "./webpush";

const hmac = (k: Uint8Array, d: Uint8Array) => createHmac("sha256", k).update(d).digest();
const hkdf = (salt: Uint8Array, ikm: Uint8Array, info: string | Buffer, len: number) =>
  hmac(hmac(salt, ikm), Buffer.concat([Buffer.from(info), Buffer.from([1])])).subarray(0, len);

/** The browser's side of RFC 8291: decrypt a single-record aes128gcm message. */
function decrypt(msg: Buffer, uaPrivate: Buffer, authSecret: Buffer): Buffer {
  const salt = msg.subarray(0, 16);
  const rs = msg.readUInt32BE(16);
  const idlen = msg[20];
  const asPublic = msg.subarray(21, 21 + idlen);
  const record = msg.subarray(21 + idlen);
  expect(rs).toBe(4096);
  expect(record.length).toBeLessThanOrEqual(rs);

  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPublic);
  const ikm = hkdf(authSecret, secret, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16);
  const nonce = hkdf(salt, ikm, "Content-Encoding: nonce\0", 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([d.update(record.subarray(0, record.length - 16)), d.final()]);
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  expect(padded[end]).toBe(2); // last-record delimiter
  return padded.subarray(0, end);
}

function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { priv: ecdh.getPrivateKey(), p256dh: b64u(ecdh.getPublicKey()), auth: randomBytes(16) };
}

describe("VAPID", () => {
  it("generates raw base64url keys", () => {
    const k = generateVapidKeys();
    expect(fromB64u(k.publicKey)).toHaveLength(65);
    expect(fromB64u(k.publicKey)[0]).toBe(4);
    expect(fromB64u(k.privateKey)).toHaveLength(32);
  });

  it("signs an ES256 JWT that verifies with the public key", () => {
    const k = generateVapidKeys();
    const now = Date.UTC(2026, 9, 17, 12);
    const { Authorization } = vapidHeaders("https://fcm.googleapis.com/fcm/send/abc", "mailto:me@example.com", k.publicKey, k.privateKey, 99 * 3600, now);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(Authorization);
    expect(m).not.toBeNull();
    const [jwt, pub] = [m![1], m![2]];
    expect(pub).toBe(k.publicKey);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(fromB64u(h).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(fromB64u(p).toString());
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:me@example.com");
    expect(claims.exp).toBe(now / 1000 + 24 * 3600); // capped at 24 h

    const raw = fromB64u(pub);
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) },
      format: "jwk",
    });
    const sig = fromB64u(s);
    expect(sig).toHaveLength(64);
    expect(verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
    expect(verify("sha256", Buffer.from(`${h}.${p}x`), { key, dsaEncoding: "ieee-p1363" }, sig)).toBe(false);
  });
});

describe("aes128gcm encryption", () => {
  it("round-trips through a browser-side decrypt", () => {
    const b = browserKeys();
    const plain = Buffer.from(JSON.stringify({ title: "Fast & Move", body: "Halfway through your 16:8 fast." }));
    const msg = encrypt(plain, b.p256dh, b64u(b.auth));
    expect(decrypt(msg, b.priv, b.auth).toString()).toBe(plain.toString());
    // A fresh salt and ephemeral key every time.
    expect(encrypt(plain, b.p256dh, b64u(b.auth)).equals(msg)).toBe(false);
  });

  it("fails to decrypt with the wrong auth secret", () => {
    const b = browserKeys();
    const msg = encrypt(Buffer.from("hi"), b.p256dh, b64u(b.auth));
    expect(() => decrypt(msg, b.priv, randomBytes(16))).toThrow();
  });

  it("rejects oversized payloads", () => {
    const b = browserKeys();
    expect(() => encrypt(Buffer.alloc(4000), b.p256dh, b64u(b.auth))).toThrow();
    expect(() => encrypt(Buffer.alloc(3993), b.p256dh, b64u(b.auth))).not.toThrow();
  });

  it("reproduces the RFC 8291 §5 example", () => {
    const msg = encrypt(
      Buffer.from("When I grow up, I want to be a watermelon"),
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      "BTBZMqHH6r4Tts7J_aSIgg",
      { salt: fromB64u("DGv6ra1nlYgDCS1FRnbzlw"), senderPrivate: fromB64u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") },
    );
    expect(b64u(msg)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
    // And the receiver side of the same example decrypts it.
    const plain = decrypt(msg, fromB64u("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"), fromB64u("BTBZMqHH6r4Tts7J_aSIgg"));
    expect(plain.toString()).toBe("When I grow up, I want to be a watermelon");
  });
});

describe("sendPush", () => {
  const vapid = { subject: "mailto:me@example.com", ...generateVapidKeys() };

  it("POSTs an encrypted body with the push headers", async () => {
    const b = browserKeys();
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const sub = { endpoint: "https://web.push.apple.com/QGuQyavXutnMH", keys: { p256dh: b.p256dh, auth: b64u(b.auth) } };
    const r = await sendPush(sub, { title: "T", body: "B", tag: "fast-1-target", url: "/fast" }, vapid, 600, fake);
    expect(r).toEqual({ status: 201, gone: false });
    expect(seen!.url).toBe(sub.endpoint);
    const h = seen!.init.headers as Record<string, string>;
    expect(h["Content-Encoding"]).toBe("aes128gcm");
    expect(h.TTL).toBe("600");
    expect(h.Urgency).toBe("high");
    expect(h.Authorization).toMatch(/^vapid t=.+, k=/);
    const body = Buffer.from(seen!.init.body as Uint8Array);
    expect(JSON.parse(decrypt(body, b.priv, b.auth).toString())).toEqual({ title: "T", body: "B", tag: "fast-1-target", url: "/fast" });
  });

  it("flags 404 and 410 as gone", async () => {
    const b = browserKeys();
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: b.p256dh, auth: b64u(b.auth) } };
    for (const [status, gone] of [[404, true], [410, true], [429, false]] as const) {
      const fake = (async () => new Response(null, { status })) as unknown as typeof fetch;
      expect(await sendPush(sub, { title: "a", body: "b" }, vapid, 60, fake)).toEqual({ status, gone });
    }
  });
});

describe("validation", () => {
  const b = browserKeys();
  const keys = { p256dh: b.p256dh, auth: b64u(b.auth) };

  it("accepts push-service https endpoints only", () => {
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "https://web.push.apple.com/abc", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "http://fcm.googleapis.com/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://evil.example/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com.evil.example/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, auth: "not base64!" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, auth: "AAAA" } })).toBeNull();
  });

  it("checks jobs", () => {
    const now = Date.UTC(2026, 9, 17);
    const job = { fastId: "a1-b2", kind: "target", sendAt: new Date(now + 3600_000).toISOString(), title: "Fast & Move", body: "Target reached: 16 h." };
    expect(parseJobs([job], now)).toHaveLength(1);
    expect(parseJobs([], now)).toEqual([]);
    expect(parseJobs(Array(11).fill(job), now)).toBeNull();
    expect(parseJobs([{ ...job, kind: "other" }], now)).toBeNull();
    expect(parseJobs([{ ...job, sendAt: new Date(now + 8 * 86400_000).toISOString() }], now)).toBeNull();
    expect(parseJobs([{ ...job, sendAt: new Date(now - 3600_000).toISOString() }], now)).toBeNull();
    expect(parseJobs([{ ...job, body: "x".repeat(121) }], now)).toBeNull();
    expect(parseJobs([{ ...job, fastId: "a/../b" }], now)).toBeNull();
  });

  it("reads env and checks the cron secret", () => {
    expect(pushEnv({})).toBeNull();
    const env = {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
      VAPID_PRIVATE_KEY: "priv",
      VAPID_SUBJECT: "mailto:a@b.c",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: "svc",
    };
    expect(pushEnv(env)?.supabaseUrl).toBe("https://x.supabase.co");
    expect(bearerOk("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerOk("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerOk("Bearer ", "")).toBe(false);
    expect(bearerOk(null, "s3cret")).toBe(false);
  });
});

describe("reminder schedule (client)", async () => {
  const { reminderJobs } = await import("@/client/push");
  const notifications = { halfway: true, target: true, windowClosing: true, sound: true, voice: false, vibrate: true };
  const settings = { notifications } as Parameters<typeof reminderJobs>[1];
  const base = { createdAt: "", updatedAt: "", remindersFired: [] };
  const start = Date.UTC(2026, 9, 17, 20);
  const active = { ...base, id: "f1", protocol: "16:8" as const, targetHours: 16, startAt: new Date(start).toISOString(), status: "active" as const };

  it("schedules halfway and target for a running fast", () => {
    const jobs = reminderJobs([active], settings, start + 60_000);
    expect(jobs.map((j) => [j.kind, j.sendAt])).toEqual([
      ["halfway", new Date(start + 8 * 3600_000).toISOString()],
      ["target", new Date(start + 16 * 3600_000).toISOString()],
    ]);
    expect(jobs[0].body).toBe("Halfway through your 16:8 fast.");
    // Past ones are dropped, toggles are respected.
    expect(reminderJobs([active], settings, start + 9 * 3600_000).map((j) => j.kind)).toEqual(["target"]);
    expect(reminderJobs([active], { notifications: { ...notifications, target: false } } as typeof settings, start).map((j) => j.kind)).toEqual(["halfway"]);
  });

  it("schedules the window-closing reminder after a fast ends", () => {
    const end = start + 16 * 3600_000;
    const ended = { ...active, id: "f0", status: "completed" as const, endAt: new Date(end).toISOString() };
    const jobs = reminderJobs([null, ended], settings, end);
    expect(jobs).toEqual([
      { fastId: "f0", kind: "window", sendAt: new Date(end + 7.5 * 3600_000).toISOString(), title: "Fast & Move", body: "Eating window closes in 30 min." },
    ]);
    expect(reminderJobs([{ ...ended, protocol: "36h", targetHours: 36 }], settings, end)).toEqual([]);
    expect(reminderJobs([ended], { notifications: { ...notifications, windowClosing: false } } as typeof settings, end)).toEqual([]);
  });

  it("skips anything more than 7 days out", () => {
    const long = { ...active, protocol: "custom" as const, targetHours: 400 };
    expect(reminderJobs([long], settings, start).map((j) => j.kind)).toEqual([]);
  });
});
