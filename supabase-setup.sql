-- =============================================
-- NYG LLC Time Tracker - Database Setup
-- Paste this entire block into Supabase SQL Editor and click "Run"
-- =============================================

-- 1. PROFILES TABLE (linked to Supabase Auth)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 2. PROJECTS TABLE
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  j_rate NUMERIC NOT NULL DEFAULT 75,
  s_rate NUMERIC NOT NULL DEFAULT 60,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (true);

-- 3. TIME ENTRIES TABLE
CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  worker TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_ms BIGINT NOT NULL,
  work_location TEXT DEFAULT NULL,  -- 'office' or 'home' (Chloe only, for location-based pay)
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all entries"
  ON public.time_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert entries"
  ON public.time_entries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update entries"
  ON public.time_entries FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete entries"
  ON public.time_entries FOR DELETE
  TO authenticated
  USING (true);

-- 4. CLOCK STATUS TABLE (shared timer state)
CREATE TABLE public.clock_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  start_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view clock status"
  ON public.clock_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own clock status"
  ON public.clock_status FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own clock status"
  ON public.clock_status FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. INSERT DEFAULT PROJECT
INSERT INTO public.projects (id, name, j_rate, s_rate)
VALUES (gen_random_uuid(), 'PM - 91-1032 Makaaloa St #9B (Hanoa)', 75, 60);

-- 6. AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
