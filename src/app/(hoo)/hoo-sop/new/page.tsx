import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SopForm } from "@/components/hoo/sop-form";

export default async function NewSopPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Nuova SOP</h1>
      <SopForm mode="create" userRole={user.role} />
    </div>
  );
}
