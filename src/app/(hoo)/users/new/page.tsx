import { UserForm } from "@/components/hoo/user-form";

export default function NewUserPage() {
  return (
    <div>
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">Nuovo utente</h1>
      <UserForm mode="create" />
    </div>
  );
}
