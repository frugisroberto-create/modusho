import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET: Diagnostica push subscription.
 * Solo ADMIN/SUPER_ADMIN. Mostra quanti utenti RACI hanno subscription attive.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const workflowId = request.nextUrl.searchParams.get("workflowId");

  // 1. Totale push subscriptions nel sistema
  const totalSubs = await prisma.pushSubscription.count();

  // 2. Utenti con almeno una subscription
  const usersWithSubs = await prisma.pushSubscription.findMany({
    select: { userId: true, endpoint: true, createdAt: true },
  });
  const uniqueUserIds = [...new Set(usersWithSubs.map((s) => s.userId))];
  const usersDetail = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, name: true, role: true, email: true },
  });

  // 3. Se workflowId, mostra i destinatari RACI e le loro subscription
  let raciDebug = null;
  if (workflowId) {
    const wf = await prisma.sopWorkflow.findUnique({
      where: { id: workflowId },
      select: {
        responsibleId: true,
        consultedId: true,
        accountableId: true,
        responsible: { select: { id: true, name: true, role: true } },
        consulted: { select: { id: true, name: true, role: true } },
        accountable: { select: { id: true, name: true, role: true } },
      },
    });

    if (wf) {
      const raciIds = [wf.responsibleId, wf.consultedId, wf.accountableId].filter(Boolean) as string[];
      const raciSubs = await prisma.pushSubscription.findMany({
        where: { userId: { in: raciIds } },
        select: { userId: true, endpoint: true },
      });

      raciDebug = {
        responsible: { user: wf.responsible, hasSubscription: raciSubs.some((s) => s.userId === wf.responsibleId) },
        consulted: wf.consultedId
          ? { user: wf.consulted, hasSubscription: raciSubs.some((s) => s.userId === wf.consultedId) }
          : null,
        accountable: { user: wf.accountable, hasSubscription: raciSubs.some((s) => s.userId === wf.accountableId) },
        totalRaciSubscriptions: raciSubs.length,
      };
    }
  }

  return NextResponse.json({
    data: {
      totalSubscriptions: totalSubs,
      usersWithSubscriptions: usersDetail.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        email: u.email,
        subscriptionCount: usersWithSubs.filter((s) => s.userId === u.id).length,
      })),
      raciDebug,
    },
  });
}
