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

- [x] Auth types and Zod schemas
- [x] PKCE helpers (`crypto/pkce.ts`, `crypto/random.ts`)
- [x] `authLogger` utility — structured console logging for every auth flow step (dev-only via `import.meta.env.DEV`)
- [x] `useGitHubAuth` hook — includes a `verify()` step that calls `GET /user` after obtaining a token
- [x] `ConnectGitHub` component
- [x] `AuthStatus` component — shows avatar, username, scopes, auth method, and connection badge; falls back to `alert` on failure
- [x] Error handling and user feedback (connection + auth state visible in both the UI and the console)

**Implementation report:** Phase 4 is implemented inside `apps/web/src/features/auth/`. The auth demo is visible on `/` and `/settings/security` through a feature-level `AuthDemo` wrapper. The implementation uses the generated shadcn/ui primitives from `apps/web/src/components/ui/` without modifying those generated component files. OAuth App and GitHub App tabs are present as disabled placeholders for later phases.

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

- [x] Fine-grained PAT + Octokit — token entered directly by the user; Octokit calls GitHub API from the browser. **No Worker required.** Validate the fine-grained PAT format with Zod before hitting the network.
- [x] **Write-pipeline smoke test** — After successful `GET /user`, offer a "Test Write Access" button that creates a throwaway private repo (`morel-test-<timestamp>`), writes a `README.md` file to it via `PUT /repos/{owner}/{repo}/contents/README.md`, verifies the file via `GET /repos/{owner}/{repo}/contents/README.md`, then **defers deletion** — displaying a "Delete Test Repo" button so the user can inspect the repo on GitHub first. Deletion happens when the user clicks the button, disconnects, or closes/refreshes the page (best-effort via `fetch` with `keepalive`). The entire lifecycle is logged step-by-step through `authLogger` and surfaced in a dedicated `WriteTestCard` UI card.

**Why the write test matters:** `GET /user` only proves the token is valid. MOREL's core flow requires creating repos, writing workflow files, and triggering Actions. Testing write access during the auth demo catches permission gaps immediately rather than failing silently in later phases. The test maps directly to US-3 (create/select project repo + install caller workflow).

**Required fine-grained PAT permissions for the write test:**

| Permission | Level | Reason |
| -- | -- | -- |
| Administration | Read and write | `DELETE /repos/{owner}/{repo}` (cleanup) |
| Contents | Read and write | `PUT /repos/{owner}/{repo}/contents/{path}` (write file) |

Without these, `GET /user` passes but the write test fails with `403` — exactly the kind of permission gap the test is designed to catch.

**Implementation report:** Phase 5 is fully implemented at code level. The PAT auth flow validates `github_pat_<id>_<secret>` tokens with Zod, verifies them with Octokit `GET /user`, maps common auth and network failures to user-facing messages, supports retry from the last submitted token, and displays "Fine-grained PAT" when GitHub does not return OAuth scopes. All Octokit instances use GitHub API version `2026-03-10` (via `X-GitHub-Api-Version` header) to avoid deprecation warnings from the default `2022-11-28`.

The write-pipeline smoke test (`useWriteTest` hook + `WriteTestCard` component) runs a three-step create → write → verify cycle, then **defers deletion** so the user can inspect the repo on GitHub. A "Delete Test Repo" button triggers step 4 on demand. Cleanup also fires automatically on disconnect (via `handleDisconnect`) and on page close/refresh (best-effort via `fetch` with `keepalive: true`). The `WriteTestResult` type includes `owner` so `needsCleanup` is derived from a single state object without race conditions. Refs are synced via `useEffect` (not during render) to satisfy strict `react-hooks/refs` lint rules. On disconnect, `writeTest.reset()` clears all state so reconnecting starts fresh.

Only existing shadcn components (`Card`, `Badge`, `Button`, `Separator`) are used — no new UI primitives were added. Static verification passed with `pnpm run typecheck`, `pnpm run lint`, and `pnpm --filter @morel/web build`. Manual acceptance still requires a real fine-grained PAT with Administration + Contents permissions.

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

