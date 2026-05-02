-- =============================================
-- Worker Configs: replace hardcoded rate logic with settings-table config
-- Run via: Supabase Dashboard > SQL Editor > paste > Run
-- =============================================
-- Idempotent. Safe to re-run.
--
-- Background: src/components/AdminTools.jsx has been writing to public.settings
-- since it was added, but the table was never created in supabase-setup.sql.
-- The Admin Settings UI has been silently failing. This migration creates the
-- table and seeds the two worker_config rows the new pay engine will read.
--
-- Reads: src/lib/workerPay.js (Phase 2) will pull these via:
--   supabase.from('settings').select('*').in('key', ['worker_config_chloe_mello', 'worker_config_desmond_mello'])
-- =============================================

-- 1. Create the settings table (key/value JSON store)
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all settings
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.settings;
CREATE POLICY "Authenticated users can view settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert/update settings (admin gating handled in app layer)
DROP POLICY IF EXISTS "Authenticated users can upsert settings" ON public.settings;
CREATE POLICY "Authenticated users can upsert settings"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.settings;
CREATE POLICY "Authenticated users can update settings"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (true);

-- Auto-bump updated_at on update
CREATE OR REPLACE FUNCTION public.touch_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settings_updated_at ON public.settings;
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_settings_updated_at();

-- 2. Chloe Mello: tiered_location pay (probation/post-probation x home/office)
-- Probation start 2026-04-07, 90 days = post-probation begins 2026-07-06.
-- Canonical rates per Justin 2026-05-01: $25 home / $30 office (probation),
-- $30 home / $35 office (post-probation). This SUPERSEDES the old hardcoded
-- $35/$40 post-probation rates that were silently overpaying.
INSERT INTO public.settings (key, value)
VALUES (
  'worker_config_chloe_mello',
  '{
    "type": "tiered_location",
    "worker": "Chloe Mello",
    "probationStart": "2026-04-07",
    "probationDays": 90,
    "rates": {
      "office": { "before": 30, "after": 35 },
      "home":   { "before": 25, "after": 30 }
    }
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. Desmond Mello: weekly_ot pay (1099 contractor, no location split, no tier change)
-- $36/hr straight up to 40 hrs/week, $54/hr (1.5x) beyond 40.
-- Working week: Monday 00:00 -> Sunday 23:59 HST. OT calc is weekly aggregate, not daily.
-- Updated 2026-05-01: rates bumped from $35/$52.50 to $36/$54 in revised brief.
INSERT INTO public.settings (key, value)
VALUES (
  'worker_config_desmond_mello',
  '{
    "type": "weekly_ot",
    "worker": "Desmond Mello",
    "straightRate": 36,
    "otRate": 54,
    "otThreshold": 40,
    "weekStart": "monday",
    "timezone": "Pacific/Honolulu",
    "effectiveDate": "2026-04-01"
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Verify rows landed:
-- SELECT key, value FROM public.settings WHERE key LIKE 'worker_config_%';
