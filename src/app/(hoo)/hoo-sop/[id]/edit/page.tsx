import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SopForm } from "@/components/hoo/sop-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSopPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, title: true, body: true, status: true, propertyId: true, departmentId: true },
  });

  if (!content) notFound();

  // Non modificabili se pubblicati o archiviati
  if (content.status === "PUBLISHED" || content.status === "ARCHIVED") notFound();

  return (
    <div>
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">Modifica SOP</h1>
      <SopForm
        mode="edit"
        contentId={content.id}
        initialData={{
          title: content.title,
          body: content.body,
          propertyId: content.propertyId,
          departmentId: content.departmentId,
        }}
      />
    </div>
  );
}
