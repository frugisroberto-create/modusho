import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { HooHeader } from "@/components/hoo/hoo-header";
import { HooSubNav } from "@/components/hoo/hoo-sub-nav";

export default async function HooLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  if (!dbUser) redirect("/api/auth/signout");

  if (user.role !== "HOTEL_MANAGER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-ivory-medium">
      <HooHeader userName={user.name} userRole={user.role} />
      <HooSubNav userRole={user.role} />
      <main className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
        {children}
      </main>
    </div>
  );
}
