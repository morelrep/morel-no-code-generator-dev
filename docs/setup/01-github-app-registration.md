# MOREL V3 — GitHub App Registration Guide

## Overview

MOREL V3 requires two GitHub App registrations:

| App | Environments |
| -- | -- |
| `Morel Studio Dev` | local development + staging |
| `Morel Studio` | production only |

Both apps support the GitHub Device Authorization Flow and the OAuth web flow.
A private key is not required for MVP — skip that section when GitHub prompts you.

______________________________________________________________________

## 1. Create the Dev & Staging App

Go to: [github.com/settings/apps/new](https://github.com/settings/apps/new)

### 1.1 Basic Info

| Field | Value |
| -- | -- |
| GitHub App name | `Morel Studio Dev` |
| Description | leave empty |
| Homepage URL | `https://github.com/jdelpino-dev/morel-v3` |

### 1.2 Identifying and Authorizing Users

| Field | Value |
| -- | -- |
| Callback URL (line 1) | `http://localhost:5173/auth/callback` |
| Callback URL (line 2) | `https://jdelpino-dev.github.io/morel-v3/auth/callback` |
| Expire user authorization tokens | checked |
| Request user authorization (OAuth) during installation | **checked** |
| Redirect on update | **checked** |
| Enable Device Flow | **checked** |

> **Important:** The installation redirect always uses the **first** callback URL — it cannot be overridden per-request. Always put the local dev URL first for the dev app. See `docs/reference/01-github-app-auth-common-mistakes.md`.

### 1.3 Post Installation

| Field | Value |
| -- | -- |
| Setup URL | leave empty |

### 1.4 Webhook

| Field | Value |
| -- | -- |
| Active | **unchecked** |
| Webhook URL | leave empty |
| Webhook secret | leave empty |

### 1.5 Permissions

#### Repository permissions

| Permission | Level |
| -- | -- |
| Contents | Read and write |
| Actions | Read and write |
| Pages | Read and write |
| Administration | Read and write |
| Metadata | Read-only (mandatory, auto-set) |

All other permissions: No access.

> **Note:** Administration: Read and write is required for the write-access smoke test (`DELETE /repos/{owner}/{repo}`).

### 1.6 Where Can This App Be Installed?

Select: **Any account**

> **Important:** "Only on this account" (the default) prevents other users from installing the app and causes a 404 on the authorize page for non-owner accounts.

### 1.7 After Creation

GitHub will show the app settings page. Copy and save:

| Value | Where to store |
| -- | -- |
| App ID | Infisical `/workers/auth` → `GITHUB_APP_ID` (dev + staging environments) |
| Client ID | Infisical `/workers/auth` → `GITHUB_CLIENT_ID` (dev + staging) |
| Client ID | Infisical `/apps/web` → `VITE_GITHUB_CLIENT_ID` (dev + staging) |
| App slug (from app URL) | Infisical `/apps/web` → `VITE_GITHUB_APP_SLUG` (dev + staging) |

Then generate a client secret:

1. Scroll to **Client secrets**
2. Click **Generate a new client secret**
3. Copy it immediately — GitHub only shows it once

| Value | Where to store |
| -- | -- |
| Client Secret | Infisical `/workers/auth` → `GITHUB_CLIENT_SECRET` (dev + staging environments) |

### 1.8 Private Key

Skip. Not required for MVP.

### 1.9 IP Allow List

Skip. Leave empty.

______________________________________________________________________

## 2. Create the Production App

Go to: [github.com/settings/apps/new](https://github.com/settings/apps/new)

### 2.1 Basic Info

| Field | Value |
| -- | -- |
| GitHub App name | `Morel Studio` |
| Description | `MOREL Studio — connect your GitHub account to manage research publications` |
| Homepage URL | `https://jdelpino-dev.github.io/morel-v3` (update when production is deployed) |

### 2.2 Identifying and Authorizing Users

| Field | Value |
| -- | -- |
| Callback URL | `https://jdelpino-dev.github.io/morel-v3/auth/callback` |
| Expire user authorization tokens | checked |
| Request user authorization (OAuth) during installation | **checked** |
| Redirect on update | **checked** |
| Enable Device Flow | **checked** |

> Production app not deployed yet. Update callback URL when production is deployed.

### 2.3 Post Installation

| Field | Value |
| -- | -- |
| Setup URL | leave empty |

### 2.4 Webhook

| Field | Value |
| -- | -- |
| Active | **unchecked** |

### 2.5 Permissions

Same as the dev app:

| Permission | Level |
| -- | -- |
| Contents | Read and write |
| Actions | Read and write |
| Pages | Read and write |
| Administration | Read and write |
| Metadata | Read-only |

### 2.6 Where Can This App Be Installed?

Select: **Any account**

### 2.7 After Creation

| Value | Where to store |
| -- | -- |
| App ID | Infisical `/workers/auth` → `GITHUB_APP_ID` (production environment) |
| Client ID | Infisical `/workers/auth` → `GITHUB_CLIENT_ID` (production) |
| Client ID | Infisical `/apps/web` → `VITE_GITHUB_CLIENT_ID` (production) |
| App slug (from app URL) | Infisical `/apps/web` → `VITE_GITHUB_APP_SLUG` (production) |
| Client Secret | Infisical `/workers/auth` → `GITHUB_CLIENT_SECRET` (production) |

### 2.8 Private Key

Skip. Not required for MVP.

### 2.9 IP Allow List

Skip. Leave empty.

______________________________________________________________________

## 3. Infisical Variable Summary

After completing both registrations, all of the following should be filled in Infisical.

Infisical project ID: `86b469f7-276d-49f9-8795-472e793cdaf0`

### `/workers/auth` path — synced to Cloudflare Workers via Infisical integration

| Variable | dev | staging | production |
| -- | -- | -- | -- |
| `GITHUB_APP_ID` | Dev app ID | Dev app ID | Prod app ID |
| `GITHUB_CLIENT_ID` | Dev client ID | Dev client ID | Prod client ID |
| `GITHUB_CLIENT_SECRET` | Dev client secret | Dev client secret | Prod client secret |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | `https://jdelpino-dev.github.io` | production URL when deployed |
| `GITHUB_OAUTH_REDIRECT_URI` | `http://localhost:5173/auth/callback` | `https://jdelpino-dev.github.io/morel-v3/auth/callback` | production URL when deployed |
| `SENTRY_DSN` | empty | staging DSN | prod DSN |

Not in Infisical — hardcoded in `wrangler.toml` as `[vars]`:

- `GITHUB_DEVICE_CODE_URL` = `https://github.com/login/device/code`
- `GITHUB_DEVICE_TOKEN_URL` = `https://github.com/login/oauth/access_token`

Future (not yet in use):

- `GITHUB_APP_PRIVATE_KEY` — PEM private key, only if worker needs App-level auth

### `/apps/web` path — used by Vite builds via Infisical CLI

| Variable | dev | staging | production |
| -- | -- | -- | -- |
| `VITE_GITHUB_CLIENT_ID` | Dev client ID | Dev client ID | Prod client ID |
| `VITE_GITHUB_APP_SLUG` | `morel-studio-dev` | `morel-studio-dev` | `morel-studio` |
| `VITE_MOREL_AUTH_GATEWAY_URL` | `http://localhost:8787` | `https://morel-auth-staging.delpinoivivas.workers.dev` | `https://morel-auth.delpinoivivas.workers.dev` |
| `VITE_SENTRY_DSN` | empty | staging DSN | prod DSN |

Future (not yet in use):

- `VITE_POSTHOG_HOST` — PostHog proxy URL when product analytics are enabled
- `VITE_POSTHOG_KEY` — PostHog project API key

### `/ops` path — never synced, local/CI use only

| Variable | Value |
| -- | -- |
| `CLOUDFLARE_ACCOUNT_ID` | `a6d5fee2cd6af1ef0354e2c736dc712b` |
| `CLOUDFLARE_API_TOKEN` | token used by Infisical → Cloudflare sync |
| `INFISICAL_PROJECT_ID` | `86b469f7-276d-49f9-8795-472e793cdaf0` |

Future (not yet in use):

- `SENTRY_AUTH_TOKEN` — for uploading source maps in CI
- `CLOUDFLARE_PAGES_PROJECT` — if automating Pages deployments from CI
- `GH_TOKEN` — if adding GitHub Actions automation from CLI

______________________________________________________________________

## 4. Updating Callback URLs Later

When your actual deployment URLs are known (Cloudflare Pages, GitHub Pages, etc.),
update the callback URLs in each app's settings:

1. Go to **Settings → Developer settings → GitHub Apps**
2. Click **Edit** on the relevant app
3. Update the callback URLs under **Identifying and authorizing users**
4. Click **Save changes**

No code changes or redeployment needed — callback URLs are only used for the
OAuth web flow redirect and the installation redirect, not for the device flow.

> Remember: the installation redirect always uses the first registered callback URL.
> Keep `http://localhost:5173/auth/callback` as the first entry on the dev app.
