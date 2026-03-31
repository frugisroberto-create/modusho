import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { ApprovalDetailClient } from "@/components/hoo/approval-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ApprovalDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "HOTEL_MANAGER") redirect("/");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      statusHistory: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
    },
  });

  if (!content) notFound();

  const hasAccess = await checkAccess(user.id, "HOTEL_MANAGER", content.propertyId);
  if (!hasAccess) notFound();

  // HM può fare review solo in REVIEW_HM (inoltra). Solo ADMIN/SUPER_ADMIN possono approvare e pubblicare in REVIEW_ADMIN.
  const canReview =
    (content.status === "REVIEW_HM" && ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) ||
    (content.status === "REVIEW_ADMIN" && ["ADMIN", "SUPER_ADMIN"].includes(user.role));
  const canEdit = canReview && (
    (content.status === "REVIEW_HM" && ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) ||
    (content.status === "REVIEW_ADMIN" && ["ADMIN", "SUPER_ADMIN"].includes(user.role))
  );

  return (
    <ApprovalDetailClient
      content={JSON.parse(JSON.stringify(content))}
      userRole={user.role}
      canReview={canReview}
      canEdit={canEdit}
    />
  );
}
