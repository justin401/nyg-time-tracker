# Add Dez Mello + Refactor Worker Pay System

**Site:** https://project-management.toptierhawaii.com
**Repo:** ~/nyg-time-tracker/
**Status:** Plan — awaiting Justin's approval before implementation
**Created:** 2026-05-01

---

## Goal
Add Desmond "Dez" Mello as a paid worker on the time tracker, with weekly-overtime rate logic that doesn't exist today. In the same pass, fix Chloe's hardcoded-rate drift and the $5/hr overpayment bug latent in her post-probation rates. Add clock-in/out notifications for both workers.

## Canonical inputs (locked)
- **Chloe:** Probation Home $25 / Office $30 → Post (after 2026-07-06) Home $30 / Office $35
- Desmond: $36 straight up to 40 hrs/week, $54 OT after 40. Mon 00:00 → Sun 23:59 HST week boundary. No location split. No probation tier. (Rates revised up from $35/$52.50 in 2026-05-01 brief revision.)
- **Notifications:** Email from Cortana to sam@, raphael@, justin@teamtaparra.com on every clock-in AND clock-out, both workers. iMessage to Justin (808-349-6499) and Sam (808-778-9346) on the same events.
- April back pay for Desmond: $6,336 total (22 business days × 8 hrs × $36), one time_entries row dated 2026-04-30. Payment is split for cash flow: $2,000 on 2026-05-01, remaining $4,336 by 2026-05-31.

---

## Phase 1 — Schema + config refactor (DONE 2026-05-01)

- [x] 1.1 Add `worker_configs` rows to existing `settings` table (key/value JSON). Two entries:
  - `worker_config_chloe_mello`: `{ type: 'tiered_location', probationStart: '2026-04-07', probationDays: 90, rates: { office: { before: 30, after: 35 }, home: { before: 25, after: 30 } } }`
  - `worker_config_desmond_mello`: `{ type: 'weekly_ot', straightRate: 35, otRate: 52.50, otThreshold: 40, weekStart: 'monday', timezone: 'Pacific/Honolulu' }`
