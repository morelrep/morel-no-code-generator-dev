# MOREL V3 — Advanced GitHub Auth Flows Spec (Phases 6–7)

> **Companion to** [01-01-auth-demo-v1-spec.md](./01-01-auth-demo-v1-spec.md) and [01-01-auth-demo-v1-implementation-guide.md](./01-01-auth-demo-v1-implementation-guide.md).
> This document specifies and guides the implementation of the remaining GitHub auth flows in the SPA auth demo, leveraging the live Cloudflare Auth Worker.

______________________________________________________________________

## 1. Context and Current State

### 1.1 What is already working

| Layer | Component | Status |
| -- | -- | -- |
| Worker | `GET /health` | ✅ live |
| Worker | `POST /github/device/code` | ✅ live |
| Worker | `POST /github/device/token` | ✅ live |
| SPA | PAT flow (`connectWithPat`) | ✅ working |
| SPA | Write-access smoke test (`useWriteTest`) | ✅ working |
| SPA | PKCE helpers (`crypto/pkce.ts`, `crypto/random.ts`) | ✅ scaffolded, unused |
| SPA | OAuth App tab in `ConnectGitHub` | ⏳ disabled placeholder |
| SPA | GitHub App tab in `ConnectGitHub` | ⏳ disabled placeholder |
| SPA | `/auth/callback` route | ⏳ stub only |

### 1.2 What the worker currently exposes

The worker (`workers/auth/`) is a Hono app on Cloudflare Workers. The source entry is
`workers/auth/src/index.ts`. All routes live under `workers/auth/src/routes/`.

```plaintext
GET  /health
POST /github/device/code
POST /github/device/token
```

The worker holds `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` as Infisical-managed
secrets. The two GitHub URL constants are hardcoded in `wrangler.toml [vars]`.

### 1.3 Scope of this document

| Phase | Name | Worker changes | SPA changes |
| -- | -- | -- | -- |
| 6 | Device Flow SPA Integration | None | New hook, new UI, env var |
| 7A | OAuth Web Flow (PKCE) | `POST /github/oauth/exchange` | Callback route, new hook branch |
| 7B | GitHub App User Auth | Reuses Phase 7A exchange route | Minimal SPA extension of Phase 7A |

______________________________________________________________________

## 2. Environment Setup

### 2.1 SPA environment variable

The SPA must read the Auth Gateway base URL from `VITE_MOREL_AUTH_GATEWAY_URL` so it can call the
worker without hardcoded URLs.

Create `apps/web/.env.local` (not committed):

```dotenv
VITE_MOREL_AUTH_GATEWAY_URL=http://localhost:8787
```

For staging deployments, set:

```dotenv
VITE_MOREL_AUTH_GATEWAY_URL=https://morel-auth-staging.delpinoivivas.workers.dev
```

### 2.2 Local dev — running both services

Both services must run simultaneously. The worker provides the auth gateway and the SPA calls it:

```sh
# Terminal 1 — Cloudflare Worker
pnpm --filter @morel/auth-worker dev

# Terminal 2 — Vite SPA
pnpm --filter @morel/web dev
```

Worker runs on `http://localhost:8787`. Vite runs on `http://localhost:5173`. The worker's default
`ALLOWED_ORIGINS` already allows `http://localhost:5173`, so no CORS changes are needed for local dev.

Verify the worker is healthy before testing:

```sh
curl http://localhost:8787/health
# → {"ok":true,"service":"morel-auth-gateway","runtime":"cloudflare","version":"0.1.0"}
```

### 2.3 GitHub App settings — required changes

Before any flow that involves a redirect (Phases 7A and 7B) will work, two settings must be
configured in the GitHub App's settings page.

Go to: **GitHub → Settings → Developer settings → GitHub Apps → Morel Studio Dev**
(or navigate directly: `https://github.com/settings/apps/<your-app-slug>`)

#### 2.3.1 Enable Device Flow (Phase 6 prerequisite)

Device Flow will fail with `error: disabled` from GitHub unless this is explicitly turned on.

In the GitHub App settings page scroll to the **"Optional features"** section and enable:

```plaintext
☑ Enable Device Flow
```

Click **Save changes**. This is a one-time change per app. It applies to all environments
(dev, staging, production) that share the same GitHub App.

#### 2.3.2 Register callback URLs (Phase 7 prerequisite)

In the GitHub App settings page, find the **"Callback URL"** field. GitHub Apps support one
callback URL per line. Add all environments you want to test:

```plaintext
http://localhost:5173/auth/callback
https://<morel-studio-staging>.pages.dev/auth/callback
https://<morel-studio-production>.pages.dev/auth/callback
```

Replace the placeholder hostnames with the actual Cloudflare Pages URLs once they are deployed.
For now, the `localhost` entry is sufficient for local dev.

Click **Save changes**.

> **Why multiple callback URLs matter:** GitHub validates the `redirect_uri` in the authorization
> request against this list. If the URL in the request is not registered, GitHub rejects the
> entire authorization attempt with `redirect_uri_mismatch` — the callback page never receives a
> code. There is no error in the SPA until GitHub redirects back with `?error=redirect_uri_mismatch`.

#### 2.3.3 Verify the OAuth callback is active

Still on the GitHub App settings page, confirm:

```plaintext
☑ Request user authorization (OAuth) during installation
```

This should already be enabled if the app was set up for user auth. If it is disabled, the
OAuth redirect flow will not be available to users who have not yet installed the app.

### 2.4 Infisical secrets — new variables per environment

The existing Infisical → Cloudflare Workers integration automatically syncs secrets from Infisical
into the deployed worker. For local dev, `pnpm dev` runs `infisical export` to write secrets to
`.dev.vars` before wrangler starts (see `docs/setup/local-dev-worker-secrets.md` for the full
explanation).

The Infisical project ID is `86b469f7-276d-49f9-8795-472e793cdaf0`. All worker secrets live at
path `/workers/auth`.

#### Variables already in Infisical (no changes needed)

| Variable | All envs |
| -- | -- |
| `GITHUB_APP_ID` | ✅ already set |
| `GITHUB_CLIENT_ID` | ✅ already set |
| `GITHUB_CLIENT_SECRET` | ✅ already set |

#### New variable to add: `GITHUB_OAUTH_REDIRECT_URI`

