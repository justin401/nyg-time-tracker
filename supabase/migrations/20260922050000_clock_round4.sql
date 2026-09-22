-- Clock round 4 after the Codex final confirmation (9/22/26, before deploy).
--  * A retried clock-out must also match its category and description.
--  * A late clock-out (arriving after the 12-hour auto-close) only ever touches
--    the person's OWN auto-closed shift, works even if they have since started
--    a new shift, and keeps NEEDS REVIEW when they really worked past 12 hours.
--  * A clock-in delayed more than 12 hours is refused, never silently moved.

DROP FUNCTION IF EXISTS public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT[], TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.clock_in(
  p_user UUID, p_project UUID, p_request_id TEXT, p_display TEXT, p_notify BOOLEAN,
  p_worker_names TEXT[], p_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  params JSONB := jsonb_build_object('project', p_project, 'at', p_at);
  prior JSONB;
  cur public.clock_status;
  last_end TIMESTAMPTZ;
  start_at TIMESTAMPTZ;
  result JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clock:' || p_user::text));
  prior := public.clock_prior_request(p_request_id, p_user, 'in', params);
  IF prior IS NOT NULL THEN RETURN prior; END IF;

  SELECT * INTO cur FROM public.clock_status WHERE user_id = p_user FOR UPDATE;
  IF FOUND THEN
    result := jsonb_build_object('status', 'already_in', 'session_id', cur.session_id,
      'start_time', cur.start_time, 'project_id', cur.project_id);
  ELSIF p_at IS NOT NULL AND p_at < now() - interval '12 hours' THEN
    -- Stuck offline for over 12 hours: we cannot know when they stopped, so
    -- do not invent a shift. An owner adds it by hand.
    result := jsonb_build_object('status', 'too_old',
      'why', 'This clock-in was made more than 12 hours ago and only just arrived. Ask Justin to add the shift.');
  ELSE
    SELECT max(end_time) INTO last_end FROM public.time_entries WHERE worker = ANY (p_worker_names);
    start_at := LEAST(COALESCE(p_at, now()), now());
    start_at := GREATEST(start_at, COALESCE(last_end, '-infinity'::timestamptz));
    INSERT INTO public.clock_status (user_id, project_id, start_time)
      VALUES (p_user, p_project, start_at) RETURNING * INTO cur;
    IF p_notify THEN
      INSERT INTO public.clock_notifications (dedupe_key, event, payload)
        VALUES ('in:' || cur.session_id, 'in',
          jsonb_build_object('display', p_display, 'at', cur.start_time, 'project_id', cur.project_id));
    END IF;
    result := jsonb_build_object('status', 'in', 'session_id', cur.session_id,
      'start_time', cur.start_time, 'project_id', cur.project_id);
  END IF;

  INSERT INTO public.clock_requests (request_id, profile_id, action, result, params)
    VALUES (p_request_id, p_user, 'in', result, params);
  RETURN result;
END $$;

DROP FUNCTION IF EXISTS public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.clock_out(
  p_user UUID, p_worker TEXT, p_display TEXT, p_request_id TEXT,
  p_category TEXT, p_description TEXT, p_reason TEXT, p_notify BOOLEAN,
  p_expected_session UUID, p_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  params JSONB := jsonb_build_object('session', p_expected_session, 'at', p_at,
                                     'category', p_category, 'description', p_description);
  prior JSONB;
  cur public.clock_status;
  cap TIMESTAMPTZ;
  end_at TIMESTAMPTZ;
  capped BOOLEAN;
  new_id UUID;
  dur BIGINT;
  saved public.time_entries;
  over_cap BOOLEAN;
  result JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clock:' || p_user::text));
  prior := public.clock_prior_request(p_request_id, p_user, 'out', params);
  IF prior IS NOT NULL THEN RETURN prior; END IF;

  -- Late arrival first: the shift this request was about may already have been
  -- auto-closed at 12 hours (even if a newer shift has started since). Only the
  -- person's OWN shift (created_by = p_user) is ever touched.
  IF p_expected_session IS NOT NULL AND p_at IS NOT NULL THEN
    SELECT * INTO saved FROM public.time_entries
     WHERE source_session_id = p_expected_session
       AND created_by = p_user
       AND review_status = 'needs_review'
     FOR UPDATE;
  END IF;

  IF saved.id IS NOT NULL THEN
    over_cap := p_at > saved.end_time;          -- they really worked past 12 hours
    end_at := LEAST(GREATEST(p_at, saved.start_time), saved.end_time);
    dur := (EXTRACT(EPOCH FROM (end_at - saved.start_time)) * 1000)::BIGINT;
    UPDATE public.time_entries
       SET end_time = end_at, duration_ms = dur,
           review_status = CASE WHEN over_cap THEN 'needs_review' ELSE 'corrected' END,
           review_note = CASE WHEN over_cap
             THEN format('%s clocked out at %s, past the 12-hour cap. Justin must confirm the hours beyond 12.',
                         p_display, to_char(p_at AT TIME ZONE 'Pacific/Honolulu', 'MM/DD HH12:MI AM'))
             ELSE format('End time set from %s''s own clock-out request (made %s), which arrived after the 12-hour auto-close.',
                         p_display, to_char(p_at AT TIME ZONE 'Pacific/Honolulu', 'MM/DD HH12:MI AM')) END
     WHERE id = saved.id;
    INSERT INTO public.clock_audit (actor_profile_id, action, entry_id, before, after, note)
      VALUES (p_user, 'late_clock_out', saved.id, to_jsonb(saved),
              jsonb_build_object('end_time', end_at, 'duration_ms', dur, 'requested_end', p_at), 'clock-out arrived after auto-close');
    IF p_notify AND NOT over_cap THEN
      INSERT INTO public.clock_notifications (dedupe_key, event, payload)
        VALUES ('correction:' || saved.id || ':late', 'correction',
          jsonb_build_object('display', p_display, 'actor', p_display, 'start', saved.start_time,
            'old_end', saved.end_time, 'new_end', end_at, 'duration_ms', dur))
        ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
    result := jsonb_build_object('status', 'out', 'entry_id', saved.id, 'session_id', saved.source_session_id,
      'start_time', saved.start_time, 'end_time', end_at, 'duration_ms', dur, 'capped', over_cap,
      'project_id', saved.project_id, 'reconciled_after_auto_close', true);
  ELSE
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
  END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO public.clock_requests (request_id, profile_id, action, result, params)
      VALUES (p_request_id, p_user, 'out', result, params);
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT[], TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clock_in(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT[], TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.clock_out(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ) TO service_role;
