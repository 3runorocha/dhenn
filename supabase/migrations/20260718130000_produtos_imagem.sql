-- Imagens de produto (PNG/WebP/JPG). A coluna produtos.imagem_path guarda o
-- caminho no bucket público "produtos-img"; a leitura é pública, a escrita é
-- restrita à pasta do próprio usuário ({user_id}/...).

insert into storage.buckets (id, name, public)
values ('produtos-img', 'produtos-img', true)
on conflict (id) do nothing;

drop policy if exists "produtos_img_insert" on storage.objects;
create policy "produtos_img_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos-img' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "produtos_img_update" on storage.objects;
create policy "produtos_img_update" on storage.objects for update to authenticated
  using (bucket_id = 'produtos-img' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "produtos_img_delete" on storage.objects;
create policy "produtos_img_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos-img' and (storage.foldername(name))[1] = auth.uid()::text);