This variable is environment-specific (each environment redirects back to a different SPA URL)
so it lives in Infisical, not in `wrangler.toml`.

Go to: **Infisical → morel-v3 project → /workers/auth** and add one entry per environment:

| Environment | Variable | Value |
| -- | -- | -- |
| `dev` | `GITHUB_OAUTH_REDIRECT_URI` | `http://localhost:5173/auth/callback` |
| `staging` | `GITHUB_OAUTH_REDIRECT_URI` | `https://<morel-studio-staging>.pages.dev/auth/callback` |
| `production` | `GITHUB_OAUTH_REDIRECT_URI` | `https://<morel-studio-production>.pages.dev/auth/callback` |

The value must **exactly match** one of the callback URLs registered in the GitHub App settings
(section 2.3.2). A mismatch between what the worker sends to GitHub and what is registered in
the GitHub App settings will cause GitHub to reject every token exchange.

#### Variables that stay in `wrangler.toml` (not Infisical)

These are public constants — the same in every environment and not sensitive:

| Variable | Value | Location |
| -- | -- | -- |
| `GITHUB_DEVICE_CODE_URL` | `https://github.com/login/device/code` | `wrangler.toml [vars]` |
| `GITHUB_DEVICE_TOKEN_URL` | `https://github.com/login/oauth/access_token` | `wrangler.toml [vars]` |
| `GITHUB_OAUTH_TOKEN_URL` | `https://github.com/login/oauth/access_token` | `wrangler.toml [vars]` |

Add `GITHUB_OAUTH_TOKEN_URL` to `wrangler.toml [vars]` and `[env.staging.vars]`:

```toml
[vars]
GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
GITHUB_DEVICE_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_OAUTH_TOKEN_URL  = "https://github.com/login/oauth/access_token"

[env.staging.vars]
GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
GITHUB_DEVICE_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_OAUTH_TOKEN_URL  = "https://github.com/login/oauth/access_token"
```

#### SPA environment variables (not in Infisical)

These are Vite build-time variables. They are not secrets and do not belong in Infisical.
For local dev, they go in `apps/web/.env.local` (gitignored). For staging/production, set
them in the Cloudflare Pages (or Render) build environment configuration.

| Variable | Local dev value | Notes |
| -- | -- | -- |
| `VITE_MOREL_AUTH_GATEWAY_URL` | `http://localhost:8787` | Worker base URL |
| `VITE_GITHUB_CLIENT_ID` | `<your GitHub App client_id>` | Public — safe to embed in SPA |

The full `apps/web/.env.local` for Phases 6–7:

```dotenv
VITE_MOREL_AUTH_GATEWAY_URL=http://localhost:8787
VITE_GITHUB_CLIENT_ID=<GitHub App client_id from Infisical or GitHub App settings>
```

#### How local dev picks up the new Infisical secret

No manual steps are needed. The `pnpm dev` script in `workers/auth/package.json` runs:

```sh
infisical export --env=dev --path=/workers/auth --format=dotenv > .dev.vars
```

This fetches **all** secrets at `/workers/auth` for the `dev` environment and writes them to
`.dev.vars`. Once you add `GITHUB_OAUTH_REDIRECT_URI` to Infisical under `dev`, it will appear
in `.dev.vars` automatically on the next `pnpm dev` restart. You do not need to edit `.dev.vars`
manually.

#### How staging and production pick it up

The Infisical → Cloudflare Workers integration syncs secrets automatically whenever you save
changes in Infisical. After adding `GITHUB_OAUTH_REDIRECT_URI` to the `staging` and `production`
environments in Infisical, the next deployment of the worker will have the variable available.
No `wrangler secret put` commands are needed.

______________________________________________________________________

## 3. Shared: Worker Client Utility

Before implementing any auth flow that calls the worker, create a typed helper that centralises the
`VITE_MOREL_AUTH_GATEWAY_URL` resolution and handles HTTP errors in one place.

**Create `apps/web/src/features/auth/lib/workerClient.ts`:**

```ts
const GATEWAY_URL = import.meta.env.VITE_MOREL_AUTH_GATEWAY_URL as string | undefined

if (!GATEWAY_URL) {
  throw new Error('VITE_MOREL_AUTH_GATEWAY_URL is not set')
}

type WorkerFetchOptions = {
  path: string
  body: unknown
}

/**
 * POST to the auth gateway. Throws on non-2xx responses with a structured error.
 */
export async function gatewayPost<T>(opts: WorkerFetchOptions): Promise<T> {
  const url = `${GATEWAY_URL}${opts.path}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Gateway ${opts.path} → ${response.status}: ${text}`)
  }

  return response.json() as Promise<T>
}
```

This utility is the only place in the SPA that knows about `VITE_MOREL_AUTH_GATEWAY_URL`. All
hooks call `gatewayPost` instead of `fetch` directly.

______________________________________________________________________

## 4. Phase 6 — Device Authorization Flow (SPA Integration)

The worker already handles both Device Flow endpoints end-to-end. This phase wires the SPA to them.
No changes to `workers/auth/` are needed.

### 4.1 How the Device Flow works

GitHub Device Authorization Flow is a two-step OAuth mechanism:

```plaintext
Step 1 — Request device code (SPA → Worker → GitHub)
  SPA calls POST /github/device/code with scopes.
  Worker calls https://github.com/login/device/code and returns a normalised response.
  SPA receives: deviceCode, userCode, verificationUri, expiresIn, interval.

Step 2 — User authorizes on GitHub (user → browser → github.com/login/device)
  SPA displays the userCode prominently and opens verificationUri in a new tab.
  User types the 8-character code (e.g. "WDJB-MJHT") at github.com/login/device.
  SPA polls POST /github/device/token every `interval` seconds.

Step 3 — Token polling (SPA → Worker → GitHub)
  Worker returns { status: "pending" } until the user finishes on GitHub.
  On slow_down, the SPA increases its polling interval by intervalIncrementSeconds.
  On authorized, the SPA receives the access token and calls GET /user to verify.
  On expired_token or access_denied, the flow fails and the user must restart.
```

The Device Flow is useful for testing because it does not require a redirect URI or a deployed
callback page — everything happens through the worker and GitHub's device page.

### 4.2 New types for Device Flow

Add to `apps/web/src/features/auth/types/githubAuth.types.ts`:

```ts
export type DeviceFlowStatus =
  | 'idle'
  | 'requesting'       // POST /github/device/code in progress
  | 'awaiting_user'    // userCode shown, polling not yet started
  | 'polling'          // polling POST /github/device/token
  | 'authorized'       // token received, verification in progress
  | 'expired'          // device code expired before user authorized
  | 'denied'           // user explicitly denied on GitHub
  | 'failed'           // unexpected error

export interface DeviceFlowState {
  status: DeviceFlowStatus
  userCode: string | null         // e.g. "WDJB-MJHT"
  verificationUri: string | null  // https://github.com/login/device
  expiresAt: Date | null          // computed from expiresIn
  interval: number                // current polling interval in seconds
  error: string | null
}
```

### 4.3 Worker response types for the SPA

These mirror `DeviceCodeResponse` and `DeviceTokenResponse` in `workers/auth/src/schemas/worker.schema.ts`.
Add to `apps/web/src/features/auth/schemas/githubAuth.schema.ts`:

```ts
import { z } from 'zod'

export const DeviceCodeResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string().url(),
  expiresIn: z.number(),
  interval: z.number(),
})

export const DeviceTokenResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('slow_down'), intervalIncrementSeconds: z.number() }),
  z.object({
    status: z.literal('authorized'),
    accessToken: z.string(),
    tokenType: z.string(),
    scope: z.string(),
  }),
  z.object({ status: z.literal('failed'), error: z.string() }),
])
```

### 4.4 New hook: `useDeviceFlow`

Create `apps/web/src/features/auth/hooks/useDeviceFlow.ts`. This hook manages the entire Device
Flow state machine and exposes controls to `useGitHubAuth`.

Key design decisions:

- The hook uses a `setInterval`-based polling loop. On `slow_down`, the interval is cancelled and
  restarted with the increased value.
- The `deviceCode` is kept in a ref (not state) so the polling closure captures the latest value
  without stale-closure bugs.
- The hook exposes a `cancel()` function that stops polling and resets state. This is called by
  `useGitHubAuth` on `disconnect()`.
- Polling stops automatically when the hook unmounts or when `authorized` / terminal states are reached.

```ts
// apps/web/src/features/auth/hooks/useDeviceFlow.ts

import { useCallback, useRef, useState } from 'react'
import { gatewayPost } from '../lib/workerClient'
import { DeviceCodeResponseSchema, DeviceTokenResponseSchema } from '../schemas/githubAuth.schema'
import { authLogger } from '../lib/authLogger'
import type { DeviceFlowState } from '../types/githubAuth.types'

const INITIAL_STATE: DeviceFlowState = {
  status: 'idle',
  userCode: null,
  verificationUri: null,
  expiresAt: null,
  interval: 5,
  error: null,
}

export function useDeviceFlow() {
  const [state, setState] = useState<DeviceFlowState>(INITIAL_STATE)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deviceCodeRef = useRef<string | null>(null)
  const intervalRef = useRef<number>(5)

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    stopPolling()
    deviceCodeRef.current = null
    intervalRef.current = 5
    setState(INITIAL_STATE)
    authLogger.info('Device flow cancelled')
  }, [stopPolling])

  /**
   * Called by the parent hook (useGitHubAuth) when a token is authorized.
   * onToken receives the raw access token and the method.
   */
  const start = useCallback(
    async (
      scopes: string[],
      onToken: (token: string, method: 'device') => Promise<void>,
    ) => {
      authLogger.group('Device flow')
      setState(INITIAL_STATE)

      try {
        // Step 1: request device code
        setState((s) => ({ ...s, status: 'requesting' }))
        authLogger.info('POST /github/device/code ...')

        const raw = await gatewayPost({ path: '/github/device/code', body: { scopes } })
        const { deviceCode, userCode, verificationUri, expiresIn, interval } =
          DeviceCodeResponseSchema.parse(raw)

        deviceCodeRef.current = deviceCode
        intervalRef.current = interval

        const expiresAt = new Date(Date.now() + expiresIn * 1000)
        setState({
          status: 'awaiting_user',
          userCode,
          verificationUri,
          expiresAt,
          interval,
          error: null,
        })
        authLogger.info(`User code: ${userCode} → ${verificationUri}`)

        // Step 2: poll for token
        const poll = async () => {
          if (!deviceCodeRef.current) return

          try {
            const tokenRaw = await gatewayPost({
              path: '/github/device/token',
              body: {
                clientId: '', // worker uses env GITHUB_CLIENT_ID
                deviceCode: deviceCodeRef.current,
                grantType: 'urn:ietf:params:oauth:grant-type:device_code',
              },
            })
            const tokenResponse = DeviceTokenResponseSchema.parse(tokenRaw)

            if (tokenResponse.status === 'pending') {
              authLogger.debug('Device flow: pending')
              setState((s) => ({ ...s, status: 'polling' }))
              pollingRef.current = setTimeout(poll, intervalRef.current * 1000)
              return
            }

            if (tokenResponse.status === 'slow_down') {
              intervalRef.current += tokenResponse.intervalIncrementSeconds
              authLogger.debug(`Device flow: slow_down → interval now ${intervalRef.current}s`)
              setState((s) => ({ ...s, interval: intervalRef.current }))
              pollingRef.current = setTimeout(poll, intervalRef.current * 1000)
              return
            }

            if (tokenResponse.status === 'failed') {
              const isExpired = tokenResponse.error === 'expired_token'
              const isDenied = tokenResponse.error === 'access_denied'
              authLogger.error(`Device flow failed: ${tokenResponse.error}`)
              setState((s) => ({
                ...s,
                status: isExpired ? 'expired' : isDenied ? 'denied' : 'failed',
                error: isExpired
                  ? 'Device code expired — restart the flow'
                  : isDenied
                    ? 'Authorization denied on GitHub'
                    : `GitHub error: ${tokenResponse.error}`,
              }))
              return
            }

            // authorized
            setState((s) => ({ ...s, status: 'authorized', error: null }))
            authLogger.info('Device flow: authorized — verifying token...')
            await onToken(tokenResponse.accessToken, 'device')
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            authLogger.error(`Device flow poll error: ${message}`)
            setState((s) => ({ ...s, status: 'failed', error: message }))
          }
        }

        setState((s) => ({ ...s, status: 'polling' }))
        pollingRef.current = setTimeout(poll, intervalRef.current * 1000)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        authLogger.error(`Device flow init error: ${message}`)
        setState((s) => ({ ...s, status: 'failed', error: message }))
      } finally {
        authLogger.groupEnd()
      }
    },
    [stopPolling],
  )

  return { state, start, cancel }
}
```