- [x] 1.2 Confirm `c_rate` column on `projects` is dead — left in place.
- [x] 1.3 New `worker_config_*` rows live; old `chloe_config` row left untouched (read via new row only). Drop old in a follow-up.
- [x] 1.4 Bonus: created `public.settings` table itself (didn't exist — AdminTools.jsx had been silently failing).

## Phase 2 — Pay calculation engine (DONE 2026-05-01)

- [x] 2.1 `src/lib/workerPay.js` — engine with `loadWorkerConfigs`, `getEntryRate`, `calcWorkerPay`, weekly OT bucketing, lump-sum support, HST-aware Monday week-key.
- [x] 2.2 Replaced `getChloeRate`/`getRate` callsites in TimeTracker.jsx and AdminPanel.jsx. DashboardWidgets/InvoiceWidgets already accepted getRate as a prop, no internal change needed.
- [x] 2.3 AdminPanel summary now uses `calcWorkerPay` per-worker so Desmond's weekly OT bucket math works correctly.
- [x] 2.4 Verified Chloe's post-probation calc: now $30 home / $35 office (was buggy $35 / $40).

## Phase 2.5 — Desmond project scoping (DONE 2026-05-01)

- [x] 2.5.1 Created `Agent Care - Desmond Mello` project (id `b134954f-16ca-4a0e-86ff-63210acb0895`).
- [x] 2.5.2 Added `DESMOND_PROJECT_ID` constant; load logic forces Desmond to his project, hides project switcher, defaults forms to "Desmond Mello", shows "Team Taparra" branding.
- [x] 2.5.3 Deployed to prod via `vercel --prod`.

## Phase 2 — Pay calculation engine (original checklist, superseded by DONE entries above)

- [x] 2.1 New file `src/lib/workerPay.js`:
  - `getWorkerConfig(workerName, settings)` — pulls config row
  - `calcChloePay(entries, config)` — per-entry rate via location + probation date logic
  - `calcDezPay(entries, config)` — bucket entries by ISO week (Mon-Sun HST), first 40 hrs at straight, remainder at OT. Returns `{ regularHours, otHours, regularPay, otPay, totalPay }` per week
  - `calcWorkerPay(workerName, entries, config)` — dispatches by `config.type`
- [x] 2.2 Replaced callsites in TimeTracker.jsx and AdminPanel.jsx. DashboardWidgets/InvoiceWidgets already accepted getRate as a prop, no internal change.
- [ ] 2.3 Pay reports (PDF export in `AdminPanel.jsx`) — add explicit "Overtime" line for Desmond. Currently summary shows `regularHours/otHours/regularPay/otPay` correctly via `calcWorkerPay`, but PDF still uses per-entry rate × hours sum which under-counts Desmond's OT in reports. Future ship.
- [x] 2.4 Verified Chloe's post-probation calc against canonical rates ($30 home / $35 office). Engine reads from `worker_config_chloe_mello`.

## Phase 3 — Roster updates

- [ ] **3.1** `WORKERS` array in `AdminPanel.jsx`: append `"Desmond Mello"`
- [ ] **3.2** Grep `"Chloe Mello"` across `src/` — for each match, decide: is this worker-specific (keep Chloe-only) or roster-general (add Dez branch)?
  - QUOTES motivational strings — Chloe-specific, leave alone or add a `dez_quotes` set if Justin wants them
  - TEMPLATES quick-fills — probably useful for Dez too; either share or split
  - Manual entry default — keep "Chloe Mello" as default for now
- [ ] 3.3 Provision Desmond in Supabase Auth dashboard (manual step):
  - Auth method: email + password (Google OAuth code exists in Login.jsx but doesn't actually work in prod per Justin 2026-05-01 — defer fixing OAuth to a separate task)
  - Create user: email = dez@teamtaparra.com, set a temp password (e.g., TempPass2026!)
  - Email confirmation: skip (Supabase dashboard option) so he can log in immediately
  - The `handle_new_user()` trigger auto-creates his `profiles` row with name from email — manually update name to "Desmond Mello" via Table Editor
- [ ] 3.4 Set Desmond's `profiles.role` to `admin` (mirror Chloe's tier — verify in Table Editor first)
- [ ] 3.5 Side task (separate ship): investigate why Google OAuth is broken on this site. Login.jsx has the code wired but it doesn't work. Likely missing redirect URL config in Supabase Auth dashboard or missing Google client credentials in env. Not blocking Dez launch.

## Phase 4 — April 2026 back pay entry (SCRAPPED 2026-05-01)

Per Justin: back pay is handled off-platform. No time_entries row, no schema change. The `lump_sum_amount` handling already in `workerPay.js` is harmless (no rows will ever have it set). Optionally remove in a future cleanup.

Original plan kept below for reference only — DO NOT EXECUTE:

## Phase 4 (scrapped) — original plan

- [ ] 4.1 SQL insert one `time_entries` row:
  ```sql
  INSERT INTO time_entries (project_id, worker, category, description, start_time, end_time, duration_ms, created_by)
  VALUES (
    '<active project id>',
    'Desmond Mello',
    'Admin',
    'April 2026 back pay — 22 business days × 8 hrs × $36/hr = $6,336. Payment split: $2,000 paid 2026-05-01, $4,336 by 2026-05-31. One-time lump entry (retroactive hourly rate adoption); not actual hours worked on this date.',
    '2026-04-30T08:00:00-10:00',
    '2026-04-30T08:00:00-10:00',
    633600000,
    '<Justin profile id>'
  );
  ```
  - 176 hrs = 22 × 8. duration_ms = 176 × 3600 × 1000 = 633,600,000
  - The entry alone won't trigger Desmond's weekly OT calc since it's marked on a single calendar day; the OT bucketing groups by ISO week and 176 hrs in one week would compute as 40 × $36 + 136 × $54 = $8,784 — WRONG. Need a flag in the entry (e.g., category="Back Pay" or a `is_lump_sum` boolean column) so the pay engine treats it as a flat dollar amount, not hours-times-rate.
- [ ] 4.2 Add a `lump_sum_amount` NUMERIC column to `time_entries` (nullable). When set, the pay engine uses that dollar amount directly and skips the rate × hours calc. Migration in this same phase.
- [ ] 4.3 Insert the back pay row with `lump_sum_amount = 6336.00`, `duration_ms = 0` (so it doesn't pollute hour totals).
- [ ] 4.4 Verify it appears as $6,336 in Desmond's first pay report and is NOT counted toward weekly OT thresholds.
- [ ] 4.5 Document the split-payment schedule in the entry description so anyone looking at it knows $2,000 was paid 2026-05-01 and $4,336 is due by 2026-05-31. (Future enhancement: separate `payments` table for proper partial-payment tracking — out of scope for this ship.)

## Phase 5 — Notification system

### 5a — Real-time clock-in/out notifications (DONE 2026-05-01)
- [x] Refactored ~/justin-assistant/chloe_clock_watcher.py to multi-worker (Chloe + Desmond), multi-recipient (Justin + Sam phones, justin@ + sam@ emails). Email via send_as_cortana.py with canonical Cortana signature. launchd plist KeepAlive=true. Verified clean startup at 13:58 HST.

### 5b — Pay report cron (PENDING, deadline 2026-05-16)
Vercel cron route firing 1st and 16th of every month. Computes prior pay period for Chloe + Desmond using calcWorkerPay engine. Emails to justin@ + sam@.

### 5 (original — superseded)

- [ ] **5.1** Decide architecture. Two viable paths:
  - **A)** Supabase database trigger on `clock_status` insert/delete → Postgres function calls Edge Function → Edge Function sends email + iMessage. Cons: iMessage from Edge Function is hard (no native sender).
  - **B)** Client-side fire-and-forget POST to `/api/notify` after successful clock-in/out. Vercel API route relays to email service + iMessage relay. Cons: skipped if user closes tab between clock-in and the POST.
  - **Recommendation:** Path B for simplicity, with the POST happening BEFORE the success UI fires, so a network failure surfaces to the user.
