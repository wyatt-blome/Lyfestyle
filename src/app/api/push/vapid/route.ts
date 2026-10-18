// The VAPID public key the browser subscribes with. 503 when push isn't fully configured, so the
// Settings card can say so before asking for notification permission.
import { json, PUSH_NOT_SET_UP, pushEnv } from "@/lib/webpush";

export const dynamic = "force-dynamic";

export function GET() {
  const env = pushEnv();
  if (!env) return json({ error: PUSH_NOT_SET_UP }, 503);
  return json({ publicKey: env.vapid.publicKey });
}
