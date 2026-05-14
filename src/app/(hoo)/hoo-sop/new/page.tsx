import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SopForm } from "@/components/hoo/sop-form";

export default async function NewSopPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Per HOD e CORPORATE: passa i department IDs assegnati
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
      <h1 className="text-xl font-heading font-medium text-charcoal-dark mb-6">Nuova SOP</h1>
      <SopForm mode="create" userRole={user.role} userDepartmentIds={userDepartmentIds} userTargetDepartmentIds={userTargetDepartmentIds} />
    </div>
  );
}
