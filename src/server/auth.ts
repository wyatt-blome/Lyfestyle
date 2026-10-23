import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DEFAULT_SETTINGS, type Household, type HouseholdSettings, type User } from "@/db/schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "mp_session";
const SESSION_DAYS = 90;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startSession(userId: string) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(schema.sessions).values({ id: tokenId(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, tokenId(token)));
  }
  store.delete(COOKIE);
}

export interface Viewer {
  user: Pick<User, "id" | "name" | "email">;
  household: Household & { settings: HouseholdSettings };
}

const DEFAULT_HOUSEHOLD_ID = "default-household";
const DEFAULT_USER_ID = "default-user";

/**
 * No sign-in: everyone uses one shared household. If accounts already exist, the earliest
 * user's household is used so existing data stays visible; otherwise a default one is created.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  await connection(); // always render per request, never at build time
  const db = await getDb();
  const load = () =>
    db
      .select({ user: schema.users, household: schema.households })
      .from(schema.users)
      .innerJoin(schema.households, eq(schema.households.id, schema.users.householdId))
      .orderBy(asc(schema.users.createdAt))
      .limit(1);
  let [row] = await load();
  if (!row) {
    await db
      .insert(schema.households)
      .values({ id: DEFAULT_HOUSEHOLD_ID, name: "Our household", inviteCode: "DEFA-ULT0", settings: DEFAULT_SETTINGS })
      .onConflictDoNothing();
    await db
      .insert(schema.users)
      .values({ id: DEFAULT_USER_ID, householdId: DEFAULT_HOUSEHOLD_ID, email: "household@local", name: "Household", passwordHash: "disabled" })
      .onConflictDoNothing();
    [row] = await load();
  }
  return {
    user: { id: row.user.id, name: row.user.name, email: row.user.email },
    household: { ...row.household, settings: { ...DEFAULT_SETTINGS, ...row.household.settings } },
  };
});

/** For pages and actions: the shared default household (no sign-in). */
export async function requireViewer(): Promise<Viewer> {
  return getViewer();
}

export function newInviteCode(): string {
  // Short, unambiguous, easy to read aloud: no 0/O or 1/I/L.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
