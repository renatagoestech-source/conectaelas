-- Assinaturas push vinculadas a contas e configuração VAPID acessível somente pelo backend.
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint text PRIMARY KEY CHECK (char_length(endpoint) <= 2048),
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  p256dh text NOT NULL CHECK (char_length(p256dh) <= 256),
  auth text NOT NULL CHECK (char_length(auth) <= 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

CREATE TABLE IF NOT EXISTS public.push_settings (
  name text PRIMARY KEY CHECK (name = 'vapid'),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.push_settings TO service_role;
COMMENT ON TABLE public.push_settings IS 'Chaves VAPID geradas e usadas somente pela Edge Function; nunca expor a chave privada ao navegador.';

COMMIT;
