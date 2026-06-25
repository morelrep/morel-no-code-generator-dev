# MOREL V3 — Worker/Auth Gateway Architecture Specification

## 1. Purpose

This document defines the specific architecture for the MOREL V3 micro-backend layer, especially the Hono-based Auth Gateway, and how it integrates with the static MOREL Studio SPA, GitHub, Zotero, GitHub Actions, monitoring, analytics, DNS, and fallback deployments.

This specification does not replace the full MOREL V3 product specification. It narrows the implementation architecture for the worker/micro-backend layer and its relationship to the rest of the system.

Client-side SPA security — token handling, CSP, session containment, and the Web Worker token broker — is specified in `03-client-token-broker-design.md`. This document defers to `03` for those concerns and is kept consistent with it.

______________________________________________________________________

## 2. Final Architectural Decision

MOREL V3 will be implemented as a static, lightweight SPA supported by a minimal stateless auth gateway.

The static SPA will remain the main user-facing application. It will handle local UI state, local-first project setup, local vault workflows, and client-side calls to GitHub APIs after authentication.

The Auth Gateway will exist only to mediate authentication flows that cannot be safely or conveniently completed directly from a browser-only static SPA.

```plaintext
MOREL Studio SPA
  → static deployment URL during beta/MVP
  → later custom MOREL domain/subdomain

MOREL Auth Gateway
  → Cloudflare Worker + Hono as primary
  → Deno Deploy, Netlify, and AWS Lambda as portable backups

GitHub API access
  → Octokit in the browser after a token is obtained

Remote compute
  → GitHub Actions reusable workflows in the user/project repository

Monitoring
  → Sentry as central operational monitor

Basic web analytics
  → Cloudflare Web Analytics

Product analytics
  → PostHog deferred until needed
```

______________________________________________________________________

## 3. Current Production-Domain Decision

The existing MOREL production domain currently serves the MOREL Website V2 and must not be disturbed during V3 beta/MVP work.

For beta and MVP, MOREL V3 will use free provider deployment domains rather than modifying the production MOREL domain or GoDaddy DNS.

```plaintext
Current production:
  official MOREL domain
    → MOREL Website V2
    → no V3 tools
    → no DNS disruption during beta

MOREL V3 beta:
  static frontend on free provider URL
  auth gateway on free Cloudflare Workers URL
```

This allows development, staging, and MVP validation without DNS migration, CNAME setup, certificate issues, or risk to the current production website.

______________________________________________________________________

## 4. MOREL Studio Deployment During Beta/MVP

MOREL Studio will be a static SPA with mostly static content and minimal interactivity.

### 4.1 Interactive Responsibilities

- GitHub connection UI
- Zotero connection/import UI
- Local vault UI
- Project setup
- Workflow dispatch UI
- Workflow status display
- Links to generated/public outputs

### 4.2 Deployment Targets

**MVP: GitHub Pages only:**

```plaintext
MVP (GitHub Pages):
  https://jdelpino-dev.github.io/morel-v3
```

GitHub Pages is acceptable for MVP because the SPA is fully static — no server-side compute,
database, or backend session state. GitHub's hosting infrastructure provides sufficient
resilience for beta/MVP scale.

Future options remain open if the project outgrows GitHub Pages:

```plaintext
Render Static Site:   https://<site>.onrender.com
Cloudflare Pages:     https://<site>.pages.dev
Custom domain later:  https://studio.morel.<domain>
```

The exact public beta URL can be changed without affecting the architecture, as long as it is included in the Auth Gateway CORS allowlist.

______________________________________________________________________

## 5. Auth Gateway Deployment During Beta/MVP

The primary Auth Gateway is deployed as a Cloudflare Worker using Hono.

During beta/MVP, the gateway uses Cloudflare's free Workers domain rather than a custom MOREL subdomain.

### 5.1 Deployed URLs

```plaintext
Local dev:
  http://localhost:8787  (wrangler dev)

Staging (live):
  https://morel-auth-staging.delpinoivivas.workers.dev

Production (live):
  https://morel-auth.delpinoivivas.workers.dev

Production later (custom domain):
  https://auth.morel.<domain>
```

Cloudflare account: `delpinoivivas` (account ID: `a6d5fee2cd6af1ef0354e2c736dc712b`)

