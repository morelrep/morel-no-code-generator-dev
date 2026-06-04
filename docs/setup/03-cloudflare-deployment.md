# Cloudflare Deployment — Pages & Workers (Beta Setup)

## Scope

This guide covers the deployment setup for the **beta phase only**:

- `major/morel-v3` is the production branch for beta.
- Feature branches (`feature/*`) branching off `major/morel-v3` get automatic preview
  deployments from Cloudflare Pages.
- The main repo (`morelrep/morel-no-code-generator-dev`) is the source of truth. The
  existing GitHub Pages deployment on the default branch is untouched.

Both the `apps/web` SPA and the `workers/auth` Worker are deployed to Cloudflare. This
guide replaces local `wrangler deploy` calls with GitHub-connected deployments while
keeping deployment triggers **fully manual** — Cloudflare will not deploy automatically
on every push.

______________________________________________________________________

## Part 1 — Cloudflare Pages (`apps/web`)

### 1.1 Create the Pages project

1. Go to **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize the `morelrep` GitHub org and select the `morel-no-code-generator-dev` repository.
3. Set the project name — e.g. `morel-beta`.
4. **Production branch:** `major/morel-v3`
5. **Build configuration** — use the values in the table below.
6. Add env vars in the **Environment variables** panel (see Part 4 below).
7. Save and skip the first deployment — you will trigger it manually.

| Setting | Value |
| -- | -- |
| Build command | `pnpm build:app` |
| Build output directory | `apps/web/dist` |
| Root directory | `/` (monorepo root) |
| Node version | `24` (set via env var `NODE_VERSION=24`) |

### 1.2 Disable automatic deployments

Cloudflare Pages auto-deploys on every push to the production branch by default.
To disable this:

1. Go to the project → **Settings → Builds & Deployments**.
2. Under **Branch control**, toggle off **"Automatic production branch deployments"**.
3. Optionally, leave **Preview branch deployments** enabled — Cloudflare will still
   create preview URLs for every feature branch PR without touching production.

With this setting, the production deployment is only triggered via the API (see Part 2).

______________________________________________________________________

## Part 2 — Manual Deployment Trigger

Cloudflare exposes a REST API endpoint to trigger a Pages deployment without pushing
code:

```plaintext
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT_NAME}/deployments
```

The body can include an optional `{"branch": "major/morel-v3"}` to pin the branch.
Cloudflare will pull the latest commit of that branch from GitHub, run the build, and
deploy.

### 2.1 Required credentials

Store these in Infisical at `/deploy` (all environments) or as local shell exports:

| Variable | Description |
| -- | -- |
| `CF_ACCOUNT_ID` | Found in the Cloudflare Dashboard right-sidebar |
| `CF_API_TOKEN` | Create at My Profile → API Tokens — needs `Pages:Edit` permission |
| `CF_PAGES_PROJECT` | The Pages project name you set in step 1.1 (e.g. `morel-beta`) |

### 2.2 Deploy script

Create `scripts/deploy-pages.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Manually triggers a Cloudflare Pages deployment via the REST API.
 *
 * Usage:
 *   pnpm deploy:pages
 *
 * Required environment variables (from Infisical or shell):
 *   CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT
 */

const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT } = process.env

if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_PAGES_PROJECT) {
  console.error(
    'Missing required env vars: CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT',
  )
  process.exit(1)
}

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT}/deployments`

console.log(`→ Triggering Pages deployment for project: ${CF_PAGES_PROJECT}`)

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ branch: 'major/morel-v3' }),
})

const data = (await res.json()) as { success: boolean; result?: { id: string; url: string }; errors?: unknown[] }

if (!res.ok || !data.success) {
  console.error('Deployment trigger failed:', data.errors ?? res.statusText)
  process.exit(1)
}

