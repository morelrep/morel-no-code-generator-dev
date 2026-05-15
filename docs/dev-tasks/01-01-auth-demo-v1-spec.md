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
  tsconfig.json
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

## Auth Verification Strategy

Every auth method must provide **visible proof** that the connection actually works. The demo uses a two-channel approach: live UI feedback and structured console logs.

### UI feedback (`AuthStatus` component)

After a token is obtained (by any method), the app calls **`GET /user`** via Octokit. On success the `AuthStatus` card shows:

| Field | Source | UI element |
| -- | -- | -- |
| Avatar | `response.data.avatar_url` | `<img>` inside the card |
| Username | `response.data.login` | Primary text |
| Display name | `response.data.name` | Secondary text |
| Token scopes | `response.headers["x-oauth-scopes"]` | Comma-separated `badge` list |
| Auth method | Internal state (PAT / OAuth / GitHub App) | `badge` variant |
| Connection status | Derived from the API call result | `badge`: green "Connected", red "Failed", amber "Connecting…" |

On failure the card collapses to an `alert` with the HTTP status, error message, and a **Retry** button.

### Console logs (`authLogger`)

A thin `authLogger` utility wraps `console.group` / `console.log` / `console.error` to emit structured, timestamped entries for each step of the auth flow. Output is grouped per attempt so it's easy to follow in DevTools.

| Step | Log level | Example output |
| -- | -- | -- |
| Flow initiated | `info` | `[auth] PAT flow started` |
| Token received | `info` | `[auth] Token received (type: bearer)` |
| Verification call sent | `debug` | `[auth] GET /user …` |
| Verification succeeded | `info` | `[auth] ✓ Authenticated as @octocat (scopes: repo, read:org)` |
| Verification failed | `error` | `[auth] ✗ GET /user → 401 Bad credentials` |
| Worker exchange (OAuth) | `debug` | `[auth] POST /exchange → 200 (token redacted)` |
| Worker exchange failed | `error` | `[auth] POST /exchange → 502 GitHub upstream error` |

> **Security note:** Tokens are **never** logged. Only their type (`bearer`) and the resulting scopes are printed. The `authLogger` is stripped or silenced in production builds via a `import.meta.env.DEV` guard.

### Per-method verification details

**Fine-grained PAT** — User pastes the token → immediate `GET /user` call → UI shows result. If the token is malformed (fails Zod `github_pat_` prefix check) the error appears before any network call.

**GitHub OAuth App (PKCE)** — Redirect returns to `/auth/callback` with `code` + `state` → callback route exchanges via Worker → on success calls `GET /user` → UI shows result. Console logs both the Worker exchange step and the verification step.

**GitHub App** — Same as OAuth but the scopes badge shows the app installation permissions instead of user-level OAuth scopes.

______________________________________________________________________

## Implementation Plan

### Phase 1 — Monorepo Scaffold ✓

- [x] Add `catalog:` block to root `pnpm-workspace.yaml`
- [x] Scaffold `apps/web/` with `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`
- [x] Scaffold `workers/github-auth-exchange/` with `package.json`, `wrangler.toml`, `tsconfig.json`
- [x] Update root `package.json` scripts (`dev`, `dev:worker`, `build`, `typecheck`, etc.)
- [x] Run `pnpm install` and commit `pnpm-lock.yaml`

**Acceptance criteria:**

- `pnpm install` works from repo root
- `pnpm --filter @morel/web dev` starts the Vite app
- `pnpm --filter @morel/github-auth-worker dev` starts the Worker
- `pnpm -r typecheck` passes across both packages

______________________________________________________________________

### Phase 2 — App Shell (`apps/web/`)

- [x] Configure TanStack Router
- [x] Configure TanStack Query
- [x] Add `routes/index.tsx` — dashboard/home
- [x] Add `routes/auth.callback.tsx` — OAuth callback handler
- [x] Add `routes/settings.security.tsx` — credential management UI

______________________________________________________________________

### Phase 3 — Worker Shell (`workers/github-auth-exchange/`)

- [x] Add `GET /health` (implemented inline in `src/index.ts`)
- [x] Scaffold `package.json`, `wrangler.toml`, `tsconfig.json`
- [x] Add Zod request/response schemas (`schemas/worker.schema.ts`)

______________________________________________________________________

### Phase 4 — Auth UI + Core (`apps/web/src/features/auth/`)

- [ ] Auth types and Zod schemas
- [ ] PKCE helpers (`crypto/pkce.ts`, `crypto/random.ts`)
- [ ] `authLogger` utility — structured console logging for every auth flow step (dev-only via `import.meta.env.DEV`)
- [ ] `useGitHubAuth` hook — includes a `verify()` step that calls `GET /user` after obtaining a token
- [ ] `ConnectGitHub` component
- [ ] `AuthStatus` component — shows avatar, username, scopes, auth method, and connection badge; falls back to `alert` on failure
- [ ] Error handling and user feedback (connection + auth state visible in both the UI and the console)

#### shadcn/ui components required

Install all at once:

```sh
pnpm dlx shadcn@latest add button card input label tabs badge alert dialog select separator textarea
```