______________________________________________________________________

## Manual Acceptance Testing — Phases 4–5

This section describes how to create the PAT, what permissions it needs, every manual test scenario, and exactly what to verify in both the UI and the console at each step. Following these steps should surface any bug in the auth flow or the write-pipeline test.

### PAT creation

Go to <https://github.com/settings/personal-access-tokens/new> and create **two** tokens:

#### Token A — Full permissions (happy path)

| Setting | Value |
| -- | -- |
| Name | `morel-dev-full` |
| Expiration | 7 days |
| Resource owner | *(your personal account)* |
| Repository access | **All repositories** |
| Permissions → Repository → Administration | **Read and write** |
| Permissions → Repository → Contents | **Read and write** |

Leave **all other permissions** at the default "No access". Only Administration and Contents are needed. Metadata is auto-included and cannot be disabled.

This token can do everything MOREL needs: `GET /user`, create repos, write files, delete repos.

#### Token B — Read-only (permission-failure path)

| Setting | Value |
| -- | -- |
| Name | `morel-dev-readonly` |
| Expiration | 7 days |
| Resource owner | *(your personal account)* |
| Repository access | **Public repositories** |
| Permissions | **No access** on everything (leave all at default) |

`GET /user` works with zero extra permissions — it only reads your own profile, which is covered by the auto-included Metadata permission. This token will fail the write test, which is the expected behavior.

#### What the tokens look like

Both tokens follow the format `github_pat_<22-alphanumeric-chars>_<40+-alphanumeric-chars>`. Copy each one immediately — GitHub shows it only once.

______________________________________________________________________

### Test environment setup

```sh
cd morel-v3
pnpm install
pnpm dev          # starts Vite on http://localhost:5173
```

Open `http://localhost:5173` in a browser with DevTools open (Console tab).

______________________________________________________________________

### Scenario 1 — Invalid token format

**Input:** Paste `not-a-real-token` or `ghp_abc123` into the PAT field and click **Connect**.

**Expected UI:**

- No network request fires
- A red `Alert` appears: "Invalid fine-grained PAT format (expected github_pat\_\<id>\_\<secret>)"
- The "Connect" button remains enabled after the error

**Expected console:**

```plaintext
[auth] PAT flow
  [auth] PAT flow started
  [auth] Invalid fine-grained PAT format (expected github_pat_<id>_<secret>)
```

**Verify:** The console group opens and closes. No `GET /user` request appears in the Network tab.

______________________________________________________________________

### Scenario 2 — Valid token, successful connection (Token A)

**Input:** Paste Token A into the PAT field and click **Connect**.

**Expected UI:**

