-- Agendamento diário de lembretes push para atendimentos confirmados.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'conectafemme_reminder_project_url') THEN
    PERFORM vault.create_secret(
      'https://djrmhibvucstshqjxhfe.supabase.co',
      'conectafemme_reminder_project_url',
      'URL do projeto Supabase usada pelo job de lembretes ConectaFemme'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'conectafemme_reminder_publishable_key') THEN
    PERFORM vault.create_secret(
      'sb_publishable_19BBLndUzJFFqAuglRINwA_7RC1N975',
      'conectafemme_reminder_publishable_key',
      'Chave pública usada pelo job de lembretes ConectaFemme'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'conectafemme_reminder_cron_secret') THEN
    PERFORM vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'conectafemme_reminder_cron_secret',
      'Segredo privado de autenticação do job de lembretes ConectaFemme'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_conectafemme_reminder_secret(candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, vault
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'conectafemme_reminder_cron_secret'
      AND decrypted_secret = candidate
  );
$$;

REVOKE ALL ON FUNCTION public.check_conectafemme_reminder_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_conectafemme_reminder_secret(text) TO service_role;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'conectafemme-day-reminders'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'conectafemme-day-reminders',
    '0 10 * * *',
    $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'conectafemme_reminder_project_url')
          || '/functions/v1/conectafemme-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'conectafemme_reminder_publishable_key'),
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'conectafemme_reminder_cron_secret')
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $job$
  );
END $$;

COMMIT;
