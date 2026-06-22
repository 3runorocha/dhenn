# Monitor de Preços — Supermercados (Alagoas)

App de monitoramento de preços que usa a API pública do **Economiza Alagoas (SEFAZ-AL)**
para acompanhar o preço de produtos de supermercado ao longo do tempo.

- **Frontend / SSR:** TanStack Start (React 19) + Nitro — é o que roda na **VM da Oracle**.
- **Backend:** Supabase Cloud (Postgres + Auth + Edge Functions + pg_cron) — **não** roda na VM.
- **Coleta:** edge function `coletar-precos` agendada por `pg_cron` (a cada 6h) + botão "Coletar agora".

```
Navegador ──HTTP──> VM Oracle (Node/Nitro, este app) ──HTTPS──> Supabase Cloud
                                                                  │
                                          Edge Functions ─────────┘──> API SEFAZ-AL / Nominatim
```

---

## Pré-requisitos

- Conta no [Supabase](https://supabase.com) com o projeto já criado (ref em `supabase/config.toml`).
- AppToken da API do Economiza Alagoas (SEFAZ-AL).
- Uma VM na Oracle Cloud (Ubuntu 22.04+ ou Oracle Linux 9; funciona no free tier ARM/Ampere ou AMD).

---

## Parte 1 — Backend (Supabase Cloud), uma vez

Feito da sua máquina (ou da VM), com a [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
# 1. Login e vínculo com o projeto
supabase login
supabase link --project-ref rlhzpdjthpmsxwufjuld

# 2. Aplica as migrations (tabelas, RLS, índices, cron)
supabase db push

# 3. Secret do AppToken da SEFAZ (NUNCA colocar no código/.env)
supabase secrets set SEFAZ_APP_TOKEN="seu-app-token-aqui"

# 4. Deploy das edge functions
supabase functions deploy geocode
supabase functions deploy buscar-produto
supabase functions deploy coletar-precos
```

No **SQL Editor** do dashboard, configure a chave usada pelo cron para chamar a função
(fica só no banco, fora do código) e garanta as extensões:

```sql
-- usada pelo job pg_cron em coletar-precos
alter database postgres set app.service_role_key = 'SUA_SERVICE_ROLE_KEY';

-- caso ainda não estejam ativas (Database > Extensions também resolve)
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

> A migration `..._cron_coletar_precos.sql` agenda a coleta a cada 6 horas
> (`0 */6 * * *`). Confira em **Database > Cron Jobs** se `coletar-precos-automatico` aparece.

---

## Parte 2 — Frontend na VM da Oracle

### 2.1 Liberar a porta (o passo que todo mundo esquece na Oracle)

A Oracle bloqueia em **dois** níveis — precisa abrir nos dois:

**a) Console da Oracle Cloud** — VCN → Subnet → *Security List* (ou NSG da instância) →
adicione uma *Ingress Rule*: `Source 0.0.0.0/0`, `TCP`, porta `80` e `443`
(ou `3000` se for expor a porta do app direto, sem proxy).

**b) Firewall do SO:**

```bash
# Ubuntu (iptables) — as imagens da Oracle vêm com INPUT fechado
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Oracle Linux (firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 2.2 Instalar o runtime

O projeto usa **bun** (há `bun.lock`). Instale bun (Node 20+ também serve para rodar o build):

```bash
curl -fsSL https://bun.sh/install | bash
exec $SHELL        # recarrega o PATH
bun --version
```

### 2.3 Clonar e configurar variáveis

```bash
git clone <url-do-seu-repo> dhenn
cd dhenn
```

O `.env` já vem commitado com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
(são valores públicos). Confirme que existe e está correto:

```bash
cat .env
```

> ⚠️ Nunca adicione a **service_role key** ou o **SEFAZ_APP_TOKEN** ao `.env` — eles ficam
> só nos secrets do Supabase (Parte 1). As variáveis `VITE_*` são lidas em **tempo de build**.

### 2.4 Instalar dependências e buildar (preset Node)

O build padrão mira Cloudflare; para a VM force o preset Node do Nitro:

```bash
bun install
NITRO_PRESET=node-server bun run build
```

Isso gera o servidor em `.output/server/index.mjs`.

> Se o `.output/server/index.mjs` não for criado (o build saiu como worker Cloudflare),
> adicione o preset no `vite.config.ts` via `defineConfig({ nitro: { preset: "node-server" } })`
> e rode `bun run build` de novo.

### 2.5 Rodar

```bash
PORT=3000 HOST=0.0.0.0 node .output/server/index.mjs
```

Teste localmente na VM: `curl http://localhost:3000`. Pelo navegador:
`http://<IP-PÚBLICO-DA-VM>:3000`.

### 2.6 Manter no ar (systemd)

Crie `/etc/systemd/system/dhenn.service` (ajuste usuário e caminho):

```ini
[Unit]
Description=Monitor de Precos (TanStack Start)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/dhenn
Environment=PORT=3000
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node /home/ubuntu/dhenn/.output/server/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dhenn
sudo systemctl status dhenn
journalctl -u dhenn -f     # logs ao vivo
```

### 2.7 (Recomendado) Nginx + HTTPS

Para servir em 80/443 com domínio e TLS:

```bash
sudo apt install -y nginx
```

`/etc/nginx/sites-available/dhenn`:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dhenn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS grátis com Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

---

## Atualizar o app depois de mudanças

```bash
cd ~/dhenn
git pull
bun install
NITRO_PRESET=node-server bun run build
sudo systemctl restart dhenn
```

---

## Desenvolvimento local

```bash
bun install
bun run dev        # http://localhost:3000
```

| Script            | O que faz                          |
| ----------------- | ---------------------------------- |
| `bun run dev`     | servidor de desenvolvimento (HMR)  |
| `bun run build`   | build de produção                  |
| `bun run preview` | pré-visualiza o build              |
| `bun run lint`    | ESLint                             |
