# MOREL V3 — GitHub Auth Spec v1

> **Core requirement:** The GitHub auth feature is built directly inside the real `morel-v3` monorepo from day one. Auth code lives in `apps/web/src/features/auth/`. The Cloudflare Worker lives in `workers/github-auth-exchange/`. There is no separate demo repo and no `packages/*` layer yet.

______________________________________________________________________

## Monorepo Context

This spec targets the `morel-v3` monorepo directly. The auth feature is not an isolated demo — it is the first feature of the real app, scaffolded in the real repo from day one.

The workspace is already configured in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "workers/*"
```

The two packages in scope for this spec:

| Package | Path | Role |
| -- | -- | -- |
| `@morel/web` | `apps/web/` | Vite + React SPA — the main application |
| `@morel/github-auth-worker` | `workers/github-auth-exchange/` | Cloudflare Worker — GitHub OAuth code exchange |

No `packages/*` workspace is needed yet. Auth types, schemas, PKCE helpers, and vault logic all live inside `apps/web/src/features/auth/`. The worker keeps its own local copy of the schemas it needs. This is a known trade-off: if the same schemas grow to be needed in multiple workers, a shared `packages/auth-core` can be extracted then.

______________________________________________________________________

## Repository Structure (auth scope)

Only the files and folders relevant to the auth feature are listed. The rest of the monorepo structure is defined in the general spec.

```plaintext
morel-v3/
  package.json
  pnpm-workspace.yaml          ← already configured: apps/*, workers/*
  pnpm-lock.yaml
  tsconfig.base.json
  apps/
    web/
      package.json
      index.html
      vite.config.ts
      tsconfig.json
      components.json
      src/
        main.tsx
        app/
          router.tsx
          providers.tsx
        routes/
          index.tsx
          auth.callback.tsx
          settings.security.tsx
        features/
          auth/
            types/
              githubAuth.types.ts
              vault.types.ts
            schemas/
              githubAuth.schema.ts
              vault.schema.ts
            crypto/
              pkce.ts
              random.ts
            hooks/
              useGitHubAuth.ts
            components/
              ConnectGitHub.tsx
              AuthStatus.tsx
            vault/
              indexeddb.ts
              opfs.ts
              vault.ts
            index.ts
        components/
          ui/               ← shadcn/ui components
        lib/
          queryClient.ts
          errors.ts
  workers/
    github-auth-exchange/
      package.json
      wrangler.toml
      tsconfig.json
      src/
        index.ts
        routes/
          health.ts
          exchange.ts
        lib/
          cors.ts
          validate.ts
        schemas/
          worker.schema.ts  ← worker-local copy; extracted to packages/ if reused
```

______________________________________________________________________

## `apps/web/package.json`

```json
{
  "name": "@morel/web",
  "private": true,
  "type": "module",
  "dependencies": {
    "@octokit/rest": "catalog:",
    "@tanstack/react-query": "catalog:",
    "@tanstack/react-router": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "echo \"lint not configured yet\"",
    "test": "echo \"tests not configured yet\"",
    "clean": "rm -rf dist .vite"
  }
}
```

______________________________________________________________________

## `workers/github-auth-exchange/package.json`

```json
{
  "name": "@morel/github-auth-worker",
  "private": true,
  "type": "module",
  "dependencies": {
    "hono": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "wrangler": "catalog:"
  },
  "scripts": {
    "dev": "wrangler dev",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "lint": "echo \"lint not configured yet\"",
    "test": "echo \"tests not configured yet\"",
    "clean": "rm -rf dist .wrangler"
  }
}
```

______________________________________________________________________

## Root `pnpm-workspace.yaml` — Catalog

The existing `pnpm-workspace.yaml` only needs the `catalog:` block added. The `packages:` list stays as-is — no `packages/*` entry.

```yaml
packages:
  - "apps/*"
  - "workers/*"
catalog:
  "@vitejs/plugin-react": "^6.0.0"
  "@types/react": "^19.0.0"
  "@types/react-dom": "^19.0.0"
  "vite": "^6.0.0"
  "typescript": "^5.0.0"
  "react": "^19.0.0"
  "react-dom": "^19.0.0"
  "zod": "^3.0.0"
  "@tanstack/react-query": "^5.0.0"
  "@tanstack/react-router": "^1.0.0"
  "@octokit/rest": "^21.0.0"
  "wrangler": "^4.0.0"
  "hono": "^4.0.0"
```

> Replace these ranges with exact versions after running `pnpm install` the first time and reviewing the lock file.

______________________________________________________________________

## Auth Feature: What Lives Where

### `apps/web/src/features/auth/`

Everything the browser needs for GitHub auth:

- **`types/`** — TypeScript interfaces for GitHub auth methods, credentials, vault payloads
- **`schemas/`** — Zod schemas for runtime validation (GitHub API responses, vault entries)
- **`crypto/`** — PKCE code verifier/challenge generation, random state helpers
- **`hooks/`** — React hooks (`useGitHubAuth`, `useAuthStatus`)
- **`components/`** — UI components (`ConnectGitHub`, `AuthStatus`)
- **`vault/`** — Encrypted credential storage using IndexedDB (primary) and OPFS (fallback)
- **`index.ts`** — Public exports from the feature

**Not here:** Worker-side secret exchange logic.

### `workers/github-auth-exchange/src/`

Everything the Cloudflare Worker needs:

- **`routes/health.ts`** — `GET /health`
- **`routes/exchange.ts`** — `POST /exchange` — receives the OAuth code, calls GitHub, returns token
- **`lib/cors.ts`** — CORS middleware
- **`lib/validate.ts`** — Request validation helpers
- **`schemas/worker.schema.ts`** — Worker-local Zod schemas for request/response shapes

**Not here:** Browser-only vault code or React components.

______________________________________________________________________

## pnpm Commands

```sh
# Install all workspace packages
pnpm install

# Run the Vite app
pnpm dev
# or:
pnpm --filter @morel/web dev

# Run the Cloudflare Worker
pnpm dev:worker
# or:
pnpm --filter @morel/github-auth-worker dev

# Typecheck all packages
pnpm -r typecheck

# Build all packages
pnpm -r build
```

______________________________________________________________________

## pnpm 11 Config Policy

| File | Purpose |
| -- | -- |
| `pnpm-workspace.yaml` | Workspace package list, catalogs, pnpm behavior settings |
| `.npmrc` | Registry/auth settings only (if needed) |
| `package.json` (root) | Scripts and root metadata only |

Do not put package-manager config in subproject `package.json` files.

______________________________________________________________________

## Implementation Plan

### Phase 1 — Monorepo Scaffold

- [ ] Add `catalog:` block to root `pnpm-workspace.yaml`
- [ ] Scaffold `apps/web/` with `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`
- [ ] Scaffold `workers/github-auth-exchange/` with `package.json`, `wrangler.toml`, `tsconfig.json`
- [ ] Update root `package.json` scripts (`dev`, `dev:worker`, `build`, `typecheck`, etc.)
- [ ] Run `pnpm install` and commit `pnpm-lock.yaml`

**Acceptance criteria:**

- `pnpm install` works from repo root
- `pnpm --filter @morel/web dev` starts the Vite app
- `pnpm --filter @morel/github-auth-worker dev` starts the Worker
- `pnpm -r typecheck` passes across both packages

______________________________________________________________________

### Phase 2 — App Shell (`apps/web/`)

- [ ] Configure TanStack Router
- [ ] Configure TanStack Query
- [ ] Install shadcn/ui
- [ ] Add `routes/index.tsx` — dashboard/home
- [ ] Add `routes/auth.callback.tsx` — OAuth callback handler
- [ ] Add `routes/settings.security.tsx` — credential management UI

______________________________________________________________________

### Phase 3 — Worker Shell (`workers/github-auth-exchange/`)

- [ ] Add `GET /health`
- [ ] Add CORS middleware
- [ ] Add request validation helpers
- [ ] Add `POST /exchange` stub

______________________________________________________________________

### Phase 4 — Auth Feature (`apps/web/src/features/auth/`)

- [ ] Auth types and Zod schemas
- [ ] PKCE helpers (`crypto/pkce.ts`, `crypto/random.ts`)
- [ ] IndexedDB vault (`vault/indexeddb.ts`)
- [ ] OPFS vault fallback (`vault/opfs.ts`)
- [ ] Vault orchestrator (`vault/vault.ts`)
- [ ] `useGitHubAuth` hook
- [ ] `ConnectGitHub` component

______________________________________________________________________

### Phase 5 — GitHub Auth Methods

Implement in this order:

- [ ] Fine-grained PAT + Octokit (simplest, no redirect flow)
- [ ] GitHub OAuth App (PKCE + Worker code exchange)
- [ ] GitHub App user auth flow

______________________________________________________________________

### Phase 6 — Polish

- [ ] Error handling and user feedback
- [ ] Auth state persistence across reloads
- [ ] `SECURITY.md` with threat model
- [ ] Local dev documentation
