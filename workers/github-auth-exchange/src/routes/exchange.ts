import type { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { parseBody } from '../lib/validate'
import { ExchangeRequestSchema } from '../schemas/worker.schema'

export function registerExchange(app: Hono) {
  app.post('/exchange', async (c) => {
    // Validate request body — will throw 400 if invalid
    parseBody(ExchangeRequestSchema, await c.req.json())

    // TODO Phase 5: exchange OAuth code for GitHub access token
    throw new HTTPException(501, { message: 'Not implemented' })
  })
}
