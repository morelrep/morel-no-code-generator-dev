import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new HTTPException(400, { message: 'Invalid request body' })
  }
  return result.data
}
