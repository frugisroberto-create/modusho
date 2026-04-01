import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SopForm } from "@/components/hoo/sop-form";
import { ContentActions } from "@/components/hoo/content-actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSopPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const canEdit = ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role);
  if (!canEdit) redirect("/");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, type: true, title: true, body: true, status: true, propertyId: true, departmentId: true, isFeatured: true },
  });

  if (!content) notFound();
  if (content.status === "ARCHIVED") notFound();

  const isPublished = content.status === "PUBLISHED";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">
          {isPublished ? "Modifica SOP pubblicata" : "Modifica SOP"}
        </h1>
        {isPublished && (
          <ContentActions
            contentId={content.id}
            contentType={content.type}
            contentStatus={content.status}
            userRole={user.role}
            isFeatured={content.isFeatured}
          />
        )}
      </div>

      <SopForm
        mode="edit"
        contentId={content.id}
        initialData={{
          title: content.title,
          body: content.body,
          propertyId: content.propertyId,
          departmentId: content.departmentId,
        }}
        userRole={user.role}
      />
    </div>
  );
}
