import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env/server";
import { createPrismaAdapter } from "@/lib/db/adapter";

const adapter = createPrismaAdapter();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