### 4.5 Changes to `useGitHubAuth`

Add `connectWithDeviceFlow` to the hook. The `AuthMethod` type already includes `'oauth'` and
`'github-app'`; add `'device'` to cover the device flow:

```ts
// In types/githubAuth.types.ts
export type AuthMethod = 'pat' | 'device' | 'oauth' | 'github-app'
```

In `useGitHubAuth.ts`:

```ts
import { useDeviceFlow } from './useDeviceFlow'

export function useGitHubAuth() {
  // ... existing state, verify, connectWithPat, retry, disconnect

  const deviceFlow = useDeviceFlow()

  const connectWithDeviceFlow = useCallback(
    async (scopes: string[] = ['repo', 'workflow']) => {
      setState((s) => ({ ...s, status: 'connecting', method: 'device', error: null }))
      await deviceFlow.start(scopes, async (token) => {
        await verify(token, 'device')
      })
    },
    [deviceFlow, verify],
  )

  // Patch disconnect to also cancel any active device flow
  const disconnectAll = useCallback(() => {
    deviceFlow.cancel()
    disconnect()
  }, [deviceFlow, disconnect])

  return {
    ...state,
    token,
    connectWithPat,
    connectWithDeviceFlow,
    deviceFlow: deviceFlow.state,   // surface raw device flow state for the UI
    retry,
    disconnect: disconnectAll,
  }
}
```

### 4.6 Changes to `ConnectGitHub`

Enable the second tab as "Device Flow" (rename from "OAuth App") and build the device code UI.
The tab shows one of three sub-states:

**Idle / requesting:** A "Connect with Device Flow" button and a scope selector.

**Awaiting user / polling:** A prominent `userCode` display, the `verificationUri` as a button that
opens in a new tab, an expiry countdown, and the current polling interval.

**Expired / denied / failed:** An error message with a Restart button.

```tsx
// ConnectGitHub.tsx — device tab content excerpt

{deviceFlow.status === 'idle' || deviceFlow.status === 'failed' ? (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Opens GitHub in a new tab. You will enter a short code to authorize MOREL.
      No redirect — works in any browser.
    </p>
    {deviceFlow.error && (
      <Alert variant="destructive">
        <AlertDescription>{deviceFlow.error}</AlertDescription>
      </Alert>
    )}
    <Button onClick={() => onConnectDeviceFlow(['repo', 'workflow'])}>
      Connect with Device Flow
    </Button>
  </div>
) : deviceFlow.status === 'awaiting_user' || deviceFlow.status === 'polling' ? (
  <div className="space-y-4">
    <p className="text-sm font-medium">Enter this code at GitHub:</p>
    <code className="block text-center text-3xl font-mono tracking-widest bg-muted p-4 rounded-lg">
      {deviceFlow.userCode}
    </code>
    <Button
      variant="outline"
      className="w-full"
      onClick={() => window.open(deviceFlow.verificationUri ?? '', '_blank')}
    >
      Open github.com/login/device ↗
    </Button>
    <p className="text-xs text-muted-foreground text-center">
      {deviceFlow.status === 'polling'
        ? `Checking every ${deviceFlow.interval}s…`
        : 'Waiting for you to open GitHub…'}
    </p>
    <Button variant="ghost" size="sm" onClick={onCancelDeviceFlow}>
      Cancel
    </Button>
  </div>
) : deviceFlow.status === 'expired' ? (
  <div className="space-y-4">
    <Alert variant="destructive">
      <AlertDescription>Device code expired. Please try again.</AlertDescription>
    </Alert>
    <Button onClick={() => onConnectDeviceFlow(['repo', 'workflow'])}>Restart</Button>
  </div>
) : null}
```

Add `onConnectDeviceFlow` and `onCancelDeviceFlow` props to `ConnectGitHubProps`.

### 4.7 Changes to `AuthDemo`

Pass the new device flow handlers from `useGitHubAuth` into `ConnectGitHub`:

```tsx
<ConnectGitHub
  status={auth.status}
  deviceFlow={auth.deviceFlow}
  onConnectPat={auth.connectWithPat}
  onConnectDeviceFlow={auth.connectWithDeviceFlow}
  onCancelDeviceFlow={auth.disconnect}
/>
```

______________________________________________________________________

## 5. Phase 6 — Manual Testing: Device Flow

### Setup

```sh
pnpm --filter @morel/auth-worker dev   # Worker on localhost:8787
pnpm --filter @morel/web dev           # SPA on localhost:5173
```

Navigate to `http://localhost:5173`. Open DevTools (Console + Network tabs). Click the "Device Flow"
tab in the Connect card.

______________________________________________________________________

### Scenario D-1 — Happy path: authorize and connect

**Input:** Click **Connect with Device Flow**.

**Expected UI (step by step):**

1. "Requesting code…" spinner briefly
2. A large monospace code appears: e.g. `WDJB-MJHT`
3. An "Open github.com/login/device ↗" button appears
4. Footer shows "Checking every 5s…"
5. Open the verification URL in a new tab. Type the code. Authorize on GitHub.
6. Within 5s of authorization, the SPA transitions to the connected state
7. `AuthStatus` card appears with your avatar, username, and green "Connected" badge
8. Method badge shows "DEVICE"

**Expected console:**

```plaintext
[auth] Device flow
  [auth] POST /github/device/code ...
  [auth] User code: WDJB-MJHT → https://github.com/login/device
  [auth] Device flow: pending
  [auth] Device flow: pending
  [auth] Device flow: authorized — verifying token...
  [auth] GET /user ...
  [auth] Authenticated as @<your-username> (scopes: repo, workflow)
```

**Verify in DevTools Network tab:**

- `POST localhost:8787/github/device/code` → 200 (request before authorization)
- Multiple `POST localhost:8787/github/device/token` → 200 with `{"status":"pending"}` until authorized
- Final `POST localhost:8787/github/device/token` → 200 with `{"status":"authorized", "accessToken": ...}`
- `GET api.github.com/user` → 200 (direct from browser, not through worker)
- Access token is NOT visible in any log line

______________________________________________________________________

### Scenario D-2 — Let the device code expire

