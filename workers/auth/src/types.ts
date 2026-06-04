import { z } from 'zod'

export const EnvSchema = z.object({
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_DEVICE_CODE_URL: z.url(),
  GITHUB_DEVICE_TOKEN_URL: z.url(),
  GITHUB_OAUTH_TOKEN_URL: z.url(),
  GITHUB_OAUTH_REDIRECT_URI: z.url(),
  ALLOWED_ORIGINS: z.string().optional(),
  SENTRY_DSN: z.url().optional(),
})

export type Env = z.infer<typeof EnvSchema>
