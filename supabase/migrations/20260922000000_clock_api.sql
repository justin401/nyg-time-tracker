-- Clock API (9/22/26): Claude Code /clock skill replaces website clocking.
-- Every clock change goes through clock_in() / clock_out(), which run as one
-- locked transaction each, so a shift can never be lost or saved twice.
-- All new tables are service-role only (RLS on, no policies).

-- ── time_entries: link each closed shift to the open shift it came from ──
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS source_session_id UUID,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS review_note TEXT;

DO $$ BEGIN
  ALTER TABLE public.time_entries
    ADD CONSTRAINT time_entries_review_status_chk
    CHECK (review_status IN ('ok', 'needs_review', 'corrected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_source_session_id_key
  ON public.time_entries (source_session_id) WHERE source_session_id IS NOT NULL;

-- ── clock_status: a stable id per open shift, one open shift per person ──
ALTER TABLE public.clock_status
  ADD COLUMN IF NOT EXISTS session_id UUID NOT NULL DEFAULT gen_random_uuid();

DO $$ BEGIN
  ALTER TABLE public.clock_status ADD CONSTRAINT clock_status_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── devices: one row per person per Mac; the token itself is never stored ──
CREATE TABLE IF NOT EXISTS public.clock_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  display_name TEXT NOT NULL,              -- "Dez", "Chloe", "Justin", "Sam"
  worker_name TEXT NOT NULL,               -- time_entries.worker value
  worker_aliases TEXT[] NOT NULL DEFAULT '{}',  -- older spellings of worker_name
  role TEXT NOT NULL CHECK (role IN ('worker', 'owner')),
  fixed_project_id UUID REFERENCES public.projects(id),  -- Dez/Chloe; NULL = picks
  device_label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,         -- sha256 hex of the token
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── idempotency: a retried request returns the original answer ──
CREATE TABLE IF NOT EXISTS public.clock_requests (
  request_id TEXT PRIMARY KEY,
  profile_id UUID NOT NULL,
  action TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── email outbox: written in the same transaction as the clock change ──
CREATE TABLE IF NOT EXISTS public.clock_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL,                     -- in | out | auto_close | correction
  payload JSONB NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── memos from Justin, shown at clock-in ──
CREATE TABLE IF NOT EXISTS public.clock_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL,
  target_profile_ids UUID[] NOT NULL,
  show_on DATE NOT NULL,                   -- HST date; shown at the first clock-in on/after
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clock_memo_acks (
  memo_id UUID NOT NULL REFERENCES public.clock_memos(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  acked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (memo_id, profile_id)
);

-- ── audit: every correction and every owner edit ──
CREATE TABLE IF NOT EXISTS public.clock_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID,
  action TEXT NOT NULL,
  entry_id UUID,
  before JSONB,
  after JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_devices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_memos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_memo_acks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_audit         ENABLE ROW LEVEL SECURITY;

-- Older signatures from the first apply (same day), replaced below.
DROP FUNCTION IF EXISTS public.clock_in(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ── clock_in: never deletes an open shift ──
CREATE OR REPLACE FUNCTION public.clock_in(p_user UUID, p_project UUID, p_request_id TEXT, p_display TEXT, p_notify BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  prior JSONB;
  cur public.clock_status;
  result JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clock:' || p_user::text));

  SELECT r.result INTO prior FROM public.clock_requests r WHERE r.request_id = p_request_id;
  IF FOUND THEN RETURN prior; END IF;

  SELECT * INTO cur FROM public.clock_status WHERE user_id = p_user FOR UPDATE;
  IF FOUND THEN
    result := jsonb_build_object('status', 'already_in', 'session_id', cur.session_id,
      'start_time', cur.start_time, 'project_id', cur.project_id);
  ELSE
    INSERT INTO public.clock_status (user_id, project_id, start_time)
      VALUES (p_user, p_project, now()) RETURNING * INTO cur;
    IF p_notify THEN
      INSERT INTO public.clock_notifications (dedupe_key, event, payload)
        VALUES ('in:' || cur.session_id, 'in',
          jsonb_build_object('display', p_display, 'at', cur.start_time, 'project_id', cur.project_id));
    END IF;
    result := jsonb_build_object('status', 'in', 'session_id', cur.session_id,
      'start_time', cur.start_time, 'project_id', cur.project_id);
  END IF;

  INSERT INTO public.clock_requests (request_id, profile_id, action, result)
    VALUES (p_request_id, p_user, 'in', result);
  RETURN result;
END $$;

-- ── clock_out: one step, capped at 12 hours, impossible to save twice ──
CREATE OR REPLACE FUNCTION public.clock_out(
  p_user UUID, p_worker TEXT, p_display TEXT, p_request_id TEXT,
  p_category TEXT, p_description TEXT, p_reason TEXT, p_notify BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  prior JSONB;
  cur public.clock_status;
  cap TIMESTAMPTZ;
  end_at TIMESTAMPTZ;
  capped BOOLEAN;
  new_id UUID;
  result JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clock:' || p_user::text));

  IF p_request_id IS NOT NULL THEN
    SELECT r.result INTO prior FROM public.clock_requests r WHERE r.request_id = p_request_id;
    IF FOUND THEN RETURN prior; END IF;
  END IF;

  SELECT * INTO cur FROM public.clock_status WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    result := jsonb_build_object('status', 'not_in');
  ELSE
    cap := cur.start_time + interval '12 hours';
    capped := now() > cap;
    end_at := LEAST(now(), cap);

    INSERT INTO public.time_entries
      (project_id, worker, category, description, start_time, end_time, duration_ms,
       created_by, source_session_id, review_status, review_note)
    VALUES
      (cur.project_id, p_worker, p_category, p_description, cur.start_time, end_at,
       (EXTRACT(EPOCH FROM (end_at - cur.start_time)) * 1000)::BIGINT,
       p_user, cur.session_id,
       CASE WHEN capped THEN 'needs_review' ELSE 'ok' END,
       CASE WHEN capped THEN 'Open more than 12 hours, closed automatically at the 12-hour cap. Confirm the real end time before payroll.' END)
    ON CONFLICT (source_session_id) WHERE source_session_id IS NOT NULL DO NOTHING
    RETURNING id INTO new_id;

    DELETE FROM public.clock_status WHERE id = cur.id;

    IF p_notify THEN
    INSERT INTO public.clock_notifications (dedupe_key, event, payload)
      VALUES ('out:' || cur.session_id,
        CASE WHEN capped THEN 'auto_close' ELSE 'out' END,
        jsonb_build_object('display', p_display, 'start', cur.start_time, 'end', end_at,
          'duration_ms', (EXTRACT(EPOCH FROM (end_at - cur.start_time)) * 1000)::BIGINT,
          'project_id', cur.project_id, 'reason', p_reason))
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;

    result := jsonb_build_object('status', 'out', 'entry_id', new_id,
      'session_id', cur.session_id, 'start_time', cur.start_time, 'end_time', end_at,
      'duration_ms', (EXTRACT(EPOCH FROM (end_at - cur.start_time)) * 1000)::BIGINT,
      'capped', capped, 'project_id', cur.project_id);
  END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO public.clock_requests (request_id, profile_id, action, result)
      VALUES (p_request_id, p_user, 'out', result);
  END IF;
  RETURN result;
END $$;

-- ── outbox claim: two senders can never grab the same email ──
CREATE OR REPLACE FUNCTION public.clock_claim_notifications(p_limit INT)
RETURNS SETOF public.clock_notifications LANGUAGE sql AS $$
  UPDATE public.clock_notifications n
     SET claimed_at = now(), attempts = n.attempts + 1
   WHERE n.id IN (
     SELECT id FROM public.clock_notifications
      WHERE sent_at IS NULL
        AND attempts < 20
        AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING n.*;
$$;

REVOKE ALL ON FUNCTION public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clock_claim_notifications(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_claim_notifications(INT) TO service_role;
