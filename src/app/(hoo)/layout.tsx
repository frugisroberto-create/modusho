import { redirect } from "next/navigation";
import { getSessionUser, getUserProperties } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { HooShell } from "@/components/hoo/hoo-shell";

export default async function HooLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  if (!dbUser) redirect("/api/auth/signout");

  if (user.role !== "HOD" && user.role !== "HOTEL_MANAGER" && user.role !== "PRO" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  // Carica le property accessibili — solo SUPER_ADMIN vede tutto
  let properties;
  if (user.role === "SUPER_ADMIN") {
    properties = await prisma.property.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    });
  } else {
    properties = await getUserProperties(user.id);
  }

  return (
    <HooShell
      userName={user.name}
      userRole={user.role}
      properties={properties}
    >
      {children}
    </HooShell>
  );
}
