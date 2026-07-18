-- Extensões (no Supabase, ative também em Database > Extensions se necessário).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Coleta automática de hora em hora.
-- Observações:
--   * O Supabase bloqueia guardar segredo via ALTER DATABASE ... SET, então o
--     bearer usa a ANON KEY pública (mesma VITE_SUPABASE_PUBLISHABLE_KEY do .env).
--   * A função coletar-precos faz o trabalho privilegiado com a service_role
--     injetada automaticamente pelo Supabase — não precisa de segredo aqui.
-- Troque <ANON_KEY> pela publishable/anon key do projeto.
select cron.schedule('coletar-precos-automatico', '0 * * * *', $$
  select net.http_post(
    url := 'https://wflarolzpwwecyarwpci.supabase.co/functions/v1/coletar-precos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'apikey', '<ANON_KEY>'
    ),
    body := '{}'::jsonb
  );
$$);
