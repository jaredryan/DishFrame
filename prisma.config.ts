import { defineConfig } from "prisma/config";

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
