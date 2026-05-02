-- =============================================
-- Chloe restructure (effective 2026-05-01) + laptop deduction schedule
-- =============================================
-- Per Justin's "CHLOE P. MELLO - HOURLY PAY MASTER BRIEF" 2026-05-01:
--   - New flat rate structure ($28 probation -> $33 post), no location split
--   - 40-hr weekly cap, OT at 1.5x with advance approval required
--   - Laptop repayment: $141.58 × 12 paychecks, May 16 2026 - Nov 1 2026
--   - Past entries (Apr 16-30) already paid at old rates -- preserved via
--     history-wrapped config so old entries still calc with old structure
--
-- Run via: Supabase Dashboard > SQL Editor > paste > Run
-- Idempotent. Safe to re-run.
-- =============================================

-- 1. Wrap Chloe's config in a history array. Old config preserved for entries
-- with start_time < 2026-05-01 (i.e., April hours already paid). New config
-- applies May 1 onward.
INSERT INTO public.settings (key, value)
VALUES (
  'worker_config_chloe_mello',
  '{
    "type": "history",
    "worker": "Chloe Mello",
    "configs": [
      {
        "effective_from": "2026-04-07",
        "effective_to": "2026-04-30T23:59:59",
        "type": "tiered_location",
        "probationStart": "2026-04-07",
        "probationDays": 90,
        "rates": {
          "office": { "before": 30, "after": 35 },
          "home":   { "before": 25, "after": 30 }
        }
      },
      {
        "effective_from": "2026-05-01",
        "effective_to": null,
        "type": "tiered_weekly_ot",
        "probationStart": "2026-05-01",
        "probationDays": 66,
        "rates": {
          "before": { "straight": 28, "ot": 42 },
          "after":  { "straight": 33, "ot": 49.50 }
        },
        "otThreshold": 40,
        "weekStart": "monday",
        "timezone": "Pacific/Honolulu",
        "otRequiresApproval": true
      }
    ]
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Laptop deduction schedule for Chloe.
-- Pay-report-only (subtracted from gross to compute net). Not part of the
-- time-tracker pay calc.
INSERT INTO public.settings (key, value)
VALUES (
  'worker_deductions_chloe_mello',
  '{
    "worker": "Chloe Mello",
    "deductions": [
      {
        "name": "Work laptop repayment",
        "total_amount": 1698.96,
        "per_paycheck": 141.58,
        "interest_free": true,
        "schedule": [
          { "pay_date": "2026-05-16", "covers_period": "May 1-15, 2026", "amount": 141.58, "n": 1 },
          { "pay_date": "2026-06-01", "covers_period": "May 16-31, 2026", "amount": 141.58, "n": 2 },
          { "pay_date": "2026-06-16", "covers_period": "June 1-15, 2026", "amount": 141.58, "n": 3 },
          { "pay_date": "2026-07-01", "covers_period": "June 16-30, 2026", "amount": 141.58, "n": 4 },
          { "pay_date": "2026-07-16", "covers_period": "July 1-15, 2026", "amount": 141.58, "n": 5 },
          { "pay_date": "2026-08-01", "covers_period": "July 16-31, 2026", "amount": 141.58, "n": 6 },
          { "pay_date": "2026-08-16", "covers_period": "August 1-15, 2026", "amount": 141.58, "n": 7 },
          { "pay_date": "2026-09-01", "covers_period": "August 16-31, 2026", "amount": 141.58, "n": 8 },
          { "pay_date": "2026-09-16", "covers_period": "September 1-15, 2026", "amount": 141.58, "n": 9 },
          { "pay_date": "2026-10-01", "covers_period": "September 16-30, 2026", "amount": 141.58, "n": 10 },
          { "pay_date": "2026-10-16", "covers_period": "October 1-15, 2026", "amount": 141.58, "n": 11 },
          { "pay_date": "2026-11-01", "covers_period": "October 16-31, 2026", "amount": 141.58, "n": 12 }
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Verify:
-- SELECT key, jsonb_pretty(value) FROM public.settings WHERE key IN ('worker_config_chloe_mello', 'worker_deductions_chloe_mello');
