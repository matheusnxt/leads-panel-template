# Leads Panel

Painel de gestão de leads em tempo real, integrado ao **Meta Ads**, com views
Lista e Kanban, filtros, lead scoring, deduplicação, analytics, importação de
planilhas, eventos e controle de usuários por permissão.

Feito para ser **replicável**: clone, configure as variáveis de ambiente da sua
empresa e suba. Nenhum dado de cliente vai no repositório.

## Stack
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **CSS Modules** (sem Tailwind) — design minimalista, dark mode
- **Supabase** (PostgreSQL + Auth + Realtime + Storage)
- Deploy na **Vercel**

## Funcionalidades
- Views **Lista** (colunas selecionáveis/reordenáveis, paginação) e **Kanban** (drag & drop)
- Filtros: busca, multi-formulário, período, faixa de score
- **Lead scoring** 0–100 com gauge visual
- **Deduplicação** não-destrutiva (unifica por telefone OU email exatos)
- **Analytics** por origem (donut, barras, cards)
- Ingestão via **webhook do Meta Ads**, **backfill**, **planilhas CSV/XLSX** e **API do site**
- **Telefones** normalizados para `+55 (DD) 9 XXXX-XXXX` (DDI correto p/ outros países)
- **Eventos** com formulário público de inscrição
- **Usuários** com papéis (admin/usuário) e permissões por aba
- Exportação CSV/XLSX/PDF, log de atividades, dark mode

---

## Como replicar (passo a passo)

### 1. Clonar e instalar
```bash
git clone <URL_DO_SEU_FORK>
cd leads-panel
npm install
```

### 2. Criar o projeto no Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, cole e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) (cria tabelas + RLS).
3. Em **Project Settings → API**, copie a `URL`, a `anon key` e a `service_role key`.
4. (Opcional) Em **Storage**, crie um bucket **privado** chamado `exports` para os arquivos exportados.

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env.local
```
Preencha `.env.local` com os dados do seu Supabase e o nome da sua empresa
(`NEXT_PUBLIC_APP_NAME`). Veja [`.env.example`](.env.example) para a lista completa.

### 4. Rodar localmente
```bash
npm run dev
```

### 5. Criar o primeiro administrador
Com a app rodando (local ou em produção), chame o bootstrap **uma vez**
(usa o `WEBHOOK_VERIFY_TOKEN` que você definiu):
```bash
curl -X POST "http://localhost:3000/api/auth/bootstrap?token=SEU_WEBHOOK_VERIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","name":"Admin","password":"trocar-senha"}'
```
Depois é só acessar `/login` com esse usuário. Novos usuários são criados pela aba **Usuários**.

### 6. Deploy na Vercel
Suba o repositório na Vercel e replique as variáveis de ambiente do `.env.local`
em **Project Settings → Environment Variables** (marque as `service_role`/tokens
como *sensitive*). Faça o deploy.

---

## Integração com Meta Ads (opcional)
1. Crie um App no [Meta for Developers](https://developers.facebook.com) com o produto **Webhooks** + **Leads Access**.
2. Gere um **Page Access Token** (via System User do Business Manager, não expira) → `META_PAGE_ACCESS_TOKEN`.
3. Preencha `META_APP_SECRET` e `META_PAGE_ID`.
4. Configure o webhook para `https://SEU_DOMINIO/api/webhook/meta`, campo `leadgen`, usando o `WEBHOOK_VERIFY_TOKEN`.
5. Importe o histórico: `POST /api/backfill?token=SEU_TOKEN&max=1000`.

> Como o Meta às vezes não entrega o webhook, vale agendar um backfill periódico
> (ex.: `pg_cron` + `pg_net` no Supabase chamando `/api/backfill` a cada 5 min).

## Ingestão de leads do site (opcional)
`POST /api/leads/site` insere um lead com `source: 'site'`. Se `SITE_LEADS_TOKEN`
estiver definido, exija-o no header `x-api-token`.

## Scripts utilitários (`scripts/`)
Rodam com a `service_role` via env (`SUPABASE_URL` + `SUPABASE_KEY`):
- `audit-dedupe.mjs` — audita unificações de leads (telefone/email).
- `migrate-phones.mjs` — reformata todos os telefones da base (dry-run por padrão; `--apply` grava; faz backup antes).

## Personalização de marca
- Nome: `NEXT_PUBLIC_APP_NAME`.
- Cores: variáveis `--brand-*` em [`src/app/globals.css`](src/app/globals.css).
