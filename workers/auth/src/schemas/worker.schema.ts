import { z } from 'zod'

// --- Device Code Request/Response ---

export const DeviceCodeRequestSchema = z.object({
  clientId: z.string().optional().default(''),
  scopes: z.array(z.string()).optional().default([]),
})

export const DeviceCodeResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string().url(),
  expiresIn: z.number(),
  interval: z.number(),
})

// --- Device Token Request/Response ---

export const DeviceTokenRequestSchema = z.object({
  clientId: z.string().optional().default(''),
  deviceCode: z.string().min(1),
  grantType: z.literal('urn:ietf:params:oauth:grant-type:device_code'),
})

export const DeviceTokenResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('slow_down'), intervalIncrementSeconds: z.number() }),
  z.object({
    status: z.literal('authorized'),
    accessToken: z.string(),
    tokenType: z.string(),
    scope: z.string(),
  }),
  z.object({ status: z.literal('failed'), error: z.string() }),
])

// --- OAuth Exchange Request/Response ---

export const OAuthExchangeRequestSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().optional(),
})

export const OAuthExchangeResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.string(),
  scope: z.string(),
})

// --- Types ---

export type DeviceCodeRequest = z.infer<typeof DeviceCodeRequestSchema>
export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>
export type DeviceTokenRequest = z.infer<typeof DeviceTokenRequestSchema>
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>
export type OAuthExchangeRequest = z.infer<typeof OAuthExchangeRequestSchema>
export type OAuthExchangeResponse = z.infer<typeof OAuthExchangeResponseSchema>
