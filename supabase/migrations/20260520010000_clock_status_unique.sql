-- Enforce one open clock session per user.
-- App-level cleanup added in TimeTracker.jsx clockIn already prevents stacking,
-- but this constraint guarantees the invariant even against manual SQL or bugs.
--
-- Pre-condition: any duplicate stale rows for the same user_id must be removed
-- first. Cleanup of pre-existing stale rows was performed via the REST API on
-- 2026-05-20 prior to running this migration.

ALTER TABLE public.clock_status
  ADD CONSTRAINT clock_status_user_id_key UNIQUE (user_id);