**Input:** Click **Connect with Device Flow**. Do NOT visit the verification URL. Wait for the
code to expire (GitHub device codes expire after 900 seconds / 15 minutes by default, but you
can simulate this by using a slightly stale code if needed — or test with a short-lived test client).

**Expected UI:** After expiry the `status` becomes `expired` and the card shows: "Device code
expired. Please try again." with a **Restart** button.

**Expected console:**

```plaintext
[auth] Device flow
  [auth] Device flow failed: expired_token
```

**Verify:** Clicking **Restart** initiates a fresh device code request cycle.

______________________________________________________________________

### Scenario D-3 — Deny on GitHub

**Input:** Click **Connect with Device Flow**. Visit the verification URL. Click **Deny** (if
your GitHub App is configured to allow denial).

**Expected UI:** Error card: "Authorization denied on GitHub."

**Expected console:**

```plaintext
[auth] Device flow failed: access_denied
```

______________________________________________________________________

### Scenario D-4 — Cancel mid-flow

**Input:** Click **Connect with Device Flow**. Wait for the user code to appear. Click **Cancel**
before authorizing.

**Expected UI:** Card returns to idle state. No error shown.

**Expected console:**

```plaintext
[auth] Device flow cancelled
[auth] Disconnected
```

**Verify:** The polling `setTimeout` is not running after cancel (no more
`POST /github/device/token` requests appear in the Network tab).

______________________________________________________________________

### Scenario D-5 — Worker offline during code request

**Input:** Stop the worker process. Click **Connect with Device Flow**.

**Expected UI:** Error Alert: "Gateway /github/device/code → ..." with the error detail.

**Expected console:**

```plaintext
[auth] Device flow init error: ...
```

**Verify:** No hanging polling loop. Restart the worker and try again — the flow works.

______________________________________________________________________

### Scenario D-6 — Worker offline during polling

**Input:** Start the flow successfully (code appears). Stop the worker before the next poll fires.

**Expected UI:** After the next poll attempt fails, `status` becomes `failed`.

**Verify:** The error message is specific (not "Unknown error"). Restarting the worker and clicking
**Restart** successfully initiates a new flow.

______________________________________________________________________

### Scenario D-7 — Slow_down handling

This scenario requires controlling GitHub's rate limiting, which is hard to trigger manually.
Verify through unit tests instead: feed `{ status: "slow_down", intervalIncrementSeconds: 5 }`
into the `DeviceTokenResponseSchema` parse and confirm `intervalRef.current` increments and the
polling restarts at the new interval.

______________________________________________________________________

## 6. Phase 7A — OAuth Web Flow with PKCE

This phase adds:

- Worker: `POST /github/oauth/exchange` (new route)
- SPA: Full redirect-based OAuth 2.0 + PKCE flow
- SPA: `auth.callback.tsx` implementation

### 6.1 How the OAuth Web Flow works

```plaintext
1. SPA generates code_verifier and code_challenge (PKCE, SHA-256).
2. SPA generates a random state parameter.
3. SPA stores { codeVerifier, state, method: 'oauth' } in sessionStorage.
4. SPA redirects the browser to GitHub's authorization URL:
     https://github.com/login/oauth/authorize
       ?client_id=<GITHUB_CLIENT_ID>
       &redirect_uri=<http://localhost:5173/auth/callback>
       &scope=repo workflow
       &state=<random>
       &code_challenge=<SHA-256 of verifier, base64url>
       &code_challenge_method=S256
5. User authorizes on GitHub.
6. GitHub redirects back to /auth/callback?code=XXX&state=YYY.
7. Callback route validates state (must match sessionStorage), clears sessionStorage.
8. Callback calls Worker POST /github/oauth/exchange with code + codeVerifier.
9. Worker exchanges code for access_token using GITHUB_CLIENT_SECRET.
10. SPA receives access_token, calls GET /user, sets auth state.
```

Note on PKCE with GitHub OAuth Apps: GitHub validates the `code_challenge` server-side and rejects
token exchanges where `code_verifier` does not match the original `code_challenge`. This means the
`code_verifier` must be forwarded to GitHub through the worker — the worker must include it in its
token request body.

### 6.2 New worker env vars

The exchange route needs the GitHub token endpoint URL and the OAuth callback URL. Add to
`workers/auth/src/types.ts`:

```ts
export const EnvSchema = z.object({
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_DEVICE_CODE_URL: z.url(),
  GITHUB_DEVICE_TOKEN_URL: z.url(),
  GITHUB_OAUTH_TOKEN_URL: z.url(),
  GITHUB_OAUTH_REDIRECT_URI: z.url(),
  ALLOWED_ORIGINS: z.string().optional(),
  SENTRY_DSN: z.url().optional(),
})
```

Add to `workers/auth/wrangler.toml [vars]`:

```toml
GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_OAUTH_REDIRECT_URI = "http://localhost:5173/auth/callback"
```

Add to `workers/auth/.dev.vars.example` (and your local `.dev.vars`):

```dotenv
# OAuth web flow
GITHUB_OAUTH_REDIRECT_URI=http://localhost:5173/auth/callback
```

For staging, set `GITHUB_OAUTH_REDIRECT_URI` in Infisical to the staging SPA URL callback path.

### 6.3 New worker schemas

Add to `workers/auth/src/schemas/worker.schema.ts`:

```ts
// --- OAuth Exchange Request/Response ---

export const OAuthExchangeRequestSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(1),
})

export const OAuthExchangeResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.string(),
  scope: z.string(),
})

export type OAuthExchangeRequest = z.infer<typeof OAuthExchangeRequestSchema>
export type OAuthExchangeResponse = z.infer<typeof OAuthExchangeResponseSchema>
```

### 6.4 New worker route: `POST /github/oauth/exchange`

Create `workers/auth/src/routes/github-oauth.ts`:

