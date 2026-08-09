# DevMate AI

AI-powered code scanning, PR review, and repo chat — built with a NestJS API, a Next.js web app, and an offline-by-default AI engine that needs **zero API keys**.

Created by Aatmadip Ghosh.

## What it does

- **Code scans** — detect security issues, bugs, performance problems, and style debt in uploaded projects or GitHub repos (offline rule engine, no keys required).
- **AI-assisted PR review** — LLM review when `OPENAI_API_KEY` is set, merged with static analysis otherwise.
- **Repo chat** — ask questions about your codebase with citations (LLM or offline retrieval).
- **Auth & plans** — email/Google/GitHub OAuth, free/pro plans, usage quotas.

## Stack

- `apps/api` — NestJS + Prisma + JWT (SQLite locally, Postgres on Render)
- `apps/web` — Next.js 14 (App Router, `output: standalone`) + Tailwind
- `packages/ai` — LLM provider (OpenAI-compatible) + offline fallback engine
- `packages/shared` — shared types

## Local development

Requires Node 18+ (tested on Node 20/24) and npm.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run db:push   # creates SQLite db + Prisma client
npm run db:seed   # optional: seeds tester@devmate.ai / secret123 (pro)
npm run dev       # API on :4000, web on :3000
```

- API health: http://localhost:4000/api/health
- AI status: http://localhost:4000/api/ai/status
- Web: http://localhost:3000

### Using a real LLM (optional)

Set in `apps/api/.env` (no key = offline engine everywhere):

```env
AI_PROVIDER=openai-compatible
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1   # any OpenAI-compatible endpoint works
```

## Deploy for free (Vercel + Render + Supabase)

Free hosting split across three providers (no credit card required):
- **Web** (Next.js) → **Vercel** (free)
- **API** (NestJS) → **Render** (free, native Node — no Docker)
- **Database** → **Supabase** (free Postgres)

### 1. Database — Supabase (free)

1. New project at [supabase.com](https://supabase.com) → set a strong database password.
2. Project Settings → **Database** → copy the **Direct connection** URI
   (`postgresql://postgres.<ref>:<password>@<host>:5432/postgres`).
3. Append `?sslmode=require` → this is `DATABASE_URL`.

### 2. API — Render (free)

1. Sign up at [render.com](https://render.com) → **New → Web Service** → connect GitHub → select the `DevMate.ai` repo, branch `main`.
2. Runtime auto-detects **Node**. Set:
   - **Build Command**:
     ```
     npm ci && npm run build -w @devmate/shared && npm run build -w @devmate/ai && npm run build -w @devmate/api && cp apps/api/prisma/schema.postgres.prisma apps/api/prisma/schema.prisma && cd apps/api && npx prisma generate
     ```
   - **Start Command**:
     ```
     cd apps/api && npx prisma db push --skip-generate && node dist/main.js
     ```
3. Instance type: **Free**.
4. **Environment variables**:
   - `DATABASE_URL` = the Supabase URI
   - `JWT_SECRET` = any long random string (`openssl rand -hex 32`)
   - `NODE_ENV` = `production`
   - `AI_PROVIDER` = `offline`
   - `FRONTEND_URL` = `https://devmate-web.vercel.app` (update after step 3)
5. Deploy. On first boot `prisma db push` creates the schema.

The deployed API URL will be `https://devmate-api.onrender.com`.

### 3. Web — Vercel (free)

1. Sign up at [vercel.com](https://vercel.com) → **Add New Project** → import the `DevMate.ai` repo.
2. **Root Directory**: `apps/web`. Framework preset: **Next.js**.
3. **Build Command** (builds the shared workspace package first):
   ```
   cd ../.. && npm run build -w @devmate/shared && cd apps/web && next build
   ```
4. **Environment variables** (set in Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL` = `https://devmate-api.onrender.com/api`
   - `NEXT_PUBLIC_APP_URL` = `https://devmate-web.vercel.app`
5. Deploy. Then set `FRONTEND_URL` on the Render service to the Vercel URL.

### Architecture

```
Browser ──> devmate-web.vercel.app (Next.js) ──> devmate-api.onrender.com (NestJS) ──> Supabase Postgres
```

The browser calls `NEXT_PUBLIC_API_URL` directly (CORS allows any origin); auth
uses Bearer tokens, so no cookies/CORS headaches.

Free-tier notes:

- Render free web services **sleep after ~15 min idle** and wake on the next request (first call takes ~30–60 s).
- Supabase DB pauses only after ~7 days of inactivity and wakes automatically.
- Uploaded project files are stored in the database; the API disk is ephemeral.
- To use a real LLM later, set `AI_PROVIDER=openai-compatible` and `OPENAI_API_KEY` on the Render service.

## Production notes

- The local SQLite schema is `apps/api/prisma/schema.prisma`; the deployable Postgres variant is `apps/api/prisma/schema.postgres.prisma` (kept in sync, swapped in by the build command before `prisma generate`).
- Schema migrations run automatically at container start (`prisma db push`).
- Add Google/GitHub OAuth keys via `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` on the Render service.
