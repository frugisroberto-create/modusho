import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
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
    select: { propertyId: true, departmentId: true },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const hasAccess = await checkAccess(session.user.id, "HOD", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

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
    select: { propertyId: true, departmentId: true, createdById: true },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const hasAccess = await checkAccess(session.user.id, "HOD", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  // HOD può scrivere note solo sui propri contenuti
  if (session.user.role === "HOD" && content.createdById !== session.user.id) {
    return NextResponse.json({ error: "HOD può aggiungere note solo ai propri contenuti" }, { status: 403 });
  }

  const json = await request.json();
  const parsed = noteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Testo obbligatorio (max 5000 caratteri)" }, { status: 400 });

  const note = await prisma.contentNote.create({
    data: { contentId: id, authorId: session.user.id, body: parsed.data.body.trim() },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json({ data: note }, { status: 201 });
}