```ts
import type { Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { parseBody } from '../lib/validate'
import { OAuthExchangeRequestSchema } from '../schemas/worker.schema'
import type { Env } from '../types'

export function registerOAuthExchange(app: Hono<{ Bindings: Env }>) {
  app.post('/github/oauth/exchange', async (c: Context<{ Bindings: Env }>) => {
    if (!c.env.GITHUB_CLIENT_SECRET) {
      throw new HTTPException(500, { message: 'GITHUB_CLIENT_SECRET not configured' })
    }

    const body = parseBody(OAuthExchangeRequestSchema, await c.req.json())

    const params = new URLSearchParams({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code: body.code,
      code_verifier: body.codeVerifier,
      redirect_uri: c.env.GITHUB_OAUTH_REDIRECT_URI,
    })

    const upstream = await fetch(c.env.GITHUB_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!upstream.ok) {
      const text = await upstream.text()
      throw new HTTPException(upstream.status as 400 | 500, {
        message: `GitHub token exchange failed: ${text}`,
      })
    }

    const data = (await upstream.json()) as Record<string, unknown>

    if (data.error) {
      throw new HTTPException(400, {
        message: `GitHub rejected exchange: ${data.error} — ${data.error_description ?? ''}`,
      })
    }

    return c.json({
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope ?? '',
    })
  })
}
```

Register it in `workers/auth/src/index.ts`:

```ts
import { registerOAuthExchange } from './routes/github-oauth'

// After registerDeviceFlow(app):
registerOAuthExchange(app)
```

**Security notes on this route:**

- `GITHUB_CLIENT_SECRET` never leaves the worker. The browser only sends `code` and `codeVerifier`.
- CORS restricts which origins can call this route (same `ALLOWED_ORIGINS` as all other routes).
- Zod validates the request body before any upstream call.
- Error responses never echo the `client_secret` or the raw code.
- GitHub validates the PKCE `code_verifier` on its end. If the `code_verifier` does not match the
  `code_challenge` used during authorization, GitHub rejects the exchange with `bad_verification_code`.

### 6.5 SPA: PKCE OAuth utility

The `crypto/pkce.ts` and `crypto/random.ts` helpers are already implemented. Add an
`initiateOAuthFlow` function that generates PKCE params and initiates the redirect:

Create or add to `apps/web/src/features/auth/lib/oauthFlow.ts`:

```ts
import { generateCodeChallenge, generateCodeVerifier } from '../crypto/pkce'
import { randomBase64Url } from '../crypto/random'

const SESSION_KEY = 'morel_oauth_pending'

export interface OAuthPendingState {
  codeVerifier: string
  state: string
  method: 'oauth' | 'github-app'
}

export async function initiateOAuthFlow(params: {
  clientId: string
  redirectUri: string
  scopes: string[]
  method: 'oauth' | 'github-app'
}) {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = randomBase64Url(16)

  const pending: OAuthPendingState = {
    codeVerifier,
    state,
    method: params.method,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(pending))

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', params.scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  window.location.href = url.toString()
}

export function consumeOAuthPendingState(returnedState: string): OAuthPendingState | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  sessionStorage.removeItem(SESSION_KEY)
  const pending = JSON.parse(raw) as OAuthPendingState
  if (pending.state !== returnedState) return null // CSRF check
  return pending
}
```

**Why sessionStorage (not localStorage):**
The `codeVerifier` and `state` are ephemeral — they exist only for the duration of a single OAuth
redirect round trip. sessionStorage is cleared on tab close, which is appropriate. Storing them
in localStorage would survive browser restarts and could be misused by stale values.

**Why the CSRF check matters:**
The `state` parameter is a nonce generated fresh for each authorization attempt. If the `state`
returned in the callback does not match what was stored, the authorization response may have been
crafted by an attacker (CSRF or open-redirect attack). Rejecting the mismatch is the correct
behavior and is required by RFC 6749.

### 6.6 SPA: `auth.callback.tsx` implementation

Replace the stub with the real callback handler:

```tsx
// apps/web/src/routes/auth.callback.tsx

import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { gatewayPost } from '@/features/auth/lib/workerClient'
import { consumeOAuthPendingState } from '@/features/auth/lib/oauthFlow'
import { authLogger } from '@/features/auth/lib/authLogger'

type CallbackStatus = 'processing' | 'error'

export function AuthCallbackPage() {
  const [status, setStatus] = useState<CallbackStatus>('processing')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const returnedState = params.get('state')
      const errorParam = params.get('error')

      if (errorParam) {
        authLogger.error(`OAuth callback error: ${errorParam}`)
        setError(errorParam === 'access_denied'
          ? 'Authorization denied on GitHub'
          : `GitHub error: ${errorParam}`)
        setStatus('error')
        return
      }

      if (!code || !returnedState) {
        setError('Missing code or state in callback URL')
        setStatus('error')
        return
      }

      const pending = consumeOAuthPendingState(returnedState)
      if (!pending) {
        authLogger.error('OAuth callback: state mismatch or missing pending state')
        setError('Security check failed — please retry the authorization')
        setStatus('error')
        return
      }

      authLogger.group(`OAuth callback (${pending.method})`)
      try {
        authLogger.debug('POST /github/oauth/exchange ...')
        const result = await gatewayPost<{ accessToken: string; tokenType: string; scope: string }>({
          path: '/github/oauth/exchange',
          body: { code, codeVerifier: pending.codeVerifier },
        })
        authLogger.info('Exchange succeeded (token redacted)')

        // Store token in sessionStorage under a known key so the destination
        // page can pick it up and call verify(). Never store in localStorage.
        sessionStorage.setItem('morel_oauth_token', JSON.stringify({
          accessToken: result.accessToken,
          method: pending.method,
        }))

        await navigate({ to: '/' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        authLogger.error(`Exchange failed: ${message}`)
        setError(message)
        setStatus('error')
      } finally {
        authLogger.groupEnd()
      }
    }

    void handleCallback()
  }, [navigate])

  if (status === 'error') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-destructive">{error}</p>
        <a href="/" className="underline text-sm">Go back</a>
      </main>
    )
  }

  return (
    <main className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Processing authentication…</p>
    </main>
  )
}
```

### 6.7 SPA: pick up OAuth token on home page

After the callback redirects back to `/`, `useGitHubAuth` must check for a pending OAuth token in
sessionStorage and consume it. Add to the hook's initialization:

```ts
// In useGitHubAuth, inside useEffect on mount:
useEffect(() => {
  const raw = sessionStorage.getItem('morel_oauth_token')
  if (!raw) return
  sessionStorage.removeItem('morel_oauth_token')
  const { accessToken, method } = JSON.parse(raw) as { accessToken: string; method: AuthMethod }
  void verify(accessToken, method)
}, [verify])
```

The `setToken(token)` call inside `verify` stores the token in React state (memory-only). It is
never written back to sessionStorage.

