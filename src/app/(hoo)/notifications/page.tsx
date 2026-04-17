import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { NotificationList } from "@/components/shared/notification-list";

export default async function HooNotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="text-2xl font-heading font-semibold text-charcoal-dark mb-6">Notifiche</h1>

      <div className="bg-white border border-ivory-dark">
        <NotificationList />
      </div>
    </div>
  );
}
