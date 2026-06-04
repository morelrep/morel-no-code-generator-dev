import type { Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { parseBody } from '../lib/validate'
import {
    DeviceCodeRequestSchema,
    DeviceTokenRequestSchema,
} from '../schemas/worker.schema'
import type { Env } from '../types'

export function registerDeviceFlow(app: Hono<{ Bindings: Env }>) {
  app.post('/github/device/code', async (c: Context<{ Bindings: Env }>) => {
    const body = parseBody(DeviceCodeRequestSchema, await c.req.json())

    const clientId = body.clientId || c.env.GITHUB_CLIENT_ID
    if (!clientId) {
      throw new HTTPException(400, { message: 'Missing clientId' })
    }

    const params = new URLSearchParams({
      client_id: clientId,
      scope: body.scopes.join(' '),
    })

    const upstream = await fetch(c.env.GITHUB_DEVICE_CODE_URL, {
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
        message: `GitHub device/code failed: ${text}`,
      })
    }

    const data = (await upstream.json()) as Record<string, unknown>

    return c.json({
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
    })
  })

  app.post('/github/device/token', async (c: Context<{ Bindings: Env }>) => {
    const body = parseBody(DeviceTokenRequestSchema, await c.req.json())

    const clientId = body.clientId || c.env.GITHUB_CLIENT_ID
    if (!clientId) {
      throw new HTTPException(400, { message: 'Missing clientId' })
    }

    const params = new URLSearchParams({
      client_id: clientId,
      device_code: body.deviceCode,
      grant_type: body.grantType,
    })

    const upstream = await fetch(c.env.GITHUB_DEVICE_TOKEN_URL, {
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
        message: `GitHub device/token failed: ${text}`,
      })
    }

    const data = (await upstream.json()) as Record<string, unknown>

    // GitHub returns an "error" field while the user hasn't authorized yet
    if (data.error === 'authorization_pending') {
      return c.json({ status: 'pending' })
    }

    if (data.error === 'slow_down') {
      return c.json({
        status: 'slow_down',
        intervalIncrementSeconds: (data.interval as number) ?? 5,
      })
    }

    if (data.error === 'expired_token' || data.error === 'access_denied') {
      return c.json({ status: 'failed', error: data.error as string })
    }

    if (data.error) {
      return c.json({ status: 'failed', error: data.error as string })
    }

    // Success — token was issued
    return c.json({
      status: 'authorized',
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
    })
  })
}