1. While connecting: "Connecting" amber badge appears briefly
2. On success:
   - `AuthStatus` card appears with your GitHub avatar, `@username`, and display name
   - Green "Connected" badge
   - "PAT" badge in the card body
   - "Fine-grained PAT" badge (since fine-grained PATs don't return `x-oauth-scopes`)
   - "Disconnect" button at the right
3. The `ConnectGitHub` card disappears (replaced by the `WriteTestCard` in idle state)
4. The `WriteTestCard` shows: title "Write Access Test", description text, and a **"Test Write Access"** button

**Expected console:**

```plaintext
[auth] PAT flow
  [auth] PAT flow started
  [auth] Token received (type: bearer)
  [auth] GET /user ...
  [auth] Authenticated as @<your-username> (scopes: none)
```

**Verify:**

- The avatar image loads (check `src` attribute — it should be a `https://avatars.githubusercontent.com/` URL)
- Your display name appears below the username (or is absent if your GitHub profile has no name set)
- The token value does **not** appear anywhere in the console output
- No errors in the Console or Network tabs

______________________________________________________________________

### Scenario 3 — Write-pipeline test, full permissions (Token A)

**Prerequisite:** Scenario 2 completed successfully (connected state).

**Input:** Click **"Test Write Access"**.

**Expected UI (step by step):**

1. Card header gains an amber "Running" badge
2. Step list appears with four items:
   - `◌ Create test repo` (running) → `✓ Create test repo — https://github.com/<you>/morel-test-YYYY-MM-DD-HH-MM-SS` (done)
   - `◌ Write README.md` (running) → `✓ Write README.md — commit abc1234` (done)
   - `◌ Verify file` (running) → `✓ Verify file — File verified` (done)
   - `○ Delete test repo` — stays pending (deferred)
3. Badge changes to green "Passed"
4. A summary box appears showing:
   - `Commit: abc1234` (7-char SHA)
   - `Repo: https://github.com/<you>/morel-test-...` (clickable link — repo still exists)
5. A red **"Delete Test Repo"** button appears
6. No "Dismiss" button yet — only appears after deletion

**Expected console:**

```plaintext
[auth] Write-pipeline test
  [auth] POST /user/repos (morel-test-2026-05-15-14-30-22) ...
  [auth] Repo created: https://github.com/<you>/morel-test-2026-05-15-14-30-22
  [auth] PUT /repos/<you>/morel-test-2026-05-15-14-30-22/contents/README.md ...
  [auth] File written: commit abc1234, https://github.com/<you>/morel-test-.../blob/.../README.md
  [auth] GET /repos/<you>/morel-test-2026-05-15-14-30-22/contents/README.md ...
  [auth] File verified via GET
  [auth] Write test passed — repo kept for inspection. Delete manually or click 'Delete Test Repo'.
```

**Verify (before deletion):**

- Click the repo URL link → opens the repo on GitHub in a new tab
- The repo exists, is private, and contains `README.md` with the correct timestamp
- The Network tab shows exactly 3 GitHub API calls: `POST /user/repos`, `PUT .../contents/README.md`, `GET .../contents/README.md`
- No token appears in any log entry

**Now click "Delete Test Repo":**

1. Step 4 changes from `○` pending to `◌` running to `✓ Delete test repo — Repo deleted`
2. Repo URL now shows "(deleted)" instead of a clickable link
3. "Delete Test Repo" button disappears, "Dismiss" button appears
4. Console shows a new group:

```plaintext
[auth] Write-pipeline cleanup
  [auth] DELETE /repos/<you>/morel-test-2026-05-15-14-30-22 ...
  [auth] Test repo deleted
```

**Verify (after deletion):**

- Go to `https://github.com/<you>?tab=repositories` — the `morel-test-*` repo should **not** exist
- Click **"Dismiss"** → the card returns to idle state with the "Test Write Access" button

______________________________________________________________________

### Scenario 4 — Write-pipeline test, missing permissions (Token B)

**Setup:** Disconnect (click **Disconnect**), then reconnect with Token B.

**Prerequisite:** Token B connects successfully (Scenario 2 passes — `GET /user` works with any valid token).

**Input:** Click **"Test Write Access"**.

**Expected UI:**

1. Step 1 "Create test repo" shows `◌` (running), then `✗` (failed)
2. Badge changes to red "Failed"
3. Error message appears: a GitHub API error (likely `Resource not accessible by personal access token` or a `403`/`422` message)
4. "Dismiss" button appears

**Expected console:**

```plaintext
[auth] Write-pipeline test
  [auth] POST /user/repos (morel-test-...) ...
  [auth] Write-pipeline test failed: <error message>
```

**Verify:**

- The error message is specific enough to guide the user (not just "Unknown error")
- No `morel-test-*` repo was created on GitHub (the creation itself failed)
- If the repo *was* created but a later step failed, the console should show `Cleanup: test repo deleted after failure`

______________________________________________________________________

### Scenario 5 — Revoked or expired token

**Setup:** Revoke Token A at <https://github.com/settings/personal-access-tokens>, or wait for it to expire.

**Input:** Paste the revoked token and click **Connect**.

**Expected UI:**

- Red `Alert` appears: "Token is invalid or revoked"
- **Retry** button appears in the alert

**Expected console:**

```plaintext
[auth] PAT flow
  [auth] PAT flow started
  [auth] Token received (type: bearer)
  [auth] GET /user ...
  [auth] GET /user -> 401 Bad credentials
```

**Verify:** Clicking **Retry** re-attempts the same token and shows the same error.

______________________________________________________________________

### Scenario 6 — Network failure

**Setup:** Connect successfully first (Scenario 2), then disconnect your network (Wi-Fi off, or throttle to "Offline" in DevTools Network tab). Click **Disconnect**, then paste a valid token and click **Connect**.

**Expected UI:**

- Red `Alert` appears: "Cannot reach GitHub - check your connection"
- **Retry** button appears

**Expected console:**

```plaintext
[auth] PAT flow
  [auth] PAT flow started
  [auth] Token received (type: bearer)
  [auth] GET /user ...
  [auth] Network error: <fetch/load failed message>
```

**Verify:** Re-enable the network, click **Retry** → should connect successfully.

______________________________________________________________________

### Scenario 7 — Disconnect and reconnect

**Setup:** Connected state (Scenario 2). Optionally, run the write test first (Scenario 3) but do NOT click "Delete Test Repo" — leave the repo alive.

**Input:** Click **Disconnect**.

**Expected UI:**

- `AuthStatus` card disappears
- `WriteTestCard` disappears
- `ConnectGitHub` card reappears with empty PAT field

**Expected console (if write test repo existed):**

```plaintext
[auth] Write-pipeline cleanup
  [auth] DELETE /repos/<you>/morel-test-... ...
  [auth] Test repo deleted
[auth] Disconnected
```

**Expected console (if no write test was run):**

```plaintext
[auth] Disconnected
```

**Verify:**

- If a write test repo existed, check GitHub — it should be deleted
- Pasting the same token and clicking **Connect** works as in Scenario 2
- After reconnecting, the `WriteTestCard` appears in **idle** state (no stale results from the previous session)

______________________________________________________________________

### Scenario 8 — Write test during network interruption

**Setup:** Connected state (Scenario 2). Disable network.

**Input:** Click **"Test Write Access"**.

**Expected UI:**

- Step 1 "Create test repo" shows `✗` (failed)
- Badge shows red "Failed"
- Error message indicates a network issue

**Expected console:**

```plaintext
[auth] Write-pipeline test
  [auth] POST /user/repos (morel-test-...) ...
  [auth] Write-pipeline test failed: <network error>
```

**Verify:** No repo was created. Re-enable network. Click **"Dismiss"**, then **"Test Write Access"** again — should work.

______________________________________________________________________

### Summary of what to check across all scenarios

| Check | Where | Scenarios |
| -- | -- | -- |
| Token never appears in logs | Console | All |
| Error messages are user-friendly, not raw stack traces | UI Alert | 1, 4, 5, 6, 8 |
| Console groups open and close properly (`[auth] ...` → content → group end) | Console | All |
| Network tab shows only the expected API calls | DevTools Network | 2, 3, 4, 5 |
| No leftover `morel-test-*` repos on GitHub (after deletion or disconnect) | GitHub repo list | 3, 4, 7, 8 |
| "Delete Test Repo" button appears after write test passes | UI | 3 |
| Repo URL is a clickable link before deletion, shows "(deleted)" after | UI | 3 |
| "Dismiss" only appears after repo is deleted or on failure | UI | 3, 4 |
| Disconnect triggers cleanup if write test repo exists | Console + GitHub | 7 |
| Reconnecting after disconnect shows clean idle state | UI | 7 |
| Retry button works after failure | UI | 5, 6 |
| Status badges use correct colors (amber=connecting/running, green=connected/passed, red=failed) | UI | All |
| Write test steps progress in order and show details | UI | 3, 4 |
| Timestamps are consistent across repo name, description, file content, commit message | Console + GitHub | 3 |
| No deprecation warnings in console (`X-GitHub-Api-Version: 2026-03-10` is used) | Console | 2, 3 |
