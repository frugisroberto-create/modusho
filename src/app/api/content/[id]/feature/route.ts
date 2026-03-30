import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { role } = session.user;
  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { id } = await params;
  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, status: true, propertyId: true },
  });

  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  if (content.status !== "PUBLISHED") return NextResponse.json({ error: "Solo contenuti pubblicati" }, { status: 400 });

  if (role === "HOTEL_MANAGER") {
    const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", content.propertyId);
    if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const updated = await prisma.content.update({
    where: { id },
    data: { isFeatured: true, featuredAt: new Date(), featuredById: session.user.id },
  });

  return NextResponse.json({ data: { id: updated.id, isFeatured: true } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { role } = session.user;
  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { id } = await params;
  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, propertyId: true },
  });

  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  if (role === "HOTEL_MANAGER") {
    const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", content.propertyId);
    if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  await prisma.content.update({
    where: { id },
    data: { isFeatured: false, featuredAt: null, featuredById: null },
  });

  return NextResponse.json({ data: { id, isFeatured: false } });
}
