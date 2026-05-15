import { cors } from 'hono/cors'

export const corsMiddleware = cors({
  origin: ['http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
})
