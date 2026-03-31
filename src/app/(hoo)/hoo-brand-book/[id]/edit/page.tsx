import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { BookForm } from "@/components/hoo/book-form";

interface Props { params: Promise<{ id: string }> }

export default async function EditBrandBookPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/hoo-brand-book");

  const { id } = await params;
  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false, type: "BRAND_BOOK" },
    select: { id: true, title: true, body: true, propertyId: true, status: true },
  });

  if (!content) notFound();

  return (
    <div>
      <h1 className="text-xl font-heading font-medium text-charcoal-dark mb-6">Modifica Brand Book</h1>
      <BookForm mode="edit" contentType="BRAND_BOOK" backPath="/hoo-brand-book" contentId={content.id}
        initialData={{ title: content.title, body: content.body, propertyId: content.propertyId }} canDelete />
    </div>
  );
}
