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
