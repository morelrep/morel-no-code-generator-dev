# MOREL V3 — GitHub Auth System Specification

This is the definitive reference for the MOREL V3 GitHub auth system as implemented.
It consolidates the original planning documents (`01-01-auth-demo-v1-spec.md`,
`01-01-auth-demo-v1-implementation-guide.md`, and `01-02-auth-flows-advanced-spec.md`)
into a single, accurate description of the system as it actually exists.

> For common mistakes and debugging notes from the initial implementation, see
> `docs/reference/github-app-auth-common-mistakes.md`.

______________________________________________________________________

## 1. Architecture Overview

The auth system is split between the browser SPA and a stateless Cloudflare Worker.

```plaintext
Browser (apps/web)
  ├── useGitHubAuth         — auth state machine, token lifecycle
  ├── useDeviceFlow         — device flow polling
  ├── useWriteTest          — write-access smoke test
  ├── ConnectGitHub         — auth method selector UI
  ├── AuthStatus            — connected user card + install prompt
  └── WriteTestCard         — write test progress UI

Cloudflare Worker (workers/auth)
  ├── POST /github/device/code    — starts device flow
  ├── POST /github/device/token   — polls for device flow token
  ├── POST /github/oauth/exchange — exchanges auth code for access token
  └── GET  /health                — health check

GitHub API
  └── Called directly from the browser via Octokit after token acquisition
```

The worker's only role is to mediate token acquisition — it holds the `GITHUB_CLIENT_SECRET`
so the SPA never touches it. After a token is obtained, all GitHub API operations
(reads, writes, repo management) use Octokit directly from the browser.

______________________________________________________________________

## 2. Repository Structure

```plaintext
morel-v3/
  apps/web/src/
    features/auth/
      types/
        githubAuth.types.ts       — AuthState, AuthMethod, DeviceFlowState, WriteTestResult
      schemas/
        githubAuth.schema.ts      — GitHubPatSchema, GitHubUserSchema
      crypto/
        pkce.ts                   — PKCE code verifier + challenge
        random.ts                 — cryptographically random URL-safe base64
      hooks/
        useGitHubAuth.ts          — main auth hook
        useDeviceFlow.ts          — device flow state machine
        useWriteTest.ts           — write-access smoke test
      components/
        ConnectGitHub.tsx         — auth method tabs
        AuthStatus.tsx            — connected user card
        AuthDemo.tsx              — composes hook + components
        WriteTestCard.tsx         — write test UI
      lib/
        authLogger.ts             — dev-only structured console logger
        oauthFlow.ts              — PKCE redirect + installation redirect helpers
        workerClient.ts           — typed POST helper for the auth gateway
      index.ts                    — public feature exports
    routes/
      auth.callback.tsx           — OAuth/installation callback handler

  workers/auth/src/
    index.ts                      — Hono app, CORS + env validation middleware
    routes/
      health.ts                   — GET /health
      github-device.ts            — POST /github/device/code + /token
      github-oauth.ts             — POST /github/oauth/exchange
    lib/
      cors.ts                     — CORS middleware (reads ALLOWED_ORIGINS)
      validate.ts                 — Zod request parsing helper
    schemas/
      worker.schema.ts            — request/response schemas
    types.ts                      — Env bindings type + EnvSchema
```

______________________________________________________________________

## 3. Auth Methods

Four auth methods are supported. All non-PAT methods check for GitHub App installation
after obtaining a token and auto-redirect to the installation page if not installed.

| Tab | Method | Entry point | PKCE | Worker endpoint |
| -- | -- | -- | -- | -- |
| PAT | `pat` | Token pasted directly | No | None |
| Device Flow | `device` | Poll-based, no redirect | No | `/github/device/code`, `/github/device/token` |
| OAuth App | `oauth` | `/login/oauth/authorize` | Yes | `/github/oauth/exchange` |
| GitHub App | `github-app` | `/apps/{slug}/installations/new` | No | `/github/oauth/exchange` |

After every successful token acquisition (except PAT), `useGitHubAuth` calls
`apps.listInstallationsForAuthenticatedUser()` and auto-redirects to
`https://github.com/apps/{GITHUB_APP_SLUG}/installations/new` if the app is not installed.

______________________________________________________________________

## 4. Key Design Decisions

**GitHub App tab uses the installation endpoint, not the authorize endpoint.**
`/login/oauth/authorize` only authorizes the user — it does not install the app. The GitHub App
tab redirects to `/apps/{slug}/installations/new`, which combines installation + user
authorization in one step (requires "Request user authorization during installation" to be
enabled on the app). PKCE is not supported on the installation endpoint, so `codeVerifier`
is optional throughout the exchange pipeline.

