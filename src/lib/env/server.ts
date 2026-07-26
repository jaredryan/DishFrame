import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Optional at the schema level, and empty strings are treated the same as
  // unset (see the `.env.local` placeholders): Milestone 1 must run and
  // build without a live database. Code that needs the database checks
  // `isDatabaseConfigured` and fails gracefully (health endpoint, Prisma
  // client), rather than requiring the var to be present here.
  DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  DIRECT_URL: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),

  // Explicit driver-adapter selection (see src/lib/db/adapter.ts). Deliberately not
  // inferred from whether DATABASE_URL happens to look like a Neon host — the
  // architecture proposal calls that out as unsafe: a clear, explicit setting is
  // safer than pattern-matching a connection string. Defaults to "neon" so a
  // deployed environment that forgets to set this still gets the correct,
  // already-working-in-production adapter; local development and CI must opt into
  // "pg" explicitly (see .env.example and .github/workflows/ci.yml).
  DATABASE_DRIVER: z.enum(["neon", "pg"]).default("neon"),

  BETTER_AUTH_SECRET: z
    .string()
    .min(1, "BETTER_AUTH_SECRET is required — see .env.example."),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),

  // Optional: sign-in stays functional but shows a setup notice when unset.
  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),

  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  // Optional: the contact form checks `isContactFormConfigured` and fails
  // clearly at submission time when unset, rather than at startup — public
  // pages (including /contact itself) must keep rendering either way.
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  CONTACT_FROM_EMAIL: z
    .string()
    .min(1)
    .default("DishFrame <onboarding@resend.dev>"),
  CONTACT_TO_EMAIL: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env.local and fill in the required values.`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();

export const isDatabaseConfigured = Boolean(env.DATABASE_URL);
export const isGoogleAuthConfigured = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);
export const isContactFormConfigured = Boolean(
  env.RESEND_API_KEY && env.CONTACT_TO_EMAIL,
);
