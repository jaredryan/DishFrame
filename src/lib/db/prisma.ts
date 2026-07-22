import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env/server";

neonConfig.webSocketConstructor = ws;

// Used only when DATABASE_URL is unset, so the client can still be
// constructed in environments without a configured database (see
// isDatabaseConfigured in src/lib/env/server.ts). No query is issued
// against it unless a caller ignores that flag.
const connectionString =
  env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/dishframe";

const adapter = new PrismaNeon({ connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
