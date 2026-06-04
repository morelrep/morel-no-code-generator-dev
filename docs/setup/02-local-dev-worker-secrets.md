# Local Dev — Cloudflare Workers Secrets with Infisical

## The Problem

Running `infisical run -- wrangler dev` does **not** inject secrets into the
Cloudflare Worker's runtime environment.

It only injects them into the **Node.js process that runs wrangler** — as regular
process environment variables. But a Worker's `env` bindings (the `c.env` object
in Hono, or the `Env` interface in plain Workers) are a completely separate layer
managed by the wrangler runtime simulation. Wrangler does **not** forward parent
process env vars into the Worker's binding environment.

This means the Worker sees `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, etc. as
`undefined`, and any Zod validation on `c.env` fails with:

```plaintext
{ "error": "Misconfigured env: GITHUB_APP_ID, GITHUB_CLIENT_ID" }
```

even though those variables are correctly stored in Infisical and the
`infisical run` command appears to succeed silently.

## Why Staging Works but Local Does Not

Staging and production secrets are synced **directly into Cloudflare** via the
Infisical → Cloudflare Workers integration. Wrangler reads them natively from
the deployed runtime.

For local dev, wrangler's simulated runtime reads secrets from exactly one place:
a `.dev.vars` file in the worker directory. There is no automatic bridge from
the parent process environment to that layer.

## The Solution

Use `infisical export` to write secrets into `.dev.vars` **before** wrangler
starts. The dev script in `workers/auth/package.json` does this automatically:

```json
"dev": "infisical export --env=dev --path=/workers/auth --format=dotenv > .dev.vars && (trap 'rm -f .dev.vars' EXIT INT TERM; wrangler dev)"
```

When you run `pnpm dev`, it:

1. Fetches all secrets for the `dev` environment from Infisical at `/workers/auth`
2. Writes them as a `KEY=VALUE` dotenv file to `workers/auth/.dev.vars`
3. Starts `wrangler dev`, which detects `.dev.vars` and loads all entries as Worker bindings

Wrangler confirms this in the startup output:

```plaintext
Using secrets defined in .dev.vars
Your Worker has access to the following bindings:
  env.GITHUB_APP_ID   Environment Variable  local  "(hidden)"
  env.GITHUB_CLIENT_ID ...
```

## Security Note

`.dev.vars` is a **plaintext file on disk**. It is gitignored (safe from commits),
but it persists between sessions if not cleaned up.

The dev script uses a shell `trap` to delete `.dev.vars` automatically when
wrangler exits — whether that is a clean shutdown or a Ctrl+C (SIGINT/SIGTERM).
The file still exists while the dev server is running, which is unavoidable since
wrangler reads it at startup and on hot-reload.

## Important Notes

- `.dev.vars` is gitignored — never commit it.
- It is deleted automatically on `pnpm dev` exit via the `trap` in the dev script.
- If wrangler crashes hard (SIGKILL), the trap won't fire — manually delete the
  file with `rm workers/auth/.dev.vars` if needed.
- The public constants `GITHUB_DEVICE_CODE_URL` and `GITHUB_DEVICE_TOKEN_URL`
  are hardcoded in `wrangler.toml [vars]` and do **not** belong in Infisical or
  `.dev.vars`.
- If you add a new secret to Infisical, it will be picked up automatically the
  next time you restart the dev server.

## Infisical Path Reference

| Environment | Infisical path | Where secrets land |
| -- | -- | -- |
| `dev` | `/workers/auth` | `.dev.vars` (via `infisical export`) |
| `staging` | `/workers/auth` | Cloudflare (via Infisical integration) |
| `production` | `/workers/auth` | Cloudflare (via Infisical integration) |