### 6.8 Changes to `ConnectGitHub`

Enable the "OAuth App" tab. The tab shows a single **"Connect with GitHub OAuth"** button that calls
`onConnectOAuth('oauth')`. Since the entire flow happens in a redirect, the UI just triggers
`initiateOAuthFlow` and the page navigates away.

```tsx
<TabsContent value="oauth" className="space-y-4 pt-4">
  <p className="text-sm text-muted-foreground">
    Redirects to GitHub for authorization. You will be returned to this page
    with a token scoped to <code>repo</code> and <code>workflow</code>.
  </p>
  <Button onClick={() => onConnectOAuth('oauth')}>
    Connect with GitHub OAuth
  </Button>
</TabsContent>
```

Add `onConnectOAuth: (method: 'oauth' | 'github-app') => void` to `ConnectGitHubProps`.

In `useGitHubAuth`, implement `connectWithOAuth`:

```ts
const connectWithOAuth = useCallback(
  async (method: 'oauth' | 'github-app') => {
    authLogger.info(`${method} flow: initiating redirect`)
    setState((s) => ({ ...s, status: 'connecting', method, error: null }))
    await initiateOAuthFlow({
      clientId: import.meta.env.VITE_GITHUB_CLIENT_ID as string,
      redirectUri: `${window.location.origin}/auth/callback`,
      scopes: ['repo', 'workflow'],
      method,
    })
    // Page navigates away — no further code runs here
  },
  [],
)
```

Add `VITE_GITHUB_CLIENT_ID` to `apps/web/.env.local`:

```dotenv
VITE_GITHUB_CLIENT_ID=<your GitHub App or OAuth App client_id>
```

This is not a secret — it is the public client ID, safe to embed in a static SPA.

______________________________________________________________________

## 7. Phase 7A — Manual Testing: OAuth Web Flow

### Setup

```sh
pnpm --filter @morel/auth-worker dev
pnpm --filter @morel/web dev
```

The GitHub App or OAuth App must have `http://localhost:5173/auth/callback` added as an
authorized callback URL in its GitHub settings page.

Navigate to `http://localhost:5173`. Click the "OAuth App" tab.

______________________________________________________________________

### Scenario O-1 — Happy path: authorize and connect

**Input:** Click **Connect with GitHub OAuth**.

**Expected behavior (step by step):**

1. Browser navigates to `https://github.com/login/oauth/authorize?client_id=...&...`
2. GitHub shows the authorization screen. Click **Authorize**.
3. GitHub redirects to `http://localhost:5173/auth/callback?code=...&state=...`
4. Callback page shows "Processing authentication…" briefly
5. Callback calls `POST localhost:8787/github/oauth/exchange`
6. Callback navigates back to `/`
7. Home page finds token in sessionStorage, calls `verify(token, 'oauth')`
8. `AuthStatus` shows avatar, username, and granted scopes as badges
9. Method badge shows "OAUTH"

**Expected console (on callback page then home page):**

```plaintext
[auth] OAuth callback (oauth)
  [auth] POST /github/oauth/exchange ...
  [auth] Exchange succeeded (token redacted)
[auth] GET /user ...
[auth] Authenticated as @<your-username> (scopes: repo, workflow)
```

**Verify in DevTools:**

- sessionStorage had `morel_oauth_pending` while on GitHub; it was deleted after callback
- sessionStorage had `morel_oauth_token` briefly on `/`; it was deleted after verify
- Token does not appear in any console log
- The `code` parameter in the callback URL is not logged
- Network tab shows `POST localhost:8787/github/oauth/exchange` with a body containing `code`
  and `codeVerifier` (not the `client_secret`)

______________________________________________________________________

### Scenario O-2 — User denies on GitHub

**Input:** Click **Connect with GitHub OAuth**. On GitHub, click **Cancel** or **Deny**.

**Expected behavior:** GitHub redirects to `/auth/callback?error=access_denied&...`

**Expected UI on callback page:** "Authorization denied on GitHub" with a "Go back" link.

**Expected console:**

```plaintext
[auth] OAuth callback error: access_denied
```

______________________________________________________________________

### Scenario O-3 — State mismatch (CSRF simulation)

**Input:** Manually clear `morel_oauth_pending` from sessionStorage before GitHub redirects
back. You can simulate this by opening DevTools → Application → Session Storage → delete the key
after clicking "Connect with GitHub OAuth" but before GitHub redirects back.

**Expected behavior:** Callback shows "Security check failed — please retry the authorization."

**Expected console:**

```plaintext
[auth] OAuth callback: state mismatch or missing pending state
```

**Verify:** No token exchange was attempted (no `POST /exchange` request in Network tab).

______________________________________________________________________

### Scenario O-4 — Worker offline during exchange

**Input:** Stop the worker. Complete the GitHub authorization flow normally.

**Expected behavior:** Callback page shows the gateway error with the HTTP status and detail.

**Expected console:**

```plaintext
[auth] OAuth callback (oauth)
  [auth] POST /github/oauth/exchange ...
  [auth] Exchange failed: Gateway /github/oauth/exchange → 502: ...
```

**Verify:** `morel_oauth_pending` and `morel_oauth_token` are both cleared from sessionStorage
on failure.

______________________________________________________________________

### Scenario O-5 — Invalid or replayed code

**Input:** Manually submit a stale or replayed `code` to `POST /github/oauth/exchange` (e.g.,
via curl or by reloading the callback URL with the same `?code=...&state=...`).

**Expected behavior:** Worker responds with 400 and an error message from GitHub
(`bad_verification_code` or `expired_token`).

**Verify:** The worker response contains an error message. No access token is returned.

______________________________________________________________________

## 8. Phase 7B — GitHub App User Auth

GitHub App user authorization uses the same OAuth 2.0 redirect flow as a standard OAuth App.
The differences are:

| Aspect | OAuth App | GitHub App |
| -- | -- | -- |
| Client ID | OAuth App client ID | GitHub App client ID |
| Scopes | Standard OAuth scopes (e.g. `repo`) | Scopes requested within installed permissions |
| `x-oauth-scopes` header | Populated | May be empty; permissions come from installation |
| Auth method badge | `OAUTH` | `GITHUB-APP` |
| Worker endpoint | `POST /github/oauth/exchange` | Same |

