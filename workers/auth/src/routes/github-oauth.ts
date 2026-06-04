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
      redirect_uri: c.env.GITHUB_OAUTH_REDIRECT_URI,
    })

    if (body.codeVerifier) {
      params.set('code_verifier', body.codeVerifier)
    }

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
