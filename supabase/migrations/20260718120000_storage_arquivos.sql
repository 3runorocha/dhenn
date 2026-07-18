-- Storage: bucket privado pros CSVs semanais + leitura por dono, e o cron
-- semanal que gera os arquivos. Ver a edge function supabase/functions/arquivar-semana.

-- Bucket privado (a função também cria via API caso não exista).
insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', false)
on conflict (id) do nothing;

-- Cada usuário lê/lista apenas a própria pasta ({user_id}/...).
drop policy if exists "arquivos_own_read" on storage.objects;
create policy "arquivos_own_read" on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Arquivamento semanal: segunda 06:00 UTC (03:00 BR). Pega a semana anterior
-- (seg-dom). Sem bearer — a função é deployada com verify_jwt = false (config.toml).
select cron.schedule('arquivar-semana', '0 6 * * 1', $$
  select net.http_post(
    url := 'https://wflarolzpwwecyarwpci.supabase.co/functions/v1/arquivar-semana',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);
