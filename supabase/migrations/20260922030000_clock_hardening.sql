-- Clock hardening after Codex review (9/22/26, before first deploy).
--  * clock_out: the sweep passes the exact shift it saw, and the 12-hour check
--    is repeated inside the lock, so it can never close a newer shift.
--  * request ids are scoped to the person and the action.
--  * every shift edit (worker's missed clock-out fix, owner add/correct/approve)
--    runs as ONE locked transaction with its audit row and email, and refuses
--    overlaps against saved AND open shifts, future end times, and stale reads.
--  * email outbox: no 20-attempt dead end; retries back off up to an hour.

DROP FUNCTION IF EXISTS public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID);

-- Returns the stored result for a retried request, NULL for a new one, and
-- refuses a request id that belongs to someone else or to another action.
CREATE OR REPLACE FUNCTION public.clock_prior_request(p_request_id TEXT, p_user UUID, p_action TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE r public.clock_requests;
BEGIN
  IF p_request_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.clock_requests WHERE request_id = p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.profile_id <> p_user OR r.action <> p_action THEN
    RAISE EXCEPTION 'request_id already used for a different request' USING ERRCODE = '22023';
  END IF;
  RETURN r.result;
END $$;

CREATE OR REPLACE FUNCTION public.clock_in(p_user UUID, p_project UUID, p_request_id TEXT, p_display TEXT, p_notify BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  prior JSONB;
  cur public.clock_status;
  result JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clock:' || p_user::text));
  prior := public.clock_prior_request(p_request_id, p_user, 'in');
  IF prior IS NOT NULL THEN RETURN prior; END IF;

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

-- p_expected_session: when set, only that exact shift may be closed (the sweep
--   passes the shift it saw; the skill passes the shift the person was in when
--   they asked, so a clock-out retried late can never close a newer shift).
-- p_at: when the person actually asked to clock out. A retry that arrives late
--   still ends the shift at that moment, never later.
-- p_reason = 'auto': only closes if the shift really is past 12 hours right now.
CREATE OR REPLACE FUNCTION public.clock_out(
  p_user UUID, p_worker TEXT, p_display TEXT, p_request_id TEXT,
  p_category TEXT, p_description TEXT, p_reason TEXT, p_notify BOOLEAN,
  p_expected_session UUID, p_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  prior JSONB;
  cur public.clock_status;
  cap TIMESTAMPTZ;
  end_at TIMESTAMPTZ;
  capped BOOLEAN;
  new_id UUID;
  dur BIGINT;
  result JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clock:' || p_user::text));
  prior := public.clock_prior_request(p_request_id, p_user, 'out');
  IF prior IS NOT NULL THEN RETURN prior; END IF;

  SELECT * INTO cur FROM public.clock_status WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    result := jsonb_build_object('status', 'not_in');
  ELSIF p_expected_session IS NOT NULL AND cur.session_id <> p_expected_session THEN
    result := jsonb_build_object('status', 'skipped', 'why', 'a different shift is open now');
  ELSIF p_reason = 'auto' AND now() <= cur.start_time + interval '12 hours' THEN
    result := jsonb_build_object('status', 'skipped', 'why', 'not yet 12 hours');
  ELSE
    cap := cur.start_time + interval '12 hours';
    end_at := LEAST(GREATEST(COALESCE(p_at, now()), cur.start_time), now());
    capped := end_at > cap;
    end_at := LEAST(end_at, cap);
    dur := (EXTRACT(EPOCH FROM (end_at - cur.start_time)) * 1000)::BIGINT;

    INSERT INTO public.time_entries
      (project_id, worker, category, description, start_time, end_time, duration_ms,
       created_by, source_session_id, review_status, review_note)
    VALUES
      (cur.project_id, p_worker, p_category, p_description, cur.start_time, end_at, dur,
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
            'duration_ms', dur, 'project_id', cur.project_id, 'reason', p_reason))
        ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;

    result := jsonb_build_object('status', 'out', 'entry_id', new_id,
      'session_id', cur.session_id, 'start_time', cur.start_time, 'end_time', end_at,
      'duration_ms', dur, 'capped', capped, 'project_id', cur.project_id);
  END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO public.clock_requests (request_id, profile_id, action, result)
      VALUES (p_request_id, p_user, 'out', result);
  END IF;
  RETURN result;
END $$;

-- One door for every edit to a saved shift. p_mode:
--   'worker_fix'  worker sets the end time of their own NEEDS REVIEW shift (max 12h)
--   'owner_add'   owner adds a missed shift
--   'owner_edit'  owner changes start/end/description/category (approves if reviewed)
--   'owner_approve' owner accepts the recorded end time as-is
-- Locks the person, re-reads the entry, rejects overlaps with saved AND open
-- shifts, rejects future end times, and writes the audit row and email in the
-- same transaction. The entry is re-read under the lock, so nobody acts on a stale copy.
CREATE OR REPLACE FUNCTION public.clock_edit_shift(
  p_mode TEXT, p_actor UUID, p_actor_display TEXT,
  p_person UUID, p_worker TEXT, p_worker_names TEXT[], p_person_display TEXT, p_notify BOOLEAN,
  p_entry_id UUID, p_project UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ,
  p_category TEXT, p_description TEXT, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  e public.time_entries;
  v_before JSONB;
  new_start TIMESTAMPTZ;
  new_end TIMESTAMPTZ;
  max_len INTERVAL;
  open_start TIMESTAMPTZ;
  clash public.time_entries;
  after_row public.time_entries;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clock:' || p_person::text));

  IF p_mode = 'owner_add' THEN
    new_start := p_start; new_end := p_end;
  ELSE
    SELECT * INTO e FROM public.time_entries WHERE id = p_entry_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No such shift' USING ERRCODE = 'P0002'; END IF;
    IF NOT (e.worker = ANY (p_worker_names)) THEN
      RAISE EXCEPTION 'That shift belongs to someone else' USING ERRCODE = '42501';
    END IF;
    v_before := to_jsonb(e);
    IF p_mode = 'worker_fix' AND e.review_status <> 'needs_review' THEN
      RAISE EXCEPTION 'That shift is not waiting for a correction' USING ERRCODE = '22023';
    END IF;
    new_start := COALESCE(p_start, e.start_time);
    new_end := COALESCE(p_end, e.end_time);
  END IF;

  IF p_mode <> 'owner_approve' THEN
    max_len := CASE WHEN p_mode = 'worker_fix' THEN interval '12 hours' ELSE interval '24 hours' END;
    IF new_end <= new_start THEN RAISE EXCEPTION 'End time must be after the start time' USING ERRCODE = '22023'; END IF;
    IF new_end - new_start > max_len THEN
      RAISE EXCEPTION 'That would make the shift longer than %', max_len USING ERRCODE = '22023';
    END IF;
    IF new_end > now() THEN RAISE EXCEPTION 'End time cannot be in the future' USING ERRCODE = '22023'; END IF;

    SELECT * INTO clash FROM public.time_entries t
     WHERE t.worker = ANY (p_worker_names)
       AND (p_entry_id IS NULL OR t.id <> p_entry_id)
       AND t.start_time < new_end AND t.end_time > new_start
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'That overlaps another shift (% to %)', clash.start_time, clash.end_time USING ERRCODE = '23P01';
    END IF;
    SELECT start_time INTO open_start FROM public.clock_status WHERE user_id = p_person;
    IF FOUND AND new_end > open_start THEN
      RAISE EXCEPTION 'That overlaps the shift they are clocked into right now (since %)', open_start USING ERRCODE = '23P01';
    END IF;
  END IF;

  IF p_mode = 'owner_add' THEN
    INSERT INTO public.time_entries
      (project_id, worker, category, description, start_time, end_time, duration_ms, created_by, review_status)
    VALUES
      (p_project, p_worker, p_category, COALESCE(p_description, 'Shift added by owner'), new_start, new_end,
       (EXTRACT(EPOCH FROM (new_end - new_start)) * 1000)::BIGINT, p_actor, 'ok')
    RETURNING * INTO after_row;
  ELSIF p_mode = 'owner_approve' THEN
    UPDATE public.time_entries
       SET review_status = 'corrected',
           review_note = format('Approved as recorded by %s on %s.', p_actor_display, to_char(now() AT TIME ZONE 'Pacific/Honolulu', 'MM/DD/YYYY'))
     WHERE id = e.id RETURNING * INTO after_row;
  ELSE
    UPDATE public.time_entries
       SET start_time = new_start,
           end_time = new_end,
           duration_ms = (EXTRACT(EPOCH FROM (new_end - new_start)) * 1000)::BIGINT,
           description = COALESCE(p_description, e.description),
           category = COALESCE(p_category, e.category),
           review_status = CASE
             WHEN e.review_status = 'needs_review' AND (p_start IS NOT NULL OR p_end IS NOT NULL) THEN 'corrected'
             ELSE e.review_status END,
           review_note = CASE
             WHEN e.review_status = 'needs_review' AND (p_start IS NOT NULL OR p_end IS NOT NULL)
               THEN format('Times corrected by %s on %s (was %s to %s).', p_actor_display,
                 to_char(now() AT TIME ZONE 'Pacific/Honolulu', 'MM/DD/YYYY'), e.start_time, e.end_time)
             ELSE e.review_note END
     WHERE id = e.id RETURNING * INTO after_row;
  END IF;

  INSERT INTO public.clock_audit (actor_profile_id, action, entry_id, before, after, note)
    VALUES (p_actor, p_mode, after_row.id, v_before, to_jsonb(after_row), p_note);

  IF p_notify AND p_mode IN ('worker_fix', 'owner_edit', 'owner_approve')
     AND v_before IS NOT NULL AND (v_before->>'review_status') = 'needs_review' THEN
    INSERT INTO public.clock_notifications (dedupe_key, event, payload)
      VALUES ('correction:' || after_row.id || ':' || extract(epoch from now())::text, 'correction',
        jsonb_build_object('display', p_person_display, 'actor', p_actor_display,
          'start', after_row.start_time, 'old_end', v_before->>'end_time', 'new_end', after_row.end_time,
          'duration_ms', after_row.duration_ms))
      ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN to_jsonb(after_row);
END $$;

-- Outbox claim with back-off instead of a 20-attempt dead end: a row is
-- retried after 5 minutes, then longer, capped at an hour between tries.
CREATE OR REPLACE FUNCTION public.clock_claim_notifications(p_limit INT)
RETURNS SETOF public.clock_notifications LANGUAGE sql AS $$
  UPDATE public.clock_notifications n
     SET claimed_at = now(), attempts = n.attempts + 1
   WHERE n.id IN (
     SELECT id FROM public.clock_notifications
      WHERE sent_at IS NULL
        AND (claimed_at IS NULL
             OR claimed_at < now() - LEAST(interval '5 minutes' * GREATEST(attempts, 1), interval '1 hour'))
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING n.*;
$$;

REVOKE ALL ON FUNCTION public.clock_prior_request(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clock_edit_shift(TEXT, UUID, TEXT, UUID, TEXT, TEXT[], TEXT, BOOLEAN, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clock_claim_notifications(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clock_prior_request(TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_edit_shift(TEXT, UUID, TEXT, UUID, TEXT, TEXT[], TEXT, BOOLEAN, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_claim_notifications(INT) TO service_role;