### 5.2 Wrangler Environment Configuration

Two named environments in `workers/auth/wrangler.toml`:

```toml
name = "morel-auth"          # production

[env.staging]
name = "morel-auth-staging"  # staging
```

Deploy commands:

```bash
# Staging only
pnpm exec wrangler deploy --env staging

# Production
pnpm exec wrangler deploy
```

### 5.3 SPA Environment Configuration

The SPA reads the Auth Gateway base URL from environment configuration, not from hardcoded source constants.

```plaintext
VITE_MOREL_AUTH_GATEWAY_URL=https://morel-auth-staging.delpinoivivas.workers.dev
```

This makes later migration from a free Workers URL to `auth.morel.<domain>` trivial.

### 5.4 Secrets Management

Secrets are managed in Infisical and synced automatically to Cloudflare Workers via the Infisical → Cloudflare Workers integration:

```plaintext
Infoisical staging /worker  →  morel-auth-staging  (auto-sync)
Infisical prod     /worker  →  morel-auth          (auto-sync)
```

Public non-secret vars (`GITHUB_DEVICE_CODE_URL`, `GITHUB_DEVICE_TOKEN_URL`) are hardcoded in `wrangler.toml [vars]` and not stored in Infisical.

______________________________________________________________________

## 6. Auth Gateway Role

The Auth Gateway is not a general backend. It is a narrow authentication intermediary.

### 6.1 In Scope

- GitHub device authorization mediation
- Future Zotero authorization mediation if needed
- CORS handling for the static SPA
- Normalized auth errors
- Health checks
- Basic abuse protection

### 6.2 Out of Scope

- Storing users
- Storing projects
- Storing project files
- Storing GitHub tokens
- Storing Zotero tokens
- Storing vault secrets
- Proxying all GitHub API calls
- Proxying analytics traffic
- Running MOREL generation jobs
- Managing GitHub Actions workflows server-side

After authentication, the browser-based SPA uses Octokit directly to call GitHub APIs.

### 6.3 Future Exception — Premium Accounts (WebAuthn Step-Up)

The "Out of Scope" list above describes the free/MVP gateway, which stores no users, sessions, or credentials and remains fully stateless.

A planned hardening feature — **WebAuthn step-up gating for destructive operations** (see `03-client-token-broker-design.md` §12.1) — requires the gateway to verify WebAuthn assertions server-side, which in turn requires storing **per-user credential public keys and short-lived challenges**. This is a deliberate, minimal deviation from the stateless principle: it stores *public* keys and challenges only — never tokens, secrets, or vault material.

This exception is **not** part of the free/MVP tier. It is expected to ship only for a future **premium tier**: users with online accounts/sessions persisted on the Cloudflare backend (Worker + in-memory database, e.g. Durable Objects / KV / D1) for a fee. Free users remain on the fully stateless, no-stored-account model. The premium account model must be designed and approved before this is implemented.

______________________________________________________________________

## 7. Primary Auth Gateway Routes

The Auth Gateway exposes only authentication routes. Current and planned routes:

```plaintext
GET  /health
POST /github/device/code
POST /github/device/token
POST /github/oauth/exchange       (implemented — see 02 §9)
POST /github/oauth/refresh        (planned — token refresh, see 03 §5)
```

Routes are implemented in `workers/auth/src/routes/`. The route allowlist is deliberately small; no non-auth routes are registered.

### 7.1 GET /health

Purpose: basic liveness check for monitoring and fallback selection.

Implemented in `routes/health.ts`. Response:

```json
{
  "ok": true,
  "service": "morel-auth-gateway",
  "runtime": "cloudflare",
  "version": "0.1.0"
}
```

### 7.2 POST /github/device/code

Purpose: starts GitHub Device Authorization Flow. The SPA calls this route. The Worker calls GitHub's device-code endpoint and returns a normalized response.

Input:

```json
{
  "clientId": "github-oauth-or-app-client-id",
  "scopes": ["repo", "workflow"]
}
```

Output:

```json
{
  "deviceCode": "...",
  "userCode": "...",
  "verificationUri": "https://github.com/login/device",
  "expiresIn": 900,
  "interval": 5
}
```

### 7.3 POST /github/device/token

