// Scheduled every 5 minutes (vercel.json). Two jobs:
//   1. Close any shift open 12+ hours at the 12-hour cap, marked NEEDS REVIEW
//      (payroll stops on it until someone confirms the real end time).
//   2. Retry any agent.care@ email that has not gone out yet.
// Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled runs.
import { db } from "./_lib/supa.js";
import { drainOutbox } from "./_lib/notify.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (process.env.CLOCK_SWEEP_ENABLED !== "1") {
    return res.status(200).json({ skipped: "CLOCK_SWEEP_ENABLED is not 1" });
  }

  const cutoff = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const stale = await db.get(`clock_status?start_time=lte.${encodeURIComponent(cutoff)}&select=user_id,start_time,session_id,profiles(name)`);
  const devices = await db.get("clock_people?select=profile_id,display_name,worker_name,role");
  const byProfile = new Map((devices || []).map((d) => [d.profile_id, d]));

  const closed = [];
  const errors = [];
  for (const s of stale || []) {
    const d = byProfile.get(s.user_id);
    try {
      const result = await db.rpc("clock_out", {
        p_user: s.user_id,
        p_worker: d?.worker_name || s.profiles?.name,
        p_display: d?.display_name || (s.profiles?.name || "Someone").split(" ")[0],
        p_request_id: null,
        p_category: "Admin",
        p_description: "Shift closed automatically at the 12-hour cap (needs review)",
        p_reason: "auto",
        p_notify: !d || d.role === "worker",
        p_expected_session: s.session_id, // never a newer shift than the one we saw
        p_at: null,
      });
      closed.push({ user_id: s.user_id, result });
    } catch (err) {
      errors.push({ user_id: s.user_id, error: String(err.message || err) });
    }
  }

  const email = await drainOutbox(25).catch((err) => ({ error: String(err.message || err) }));
  return res.status(200).json({ closed, errors, email });
}
