-- Retire the time tracker website (9/22/26). APPLY AT CUTOVER, not before:
-- once this runs, the old site can no longer read or write hours for anyone.
--
-- These tables share a Supabase project (and its sign-ins) with the Command
-- Center, so we do NOT ban users (that would lock the team out of the Command
-- Center). Instead the signed-in role simply loses every policy on the four
-- tracker tables. The service role (the /clock API, pay_report.py, the
-- watcher until it is unloaded) bypasses RLS and is unaffected.
--
-- This also closes an old gap: any signed-in team member could read every
-- worker's pay rates from `settings` and every shift from `time_entries`.
-- Verified 9/22/26: nothing but the retired site used these with a user session.

DROP POLICY IF EXISTS "Authenticated users can view all entries"   ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated users can insert entries"     ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated users can update entries"     ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated users can delete entries"     ON public.time_entries;

DROP POLICY IF EXISTS "Authenticated users can view clock status"  ON public.clock_status;
DROP POLICY IF EXISTS "Users can insert own clock status"          ON public.clock_status;
DROP POLICY IF EXISTS "Users can delete own clock status"          ON public.clock_status;

DROP POLICY IF EXISTS "Authenticated users can view all projects"  ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects"    ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can update projects"    ON public.projects;

DROP POLICY IF EXISTS "Authenticated users can view settings"      ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can upsert settings"    ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can update settings"    ON public.settings;

-- Some live policy names carry stray newlines/spaces (pasted by hand long ago),
-- so the exact-name drops above can miss them. Drop whatever is left for the
-- signed-in / anonymous roles on these four tables, by lookup.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('time_entries', 'clock_status', 'projects', 'settings')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings     ENABLE ROW LEVEL SECURITY;
