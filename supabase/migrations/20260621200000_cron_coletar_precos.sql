CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Defina a service_role_key uma vez (SQL Editor), fora do código-fonte:
--   ALTER DATABASE postgres SET app.service_role_key = '<service-role-key>';
SELECT cron.schedule(
  'coletar-precos-automatico',
  '0 */6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://rlhzpdjthpmsxwufjuld.supabase.co/functions/v1/coletar-precos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
