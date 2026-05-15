# Auth Demo v1 — Implementation Guide (Phases 4–5)

> Companion to [01-01-auth-demo-v1-spec.md](./01-01-auth-demo-v1-spec.md). This guide gives step-by-step implementation instructions for Phases 4 and 5.

______________________________________________________________________

## Prerequisites

Phases 1–3 are complete. You should be able to run:

```sh
pnpm dev          # Vite on http://localhost:5173
pnpm dev:worker   # Cloudflare Worker on http://localhost:8787
pnpm -r typecheck # passes
```

______________________________________________________________________

## Phase 4 — Auth UI + Core

### 4.1 Install shadcn/ui

shadcn/ui requires Tailwind CSS. Install Tailwind first, then pre-create `components.json` so the `shadcn add` command works non-interactively.

```sh
cd apps/web

# Tailwind + its Vite plugin
pnpm add -D tailwindcss @tailwindcss/vite
```

Create `apps/web/components.json` (controls where shadcn places generated primitives):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

> `src/components/ui/` holds shadcn primitives (generated, rarely hand-edited). Custom feature components live in `src/features/*/components/`.

Add the `@/` path alias to `tsconfig.app.json`:

```jsonc
{
  "compilerOptions": {
    // ... existing options ...
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Update `vite.config.ts` to resolve the `@/` alias:

```ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Replace `apps/web/src/index.css` with Tailwind directives:

```css
@import "tailwindcss";
```

Now add all required components in one shot (reads `components.json`, no prompts):

```sh
pnpm dlx shadcn@latest add button card input label tabs badge alert dialog select separator textarea
```

This generates files into `src/components/ui/` and creates `src/lib/utils.ts` (the `cn()` helper) automatically.

**Checkpoint:** `pnpm typecheck` still passes. The app renders (blank is fine).

______________________________________________________________________

### 4.2 Create the feature directory structure

```sh
mkdir -p src/features/auth/{types,schemas,crypto,hooks,components,lib}
```

______________________________________________________________________

### 4.3 Auth types

Create `src/features/auth/types/githubAuth.types.ts`:

```ts
export type AuthMethod = 'pat' | 'oauth' | 'github-app'

export type AuthStatus = 'disconnected' | 'connecting' | 'connected' | 'failed'

export interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
}

export interface AuthState {
  status: AuthStatus
  method: AuthMethod | null
  user: GitHubUser | null
  scopes: string[]
  error: string | null
}
```

______________________________________________________________________

### 4.4 Zod schemas

Create `src/features/auth/schemas/githubAuth.schema.ts`:

```ts
import { z } from 'zod/v4'

/**
 * Validates a fine-grained Personal Access Token.
 * GitHub fine-grained PATs start with `github_pat_`.
 */
export const GitHubPatSchema = z
  .string()
  .startsWith('github_pat_', 'Token must start with github_pat_')
  .min(40, 'Token is too short')

/**
 * Shape returned by GET /user.
 * Only the fields we display — extend as needed.
 */
export const GitHubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.url(),
})
```

______________________________________________________________________

### 4.5 `authLogger` utility

Create `src/features/auth/lib/authLogger.ts`:

```ts
const PREFIX = '[auth]'

function noop(..._args: unknown[]) {}

function createLogger() {
  if (!import.meta.env.DEV) {
    return {
      group: noop,
      groupEnd: noop,
      info: noop,
      debug: noop,
      error: noop,
    }
  }

  return {
    group(label: string) {
      console.group(`${PREFIX} ${label}`)
    },
    groupEnd() {
      console.groupEnd()
    },
    info(...args: unknown[]) {
      console.info(PREFIX, ...args)
    },
    debug(...args: unknown[]) {
      console.debug(PREFIX, ...args)
    },
    error(...args: unknown[]) {
      console.error(PREFIX, ...args)
    },
  }
}

export const authLogger = createLogger()
```

______________________________________________________________________

### 4.6 `useGitHubAuth` hook

Create `src/features/auth/hooks/useGitHubAuth.ts`:

```ts
import { useCallback, useState } from 'react'
import { Octokit } from '@octokit/rest'
import { GitHubPatSchema, GitHubUserSchema } from '../schemas/githubAuth.schema'
import { authLogger } from '../lib/authLogger'
import type { AuthMethod, AuthState, GitHubUser } from '../types/githubAuth.types'

const initialState: AuthState = {
  status: 'disconnected',
  method: null,
  user: null,
  scopes: [],
  error: null,
}

export function useGitHubAuth() {
  const [state, setState] = useState<AuthState>(initialState)

  /**
   * Verify a token by calling GET /user.
   * Returns the user on success, throws on failure.
   */
  const verify = useCallback(async (token: string, method: AuthMethod): Promise<GitHubUser> => {
    authLogger.debug(`GET /user …`)
    const octokit = new Octokit({ auth: token })
    const response = await octokit.rest.users.getAuthenticated()

    const user = GitHubUserSchema.parse(response.data)
    const scopes = (response.headers['x-oauth-scopes'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    authLogger.info(`✓ Authenticated as @${user.login} (scopes: ${scopes.join(', ') || 'none'})`)

    setState({
      status: 'connected',
      method,
      user,
      scopes,
      error: null,
    })

    return user
  }, [])

  /**
   * Connect using a fine-grained PAT.
   */
  const connectWithPat = useCallback(async (rawToken: string) => {
    authLogger.group('PAT flow')

    try {
      authLogger.info('PAT flow started')
      setState((s) => ({ ...s, status: 'connecting', method: 'pat', error: null }))

      // Validate format before hitting the network
      const result = GitHubPatSchema.safeParse(rawToken)
      if (!result.success) {
        const msg = result.error.issues[0]?.message ?? 'Invalid token format'
        throw new Error(msg)
      }

      authLogger.info('Token received (type: bearer)')
      await verify(rawToken, 'pat')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      authLogger.error(`✗ ${message}`)
      setState((s) => ({ ...s, status: 'failed', error: message }))
    } finally {
      authLogger.groupEnd()
    }
  }, [verify])

  /**
   * Disconnect and clear state.
   */
  const disconnect = useCallback(() => {
    authLogger.info('Disconnected')
    setState(initialState)
  }, [])

  return {
    ...state,
    connectWithPat,
    disconnect,
  }
}
```

______________________________________________________________________

### 4.7 `AuthStatus` component

Create `src/features/auth/components/AuthStatus.tsx`:

