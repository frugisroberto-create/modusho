import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SopWorkflowEditor } from "@/components/hoo/sop-workflow-editor";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SopWorkflowPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // OPERATOR non partecipa al workflow RACI
  if (user.role === "OPERATOR") redirect("/");

  const { id } = await params;

  return (
    <div className="max-w-5xl space-y-6">
      <nav className="flex items-center gap-2 text-sm font-ui text-charcoal/45">
        <Link href="/hoo-sop" className="hover:text-terracotta transition-colors">SOP</Link>
        <span>/</span>
        <span className="text-charcoal-dark">Workflow</span>
      </nav>

      <SopWorkflowEditor
        workflowId={id}
        currentUserId={user.id}
        currentUserRole={user.role}
        currentUserCanApprove={user.canApprove}
        currentUserCanPublish={user.canPublish}
      />
    </div>
  );
}