**`sessionStorage` handoff guards against React Strict Mode.**
The OAuth/installation callback stores the token in `sessionStorage`, then navigates to `/`.
The home page's `useEffect` picks it up. Both effects use a `useRef` guard to prevent
React Strict Mode's double-invocation from consuming the value on the first mount and
failing silently on the second. `requestAnimationFrame` was also removed from the pickup
effect for the same reason — Strict Mode's cleanup cancels the frame.

> **Planned change:** the `sessionStorage` token handoff will be replaced by passing the
> authorization `code` directly to the Web Worker broker (which performs the exchange), plus
> `history.replaceState` URL scrubbing — removing the handoff window entirely. See
> `03-client-token-broker-design.md` §4.1 and §8.

**Tokens live in memory only.** Tokens are held in React state (`useState`), never
in `localStorage`, `sessionStorage` (cleared immediately after pickup), cookies, or the URL.
They are never passed as props to rendering components and never appear in logs.

> **Planned change:** the token will move out of React state into a **Web Worker token broker**
> that owns acquisition, use, refresh, and disposal; `useGitHubAuth()` will no longer return
> `token`. See `03-client-token-broker-design.md` §4.

**`codeVerifier` is optional in the exchange pipeline.** The installation flow does not
support PKCE. The Zod schema, callback handler, and worker exchange endpoint all treat
`codeVerifier` as optional and only include/use it when present.

**Write test defers repo deletion.** After the write test passes, the repo remains so the
user can inspect it on GitHub. Deletion happens on: manual button click, disconnect, or
page close (best-effort `fetch` with `keepalive: true`).

______________________________________________________________________

## 5. Environment Configuration

### 5.1 Environment variables

**SPA (`apps/web`)** — exported from Infisical at dev startup via `pnpm dev`:

| Variable | dev | staging | production |
| -- | -- | -- | -- |
| `VITE_MOREL_AUTH_GATEWAY_URL` | `http://localhost:8787` | `https://morel-auth-staging.delpinoivivas.workers.dev` | `https://morel-auth.delpinoivivas.workers.dev` |
| `VITE_GITHUB_CLIENT_ID` | Morel Studio Dev client ID | Morel Studio Dev client ID | Morel Studio client ID |
| `VITE_SENTRY_DSN` | empty | staging DSN | prod DSN |

**Worker (`workers/auth`)** — exported from Infisical at dev startup via `pnpm dev`:

| Variable | dev | staging | production |
| -- | -- | -- | -- |
| `GITHUB_APP_ID` | Dev app ID | Dev app ID | Prod app ID |
| `GITHUB_CLIENT_ID` | Morel Studio Dev client ID | Morel Studio Dev client ID | Morel Studio client ID |
| `GITHUB_CLIENT_SECRET` | Dev secret | Dev secret | Prod secret |
| `GITHUB_OAUTH_REDIRECT_URI` | `http://localhost:5173/auth/callback` | `https://jdelpino-dev.github.io/morel-v3/auth/callback` | production URL |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | `https://jdelpino-dev.github.io` | production URL |

**Hardcoded in `wrangler.toml [vars]`** (not secrets, identical everywhere):

```toml
GITHUB_DEVICE_CODE_URL  = "https://github.com/login/device/code"
GITHUB_DEVICE_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_OAUTH_TOKEN_URL  = "https://github.com/login/oauth/access_token"
```

### 5.2 Infisical paths

| Path | Used by | Synced to |
| -- | -- | -- |
| `/apps/web` | SPA Vite build | Injected at `pnpm dev` startup into `.env.local` |
| `/workers/auth` | Auth Worker | Injected at `pnpm dev` startup into `.dev.vars`; auto-synced to Cloudflare for staging/production |

Verify Infisical values before debugging auth issues:

```sh
infisical export --env=dev --path=/apps/web --format=dotenv
infisical export --env=dev --path=/workers/auth --format=dotenv
```

### 5.3 URL consistency rule

`GITHUB_OAUTH_REDIRECT_URI` in Infisical, the `redirect_uri` the SPA sends to GitHub, and
the callback URL in the GitHub App settings **must all be the same string — character for
character**. GitHub performs an exact match. A trailing slash or one missing character will
cause a `redirect_uri_mismatch` error.

______________________________________________________________________

## 6. GitHub App Settings

Two apps exist:

| App | GitHub URL | Used for |
| -- | -- | -- |
| Morel Studio Dev | `https://github.com/apps/morel-studio-dev` | dev + staging |
| Morel Studio | `https://github.com/apps/morel-studio` | production |

Required settings on both apps:

- **Callback URLs** — first URL must be the primary environment's callback. For dev/staging app, `http://localhost:5173/auth/callback` must be first (installation redirect always uses the first registered URL).
- **Request user authorization (OAuth) during installation** — must be enabled. This is what causes the installation redirect to return a `code` to the callback, enabling seamless install + authorize.
- **Redirect on update** — enable. Redirects users back to the callback after updating their installation (e.g. adding/removing repos).
- **Where can this GitHub App be installed?** — must be **Any account** for non-owner users to install it.
- **Enable Device Flow** — must be enabled.
- **Repository permissions** — Contents: Read and write; Actions: Read and write; Pages: Read and write; Administration: Read and write; Metadata: Read-only (mandatory).

The GitHub App slug is stored as a single constant:

```ts
// apps/web/src/features/auth/hooks/useGitHubAuth.ts
export const GITHUB_APP_SLUG = "morel-studio-dev";
```

______________________________________________________________________

## 7. Auth Flow Details

### 7.1 PAT flow

1. User pastes token → Zod validates `github_pat_` format
2. Octokit `GET /user` → user state set
3. Write test available

### 7.2 Device flow

1. Worker `POST /github/device/code` → `userCode` + `verificationUri`
2. User enters code at `github.com/login/device` in a new tab
3. SPA polls worker `POST /github/device/token` every `interval` seconds
4. On `authorized` → token obtained → `GET /user` → installation check

### 7.3 OAuth flow (PKCE)

1. SPA generates PKCE verifier + challenge + CSRF state → stored in `sessionStorage`
2. Redirect to `https://github.com/login/oauth/authorize?client_id=...&code_challenge=...`
3. GitHub redirects to `http://localhost:5173/auth/callback?code=...&state=...`
4. Callback validates CSRF state, calls worker `POST /github/oauth/exchange` with `code` + `codeVerifier`
5. Worker exchanges with GitHub using `client_secret` → returns `accessToken`
6. Token stored in `sessionStorage` → TanStack Router navigate to `/`
7. Home page picks up token → `GET /user` → installation check

### 7.4 GitHub App flow (install + authorize)

1. SPA generates CSRF state → stored in `sessionStorage` (no PKCE)
2. Redirect to `https://github.com/apps/morel-studio-dev/installations/new?state=...`
3. User installs app → GitHub redirects to `http://localhost:5173/auth/callback?code=...&state=...&installation_id=...&setup_action=install`
4. Callback validates CSRF state, calls worker `POST /github/oauth/exchange` with `code` only (no `codeVerifier`)
5. Worker exchanges → returns `accessToken`
6. Token stored in `sessionStorage` → navigate to `/`
7. Home page picks up token → `GET /user` → installation check (should already be installed)

### 7.5 Installation check (all non-PAT flows)

After `verify()` completes for any non-PAT method:

1. Call `octokit.apps.listInstallationsForAuthenticatedUser()`
2. Check `data.installations.some((i) => i.app_slug === GITHUB_APP_SLUG)`
3. Set `appInstalled` on auth state
4. If `false` → call `initiateInstallationFlow()` → page navigates to install page
5. If `true` → stay on page, `AuthStatus` shows no banner

______________________________________________________________________

## 8. Write-Access Smoke Test

After connecting via any method, a **Write Access Test** card appears. It runs four steps:

1. `POST /user/repos` — creates a private `morel-test-YYYY-MM-DD-HH-MM-SS` repo
2. `PUT /repos/{owner}/{repo}/contents/README.md` — writes a timestamped file
3. `GET /repos/{owner}/{repo}/contents/README.md` — reads it back to verify
4. `DELETE /repos/{owner}/{repo}` — cleanup (deferred, user-triggered)

Step 4 is deferred: deletion happens on manual button click, disconnect, or page close
(best-effort `fetch` with `keepalive: true`).

**Required GitHub App permissions for the write test to pass:**

| Permission | Level |
| -- | -- |
| Administration | Read and write |
| Contents | Read and write |

______________________________________________________________________

## 9. Worker API

Base URL: `http://localhost:8787` (dev), `https://morel-auth-staging.delpinoivivas.workers.dev` (staging)

### `GET /health`

Returns `{ ok: true, service: "morel-auth-gateway", runtime: "cloudflare", version: "0.1.0" }`.

