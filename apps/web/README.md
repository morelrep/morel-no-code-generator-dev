# @morel/web

The main web application for Morel — a GitHub-connected platform for managing and exploring repositories. Built with React 19, Vite, TanStack Router, and TanStack Query.

Part of the `morel-v3` monorepo. The companion Cloudflare Worker (`workers/github-auth-exchange`) handles the server-side OAuth token exchange.

## Stack

| Layer | Library |
| -- | -- |
| Framework | React 19 + Vite 8 |
| Routing | TanStack React Router |
| Server state | TanStack React Query |
| GitHub API | Octokit REST |
| Validation | Zod |
| Language | TypeScript 6 |

## Routes

| Path | Purpose |
| -- | -- |
| `/` | Home / dashboard |
| `/auth/callback` | GitHub OAuth callback handler |
| `/settings/security` | Credential management |

## Development

```sh
# from the repo root
pnpm dev           # start Vite dev server at http://localhost:5173
pnpm dev:worker    # start the GitHub auth Cloudflare Worker locally

# or from this directory
pnpm dev
pnpm build         # tsc + vite build
pnpm typecheck     # type-check only (no emit)
pnpm lint          # ESLint
pnpm preview       # preview the production build locally
```

## Authentication

The app implements a multi-method GitHub auth flow:

1. **Personal Access Token (PAT)** — fine-grained token used directly with Octokit
2. **OAuth App (PKCE)** — authorization code flow proxied through `workers/github-auth-exchange` to keep the client secret off the browser
3. **GitHub App** — user-to-server auth flow (planned)

Credentials are encrypted and stored locally in IndexedDB (OPFS as fallback).
