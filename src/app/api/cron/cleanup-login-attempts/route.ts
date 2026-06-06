import { NextResponse } from "next/server";
import { cleanupExpiredAttempts } from "@/lib/rate-limit";

/**
 * GET /api/cron/cleanup-login-attempts
 *
 * Pulizia periodica dei record di rate limiting scaduti.
 * Eseguito ogni 6 ore da Vercel Cron.
 * Protetto da CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await cleanupExpiredAttempts();
    return NextResponse.json({ ok: true, deletedRecords: deleted });
  } catch (error) {
    console.error("[cron/cleanup-login-attempts] Errore:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
