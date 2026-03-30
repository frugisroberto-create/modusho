import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, propertyId: true, departmentId: true },
  });

  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const hasAccess = await checkAccess(session.user.id, "HOD", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const revisions = await prisma.contentRevision.findMany({
    where: { contentId: id },
    select: {
      id: true, previousTitle: true, previousBody: true,
      newTitle: true, newBody: true, note: true, status: true, createdAt: true,
      revisedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: revisions });
}
