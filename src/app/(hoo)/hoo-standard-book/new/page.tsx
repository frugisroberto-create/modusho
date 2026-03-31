import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { BookForm } from "@/components/hoo/book-form";

export default async function NewStandardBookPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/hoo-standard-book");

  return (
    <div>
      <h1 className="text-xl font-heading font-medium text-charcoal-dark mb-6">Nuova sezione Standard Book</h1>
      <BookForm mode="create" contentType="STANDARD_BOOK" backPath="/hoo-standard-book" />
    </div>
  );
}
