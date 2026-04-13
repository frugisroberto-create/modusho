import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { z } from "zod/v4";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const { id } = await params;
  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: {
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const canAccess = await canUserAccessContent(session.user.id, session.user.role, content);
  if (!canAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(request.nextUrl.searchParams.get("pageSize") || "20"), 50);

  const [notes, total] = await Promise.all([
    prisma.contentNote.findMany({
      where: { contentId: id },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contentNote.count({ where: { contentId: id } }),
  ]);

  return NextResponse.json({ data: notes, meta: { page, pageSize, total } });
}

const noteSchema = z.object({
  body: z.string().min(1, "Il testo della nota è obbligatorio").max(5000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const { id } = await params;
  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: {
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  // Accesso coarse alla property (per HM/ADMIN/SUPER_ADMIN basta questo)
  const canAccess = await canUserAccessContent(session.user.id, session.user.role, content);
  if (!canAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  // HOD+ can add notes to any content they have access to (checked above)

  const json = await request.json();
  const parsed = noteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Testo obbligatorio (max 5000 caratteri)" }, { status: 400 });

  const note = await prisma.contentNote.create({
    data: { contentId: id, authorId: session.user.id, body: parsed.data.body.trim() },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json({ data: note }, { status: 201 });
}
