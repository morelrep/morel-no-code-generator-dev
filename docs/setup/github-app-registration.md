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
| Callback URL (line 1) | `http://127.0.0.1:5173/auth/callback` |
| Callback URL (line 2) | `https://<your-staging-pages-url>/auth/callback` |
| Expire user authorization tokens | checked |
| Request user authorization during installation | unchecked |
| Enable Device Flow | **checked** |

### 1.3 Post Installation

| Field | Value |
| -- | -- |
| Setup URL | leave empty |
| Redirect on update | unchecked |

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
| Metadata | Read-only (mandatory, auto-set) |

All other permissions: No access.

### 1.6 Where Can This App Be Installed?

Select: **Only on this account**

### 1.7 After Creation

GitHub will show the app settings page. Copy and save:

| Value | Where to store |
| -- | -- |
| App ID | Infisical `/worker` → `GITHUB_APP_ID` (dev + staging environments) |
| Client ID | Infisical `/worker` → `GITHUB_CLIENT_ID` (dev + staging) |
| Client ID | Infisical `/web` → `VITE_GITHUB_CLIENT_ID` (dev + staging) |

Then generate a client secret:

1. Scroll to **Client secrets**
2. Click **Generate a new client secret**
3. Copy it immediately — GitHub only shows it once

| Value | Where to store |
| -- | -- |
| Client Secret | Infisical `/worker` → `GITHUB_CLIENT_SECRET` (dev + staging environments) |

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
| Homepage URL | `https://<your-production-pages-url>` (update when known) |

### 2.2 Identifying and Authorizing Users

| Field | Value |
| -- | -- |
| Callback URL | `https://<your-production-pages-url>/auth/callback` |
| Expire user authorization tokens | checked |
| Request user authorization during installation | unchecked |
| Enable Device Flow | **checked** |

### 2.3 Post Installation

| Field | Value |
| -- | -- |
| Setup URL | leave empty |
| Redirect on update | unchecked |

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
| Metadata | Read-only |

### 2.6 Where Can This App Be Installed?

Select: **Only on this account**

### 2.7 After Creation

| Value | Where to store |
| -- | -- |
| App ID | Infisical `/worker` → `GITHUB_APP_ID` (production environment) |
| Client ID | Infisical `/worker` → `GITHUB_CLIENT_ID` (production) |
| Client ID | Infisical `/web` → `VITE_GITHUB_CLIENT_ID` (production) |
| Client Secret | Infisical `/worker` → `GITHUB_CLIENT_SECRET` (production) |

### 2.8 Private Key

Skip. Not required for MVP.

### 2.9 IP Allow List

Skip. Leave empty.

______________________________________________________________________

## 3. Infisical Variable Summary

After completing both registrations, all of the following should be filled in Infisical:

### `/worker` path

| Variable | dev | staging | production |
| -- | -- | -- | -- |
| `GITHUB_APP_ID` | Dev app ID | Dev app ID | Prod app ID |
| `GITHUB_CLIENT_ID` | Dev client ID | Dev client ID | Prod client ID |
| `GITHUB_CLIENT_SECRET` | Dev client secret | Dev client secret | Prod client secret |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | staging pages URL | production pages URL |
| `SENTRY_DSN` | empty | staging DSN | prod DSN |

### `/web` path

| Variable | dev | staging | production |
| -- | -- | -- | -- |
| `VITE_GITHUB_CLIENT_ID` | Dev client ID | Dev client ID | Prod client ID |
| `VITE_MOREL_AUTH_GATEWAY_URL` | `http://localhost:8787` | staging worker URL | prod worker URL |
| `VITE_SENTRY_DSN` | empty | staging DSN | prod DSN |

______________________________________________________________________

## 4. Updating Callback URLs Later

When your actual deployment URLs are known (Cloudflare Pages, GitHub Pages, etc.),
update the callback URLs in each app's settings:

1. Go to **Settings → Developer settings → GitHub Apps**
2. Click **Edit** on the relevant app
3. Update the callback URLs under **Identifying and authorizing users**
4. Click **Save changes**

No code changes or redeployment needed — callback URLs are only used for the
OAuth web flow redirect, not for the device flow.