Purpose: polls for token completion after the user authorizes through GitHub's device page.

Input:

```json
{
  "clientId": "github-oauth-or-app-client-id",
  "deviceCode": "...",
  "grantType": "urn:ietf:params:oauth:grant-type:device_code"
}
```

Possible normalized outputs:

```json
{ "status": "pending" }
```

```json
{ "status": "slow_down", "intervalIncrementSeconds": 5 }
```

```json
{
  "status": "authorized",
  "accessToken": "...",
  "tokenType": "bearer",
  "scope": "repo workflow"
}
```

```json
{ "status": "failed", "error": "expired_token" }
```

The Auth Gateway must respect GitHub's required polling interval and must not encourage aggressive polling from the browser.

### 7.4 POST /github/oauth/exchange

Purpose: exchanges an OAuth/GitHub-App authorization `code` for an access token using the `GITHUB_CLIENT_SECRET` (held only in the Worker). Fully specified in `02-github-auth-system-spec.md` §9. PKCE `codeVerifier` is included when present (OAuth flow) and omitted for the GitHub App installation flow.

### 7.5 POST /github/oauth/refresh (Planned)

Purpose: exchanges a GitHub App **refresh token** for a new short-lived access token, enabling token expiration without forcing re-authentication. Refresh requires the client secret and therefore must run in the Worker, never the browser. See `03-client-token-broker-design.md` §5.

```plaintext
POST /github/oauth/refresh
  body:    { refreshToken }
  returns: { accessToken, refreshToken, expiresIn, refreshTokenExpiresIn, scope }
```

Not yet implemented; depends on enabling GitHub App user-token expiration.

______________________________________________________________________

## 8. Octokit Integration

Octokit will be used in the browser after the SPA obtains a GitHub token.

```plaintext
Auth acquisition:
  MOREL Studio → Auth Gateway → GitHub OAuth/device endpoints

GitHub API operations:
  MOREL Studio → Octokit → GitHub REST API

Remote compute:
  User/project repo → GitHub Actions reusable workflows
```

### 8.1 Octokit Responsibilities

- Validating the authenticated GitHub user
- Listing/selecting repositories
- Creating or updating project files
- Committing the workflow caller file
- Dispatching reusable workflows
- Reading workflow run status
- Presenting links to GitHub Actions runs
- Presenting links to generated GitHub Pages output

The Auth Gateway must not proxy normal GitHub REST API operations.

______________________________________________________________________

## 9. Token and Vault Policy

### 9.1 Default Mode (Session-Only)

```plaintext
Token lives only in memory.
Token disappears on reload, sign-out, or browser close.
```

In the target architecture the access token is held inside a **Web Worker token broker**, not in React state, and is never returned to the UI or to hooks. The broker owns token acquisition, use (via Octokit), refresh, and disposal. See `03-client-token-broker-design.md` §4. With GitHub App token expiration enabled, the broker also holds a refresh token in memory and silently refreshes via the gateway (§7.5, `03` §5).

### 9.2 Optional Persistent Mode (Local Vault)

```plaintext
User chooses to remember the GitHub connection.
User provides a local passphrase.
Passphrase is not stored.
Passphrase derives an encryption key.
Encrypted token blob is stored locally.
```

If this mode is ever implemented, only the **refresh token** (not the access token) should be persisted, minimizing blast radius. This is the single justification for reintroducing a vault and is otherwise out of scope. See `03-client-token-broker-design.md` §5.

### 9.3 Allowed Local Storage Targets

- OPFS
- IndexedDB
- Dual encrypted copy if implemented

### 9.4 Forbidden Storage Patterns

- Raw token in `localStorage`
- Raw token in `IndexedDB`
- Raw token in OPFS
- Token in GitHub project files
- Vault passphrase stored anywhere
- Derived encryption key persisted across sessions

### 9.5 Allowed Non-Secret Metadata

- GitHub username
- GitHub user ID
- Selected repository
- Workflow run IDs
- Last publication URL
- Last successful token validation timestamp
- Encrypted token blob if user opted in

______________________________________________________________________

## 10. CORS Policy

The Auth Gateway uses a strict origin allowlist. During beta/MVP, allowed origins include only the actual static SPA deployment URLs.