### `POST /github/device/code`

Body: `{ clientId?: string, scopes?: string[] }`
Returns: `{ deviceCode, userCode, verificationUri, expiresIn, interval }`

### `POST /github/device/token`

Body: `{ clientId?: string, deviceCode: string, grantType: "urn:ietf:params:oauth:grant-type:device_code" }`
Returns discriminated union: `{ status: "pending" }` | `{ status: "slow_down", intervalIncrementSeconds }` | `{ status: "authorized", accessToken, tokenType, scope }` | `{ status: "failed", error }`

### `POST /github/oauth/exchange`

Body: `{ code: string, codeVerifier?: string }`
Returns: `{ accessToken, tokenType, scope }`
Note: `codeVerifier` is optional — omit it for the GitHub App installation flow.

### `POST /github/oauth/refresh` (Planned)

Body: `{ refreshToken: string }`
Returns: `{ accessToken, refreshToken, expiresIn, refreshTokenExpiresIn, scope }`
Not yet implemented. Enables GitHub App token expiration with silent refresh; refresh requires the client secret and runs only in the Worker. See `03-client-token-broker-design.md` §5.

______________________________________________________________________

## 10. Security Properties

- **Client secret never in browser** — held only in the Cloudflare Worker
- **PKCE** — used for OAuth flow (not applicable to installation flow)
- **CSRF state parameter** — generated for all redirect flows, validated on return
- **Tokens in memory only** — never in `localStorage`, cookies, URL, or DOM
- **Tokens never logged** — `authLogger` logs only token type and resulting scopes
- **`authLogger` silenced in production** — all logger methods are no-ops when `import.meta.env.DEV` is false
- **GitHub API version pinned** — all Octokit instances use `X-GitHub-Api-Version: 2026-03-10`
- **Test repos always private** — write test repos are created as private to avoid polluting public profiles

Planned hardening (token broker, CSP, token expiration/refresh, gateway hardening, WebAuthn step-up) is summarized in §12 and specified in `03-client-token-broker-design.md`.

______________________________________________________________________

## 11. Running Locally

Both services must run simultaneously:

```sh
# Terminal 1 — Auth Worker (port 8787)
pnpm --filter @morel/auth-worker dev

# Terminal 2 — Vite SPA (port 5173)
pnpm --filter @morel/web dev
```

Verify the worker before testing:

```sh
curl http://localhost:8787/health
```

Typecheck both:

```sh
pnpm -r typecheck
```

______________________________________________________________________

## 12. Planned Security Hardening

The following changes are **planned, not yet implemented**. They are specified in
`03-client-token-broker-design.md`; this section tracks the deltas from the system as it
currently exists (described above).

- **Web Worker token broker.** The access token moves out of React state into a dedicated
  Web Worker that owns acquisition, use (Octokit), refresh, and disposal. `useGitHubAuth()`
  stops returning `token` and instead exposes status + capability methods. (`03` §4)
- **Token acquisition tail in the broker.** The callback hands the authorization `code` to the
  broker; the access token never touches the main-thread heap. The `sessionStorage` handoff is
  removed, and callback URLs are scrubbed with `history.replaceState`. (`03` §4.1, §8)
- **GitHub token expiration + refresh.** Enable GitHub App user-token expiration and add
  `POST /github/oauth/refresh`; the broker refreshes silently. (`03` §5)
- **CSP + Trusted Types.** Delivered via a `<meta>` tag in `index.html`, with a strict
  `connect-src` allowlist as the exfiltration backstop. (`03` §6)
- **Gateway hardening.** Stop echoing raw upstream error text (normalized error codes), enforce
  `Content-Type` and a max body size, add `no-store` headers, remove caller-supplied `clientId`
  from the device routes, and enforce a server-side scope allowlist. (`03` §11)
- **Session containment + revocation.** Auto-lock on idle/hidden, destructive-op gating, op
  budgets, and disconnect-with-revoke. (`03` §9, §10)
- **Least privilege.** Revisit the GitHub App's `Administration: Read and write` permission
  (used today by the write test) and minimize requested scopes. (`03` §9.4)
- **WebAuthn step-up (premium tier).** Hardware-backed user verification before destructive
  operations, verified server-side; requires the gateway to store credential public keys — a
  premium-tier feature. (`03` §12.1, `01` §6.3)
- **Supply-chain hardening.** Minimal pinned dependencies, audit in CI, no third-party scripts
  on token-handling pages. (`03` §7)
