-- Categorias de produto, por usuário. O produto referencia uma categoria (opcional).
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (user_id, nome)
);
create index categorias_user_id_idx on public.categorias(user_id);
grant select, insert, update, delete on public.categorias to authenticated;
grant all on public.categorias to service_role;
alter table public.categorias enable row level security;
create policy "categorias_owner_all" on public.categorias for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.produtos
  add column if not exists categoria_id uuid references public.categorias(id) on delete set null;
