import { z } from "zod";
import { ACCENT_TOKENS, PATTERN_TOKENS } from "./tokens.js";

/**
 * Shared validation, imported by both apps/api (server-side enforcement)
 * and apps/web (form validation) — see design doc §4: "Non-negotiable
 * given unreviewed publishing."
 */

export const publishPostSchema = z.object({
  postId: z.string().uuid(),
  tagSlugs: z.array(z.string().min(1)).max(10),
  accentColor: z.enum(ACCENT_TOKENS).optional(),
  pattern: z.enum(PATTERN_TOKENS).optional(),
});
export type PublishPostInput = z.infer<typeof publishPostSchema>;

export const createClubSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"),
  category: z.string().max(40).optional(),
  accentColor: z.enum(ACCENT_TOKENS).optional(),
  pattern: z.enum(PATTERN_TOKENS).optional(),
});
export type CreateClubInput = z.infer<typeof createClubSchema>;

export const whitelistAddSchema = z.object({
  email: z.string().email(),
  clubId: z.string().uuid(),
});
export type WhitelistAddInput = z.infer<typeof whitelistAddSchema>;

export const superadminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1), // length enforced at enrolment, not login
});
export type SuperadminLoginInput = z.infer<typeof superadminLoginSchema>;

export const totpVerifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "6-digit code"),
});
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;

export const revalidateRequestSchema = z.object({
  paths: z.array(z.string().startsWith("/")).min(1).max(20),
  secret: z.string().min(1),
});
export type RevalidateRequestInput = z.infer<typeof revalidateRequestSchema>;
