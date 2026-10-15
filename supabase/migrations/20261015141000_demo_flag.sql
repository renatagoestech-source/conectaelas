ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_demo_idx
  ON public.users (is_demo, role)
  WHERE is_demo = true;
