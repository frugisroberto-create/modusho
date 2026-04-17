import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { NotificationList } from "@/components/shared/notification-list";
import Link from "next/link";

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl mx-auto py-6">
      <nav className="flex items-center gap-2 text-sm font-ui text-sage-light mb-6">
        <Link href="/" className="hover:text-terracotta transition-colors">Home</Link>
        <span className="text-ivory-dark">/</span>
        <span className="text-charcoal-dark">Notifiche</span>
      </nav>

      <h1 className="text-2xl font-heading font-semibold text-charcoal-dark mb-6">Notifiche</h1>

      <div className="bg-white border border-ivory-dark">
        <NotificationList />
      </div>
    </div>
  );
}
