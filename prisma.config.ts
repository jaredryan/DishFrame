import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// The Prisma CLI only auto-loads `.env`, not `.env.local`. Load both here
// (in Next.js precedence order — `.env.local` wins) so `prisma migrate` /
// `prisma studio` see the same DATABASE_URL the Next.js app uses. Node's
// loadEnvFile never overrides a var that's already set, so loading `.env`
// second is a no-op for anything `.env.local` already defined. Neither
// file exists in the Vercel build environment, where real vars are
// already injected into process.env, so this is a harmless no-op there.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

// DATABASE_URL / DIRECT_URL are optional here on purpose: `prisma generate`
// must keep working before Neon credentials exist (see README "Remaining
// setup"). Commands that need a live database (migrate, studio) still read
// these from the environment and fail with Prisma's normal connection error
// if they're unset.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.DIRECT_URL,
  },
});
