import { Hono } from 'hono'
import { createCorsMiddleware } from './lib/cors'
import { registerDeviceFlow } from './routes/github-device'
import { registerHealth } from './routes/health'
import { EnvSchema, type Env } from './types'

const app = new Hono<{ Bindings: Env }>()

// Validate env bindings on every request (cheap — Zod parse is fast)
app.use('*', async (c, next) => {
  const result = EnvSchema.safeParse(c.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
    return c.json({ error: `Misconfigured env: ${missing}` }, 500)
  }
  await next()
})

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