Implemented in `workers/auth/src/lib/cors.ts`. The allowlist is configured via the `ALLOWED_ORIGINS` environment variable (comma-separated), injected at runtime from Infisical. The default fallback is `http://localhost:5173` for local dev.

### 10.1 Allowed Origins

```plaintext
dev:        http://localhost:5173
staging:    https://jdelpino-dev.github.io  (set in Infisical — GitHub Pages, MVP live URL)
production: not deployed yet
```

Staging uses the GitHub Pages deployment (`https://jdelpino-dev.github.io/morel-v3`) as the
live SPA URL. The `ALLOWED_ORIGINS` value is the origin only (no path): `https://jdelpino-dev.github.io`.
Will be updated when production is deployed or the project moves to a custom domain.

### 10.2 Forbidden

```plaintext
Access-Control-Allow-Origin: *
```

Unknown origins receive no CORS headers and requests are blocked.

______________________________________________________________________

## 11. Abuse and DoS Protections

The static SPA is low-risk because it has no server-side compute, no database, and no backend session store. The dynamic Auth Gateway is the main DoS-sensitive surface.

### 11.1 Required Protections

| Protection | Status |
| -- | -- |
| Strict CORS allowlist | ✅ implemented (`lib/cors.ts`) |
| Schema validation on all request bodies | ✅ implemented (`lib/validate.ts` + Zod schemas) |
| Env binding validation on every request | ✅ implemented (Zod `EnvSchema` in `index.ts`) |
| Fixed upstream GitHub endpoints only | ✅ implemented (URLs hardcoded in `wrangler.toml`) |
| Structured JSON errors | ✅ implemented (all routes return structured errors) |
| Upstream error text not leaked to client | ⏳ planned — routes currently echo upstream text (`03` §11.3) |
| Route allowlist | ✅ by design — only auth routes registered |
| Method allowlist | ✅ CORS middleware restricts to GET, POST, OPTIONS |
| `Content-Type` enforcement | ⏳ planned (`03` §11.1) |
| Conservative GitHub polling behavior | ✅ slow_down/pending mapped in `routes/github-device.ts` |
| No logging of tokens or secrets | ✅ no logging implemented |
| Caller-supplied `clientId` removed; scope allowlist | ⏳ planned (`03` §11.4) |
| `no-store` cache headers on auth responses | ⏳ planned (`03` §11.2) |
| Max body size | ⏳ planned (`03` §11.1) |
| Rate limiting | ⏳ deferred — Cloudflare plan-level protection in place (`03` §11.5) |
| CSP + Trusted Types (SPA) | ⏳ planned (`03` §6) |
| Sentry error sampling | ⏳ deferred — Sentry not yet integrated |

### 11.2 Expected Failure Behavior

| Condition | Response |
| -- | -- |
| Unknown route | 404 |
| Wrong method | 405 |
| Invalid origin | Blocked |
| Invalid body | 400 |
| Excessive traffic | 429 |
| Upstream failure | Normalized 4xx/5xx |

______________________________________________________________________

## 12. Hono Portability Requirement

The Auth Gateway must be written as a portable Hono application. The core application must depend on standard Web APIs and avoid runtime-specific APIs.

### 12.1 Allowed in Core

- Hono
- `fetch`
- `Request`, `Response`, `Headers`
- `URL`, `URLSearchParams`
- `crypto.subtle` if needed
- `JSON`
- Zod or equivalent schema validation

### 12.2 Avoid in Core

- Cloudflare KV / Durable Objects
- Deno KV / Deno-specific APIs
- Node `fs` / `path` / `process` usage
- AWS-specific APIs
- Provider-specific logging APIs
- Provider-specific storage APIs

Provider-specific code must live in deployment adapters.

### 12.3 Current Package Structure

For MVP, the worker is implemented as a single package at `workers/auth/` rather than the split `packages/auth-gateway-core` + `deploy/cloudflare` layout. The portability requirement is still met — no Cloudflare-specific APIs are used in core logic.

```plaintext
workers/auth/
  wrangler.toml          — Cloudflare deployment config (staging + production)
  src/
    index.ts             — Hono app entry, env validation, CORS wiring
    types.ts             — Env interface (Zod schema + inferred type)
    lib/
      cors.ts            — configurable origin allowlist middleware
      validate.ts        — Zod body parser helper
    routes/
      health.ts          — GET /health
      github-device.ts   — POST /github/device/code, POST /github/device/token
    schemas/
      worker.schema.ts   — Zod schemas for all request/response shapes
```