- [ ] **5.2** Build `api/notify-clock.js` Vercel route:
  - Accepts `{ worker, action: 'in'|'out', timestamp, project }`
  - Sends email via Cortana send-as (use existing send_as_cortana.py pattern, or call Gmail API directly with cortana-ai@ creds — check what `api/polish.js` does for env-var pattern)
  - Sends iMessage via existing iMessage relay (check ~/justin-assistant/ or assistant.py for the helper, or use AppleScript bridge if running on Mac Studio)
  - Recipients: emails to sam@/raphael@/justin@; iMessages to 808-349-6499 and 808-778-9346
  - Subject: `[Time Tracker] {Worker} clocked {in|out} — {timestamp HST}`
  - Body: brief, includes project + accumulated hours-this-week if available
- [ ] **5.3** Wire up `TimeTracker.jsx` clock-in / clock-out flows to fire the notification before showing the success UI
- [ ] **5.4** Add a settings toggle to disable notifications (so we can pause without redeploying)

## Phase 6 — Onboarding emails (Cortana send-as)

- [ ] 6.1 Build new email `email-draft-dez-onboarding.html` modeled on Chloe's, with:
  - Login URL + email/password instructions (NOT Google SSO — broken in prod). Include the temp password from Phase 3.3 + reminder to change after first login.
  - Pay structure: $36 straight, $54 OT after 40/week, working week Mon-Sun
  - Pay periods (1-15 paid 16th, 16-EOM paid 1st)
  - April back pay note: $6,336 total — $2,000 on 2026-05-01, $4,336 by 2026-05-31
  - Tax note (1099, no withholdings)
  - Manual entry instructions for May 1-3 since access goes live May 4
- [ ] **6.2** Build correction email to Chloe acknowledging the original onboarding email had errors:
  - Probation is 90 days, not 60 (so post-probation kicks in 2026-07-06, not earlier)
  - Rate is location-based, not flat: $25 home / $30 office probation → $30 home / $35 office post-probation
  - "No action needed on your end — your hours have been tracked correctly all along, this email is just to keep our paperwork accurate."
