import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id }, select: { code: true, logoUrl: true } });
  if (!property) return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "File obbligatorio" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["png", "jpg", "jpeg", "svg"].includes(ext)) {
    return NextResponse.json({ error: "Solo PNG, JPG, SVG" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Max 2MB" }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads", "logos");
  await mkdir(uploadsDir, { recursive: true });

  // Delete old logo
  if (property.logoUrl) {
    try { await unlink(path.join(process.cwd(), "public", property.logoUrl)); } catch {}
  }

  const fileName = `${property.code.toLowerCase()}-logo.${ext}`;
  const filePath = path.join(uploadsDir, fileName);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const logoUrl = `/uploads/logos/${fileName}`;
  await prisma.property.update({ where: { id }, data: { logoUrl } });

  return NextResponse.json({ data: { logoUrl } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id }, select: { logoUrl: true } });
  if (!property) return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 });

  if (property.logoUrl) {
    try { await unlink(path.join(process.cwd(), "public", property.logoUrl)); } catch {}
  }

  await prisma.property.update({ where: { id }, data: { logoUrl: null } });
  return NextResponse.json({ data: { success: true } });
}