If a second deployment target (Deno Deploy, Netlify, AWS Lambda) is needed, the core Hono app in `src/` can be extracted to `packages/auth-gateway-core/` with minimal refactoring. The deployment adapter would only need to wrap `export default app` for the target runtime.

______________________________________________________________________

## 13. Backup Deployment Strategy

Cloudflare Workers is the primary deployment target. The following backups must be kept implementation-ready.

| Priority | Target |
| -- | -- |
| Primary | Cloudflare Workers + Hono |
| Backup 1 | Deno Deploy + Hono |
| Backup 2 | Netlify Function/Edge + Hono |
| Hard fallback | AWS Lambda + API Gateway + Hono |

### 13.1 Example Beta URLs

```plaintext
Primary:
  https://morel-auth-beta.<cloudflare-account>.workers.dev

Deno backup:
  https://morel-auth-beta.deno.dev

Netlify backup:
  https://morel-auth-beta.netlify.app

AWS fallback:
  generated API Gateway URL (not necessarily publicly advertised)
```

Failover may be manual for MVP. The SPA must support a configurable auth gateway base URL. Automatic failover across a gateway list is optional and not required for MVP.

______________________________________________________________________

## 14. Monitoring

Sentry is the central operational monitor for MVP.

### 14.1 What to Send to Sentry

- Frontend errors from MOREL Studio
- Hono Auth Gateway exceptions
- Auth flow failures
- Release/version metadata
- Runtime/deployment tags
- Selected safe breadcrumbs

### 14.2 Useful Sentry Tags

```plaintext
service:    morel-auth-gateway
runtime:    cloudflare | deno | netlify | aws-lambda
deployment: staging | beta | production
route:      /github/device/code | /github/device/token | /health
release:    morel-auth-gateway@x.y.z
```

### 14.3 Never Send to Sentry

- Access tokens
- PATs
- Device codes
- Vault passphrases
- Derived keys
- Raw request bodies containing secrets

Sentry may also monitor the primary `/health` endpoint. Additional free uptime checks may be implemented via GitHub Actions cron.

______________________________________________________________________

## 15. Web Analytics

For MVP, use Cloudflare Web Analytics for public website analytics.

Answered questions:

- Visits and page views
- Referrers
- Common pages
- Countries, browsers, devices
- Basic performance metrics

This is sufficient for the static MOREL Studio website during MVP.

______________________________________________________________________

## 16. PostHog Decision

PostHog is deferred for MVP. It should be added only when product-funnel analytics become necessary.

### 16.1 Future PostHog Events (Reference)

```plaintext
github_auth_started
github_auth_completed
github_auth_failed
zotero_auth_started
zotero_auth_completed
vault_created
project_repo_created
workflow_dispatch_started
workflow_dispatch_completed
workflow_dispatch_failed
publication_opened
```

### 16.2 Routing Constraint

If PostHog is added later, it must use a separate analytics endpoint:

```plaintext
events.morel.<domain> → PostHog proxy
```

PostHog proxying must not be implemented inside the Auth Gateway. Auth and analytics must remain separate surfaces:

```plaintext
auth.morel.<domain>   → Hono Auth Gateway
events.morel.<domain> → PostHog proxy
```

______________________________________________________________________

## 17. DNS and Domain Phases

### 17.1 Beta/MVP (No Production Changes)

```plaintext
MOREL Website V2:
  remains on official MOREL production domain

MOREL V3 beta:
  static SPA on free provider URL

Auth Gateway:
  Cloudflare Workers free URL

DNS:
  no GoDaddy changes required
```

### 17.2 Production Hardening

When V3 is stable, keep GoDaddy as registrar but migrate authoritative DNS to Cloudflare.

```plaintext
Registrar:            GoDaddy
Authoritative DNS:    Cloudflare

Subdomains:
  studio.morel.<domain>         → static MOREL Studio
  auth.morel.<domain>           → Cloudflare Worker Auth Gateway
  auth-staging.morel.<domain>   → staging Auth Gateway
  events.morel.<domain>         → future PostHog proxy if needed
```

