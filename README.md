# Hotel & Venue Platform

A multi-tenant SaaS platform for hotels and conference venues to manage facilities, bookings, and staff.

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | Next.js 14 (App Router) + TypeScript |
| UI          | Tailwind CSS v4 + shadcn/ui         |
| Database    | PostgreSQL via Prisma ORM            |
| Auth        | NextAuth.js (Auth.js v5) — Sprint 1 CON-5 |
| Deployment  | Vercel (frontend/API) + Railway (DB) |

## Local Development Setup

### Prerequisites

- Node.js 22+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the local PostgreSQL instance)

### Quick start (Docker — recommended)

```bash
# 1. Clone and install
git clone <repo-url>
cd ConferaSystems
npm install

# 2. Copy env file — Docker values are pre-filled, no editing needed
cp .env.example .env.local

# 3. Start Postgres, apply migrations, seed, and launch dev server in one step
npm run dev:local
```

Open [http://localhost:3000](http://localhost:3000).  
Demo credentials: `admin@granddemo.local` / `admin1234`

### Step-by-step (manual Docker)

```bash
# Start Postgres container
npm run docker:up          # or: docker compose up -d

# Apply migrations and seed
npm run db:migrate
npm run db:seed

# Start Next.js
npm run dev
```

### Reset the database

```bash
npm run docker:reset       # wipe volume (full reset)
npm run docker:up
npm run db:migrate
npm run db:seed
```

### Configure environment

The `.env.example` file contains ready-to-use Docker connection strings. Copy it:

```bash
cp .env.example .env.local
```

Key variables:

| Variable | Local Docker value |
|----------|--------------------|
| `DATABASE_URL` | `postgresql://confera:confera_dev@localhost:5432/confera_platform` |
| `AUTH_SECRET` | `dev-secret-change-me-in-production` |
| `NEXTAUTH_URL` | `http://localhost:3000` |

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js development server |
| `npm run dev:local` | Start Docker Postgres + migrate + seed + dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type-check (no emit) |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting (CI) |
| `npm run docker:up` | Start Postgres container |
| `npm run docker:down` | Stop Postgres container |
| `npm run docker:reset` | Stop and wipe DB volume |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations (dev) |
| `npm run db:migrate:deploy` | Run migrations (production) |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Reset DB (wipe + re-migrate) |
| `npm run db:push` | Push schema to DB without migration |
| `npm run db:studio` | Open Prisma Studio |

## Project Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── layout.tsx       # Root layout
│   ├── page.tsx         # Landing page
│   └── dashboard/       # Dashboard placeholder
├── components/
│   └── ui/              # shadcn/ui components
└── lib/
    ├── prisma.ts         # Prisma client singleton
    └── utils.ts          # Utility helpers (cn, etc.)
prisma/
├── schema.prisma         # Database schema (core domain models)
└── migrations/           # Prisma migrations
.github/
└── workflows/
    └── ci.yml            # GitHub Actions: lint + typecheck + build
```

## Deployment

### 1. Provision a Supabase database

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → Database → Connection string** and copy the **Transaction pooler** connection string (use port `6543` and `?pgbouncer=true`). This is your `DATABASE_URL` for Vercel runtime.
3. For running migrations, use the **Session pooler** or the direct connection string (port `5432`). Keep this as `DIRECT_URL` — never set it in Vercel env vars, use it only from your local machine or CI.
4. Apply migrations from your local machine:
   ```bash
   DATABASE_URL="<your-direct-connection-string>" npx prisma migrate deploy
   ```
5. (Optional) Apply seed data:
   ```bash
   DATABASE_URL="<your-direct-connection-string>" npm run db:seed
   ```

### 2. Deploy to Vercel

1. Import your GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Vercel will auto-detect Next.js. The build command (`npm run build`) already runs `prisma generate` before building.
3. Add the following **Environment Variables** in the Vercel dashboard (Settings → Environment Variables):

   | Variable | Description |
   |----------|-------------|
   | `DATABASE_URL` | Supabase Transaction Pooler connection string |
   | `AUTH_SECRET` | Random 32-char secret (`openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | Your production URL, e.g. `https://your-app.vercel.app` |
   | `RESEND_API_KEY` | (Optional) Resend API key for email confirmations |
   | `EMAIL_FROM` | (Optional) Verified sender email address |

4. Deploy. Vercel automatically:
   - Deploys **preview environments** on every pull request.
   - Deploys **production** on every push to `main`.

### 3. GitHub Actions (CI/CD)

The `.github/workflows/ci.yml` pipeline runs on every PR and push to `main`:
- **Lint → Typecheck → Build** on every PR.
- **Preview deploy** to Vercel on PRs (requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets in GitHub).
- **Production deploy** to Vercel on push to `main`.

Add these GitHub repository secrets:

| Secret | Where to get it |
|--------|----------------|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel → Team/Account Settings → General (Team ID) |
| `VERCEL_PROJECT_ID` | Vercel → Project Settings → General |

### Health Check

After deployment, verify the app is running:

```bash
curl https://your-app.vercel.app/api/health
# → {"status":"ok","timestamp":"2026-..."}
```

## CI

GitHub Actions runs lint + typecheck + build on every pull request, and triggers Vercel preview/production deploys (`.github/workflows/ci.yml`).

## Architecture

See the technical architecture document in [CON-2](/CON/issues/CON-2#document-plan) for full stack decisions, domain model, and phased roadmap.
