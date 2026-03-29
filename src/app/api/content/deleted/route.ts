import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN" }, { status: 403 });
  }

  const contents = await prisma.content.findMany({
    where: { isDeleted: true },
    select: {
      id: true, code: true, title: true, type: true, status: true,
      deletedAt: true,
      deletedBy: { select: { name: true } },
      property: { select: { name: true, code: true } },
      department: { select: { name: true } },
    },
    orderBy: { deletedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ data: contents });
}
