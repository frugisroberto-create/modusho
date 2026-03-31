import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const querySchema = z.object({
  type: z.enum(["BRAND_BOOK", "STANDARD_BOOK", "DOCUMENT"]).optional(),
  propertyId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const { type, propertyId, page, pageSize } = parsed.data;
  const accessiblePropertyIds = await getAccessiblePropertyIds(session.user.id);

  const where: Record<string, unknown> = {
    OR: [
      { propertyId: null },
      { propertyId: { in: accessiblePropertyIds } },
    ],
  };
  if (type) where.type = type;
  if (propertyId) {
    if (!accessiblePropertyIds.includes(propertyId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    where.OR = [{ propertyId: null }, { propertyId }];
  }

  const [docs, total] = await Promise.all([
    prisma.staticDocument.findMany({
      where,
      include: { property: { select: { id: true, name: true, code: true } } },
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.staticDocument.count({ where }),
  ]);

  return NextResponse.json({
    data: docs.map(d => ({
      id: d.id, type: d.type, title: d.title, fileUrl: d.fileUrl,
      property: d.property, uploadedAt: d.uploadedAt,
    })),
    meta: { page, pageSize, total },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const role = session.user.role;
  const isHoo = role === "ADMIN" || role === "SUPER_ADMIN";
  const isHm = role === "HOTEL_MANAGER";

  if (!isHoo && !isHm) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const title = formData.get("title") as string | null;
  let type = formData.get("type") as string | null;
  const propertyId = (formData.get("propertyId") as string) || null;

  if (!file || !title) {
    return NextResponse.json({ error: "File e titolo sono obbligatori" }, { status: 400 });
  }

  // HM: tipo fisso DOCUMENT, property obbligatoria
  if (isHm) {
    type = "DOCUMENT";
    if (!propertyId) {
      return NextResponse.json({ error: "Seleziona la tua struttura" }, { status: 400 });
    }
    const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", propertyId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Non hai accesso a questa struttura" }, { status: 403 });
    }
  }

  // HOO: Brand Book, Standard Book o Document
  if (isHoo) {
    if (!type) type = "BRAND_BOOK";
    if (type !== "BRAND_BOOK" && type !== "STANDARD_BOOK") {
      return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    }
  }

  if (!file.name.endsWith(".pdf")) {
    return NextResponse.json({ error: "Solo file PDF" }, { status: 400 });
  }

  // Salva file
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const filePath = path.join(uploadsDir, fileName);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const doc = await prisma.staticDocument.create({
    data: {
      type: type as "BRAND_BOOK" | "STANDARD_BOOK" | "DOCUMENT",
      title,
      fileUrl: `/uploads/${fileName}`,
      propertyId: propertyId || null,
    },
  });

  return NextResponse.json({ data: { id: doc.id, fileUrl: doc.fileUrl } }, { status: 201 });
}
