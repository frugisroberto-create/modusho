import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const propertyIds = await getAccessiblePropertyIds(session.user.id);

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds }, isActive: true },
    include: {
      departments: {
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: properties });
}
