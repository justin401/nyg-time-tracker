// Device-token auth. The token is the person: no login, no password.
// Only the sha256 of each token is stored, so the table itself is useless to a reader.
import { createHash, randomBytes } from "node:crypto";
import { db, enc } from "./supa.js";

export function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function deviceFromRequest(req) {
  const token = req.headers["x-clock-token"];
  if (!token || typeof token !== "string" || token.length < 32) return null;
  const rows = await db.get(
    `clock_devices?token_hash=eq.${hashToken(token)}&revoked_at=is.null&select=*`
  );
  const dev = rows?.[0];
  if (!dev) return null;
  // The person record is the source of truth for role and names, so taking
  // someone off /clock (active=false) or changing their role applies at once.
  const person = (await db.get(`clock_people?profile_id=eq.${enc(dev.profile_id)}&active=is.true&select=*`))?.[0];
  if (!person) return null;
  // Best effort; a failed stamp never blocks a clock action.
  db.patch(`clock_devices?id=eq.${enc(dev.id)}`, { last_used_at: new Date().toISOString() }).catch(() => {});
  return { ...person, device_id: dev.id, device_label: dev.device_label };
}

/**
 * One-time enrollment. The Mac proves who it belongs to with that person's
 * existing Command Center session (a Supabase access token), and gets back a
 * device token. No password is ever typed. Only people in clock_people qualify.
 */
export async function enroll(req, label) {
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || "");
  if (!m) return { status: 401, body: { error: "No Command Center session supplied" } };
  const base = process.env.SUPABASE_URL || "https://gdyfcqpbbehozyyjrnah.supabase.co";
  const r = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${m[1]}` },
  });
  if (!r.ok) return { status: 401, body: { error: "Command Center session was not accepted" } };
  const user = await r.json();
  const person = (await db.get(`clock_people?profile_id=eq.${enc(user.id)}&active=is.true&select=*`))?.[0];
  if (!person) return { status: 403, body: { error: "This account is not set up for /clock. Ask Justin." } };
  const deviceLabel = String(label || "Mac").slice(0, 100);
  // One locked step in the database: create the new token and retire older
  // ones for this person + Mac together.
  const token = randomBytes(32).toString("hex");
  await db.rpc("clock_enroll", { p_profile: person.profile_id, p_label: deviceLabel, p_token_hash: hashToken(token) });
  return { status: 200, body: { token, display_name: person.display_name, role: person.role } };
}
