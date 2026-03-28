"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { UserForm } from "@/components/hoo/user-form";

interface UserDetail {
  id: string; email: string; name: string; role: string;
  canView: boolean; canEdit: boolean; canApprove: boolean; isActive: boolean;
  propertyAssignments: {
    id: string;
    property: { id: string; name: string; code: string };
    department: { id: string; name: string; code: string } | null;
  }[];
  contentPermissions: { contentType: string }[];
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      const res = await fetch(`/api/users/${id}`);
      if (res.ok) {
        const json = await res.json();
        setUser(json.data);
      }
      setLoading(false);
    }
    fetchUser();
  }, [id]);

  if (loading) return <div className="h-40 skeleton" />;
  if (!user) return <p className="text-sage-light font-ui">Utente non trovato</p>;

  // Build assignments from property assignments
  const assignments = user.propertyAssignments.map(a => ({
    propertyId: a.property.id,
    departmentId: a.department?.id ?? null,
  }));

  const contentTypes = user.contentPermissions.map(p => p.contentType as "SOP" | "DOCUMENT" | "MEMO");

  return (
    <div>
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">
        Modifica utente — {user.name}
      </h1>
      <UserForm
        mode="edit"
        userId={user.id}
        initialData={{
          name: user.name,
          email: user.email,
          role: user.role as "OPERATOR" | "HOD" | "HOTEL_MANAGER" | "ADMIN",
          canView: user.canView,
          canEdit: user.canEdit,
          canApprove: user.canApprove,
          isActive: user.isActive,
          assignments,
          contentTypes,
        }}
      />
    </div>
  );
}