| Component | Used in | Why |
| -- | -- | -- |
| `card` | `ConnectGitHub`, `AuthStatus` | Wraps each auth method panel and the status display |
| `tabs` | `ConnectGitHub` | Switches between PAT / OAuth App / GitHub App auth methods |
| `input` | `ConnectGitHub` | PAT token entry field |
| `label` | `ConnectGitHub` | Accessible labels for all form fields |
| `button` | `ConnectGitHub`, `AuthStatus` | Connect / Disconnect / Retry actions |
| `badge` | `AuthStatus` | Shows connected · disconnected · loading state at a glance |
| `alert` | error feedback | Surfaces auth errors and validation messages inline |
| `dialog` | `ConnectGitHub` (OAuth) | Confirmation prompt before redirecting to GitHub for OAuth flow |
| `select` | `ConnectGitHub` (PAT) | Scope selector for fine-grained PAT (optional but planned) |
| `separator` | `ConnectGitHub` | Visual divider between auth method sections |
| `textarea` | `ConnectGitHub` | Multi-line PAT paste area as an alternative to the single-line input |

______________________________________________________________________

### Phase 5 — Fine-grained PAT Auth

First auth method — no Worker dependency, fastest path to a working `GET /user` verification. Must surface the result through both `AuthStatus` (UI) and `authLogger` (console).

- [ ] Fine-grained PAT + Octokit — token entered directly by the user; Octokit calls GitHub API from the browser. **No Worker required.** Validate `github_pat_` prefix with Zod before hitting the network.

______________________________________________________________________

### Phase 6 — Complete Cloudflare Worker (`workers/github-auth-exchange/`)

Finish the worker so it can handle the full OAuth code-to-token exchange needed by Phases 7's auth methods.

- [ ] Add CORS middleware (`lib/cors.ts`)
- [ ] Add request validation helpers (`lib/validate.ts`)
- [ ] Implement `POST /exchange` — receive `code` + `code_verifier`, call GitHub's token endpoint with the client secret, return the access token
- [ ] Add error responses for invalid/expired codes and upstream GitHub failures
- [ ] Move `GET /health` to `routes/health.ts`; add `routes/exchange.ts`

______________________________________________________________________

### Phase 7 — OAuth & GitHub App Auth Methods

These methods require the Worker from Phase 6. Each must call `GET /user` on success and surface the result through both `AuthStatus` (UI) and `authLogger` (console).

- [ ] GitHub OAuth App (PKCE + Worker code exchange) — browser initiates PKCE flow, Worker holds the client secret and exchanges the code for a token. Console logs both the exchange step and the verification step.
- [ ] GitHub App user auth flow — similar redirect flow but using a GitHub App installation. Scopes badge reflects installation-level permissions.

______________________________________________________________________

### Phase 8 — Credential Vault

- [ ] IndexedDB vault (`vault/indexeddb.ts`)
- [ ] OPFS vault fallback (`vault/opfs.ts`)
- [ ] Vault orchestrator (`vault/vault.ts`)
- [ ] Auth state persistence across reloads
- [ ] Encrypt credentials at rest using `SubtleCrypto` (AES-GCM, key derived with PBKDF2 or HKDF) — credentials never stored in plaintext

______________________________________________________________________

### Phase 9 — Security Hardening: Browser Layer

Protect the app against client-side attacks.

- [ ] **Content Security Policy (CSP)** — add a strict `Content-Security-Policy` header via Vite's HTML plugin; block inline scripts, restrict `script-src` to `'self'` and known CDN hashes, set `default-src 'none'`
- [ ] **XSS prevention** — audit all places where user-supplied strings are rendered; no `dangerouslySetInnerHTML`, no `eval`, no dynamic `innerHTML`; use React's default escaping throughout
- [ ] **`X-Frame-Options: DENY`** and **`X-Content-Type-Options: nosniff`** — add security response headers to the Vite dev server and document required headers for the production deployment
- [ ] **Subresource Integrity (SRI)** — verify any third-party scripts loaded in `index.html` use `integrity` + `crossorigin` attributes
- [ ] **Sensitive data in memory only** — ensure access tokens are never written to `localStorage`, `sessionStorage`, `document.cookie`, or the URL; confirm they live only in the encrypted vault or in-memory React state

______________________________________________________________________

### Phase 10 — Security Hardening: Auth & API Layer

Protect the auth flow and the Worker against protocol-level and injection attacks.

- [ ] **CSRF / state parameter validation** — verify the `state` parameter in the OAuth callback matches the one generated during the auth initiation (stored in sessionStorage, cleared after use)
- [ ] **PKCE `code_verifier` binding** — confirm the Worker rejects any exchange request that omits or mismatches the `code_verifier`
- [ ] **Token scope minimization** — request only the GitHub scopes actually needed; document the required scopes for each auth method
- [ ] **Token rotation & expiry** — detect GitHub's token expiry signals; prompt re-auth rather than silently failing
- [ ] **Rate limiting on the Worker** — add Cloudflare rate-limiting rules to `POST /exchange` to prevent brute-force code-stuffing
- [ ] **Secrets never in logs** — audit Worker and app error paths; ensure access tokens and `client_secret` are never serialised into logs or error responses
- [ ] **`SECURITY.md`** — threat model covering XSS, CSRF, token exfiltration, vault key recovery, and the trust boundary between browser and Worker

______________________________________________________________________

### Phase 11 — Polish

- [ ] Local dev documentation
