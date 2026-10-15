-- Recursos de agenda, perfil público, uploads de imagem e agendamentos feitos pelo profissional.
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS instagram_url varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.slots
  ADD COLUMN IF NOT EXISTS available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS schedule_managed boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ALTER COLUMN client_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS manual_client_name varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manual_client_whatsapp varchar(30) NOT NULL DEFAULT '';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('conectaelas-images', 'conectaelas-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
