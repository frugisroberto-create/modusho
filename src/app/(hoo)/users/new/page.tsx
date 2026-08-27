import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { UserForm } from "@/components/hoo/user-form";
import { canCreateUsers } from "@/lib/user-scope";
import { loadActor } from "@/lib/user-scope-db";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Chi non può creare non vede nemmeno il form: il server rifiuterebbe comunque.
  if (!canCreateUsers({ role: user.role, canCreateUsers: user.canCreateUsers })) {
    redirect("/users");
  }

  // Per l'HOD: i reparti in cui è REALMENTE assegnato in modo operativo — non
  // quelli che può solo consultare (`viewDepartmentIds`). `loadActor` è la
  // fonte canonica di questo dato (già costruita per canAssignDepartment):
  // niente query diretta duplicata.
  // `undefined` = non siamo riusciti a leggerlo (loadActor non ha trovato un
  // attore attivo). `[]` = letto correttamente, e l'HOD non ha reparti
  // operativi. Il form deve trattarli in modo diverso — vedi user-form.tsx.
  let hodDepartmentIds: string[] | undefined;
  if (user.role === "HOD") {
    const actor = await loadActor(user.id);
    hodDepartmentIds = actor?.departmentIds;
  }

  const titolo =
    user.role === "HOD" ? "Nuovo operatore" : "Nuovo utente";

  return (
    <div>
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">{titolo}</h1>
      <UserForm mode="create" viewerRole={user.role} hodDepartmentIds={hodDepartmentIds} />
    </div>
  );
}
