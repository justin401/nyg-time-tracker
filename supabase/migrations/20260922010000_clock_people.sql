-- Who may use /clock, and how. A Mac enrolls itself by proving its person's
-- existing Command Center sign-in (Supabase session) to /api/clock action=enroll;
-- only people listed here can get a device token. Service-role only.
CREATE TABLE IF NOT EXISTS public.clock_people (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id),
  display_name TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_aliases TEXT[] NOT NULL DEFAULT '{}',
  role TEXT NOT NULL CHECK (role IN ('worker', 'owner')),
  fixed_project_id UUID REFERENCES public.projects(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clock_people ENABLE ROW LEVEL SECURITY;

INSERT INTO public.clock_people (profile_id, display_name, worker_name, worker_aliases, role, fixed_project_id) VALUES
  ('45a3d3a6-c099-4522-a99a-9e2105b4bf69', 'Dez',    'Desmond Mello',  '{}', 'worker', 'b134954f-16ca-4a0e-86ff-63210acb0895'),
  ('e8efc4f2-ca69-4605-b492-7b2bddd03a0c', 'Chloe',  'Chloe Mello',    '{}', 'worker', '12f5605f-b0a5-46c9-9cbd-34956d8016a8'),
  ('3b15986a-3be1-447f-aa50-21033f0e0eb0', 'Justin', 'Justin Taparra', '{"Justin K. Taparra"}', 'owner', NULL),
  ('685fbfb5-3bf4-4db0-b32b-16daffa7340b', 'Sam',    'Sam Palompo',    '{}', 'owner', NULL)
ON CONFLICT (profile_id) DO NOTHING;