### 8.1 What changes in the SPA

The GitHub App tab calls `onConnectOAuth('github-app')` instead of `'oauth'`. The method is passed
through `initiateOAuthFlow`, stored in sessionStorage's `OAuthPendingState.method`, and ultimately
used to set `method: 'github-app'` in `useGitHubAuth` state.

If your GitHub App and OAuth App share the same `VITE_GITHUB_CLIENT_ID` (because you only have
one GitHub App client configured per environment), no additional env var is needed.
If you have a separate OAuth App client ID, add `VITE_GITHUB_OAUTH_APP_CLIENT_ID` and select it
based on the method parameter in `connectWithOAuth`.

### 8.2 UI

Enable the "GitHub App" tab in `ConnectGitHub`:

```tsx
<TabsContent value="github-app" className="space-y-4 pt-4">
  <p className="text-sm text-muted-foreground">
    Connects via the MOREL GitHub App. Authorization is tied to the app's
    installation permissions rather than OAuth scopes.
  </p>
  <Button onClick={() => onConnectOAuth('github-app')}>
    Connect with GitHub App
  </Button>
</TabsContent>
```

### 8.3 `AuthStatus` — scopes display for GitHub App tokens

Fine-grained GitHub App tokens may return an empty `x-oauth-scopes` header. The `AuthStatus`
component already handles this (shows "Fine-grained PAT" badge for empty scopes). Add a
`github-app` branch to the same logic:

```tsx
{state.scopes.length > 0 ? (
  state.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)
) : state.method === 'pat' || state.method === 'device' ? (
  <Badge variant="secondary">Fine-grained token</Badge>
) : state.method === 'github-app' ? (
  <Badge variant="secondary">App permissions</Badge>
) : null}
```

### 8.4 Manual testing

Follow the same scenarios as Phase 7A (O-1 through O-5) but click the "GitHub App" tab and use
the GitHub App authorization URL. Confirm:

- Method badge shows "GITHUB-APP" instead of "OAUTH"
- Scopes badge shows "App permissions" if `x-oauth-scopes` is empty
- The write test works if the GitHub App installation has `contents: read+write` and
  `administration: read+write` permissions

______________________________________________________________________

## 9. Implementation Checklist

### Phase 6 — Device Flow SPA Integration

- [ ] Create `apps/web/.env.local` with `VITE_MOREL_AUTH_GATEWAY_URL=http://localhost:8787`
- [ ] Create `apps/web/src/features/auth/lib/workerClient.ts`
- [ ] Add `DeviceFlowStatus` and `DeviceFlowState` types to `githubAuth.types.ts`
- [ ] Add `'device'` to `AuthMethod` in `githubAuth.types.ts`
- [ ] Add `DeviceCodeResponseSchema` and `DeviceTokenResponseSchema` to `githubAuth.schema.ts`
- [ ] Create `apps/web/src/features/auth/hooks/useDeviceFlow.ts`
- [ ] Add `connectWithDeviceFlow` and `deviceFlow` state to `useGitHubAuth`
- [ ] Patch `disconnect` in `useGitHubAuth` to also call `deviceFlow.cancel()`
- [ ] Enable Device Flow tab in `ConnectGitHub` with the full state-machine UI
- [ ] Add `onConnectDeviceFlow` and `onCancelDeviceFlow` props to `ConnectGitHubProps`
- [ ] Wire new props in `AuthDemo`
- [ ] Run `pnpm -r typecheck && pnpm -r lint`
- [ ] Manual test: Scenarios D-1 through D-5

### Phase 7A — OAuth Web Flow (PKCE)

- [ ] Add `VITE_GITHUB_CLIENT_ID` to `apps/web/.env.local`
- [ ] Add `GITHUB_OAUTH_TOKEN_URL` and `GITHUB_OAUTH_REDIRECT_URI` to `workers/auth/wrangler.toml [vars]`
- [ ] Add `GITHUB_OAUTH_TOKEN_URL` and `GITHUB_OAUTH_REDIRECT_URI` to `EnvSchema` in `workers/auth/src/types.ts`
- [ ] Update `workers/auth/.dev.vars.example` with the new vars
- [ ] Add `OAuthExchangeRequestSchema` and `OAuthExchangeResponseSchema` to `workers/auth/src/schemas/worker.schema.ts`
- [ ] Create `workers/auth/src/routes/github-oauth.ts`
- [ ] Register `registerOAuthExchange` in `workers/auth/src/index.ts`
- [ ] Add `http://localhost:5173/auth/callback` as a callback URL in the GitHub App/OAuth App settings
- [ ] Create `apps/web/src/features/auth/lib/oauthFlow.ts` with `initiateOAuthFlow` and `consumeOAuthPendingState`
- [ ] Implement `apps/web/src/routes/auth.callback.tsx`
- [ ] Add `connectWithOAuth` to `useGitHubAuth` and mount-time sessionStorage token pickup
- [ ] Enable OAuth App tab in `ConnectGitHub` with the redirect button
- [ ] Add `onConnectOAuth` prop to `ConnectGitHubProps` and wire in `AuthDemo`
- [ ] Run `pnpm -r typecheck && pnpm -r lint`
- [ ] Manual test: Scenarios O-1 through O-5

### Phase 7B — GitHub App User Auth

- [ ] Enable GitHub App tab in `ConnectGitHub` using `onConnectOAuth('github-app')`
- [ ] Update `AuthStatus` scopes display to handle `github-app` method
- [ ] Add `http://localhost:5173/auth/callback` to GitHub App's callback URLs if not already there
- [ ] Manual test: Same O-1 through O-5 scenarios using the GitHub App tab

______________________________________________________________________

## 10. Summary of Auth Demo Flows After All Phases

| Tab | Method | Worker endpoint(s) used | Token source |
| -- | -- | -- | -- |
| PAT | `pat` | None (direct Octokit) | User-pasted token |
| Device Flow | `device` | `/github/device/code`, `/github/device/token` | GitHub Device OAuth |
| OAuth App | `oauth` | `/github/oauth/exchange` | GitHub OAuth PKCE redirect |
| GitHub App | `github-app` | `/github/oauth/exchange` | GitHub App PKCE redirect |

All four methods end by calling `GET /user` via Octokit directly from the browser. Only token
acquisition is mediated by the worker. After authentication, MOREL Studio uses Octokit for all
GitHub API operations.
