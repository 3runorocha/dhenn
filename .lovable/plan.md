# Plano: Monitor de Preços — Supermercados AL

Aplicativo pessoal para acompanhar preços de produtos usando a API pública da SEFAZ/AL. Interface 100% em pt-BR.

## 1. Infra & Backend (Lovable Cloud / Supabase)

- Habilitar Lovable Cloud.
- Secret `SEFAZ_APP_TOKEN` (token da SEFAZ/AL).
- Migrations criando as tabelas: `produtos`, `estabelecimentos`, `historico_precos`, `estabelecimentos_usuario`, `configuracoes` — com RLS estrita por `user_id` e GRANTs apropriados.
- Trigger para criar linha em `configuracoes` ao registrar usuário (com defaults).
- Índices: `historico_precos(produto_id, consultado_em)`, `historico_precos(estabelecimento_cnpj)`.

## 2. Autenticação

- Supabase Auth: email + senha (sem confirmação por email para uso pessoal).
- Tela `/auth` (login + cadastro em abas).
- Layout protegido `_authenticated/` gerenciado pela integração.

## 3. Edge Functions

- **`coletar-precos`**: para cada produto do usuário com `gtin`, chama
  `POST http://api.sefaz.al.gov.br/sfz-economiza-alagoas-api/api/public/produto/pesquisa`
  com header `AppToken`, usando lat/lng/raio das `configuracoes`. Faz upsert em
  `estabelecimentos`, garante `estabelecimentos_usuario` (ativo=true), insere em
  `historico_precos`. Roda para todos os usuários quando chamada por cron.
- **`geocode`**: recebe `endereco`, consulta Nominatim
  (`https://nominatim.openstreetmap.org/search?format=json&q=...` com User-Agent),
  retorna `{ latitude, longitude }`.
- **`buscar-produto`**: pesquisa GTIN/descrição na API SEFAZ para a aba "buscar por nome"
  (usa coordenadas do usuário).
- Agendamento: `pg_cron` + `pg_net` chamando `coletar-precos` a cada hora.

## 4. Frontend (rotas)

- `/auth` — login/cadastro.
- `/` (Dashboard, protegido):
  - Seletor de produto.
  - Cabeçalho: preço atual, menor preço 30d, seta de tendência.
  - Gráfico de linha (recharts) — menor preço por dia entre estabelecimentos ATIVOS, últimos 30 dias.
  - Lista de estabelecimentos ativos que venderam o produto, ordenada por preço, menor destacado.
  - Grid de cards com demais produtos (nome, preço atual, menor 30d).
  - Botão "Adicionar produto" (abre modal/rota).
- `/produtos/novo` — abas "Código de barras" e "Buscar por nome".
- `/estabelecimentos` — lista todos com checkbox ativo/inativo.
- `/configuracoes` — endereço + botão geocode, slider raio (1–15 km), toggle tema, color picker hex, salvar.

Todos os cálculos do dashboard filtram por `estabelecimentos_usuario.ativo = true`.

## 5. Tema & Personalização

- Tokens em `src/styles.css` via `@theme inline` mapeando `--primary` para variável CSS dinâmica.
- ThemeProvider no root: lê `configuracoes` do usuário, aplica classe `dark` no `<html>` e seta `--primary` (convertido hex → oklch) em runtime.
- Toggle de tema no header.
- Color picker atualiza `--primary` em tempo real e persiste ao salvar.

## 6. Stack & Bibliotecas

- TanStack Start + React + Tailwind v4 + shadcn/ui (já no template).
- `recharts` para o gráfico.
- TanStack Query para fetching e cache.
- Server functions (`createServerFn` + `requireSupabaseAuth`) para CRUD; Edge Functions apenas para SEFAZ, geocode e cron.

## 7. Detalhes técnicos

- Conversão de cor hex → oklch via `culori` (leve) para preencher os tokens shadcn.
- Funções de agregação para "menor preço por dia" rodam no Postgres via RPC para performance.
- Tratamento de erros amigável (toasts via sonner).
- Layout responsivo, mobile-first.

## 8. Ordem de implementação

1. Habilitar Cloud + criar migrations + secret.
2. Criar Edge Functions + agendamento pg_cron.
3. Server functions + helpers Supabase.
4. Auth + layout protegido + tema.
5. Dashboard + gráfico.
6. Adicionar produto + Estabelecimentos + Configurações.
7. Polimento visual pt-BR + responsivo.

Confirma para eu seguir? Vou precisar do `SEFAZ_APP_TOKEN` em algum momento — peço quando o backend estiver pronto.
