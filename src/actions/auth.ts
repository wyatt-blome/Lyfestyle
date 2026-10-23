"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { DEFAULT_SETTINGS } from "@/db/schema";
import { endSession, hashPassword, newInviteCode, startSession, verifyPassword } from "@/server/auth";

export interface FormState {
  error?: string;
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(8, "Use at least 8 characters for the password.");

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "That email and password don't match." };
  }
  await startSession(user.id);
  redirect("/");
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter your name.").max(60),
      email,
      password,
      mode: z.enum(["create", "join"]),
      householdName: z.string().trim().max(60).optional(),
      inviteCode: z.string().trim().toUpperCase().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const data = parsed.data;
  const db = await getDb();
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, data.email)).limit(1);
  if (taken) return { error: "There's already an account with that email. Sign in instead." };

  let householdId: string;
  if (data.mode === "join") {
    const code = (data.inviteCode ?? "").replace(/[^A-Z0-9]/g, "");
    const formatted = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    const [household] = await db.select().from(schema.households).where(eq(schema.households.inviteCode, formatted)).limit(1);
    if (!household) return { error: "That invite code wasn't found. Ask a household member for the code in Household settings." };
    householdId = household.id;
  } else {
    const [household] = await db
      .insert(schema.households)
      .values({
        name: data.householdName || `${data.name}'s household`,
        inviteCode: newInviteCode(),
        settings: DEFAULT_SETTINGS,
      })
      .returning();
    householdId = household.id;
  }
  const [user] = await db
    .insert(schema.users)
    .values({ householdId, email: data.email, name: data.name, passwordHash: await hashPassword(data.password) })
    .returning();
  await startSession(user.id);
  redirect(data.mode === "create" ? "/recipes/new?welcome=1" : "/");
}

export async function signOut() {
  await endSession();
  redirect("/signin");
}
