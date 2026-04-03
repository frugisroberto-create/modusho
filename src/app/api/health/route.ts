import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — Keep-alive endpoint
 * Fa una query leggera al DB per evitare l'auto-suspend di Neon.
 * Da chiamare ogni 4 minuti con un cron job esterno.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
