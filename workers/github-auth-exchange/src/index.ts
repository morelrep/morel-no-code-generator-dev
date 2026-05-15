import { Hono } from 'hono'
import { corsMiddleware } from './lib/cors'
import { registerExchange } from './routes/exchange'
import { registerHealth } from './routes/health'

const app = new Hono()

app.use('*', corsMiddleware)

registerHealth(app)
registerExchange(app)

export default app