console.log(`✓ Deployment triggered`)
console.log(`  ID:  ${data.result?.id}`)
console.log(`  URL: ${data.result?.url}`)
console.log(`  Track at: https://dash.cloudflare.com/pages/projects/${CF_PAGES_PROJECT}`)
```

### 2.3 Add pnpm scripts to root `package.json`

```json
"deploy:pages": "infisical run --env=dev --path=/deploy -- tsx scripts/deploy-pages.ts",
"deploy:pages:dry": "echo 'Would trigger Pages deployment for major/morel-v3'"
```

Run a Pages deployment with:

```sh
pnpm deploy:pages
```

______________________________________________________________________

## Part 3 — Cloudflare Worker (`workers/auth`)

The worker is **not** connected to GitHub via Workers Builds. Workers Builds creates
a separate worker instance, which means losing the existing `morel-auth` configuration:
staging environment, Infisical secrets sync, and any custom domain bindings.

Instead, the worker is deployed locally with `wrangler deploy`, which targets the
existing `morel-auth` worker and respects the environments in `wrangler.toml`.

### 3.1 Deploy scripts

Add to root `package.json`:

```json
"deploy:worker": "pnpm --filter @morel/github-auth-worker deploy",
"deploy:worker:staging": "pnpm --filter @morel/github-auth-worker deploy:staging"
```

Add to `workers/auth/package.json`:

```json
"deploy": "wrangler deploy",
"deploy:staging": "wrangler deploy --env staging"
```

### 3.2 Deployment workflow

```sh
# Validate first
pnpm check

# Deploy to staging
pnpm deploy:worker:staging

# Deploy to production
pnpm deploy:worker
```

### 3.3 Why not Workers Builds?

- Workers Builds creates a **new worker** instead of linking to the existing `morel-auth`.
- The new worker does not inherit the Infisical → Cloudflare secrets sync.
- The new worker does not inherit the `[env.staging]` configuration.
- Monorepo support in Workers Builds is limited — pnpm workspace resolution
  fails in the Cloudflare build environment.
- The worker changes infrequently — a local `wrangler deploy` after `pnpm check`
  is simple and reliable.

______________________________________________________________________

## Part 4 — Environment Variables & Secrets

### Pages environment variables

Secrets for the SPA build are set in the Cloudflare Pages dashboard under
**Settings → Environment variables**, not in Infisical's direct sync. At build time,
Cloudflare Pages injects these as env vars so Vite can pick them up via `import.meta.env`.

| Variable | Environment | Source |
| -- | -- | -- |
| `VITE_*` vars | Production & Preview | Set manually in CF Pages dashboard |

The `infisical export` call in the local `build` script is for **local builds only**.
In Cloudflare's CI, env vars come from the dashboard.

### Worker secrets

Worker secrets for staging and production are synced automatically from Infisical to
Cloudflare via the Infisical → Cloudflare Workers integration (already configured).
See `docs/setup/02-local-dev-worker-secrets.md` for the full reference.

______________________________________________________________________

## Part 5 — Branch & Environment Summary

| Branch | Cloudflare Pages | Cloudflare Worker |
| -- | -- | -- |
| `major/morel-v3` | Production (`morel-beta`) — manual trigger | `morel-auth` — manual trigger |
| `feature/*` | Auto preview URL (no manual step needed) | Not deployed |
| `main` (default) | Not connected — GitHub Pages unchanged | Not connected |

______________________________________________________________________

## Part 6 — Future: CI/CD via GitHub Actions

The current setup relies on manual local deployments (`pnpm deploy:pages`,
`pnpm deploy:worker:staging`). Eventually, both staging and production deployments
should be automated through GitHub Actions:

- **Staging** — trigger on push to a staging branch or on PR merge, running
  `wrangler deploy --env staging` and the Pages deployment script.
- **Production** — trigger on push to `major/morel-v3` (or a release tag), deploying
  both the Pages app and the worker.
- **Secrets** — `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and `CLOUDFLARE_API_TOKEN` would be
  stored as GitHub Actions secrets (or injected via the Infisical GitHub integration).
- **Build validation** — the workflow should run `pnpm check` before deploying to
  prevent broken builds from reaching production.

This eliminates the need for local credentials and ensures deployments are reproducible
and auditable.

______________________________________________________________________

## Credentials Reference

| Variable | Used by | Where to store |
| -- | -- | -- |
| `CF_ACCOUNT_ID` | Deploy script, wrangler | Infisical `/deploy` or `.env` |
| `CF_API_TOKEN` | Deploy script | Infisical `/deploy` (never commit) |
| `CF_PAGES_PROJECT` | Deploy script | Infisical `/deploy` or hardcode in script |
| `CLOUDFLARE_API_TOKEN` | wrangler CLI | Infisical `/workers/auth` or `~/.wrangler/config` |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler CLI | Infisical `/workers/auth` or `wrangler.toml` |
