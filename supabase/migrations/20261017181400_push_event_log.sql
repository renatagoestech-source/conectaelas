-- Deduplicação de notificações enviadas para cada agendamento e mudança de status.
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_event_log (
  event_key text PRIMARY KEY CHECK (char_length(event_key) <= 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_event_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_event_log FROM anon, authenticated;
GRANT ALL ON TABLE public.push_event_log TO service_role;

COMMIT;
