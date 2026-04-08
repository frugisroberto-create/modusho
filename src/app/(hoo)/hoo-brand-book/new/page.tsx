import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { BookForm } from "@/components/hoo/book-form";

export default async function NewBrandBookPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/hoo-brand-book");

  return (
    <div>
      <h1 className="text-xl font-heading font-medium text-charcoal-dark mb-6">Nuovo Brand Book</h1>
      <BookForm mode="create" contentType="BRAND_BOOK" backPath="/hoo-brand-book" userRole={user.role} />
    </div>
  );
}
