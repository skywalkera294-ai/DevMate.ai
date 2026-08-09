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

## Deploy to Koyeb (free)

The app ships as a single combined image (root `Dockerfile`) that runs the
NestJS API and the Next.js web together, so it fits on Koyeb's **one free
instance** (512 MB RAM). Data lives in **Supabase** (free Postgres, reliable).

1. **Push to GitHub** (already done if you cloned from this repo).

2. **Create the database on [supabase.com](https://supabase.com)** (free):
   - New project → pick a name/region → set a strong database password → create.
   - Project Settings → **Database** → scroll to "Connection string" → copy the
     **Direct connection** URI (port `5432`, `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`).
   - Append `?sslmode=require` to it. This becomes `DATABASE_URL`.

3. **Deploy on [koyeb.com](https://koyeb.com)** (free):
   - Create Web Service → **GitHub** → install the Koyeb GitHub app → select the `DevMate.ai` repo → branch `main`.
   - Builder: **Dockerfile** (root `Dockerfile`).
   - Instance type: **Free** (512 MB). Region: Frankfurt or Washington, D.C.
   - **Port: 8000** (http).
   - Environment variables:
     - `DATABASE_URL` — the Supabase URI from step 2
     - `JWT_SECRET` — any long random string (e.g. `openssl rand -hex 32`)
     - `NODE_ENV=production`
     - `AI_PROVIDER=offline`
     - `FRONTEND_URL=https://<your-app>.koyeb.app` (set after the first deploy, once you have the URL)
   - Deploy. On first boot the API runs `prisma db push` to create the schema.

### Architecture on Koyeb

```
Browser ──> <app>.koyeb.app:8000 (Next.js) ──/api rewrite──> localhost:4000 (NestJS) ──> Supabase Postgres
```

Both processes live in one container; the browser talks only to the Next
server (same-origin `/api`), so there are no CORS concerns.

Free-tier notes:

- The instance scales to zero after ~1 hour idle and wakes on the next request.
- The Next.js server listens on `PORT=8000`; the API binds `:4000` internally.
- Uploaded project files are stored in the database (survive restarts); the container disk is ephemeral.
- To use a real LLM later, set `AI_PROVIDER=openai-compatible` and `OPENAI_API_KEY` on the service.

## Production notes

- The local SQLite schema is `apps/api/prisma/schema.prisma`; the deployable Postgres variant is `apps/api/prisma/schema.postgres.prisma` (kept in sync, swapped in by the Dockerfile before `prisma generate`).
- Schema migrations run automatically at container start (`prisma db push`).
- Add Google/GitHub OAuth keys via `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` on the service.