```tsx
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AuthState } from '../types/githubAuth.types'

interface AuthStatusProps {
  state: AuthState
  onRetry?: () => void
  onDisconnect?: () => void
}

const statusVariant: Record<AuthState['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  disconnected: 'secondary',
  connecting: 'outline',
  connected: 'default',
  failed: 'destructive',
}

export function AuthStatus({ state, onRetry, onDisconnect }: AuthStatusProps) {
  if (state.status === 'disconnected') {
    return null
  }

  if (state.status === 'failed') {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between">
          <span>{state.error ?? 'Authentication failed'}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        {state.user?.avatar_url && (
          <img
            src={state.user.avatar_url}
            alt={`${state.user.login}'s avatar`}
            className="h-12 w-12 rounded-full"
          />
        )}
        <div className="flex-1">
          <CardTitle className="text-base">
            {state.user?.login ?? 'Connecting…'}
          </CardTitle>
          {state.user?.name && (
            <p className="text-sm text-muted-foreground">{state.user.name}</p>
          )}
        </div>
        <Badge variant={statusVariant[state.status]}>
          {state.status === 'connecting' ? 'Connecting…' : 'Connected'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {state.method && (
          <Badge variant="outline">{state.method.toUpperCase()}</Badge>
        )}
        {state.scopes.map((scope) => (
          <Badge key={scope} variant="secondary">
            {scope}
          </Badge>
        ))}
        {onDisconnect && state.status === 'connected' && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

______________________________________________________________________

### 4.8 `ConnectGitHub` component

Create `src/features/auth/components/ConnectGitHub.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { AuthState } from '../types/githubAuth.types'

interface ConnectGitHubProps {
  status: AuthState['status']
  onConnectPat: (token: string) => void
}

export function ConnectGitHub({ status, onConnectPat }: ConnectGitHubProps) {
  const [patValue, setPatValue] = useState('')

  const isLoading = status === 'connecting'

  function handlePatSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConnectPat(patValue.trim())
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Connect to GitHub</CardTitle>
        <CardDescription>
          Choose an authentication method to connect your GitHub account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pat">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pat">PAT</TabsTrigger>
            <TabsTrigger value="oauth" disabled>
              OAuth App
            </TabsTrigger>
            <TabsTrigger value="github-app" disabled>
              GitHub App
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pat" className="space-y-4 pt-4">
            <form onSubmit={handlePatSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pat-input">Fine-grained Personal Access Token</Label>
                <Textarea
                  id="pat-input"
                  placeholder="github_pat_..."
                  value={patValue}
                  onChange={(e) => setPatValue(e.target.value)}
                  className="font-mono text-sm"
                  rows={3}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Paste a fine-grained PAT. It starts with <code>github_pat_</code>.
                </p>
              </div>
              <Separator />
              <Button type="submit" disabled={isLoading || !patValue.trim()}>
                {isLoading ? 'Connecting…' : 'Connect'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="oauth" className="pt-4">
            <p className="text-sm text-muted-foreground">
              OAuth App flow will be available after Phase 7.
            </p>
          </TabsContent>

          <TabsContent value="github-app" className="pt-4">
            <p className="text-sm text-muted-foreground">
              GitHub App flow will be available after Phase 7.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
```

______________________________________________________________________

### 4.9 Feature barrel export

Create `src/features/auth/index.ts`:

```ts
export { AuthStatus } from './components/AuthStatus'
export { ConnectGitHub } from './components/ConnectGitHub'
export { useGitHubAuth } from './hooks/useGitHubAuth'
export { authLogger } from './lib/authLogger'
export type { AuthMethod, AuthState, GitHubUser } from './types/githubAuth.types'
```

______________________________________________________________________

### 4.10 Wire into the Settings page

Update `src/routes/settings.security.tsx`:

```tsx
import { AuthStatus, ConnectGitHub, useGitHubAuth } from '@/features/auth'

export function SecuritySettingsPage() {
  const auth = useGitHubAuth()

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Security Settings</h1>

      <AuthStatus
        state={auth}
        onRetry={() => {/* user re-submits last token — Phase 5 adds retry logic */}}
        onDisconnect={auth.disconnect}
      />

      {auth.status !== 'connected' && (
        <ConnectGitHub
          status={auth.status}
          onConnectPat={auth.connectWithPat}
        />
      )}
    </main>
  )
}
```

______________________________________________________________________

### 4.11 PKCE helpers (scaffolded for Phase 7)

Create `src/features/auth/crypto/random.ts`:

```ts
/** Generate a cryptographically random string of the given byte length, encoded as URL-safe base64. */
export function randomBase64Url(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
```

Create `src/features/auth/crypto/pkce.ts`:

```ts
import { randomBase64Url } from './random'

/**
 * Generate a PKCE code verifier (43–128 chars of URL-safe base64).
 */
export function generateCodeVerifier(): string {
  return randomBase64Url(32) // 43 chars
}

/**
 * Derive the code challenge from a verifier using SHA-256.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
```

______________________________________________________________________

### Phase 4 — Acceptance Criteria

- [ ] `pnpm typecheck` passes
- [ ] `pnpm dev` starts and renders the Settings page with the `ConnectGitHub` card
- [ ] Tabs show PAT (enabled), OAuth App (disabled), GitHub App (disabled)
- [ ] Entering an invalid token shows an inline error in the `Alert`
- [ ] Console shows grouped `[auth]` logs for every step
- [ ] No tokens are visible in the console output

______________________________________________________________________

## Phase 5 — Fine-grained PAT Auth

Phase 4 built the UI and the hook. Phase 5 makes the PAT flow actually work end-to-end.

### 5.1 What's already done

By the end of Phase 4, `useGitHubAuth.connectWithPat()` already:

1. Validates the token format with Zod (`github_pat_` prefix)
2. Creates an Octokit instance
3. Calls `GET /user`
4. Parses the response with `GitHubUserSchema`
5. Updates state and logs to the console

So Phase 5 is primarily about **testing the real flow** and handling edge cases.

______________________________________________________________________

### 5.2 Improve token validation

Fine-grained PATs have the format `github_pat_<22-char-id>_<40-char-secret>`. Update the schema in `githubAuth.schema.ts` to be more precise:

```ts
export const GitHubPatSchema = z
  .string()
  .trim()
  .regex(
    /^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{40,}$/,
    'Invalid fine-grained PAT format (expected github_pat_<id>_<secret>)',
  )
```

> **Note:** Classic PATs (`ghp_*`) are being deprecated. This demo only supports fine-grained tokens.

______________________________________________________________________

### 5.3 Handle network errors

Octokit throws on 4xx/5xx. Wrap the verification call to distinguish between:

| Error | User-facing message | Console log |
| -- | -- | -- |
| 401 Unauthorized | "Token is invalid or revoked" | `✗ GET /user → 401 Bad credentials` |
| 403 Forbidden | "Token lacks required permissions" | `✗ GET /user → 403 …` |
| Network failure | "Cannot reach GitHub — check your connection" | `✗ Network error: …` |
| Unexpected shape | "Unexpected response from GitHub" | `✗ Validation: …` |

Update the `verify` function's catch block in `useGitHubAuth.ts`:

```ts
import { RequestError } from '@octokit/request-error'

// Inside connectWithPat try/catch:
catch (err) {
  let message: string
  if (err instanceof RequestError) {
    if (err.status === 401) message = 'Token is invalid or revoked'
    else if (err.status === 403) message = 'Token lacks required permissions'
    else message = `GitHub API error (${err.status})`
    authLogger.error(`✗ GET /user → ${err.status} ${err.message}`)
  } else if (err instanceof Error) {
    message = err.message.includes('fetch')
      ? 'Cannot reach GitHub — check your connection'
      : err.message
    authLogger.error(`✗ ${message}`)
  } else {
    message = 'Unknown error'
    authLogger.error(`✗ Unknown error`, err)
  }
  setState((s) => ({ ...s, status: 'failed', error: message }))
}
```

Add `@octokit/request-error` — it's already bundled with `@octokit/rest`, just import it:

```ts
import { RequestError } from '@octokit/request-error'
```

______________________________________________________________________

### 5.4 Retry support

Add a `lastToken` ref so the retry button can re-attempt:

```ts
const lastTokenRef = useRef<string | null>(null)

const connectWithPat = useCallback(async (rawToken: string) => {
  lastTokenRef.current = rawToken
  // ... existing logic
}, [verify])

const retry = useCallback(() => {
  if (lastTokenRef.current) {
    connectWithPat(lastTokenRef.current)
  }
}, [connectWithPat])
```

Expose `retry` from the hook and pass it to `AuthStatus`:

```tsx
<AuthStatus
  state={auth}
  onRetry={auth.retry}
  onDisconnect={auth.disconnect}
/>
```

______________________________________________________________________

### 5.5 Scopes display

Fine-grained PATs don't return `x-oauth-scopes` in the response headers — that header is only set for OAuth tokens. For PATs, the scopes array will be empty. Instead, show a "Fine-grained PAT" badge and skip the scopes row. Update `AuthStatus` to handle this:

```tsx
{state.scopes.length > 0 ? (
  state.scopes.map((scope) => (
    <Badge key={scope} variant="secondary">{scope}</Badge>
  ))
) : state.method === 'pat' ? (
  <Badge variant="secondary">Fine-grained PAT</Badge>
) : null}
```

______________________________________________________________________

### 5.6 Manual testing procedure

1. Generate a real fine-grained PAT at <https://github.com/settings/personal-access-tokens/new>
   - Name: `morel-dev-test`
   - Expiration: 7 days
   - Repository access: **Public repositories only** (safest for testing)
   - Permissions: none needed (just `GET /user` works with zero extra scopes)
2. Run `pnpm dev`
3. Navigate to `/settings/security`
4. Paste the token → click **Connect**
5. Verify:
   - `AuthStatus` card shows your avatar, username, and "Fine-grained PAT" badge
   - Console shows `[auth] ✓ Authenticated as @<your-username>`
   - No token value visible anywhere in the console
6. Click **Disconnect** → card disappears
7. Paste a garbage string → "Invalid fine-grained PAT format" error appears inline
8. Paste an expired/revoked token → "Token is invalid or revoked" error
9. Disconnect Wi-Fi → paste valid token → "Cannot reach GitHub" error

______________________________________________________________________

### Phase 5 — Acceptance Criteria

- [ ] Valid fine-grained PAT → user avatar + username shown in `AuthStatus`
- [ ] Invalid format → inline error before any network call
- [ ] Revoked token → 401 error message shown
- [ ] Network offline → user-friendly error
- [ ] Retry button re-attempts the last token
- [ ] Console logs every step grouped under `[auth] PAT flow`
- [ ] Token value never appears in console output
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
