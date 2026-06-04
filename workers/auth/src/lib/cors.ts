import { cors } from 'hono/cors'

const DEFAULT_ORIGINS = ['http://localhost:5173']

export function createCorsMiddleware(allowedOrigins?: string[]) {
  const origins = allowedOrigins ?? DEFAULT_ORIGINS

  return cors({
    origin: (origin) => {
      if (origins.includes(origin)) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
}

export const corsMiddleware = createCorsMiddleware()
