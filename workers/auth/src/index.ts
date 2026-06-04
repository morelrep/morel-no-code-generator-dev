import { Hono } from 'hono'
import { createCorsMiddleware } from './lib/cors'
import { registerDeviceFlow } from './routes/github-device'
import { registerHealth } from './routes/health'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : undefined
  const middleware = createCorsMiddleware(origins)
  return middleware(c, next)
})

registerHealth(app)
registerDeviceFlow(app)

export default app
