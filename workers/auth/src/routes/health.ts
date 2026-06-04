import type { Hono } from 'hono'
import type { Env } from '../types'

export function registerHealth(app: Hono<{ Bindings: Env }>) {
  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'morel-auth-gateway',
      runtime: 'cloudflare',
      version: '0.1.0',
    }),
  )
}
