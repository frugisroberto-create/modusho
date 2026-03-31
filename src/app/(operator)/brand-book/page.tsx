import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { BookList } from "@/components/operator/book-list";

export default async function BrandBookPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Brand Book: solo HM+
  if (!["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    redirect("/");
  }

  return <BookList contentType="BRAND_BOOK" basePath="brand-book" title="Brand Book" />;
}
