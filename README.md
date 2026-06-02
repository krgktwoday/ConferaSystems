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
- PostgreSQL 15+ running locally (or use [Railway](https://railway.app) / [Supabase](https://supabase.com))

### 1. Clone and install

```bash
git clone <repo-url>
cd hotel-platform
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/hotel_platform?schema=public"
```

### 3. Set up the database

```bash
# Apply Prisma migrations and generate client
npm run db:migrate

# (Optional) Open Prisma Studio to browse data
npm run db:studio
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type-check (no emit) |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting (CI) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
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

### Vercel (Frontend + API)

1. Connect your GitHub repo to [Vercel](https://vercel.com)
2. Set environment variables in the Vercel project settings:
   - `DATABASE_URL` — your production PostgreSQL connection string
   - `NEXTAUTH_SECRET` — a random 32-character secret
   - `NEXTAUTH_URL` — your production URL (e.g. `https://your-app.vercel.app`)
3. Vercel will automatically deploy previews on every pull request and deploy `main` to production

### Database (Railway)

1. Create a PostgreSQL instance on [Railway](https://railway.app)
2. Copy the `DATABASE_URL` from Railway → Project → Variables
3. Run `npm run db:migrate` against the production DB on first deploy

## CI

GitHub Actions runs lint + typecheck + build on every pull request (`.github/workflows/ci.yml`).

## Architecture

See the technical architecture document in [CON-2](/CON/issues/CON-2#document-plan) for full stack decisions, domain model, and phased roadmap.
