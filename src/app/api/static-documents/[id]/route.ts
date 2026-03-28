import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

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
  const doc = await prisma.staticDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });

  // Elimina file fisico
  try {
    const filePath = path.join(process.cwd(), "public", doc.fileUrl);
    await unlink(filePath);
  } catch {
    // File già eliminato, procedi
  }

  await prisma.staticDocument.delete({ where: { id } });
  return NextResponse.json({ data: { success: true } });
}
