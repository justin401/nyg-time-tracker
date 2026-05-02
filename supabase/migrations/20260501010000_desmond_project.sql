-- =============================================
-- Create dedicated project for Desmond Mello (Agent Care)
-- Mirrors the existing "Agent Care - Chloe Mello" project pattern.
-- =============================================
-- Run via: Supabase Dashboard > SQL Editor > paste > Run
-- Idempotent. Safe to re-run.
--
-- The UUID below is hardcoded so the JS constant DESMOND_PROJECT_ID in
-- src/TimeTracker.jsx matches. Do not regenerate without updating the JS.
-- =============================================

INSERT INTO public.projects (id, name, j_rate, s_rate, c_rate, archived)
VALUES (
  'b134954f-16ca-4a0e-86ff-63210acb0895',
  'Agent Care - Desmond Mello',
  75,    -- Justin's rate (default, unused for Desmond's hours)
  60,    -- Sam's rate (default, unused for Desmond's hours)
  36,    -- Stored for legacy/display; engine reads from worker_configs
  false
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      archived = EXCLUDED.archived;

-- Verify:
-- SELECT id, name FROM public.projects WHERE id = 'b134954f-16ca-4a0e-86ff-63210acb0895';
