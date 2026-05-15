import { z } from 'zod'

export const ExchangeRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})

export const ExchangeResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  scope: z.string(),
})

export type ExchangeRequest = z.infer<typeof ExchangeRequestSchema>
export type ExchangeResponse = z.infer<typeof ExchangeResponseSchema>
