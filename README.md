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

## Deploy to Render (free)

The project ships a Render blueprint (`render.yaml`) plus production Dockerfiles.

1. **Push to GitHub** — create an empty repo, then:

   ```bash
   cd devmate-ai
   git init
   git add .
   git commit -m "DevMate AI"
   git remote add origin https://github.com/<you>/devmate-ai.git
   git push -u origin main
   ```

2. **Edit `render.yaml`** — replace `YOUR_GITHUB_USERNAME` in the two `repo:` fields with your GitHub username.

3. **Create the blueprint** — on [render.com](https://render.com) → **New → Blueprint** → select your repo. Render provisions three free resources automatically:
   - `devmate-api` (NestJS) with `DATABASE_URL` wired to the Postgres DB and a generated `JWT_SECRET`
   - `devmate-web` (Next.js)
   - `devmate-db` (free Postgres)

4. **Apply** — wait for both services to build and deploy. Open the web URL and register a new account.

Notes about the free tier:

- Free web services **sleep after 15 min idle** and wake on the next request (takes ~30–60 s).
- Free Postgres **sleeps** and spins back up on the first query after ~10–20 s.
- Uploaded project files are stored in the database, so they survive restarts; the API **disk is ephemeral**.
- To upgrade AI to a real LLM later, set `AI_PROVIDER=openai-compatible` and `OPENAI_API_KEY` on the `devmate-api` service (no redeploy needed, hot-restart only).

### Architecture on Render

```
Browser ──> devmate-web.onrender.com ──(server-side /api rewrite)──> devmate-api.onrender.com ──> Postgres
```

The browser talks only to `devmate-web` (same-origin `/api`), so no CORS concerns. `NEXT_PUBLIC_API_URL` on the web service points the Next server at the API.

## Production notes

- The local SQLite schema is `apps/api/prisma/schema.prisma`; the deployable Postgres variant is `apps/api/prisma/schema.postgres.prisma` (kept in sync, swapped in by the API Dockerfile before `prisma generate`).
- Schema migrations on Render run automatically at container start (`prisma db push`).
- Add Google/GitHub OAuth keys via `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` on the API service.
