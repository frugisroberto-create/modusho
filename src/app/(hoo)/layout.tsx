import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { HooSidebar } from "@/components/hoo/hoo-sidebar";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
};

export default async function HooLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Solo ADMIN e SUPER_ADMIN
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-ivory">
      <HooSidebar
        userName={user.name}
        userRole={ROLE_LABELS[user.role] || user.role}
      />
      <main className="lg:ml-[260px] p-6 lg:p-8 max-w-[1200px]">{children}</main>
    </div>
  );
}
