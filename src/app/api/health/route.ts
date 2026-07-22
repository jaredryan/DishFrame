import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isDatabaseConfigured } from "@/lib/env/server";

export async function GET() {
  if (!isDatabaseConfigured) {
    return NextResponse.json(
      {
        status: "degraded",
        database: "not_configured",
      },
      { status: 503 },
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        database: "unreachable",
      },
      { status: 503 },
    );
  }
}
