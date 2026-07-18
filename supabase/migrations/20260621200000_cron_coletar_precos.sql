-- Extensões (no Supabase, ative também em Database > Extensions se necessário).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Coleta automática de hora em hora.
-- A função coletar-precos é deployada com verify_jwt = false (ver config.toml),
-- então o cron chama sem bearer — a função faz o trabalho privilegiado com a
-- service_role injetada automaticamente pelo Supabase.
-- timeout_milliseconds alto porque a coleta demora mais que os 5s padrão do
-- pg_net (consulta a SEFAZ produto por produto).
select cron.schedule('coletar-precos-automatico', '0 * * * *', $$
  select net.http_post(
    url := 'https://wflarolzpwwecyarwpci.supabase.co/functions/v1/coletar-precos',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
