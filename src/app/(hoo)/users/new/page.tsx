import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { UserForm } from "@/components/hoo/user-form";
import { canCreateUsers } from "@/lib/user-scope";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Chi non può creare non vede nemmeno il form: il server rifiuterebbe comunque.
  if (!canCreateUsers({ role: user.role, canCreateUsers: user.canCreateUsers })) {
    redirect("/users");
  }

  const titolo =
    user.role === "HOD" ? "Nuovo operatore" : "Nuovo utente";

  return (
    <div>
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">{titolo}</h1>
      <UserForm mode="create" viewerRole={user.role} />
    </div>
  );
}