- [ ] **6.3** Send both via Cortana (per email-cortana-only-hard-rule). Get Justin's approval on drafts before send.

## Phase 7 — Verification

- [ ] **7.1** Local smoke test: clock-in + clock-out as Chloe (office, before probation end) — pay row shows $30/hr
- [ ] **7.2** Local smoke test: simulate Chloe entry dated 2026-08-01 (post-probation), home — pay row shows $30/hr (NOT $35 — proves bug fix)
- [ ] 7.3 Local smoke test: clock-in 41 hrs as Desmond in one week — first 40 hrs $36, hour 41 at $54, total $1,494
- [ ] 7.4 Local smoke test: clock-in 30 hrs Mon-Fri + 8 hrs Saturday as Desmond = 38 × $36 = $1,368 (zero OT, weekly under 40)
- [ ] 7.5 Local smoke test: April back pay row appears as $6,336 flat, NOT counted in any week's OT calc, NOT reflected in hour totals
- [ ] **7.5** Local smoke test: notification fires to test email + test number on local clock-in
- [ ] **7.6** PDF report includes Dez's OT breakdown, Chloe's correct probation rate
- [ ] **7.7** April back pay row shows in Dez's first pay period at $6,160

## Phase 8 — Deploy + post-deploy

- [ ] **8.1** Push to main → Vercel auto-deploys
- [ ] **8.2** In production, run the back-pay SQL insert against Supabase
- [ ] **8.3** Provision Dez in Supabase Auth
- [ ] **8.4** Send Dez onboarding email + Chloe correction email
- [ ] **8.5** Notify Sam + Raphael (cc'd on emails) so they know notifications will start hitting their inboxes

---

## Phase 9 — Cortana dedicated phone number (after launch)

Currently the iMessage notifications go from Justin's iMessage account (relayed via Mac Studio). Justin wants Cortana to have her own dedicated number long-term so the notifications don't appear to come from him personally. This is a follow-up project, scheduled after Phases 1-8 ship.

- [ ] 9.1 Decide carrier / service: Twilio iMessage-for-business, Sendbird, or a dedicated Apple ID with its own number
- [ ] 9.2 Provision number, attach to Cortana identity (matches existing Cortana email pattern)
- [ ] 9.3 Update `api/notify-clock.js` sender to use the Cortana number instead of Justin's relay
- [ ] 9.4 Cross-reference with `project_cortana_phone_number.md` memory entry for prior planning

---

## Confirmed inputs (locked 2026-05-01)

- Raphael email: raphael@teamtaparra.com
- iMessage sender for Phases 1-8: Justin's existing relay on Mac Studio (cortana phone number deferred to Phase 9)
- Dez's official name in all structured output: "Desmond Mello" (not "Dez" — per feedback_desmond_mello_full_name.md). "Dez" is fine in casual email body / motivational copy.
- Dez's login email: dez@teamtaparra.com (same teamtaparra.com domain Chloe uses, so existing Google SSO config covers him)

## Open items / risks

- iMessage relay reachability — need to find Justin's existing pattern (likely on Mac Studio). Investigate during Phase 5 prep. If Vercel can't reach Mac Studio directly, options: Tailscale Funnel, Cloudflare Tunnel, or a polling pattern where Mac Studio pulls a notification queue from Supabase.
- Auth method: email + password only (Google OAuth code wired but broken in prod per Justin 2026-05-01). No domain restriction concern since signup isn't open — accounts are provisioned manually via Supabase Auth dashboard. Fix Google OAuth as a separate task post-launch (Phase 3.5).
- Existing Chloe entries — none should be retroactively re-rated. The post-probation overpayment bug has not paid out yet (she's still in probation until 2026-07-06). No backfill needed.
- Concurrent clock-in handling — current `clock_status` schema allows one open session per user. Different user_ids for Chloe and Desmond, so no collision.

## Review section

(Filled in after implementation per CLAUDE.md workflow.)