### 17.3 Production Cutover

Only after V3 is stable should the official MOREL domain be changed or integrated with V3. Until then, V2 remains unaffected.

______________________________________________________________________

## 18. GitHub Pages and DDoS Posture

GitHub Pages is acceptable for MOREL Studio MVP because the SPA is static and has no server-side compute, database, or backend session state.

GitHub Pages provides indirect platform-level resilience through GitHub's hosting infrastructure but does not offer a customer-configurable DDoS/WAF product.

```plaintext
MVP posture:
  GitHub Pages for static MOREL Studio → acceptable
  Cloudflare Worker protects the dynamic auth surface

Later hardening:
  Move authoritative DNS to Cloudflare
  Put Cloudflare in front of the custom domain
  Use Cloudflare routing/security controls

Alternative:
  Use Render Static Site if stronger built-in static-site
  protection is desired before Cloudflare DNS migration
```

Because GitHub Pages cannot set response headers, the SPA's Content Security Policy and Trusted Types are delivered via a `<meta>` tag in `index.html`. CSP is the primary control protecting the in-browser token (its `connect-src` allowlist is the exfiltration backstop) and is independent of the DDoS posture above. See `03-client-token-broker-design.md` §6.

______________________________________________________________________

## 19. Cost Posture

The target cost for beta/MVP is zero or near-zero.

| Resource | Expected Cost |
| -- | -- |
| Static SPA | Free (provider deployment) |
| Primary Auth Gateway | Free (Cloudflare Workers) |
| Deno Deploy backup | Free tier |
| Netlify backup | Free tier |
| AWS Lambda fallback | ~$0–$10/year (quiet) |
| Monitoring (Sentry) | Free tier |
| Web analytics | Free (Cloudflare) |
| Product analytics | Deferred |

AWS WAF always-on is not recommended for MVP.

______________________________________________________________________

## 20. Final MVP Implementation Stack

| Concern | Technology / Decision |
| -- | -- |
| MOREL Studio | React + Vite + TypeScript static SPA |
| Static deployment | GitHub Pages / Render / Cloudflare Pages (free beta URL) |
| Auth Gateway | Hono on Cloudflare Workers |
| Auth backup targets | Deno Deploy, Netlify Function/Edge, AWS Lambda + API GW |
| GitHub API | Octokit in browser after token acquisition |
| Auth mode | GitHub Device Authorization Flow through Auth Gateway |
| Auth fallback | Fine-grained PAT as advanced option |
| Token storage | Held in a Web Worker token broker; session-only by default; optional encrypted refresh-token vault (future) — see `03-client-token-broker-design.md` |
| SPA security | CSP + Trusted Types, Web Worker token broker, URL hygiene (see `03-client-token-broker-design.md`) |
| Remote compute | GitHub Actions reusable workflows |
| Monitoring | Sentry |
| Website analytics | Cloudflare Web Analytics |
| Product analytics | PostHog deferred |
| Production domain | MOREL Website V2 remains untouched during beta/MVP |
| DNS | GoDaddy during beta/MVP; later move to Cloudflare |

______________________________________________________________________

## 21. Final Architecture Statement

MOREL V3 will launch in beta as a static SPA deployed on a free provider domain, supported by a minimal stateless Hono Auth Gateway deployed primarily on Cloudflare Workers. The current MOREL production domain will continue serving MOREL Website V2 during beta and MVP validation. The Auth Gateway will mediate GitHub device authorization and future external auth flows but will not store users, projects, tokens, or workflow state. After authentication, MOREL Studio will use Octokit directly from the browser to interact with GitHub repositories, workflows, Actions, and Pages. GitHub Actions reusable workflows will remain the remote compute engine.

The Hono Auth Gateway must remain portable across Cloudflare Workers, Deno Deploy, Netlify, and AWS Lambda. Sentry will serve as the MVP operational monitor, while Cloudflare Web Analytics will provide basic website analytics. PostHog will be deferred until product-funnel analytics are needed. GoDaddy DNS will remain untouched during beta/MVP; a later production-hardening phase may keep GoDaddy as registrar while moving authoritative DNS to Cloudflare for custom subdomains, edge routing, stronger custom-domain protection, and future analytics proxying.
