import { z } from 'zod'

const envSchema = z.object({
  VITE_MOREL_AUTH_GATEWAY_URL: z.url(),
  VITE_GITHUB_CLIENT_ID: z.string().min(1),
  VITE_SENTRY_DSN: z.url().optional().default(''),
})

function parseEnv() {
  const result = envSchema.safeParse(import.meta.env)
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`❌ Invalid environment variables:\n${formatted}`)
  }
  return result.data
}

export const env = parseEnv()
