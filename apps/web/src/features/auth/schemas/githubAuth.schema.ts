import { z } from "zod";

export const GitHubPatSchema = z
  .string()
  .trim()
  .regex(
    /^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{40,}$/,
    "Invalid fine-grained PAT format (expected github_pat_<id>_<secret>)",
  );

export const GitHubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.url(),
});

// --- Device Flow (SPA-side mirrors of worker schemas) ---

export const DeviceCodeResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string().url(),
  expiresIn: z.number(),
  interval: z.number(),
});

export const DeviceTokenResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({
    status: z.literal("slow_down"),
    intervalIncrementSeconds: z.number(),
  }),
  z.object({
    status: z.literal("authorized"),
    accessToken: z.string(),
    tokenType: z.string(),
    scope: z.string(),
  }),
  z.object({ status: z.literal("failed"), error: z.string() }),
]);
