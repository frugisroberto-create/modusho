import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SopForm } from "@/components/hoo/sop-form";

interface Props { params: Promise<{ id: string }> }

export default async function EditSopPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!["HOTEL_MANAGER", "CORPORATE", "ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false, type: "SOP" },
    select: {
      id: true, title: true, body: true, propertyId: true, departmentId: true, status: true,
    },
  });

  if (!content) notFound();

  let userDepartmentIds: string[] | undefined;
  let userTargetDepartmentIds: string[] | undefined;
  if (user.role === "HOD" || user.role === "CORPORATE") {
    const assignments = await prisma.propertyAssignment.findMany({
      where: { userId: user.id, departmentId: { not: null } },
      select: { departmentId: true },
    });
    userDepartmentIds = assignments.map(a => a.departmentId!);
  }
  if (user.role === "CORPORATE") {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { targetDepartmentIds: true },
    });
    if (dbUser?.targetDepartmentIds?.length) {
      userTargetDepartmentIds = dbUser.targetDepartmentIds;
    }
  }

  return (
    <div>
      <h1 className="text-xl font-heading font-medium text-charcoal-dark mb-6">Modifica SOP — Reparto e destinatari</h1>
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
        userDepartmentIds={userDepartmentIds}
        userTargetDepartmentIds={userTargetDepartmentIds}
      />
    </div>
  );
}
