"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserForm } from "@/components/hoo/user-form";
import { ActivationLinkBox } from "@/components/hoo/activation-link-box";
import { HelpTip } from "@/components/auth/help-tip";
import { getActivationStatus } from "@/lib/user-scope";
import type { EditableField } from "@/lib/user-scope";

interface UserDetail {
  id: string; email: string; name: string; role: string;
  canView: boolean; canEdit: boolean; canApprove: boolean; canPublish: boolean;
  targetDepartmentIds: string[]; viewDepartmentIds: string[]; isActive: boolean;
  canCreateUsers: boolean;
  activatedAt: string | null;
  lastInviteAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; role: string } | null;
  propertyAssignments: {
    id: string;
    property: { id: string; name: string; code: string };
    department: { id: string; name: string; code: string } | null;
  }[];
  contentPermissions: { id: string; contentType: string }[];
}

interface DetailPermissions {
  editableFields: EditableField[];
  assignableRoles: string[];
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "HOO", cls: "bg-charcoal-dark text-white" },
  ADMIN: { label: "HOO", cls: "bg-sage text-white" },
  HOTEL_MANAGER: { label: "Hotel Manager", cls: "bg-terracotta text-white" },
  CORPORATE: { label: "Corporate", cls: "bg-[#5B7B8A] text-white" },
  HOD: { label: "HOD", cls: "bg-mauve text-white" },
  OPERATOR: { label: "Operatore", cls: "bg-ivory-dark text-charcoal" },
};

const CT_LABELS: Record<string, string> = { SOP: "SOP", DOCUMENT: "Documenti", MEMO: "Memo" };

function PermBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2  border ${active ? "bg-sage/10 border-sage/30" : "bg-ivory border-ivory-dark"}`}>
      <div className={`w-3 h-3 rounded-full ${active ? "bg-sage" : "bg-ivory-dark"}`} />
      <span className={`text-sm font-ui ${active ? "text-charcoal-dark" : "text-sage-light"}`}>{label}</span>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const viewerRole = session?.user?.role ?? "";
  const isSuperAdmin = viewerRole === "SUPER_ADMIN";

  const [user, setUser] = useState<UserDetail | null>(null);
  const [permissions, setPermissions] = useState<DetailPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [togglingFlag, setTogglingFlag] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [inviteLink, setInviteLink] = useState<{ url: string; expiresAt: string } | null>(null);

  const fetchUser = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/users/${id}`);
      if (res.ok) {
        const json = await res.json();
        setUser(json.data);
        setPermissions(json.permissions ?? null);
      }
    } finally { if (!silent) setLoading(false); }
  }, [id]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const can = (field: EditableField) => permissions?.editableFields.includes(field) ?? false;

  const handleDeactivate = async () => {
    if (!user) return;
    setDeactivating(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (res.ok) fetchUser(true);
      else {
        const json = await res.json().catch(() => ({}));
        setFeedback({ text: json?.error ?? "Operazione non riuscita", ok: false });
      }
    } finally { setDeactivating(false); }
  };

  const handleResendInvite = async () => {
    setInviting(true);
    setFeedback(null);
    setInviteLink(null);
    try {
      const res = await fetch(`/api/users/${id}/send-activation`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setFeedback(
        res.ok
          ? { text: "Invito inviato.", ok: true }
          : { text: json?.error ?? "Invito non inviato", ok: false }
      );
      // Il link arriva solo per chi non si è ancora attivato: l'API non lo
      // restituisce per gli account attivi, quindi qui non può comparire.
      const payload = res.ok ? json?.data : json;
      if (payload?.activationUrl && payload?.activationExpiresAt) {
        setInviteLink({ url: payload.activationUrl, expiresAt: payload.activationExpiresAt });
      }
      if (res.ok) fetchUser(true);
    } finally { setInviting(false); }
  };

  const handleToggleCreateFlag = async () => {
    if (!user) return;
    setTogglingFlag(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canCreateUsers: !user.canCreateUsers }),
      });
      if (res.ok) fetchUser(true);
      else {
        const json = await res.json().catch(() => ({}));
        setFeedback({ text: json?.error ?? "Operazione non riuscita", ok: false });
      }
    } finally { setTogglingFlag(false); }
  };

  if (loading) return <div className="h-40 skeleton" />;
  if (!user) return <p className="text-sage-light font-ui">Utente non trovato</p>;

  const activation = getActivationStatus(
    { activatedAt: user.activatedAt ? new Date(user.activatedAt) : null },
    user.lastInviteAt ? new Date(user.lastInviteAt) : null
  );

  if (editing) {
    const assignments = user.propertyAssignments.map(a => ({
      propertyId: a.property.id,
      departmentId: a.department?.id ?? null,
    }));
    const contentTypes = user.contentPermissions.map(p => p.contentType as "SOP" | "DOCUMENT" | "MEMO");

    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Modifica — {user.name}</h1>
          <button onClick={() => setEditing(false)} className="text-sm font-ui text-sage-light hover:text-charcoal transition-colors">
            Annulla
          </button>
        </div>
        <UserForm
          mode="edit"
          userId={user.id}
          viewerRole={viewerRole}
          editableFields={permissions?.editableFields ?? []}
          assignableRoles={permissions?.assignableRoles ?? []}
          isActivated={user.activatedAt !== null}
          onSuccess={() => { setEditing(false); fetchUser(true); }}
          initialData={{
            name: user.name,
            email: user.email,
            role: user.role as "OPERATOR" | "HOD" | "HOTEL_MANAGER" | "CORPORATE" | "ADMIN",
            canView: user.canView,
            canEdit: user.canEdit,
            canApprove: user.canApprove,
            canPublish: user.canPublish,
            targetDepartmentIds: user.targetDepartmentIds || [],
            viewDepartmentIds: user.viewDepartmentIds || [],
            isActive: user.isActive,
            assignments,
            contentTypes,
          }}
        />
      </div>
    );
  }

  const badge = ROLE_BADGE[user.role] || { label: user.role, cls: "bg-ivory-dark text-charcoal" };
  const propGroups = new Map<string, { name: string; code: string; depts: string[] }>();
  for (const a of user.propertyAssignments) {
    const key = a.property.id;
    if (!propGroups.has(key)) {
      propGroups.set(key, { name: a.property.name, code: a.property.code, depts: [] });
    }
    if (a.department) {
      propGroups.get(key)!.depts.push(a.department.name);
    }
  }
  const hasAllDepts = user.propertyAssignments.some(a => !a.department);
  const firstDept = user.propertyAssignments.find(a => a.department)?.department?.name ?? "il suo reparto";

  // La card del flag esiste solo per i capi reparto, e solo per chi può concederlo.
  const showCreateFlagCard = user.role === "HOD" && can("canCreateUsers");
  // I permessi li governa l'Head of Operations: chi non li tocca li vede e basta.
  const permissionsReadOnly = !can("permissionFlags");

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-xl font-heading font-semibold text-charcoal-dark">{user.name}</h1>
            <span className={`text-xs font-ui font-medium px-2.5 py-1 rounded ${badge.cls}`}>{badge.label}</span>
            {!user.isActive && <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-alert-red/10 text-alert-red">Disattivato</span>}
          </div>
          <p className="text-sm font-ui text-sage-light">{user.email}</p>

          {/* Chip di attesa: sparisce quando l'utente si attiva */}
          {activation.state !== "ACTIVATED" && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-ui font-medium px-2.5 py-1 bg-[#E65100]/10 text-[#E65100]">
                {activation.state === "PENDING"
                  ? `In attesa di attivazione · ${activation.daysWaiting} ${activation.daysWaiting === 1 ? "giorno" : "giorni"}`
                  : "Invito mai inviato"}
              </span>
              <button onClick={handleResendInvite} disabled={inviting}
                className="px-2.5 py-1 text-[11px] font-ui font-semibold uppercase tracking-wider text-[#E65100] border border-[#E65100]/30 hover:bg-[#E65100] hover:text-white transition-colors disabled:opacity-50">
                {inviting ? "..." : "Rimanda invito"}
              </button>
            </div>
          )}

          {feedback && (
            <p className={`mt-2 text-sm font-ui ${feedback.ok ? "text-sage" : "text-alert-red"}`}>
              {feedback.text}
            </p>
          )}

          {/* Il link compare solo per chi non si è ancora attivato: appena
              l'utente attiva, activation.state diventa ACTIVATED e sparisce. */}
          {inviteLink && activation.state !== "ACTIVATED" && (
            <div className="mt-3 max-w-xl">
              <ActivationLinkBox url={inviteLink.url} expiresAt={inviteLink.expiresAt} />
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {(permissions?.editableFields.length ?? 0) > 0 && (
            <button onClick={() => setEditing(true)}
              className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light  transition-colors">
              Modifica
            </button>
          )}
          <button onClick={() => router.push("/users")}
            className="px-4 py-2 text-sm font-ui text-sage-light hover:text-charcoal transition-colors">
            Indietro
          </button>
        </div>
      </div>

      {/* Card Creazione utenti — solo sui capi reparto, solo per chi la concede */}
      {showCreateFlagCard && (
        <section className="bg-ivory-medium border border-ivory-dark p-5">
          <h2 className="text-sm font-heading font-semibold text-charcoal-dark mb-3">Creazione utenti</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={user.canCreateUsers}
              onChange={handleToggleCreateFlag}
              disabled={togglingFlag}
              className="mt-0.5"
            />
            <span className="text-sm font-ui text-charcoal">
              Può creare operatori nel suo reparto ({firstDept})
            </span>
          </label>
          <HelpTip
            question="Cosa può fare esattamente?"
            answer="Potrà aggiungere solo operatori, solo nel suo reparto, uno alla volta. Non potrà disattivare nessuno né dare permessi. Puoi spegnerlo quando vuoi: gli utenti già creati restano."
          />
        </section>
      )}

      {/* Card Permessi */}
      <section className="bg-ivory-medium border border-ivory-dark  p-5">
        <h2 className="text-sm font-heading font-semibold text-charcoal-dark mb-1">Permessi</h2>
        {permissionsReadOnly && (
          <p className="text-xs font-ui text-sage-light mb-3">(li governa l&apos;Head of Operations)</p>
        )}
        <div className={`flex flex-wrap gap-2 ${permissionsReadOnly ? "mt-2" : "mt-3"}`}>
          <PermBadge active={user.canView} label="Può vedere" />
          <PermBadge active={user.canEdit} label="Può modificare" />
          <PermBadge active={user.canApprove} label="Può approvare" />
          <PermBadge active={user.canPublish} label="Può pubblicare" />
        </div>
      </section>

      {/* Card Strutture e Reparti */}
      <section className="bg-ivory-medium border border-ivory-dark  p-5">
        <h2 className="text-sm font-heading font-semibold text-charcoal-dark mb-3">Strutture e reparti</h2>
        <div className="space-y-2">
          {Array.from(propGroups.entries()).map(([propId, data]) => (
            <div key={propId} className="flex items-start gap-3 py-2">
              <span className="text-sm font-ui font-medium text-charcoal-dark min-w-[120px]">{data.name}</span>
              <div className="flex flex-wrap gap-1">
                {hasAllDepts ? (
                  <span className="text-xs font-ui px-2 py-0.5 rounded bg-ivory-dark text-sage-light italic">Tutti i reparti</span>
                ) : data.depts.length > 0 ? (
                  data.depts.map(d => (
                    <span key={d} className="text-xs font-ui px-2 py-0.5 rounded bg-ivory-dark text-charcoal">{d}</span>
                  ))
                ) : (
                  <span className="text-xs font-ui px-2 py-0.5 rounded bg-ivory-dark text-sage-light italic">Tutti i reparti</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Card Tipi contenuto */}
      <section className="bg-ivory-medium border border-ivory-dark  p-5">
        <h2 className="text-sm font-heading font-semibold text-charcoal-dark mb-3">Tipi di contenuto gestibili</h2>
        {user.contentPermissions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {user.contentPermissions.map(p => (
              <span key={p.contentType} className="text-xs font-ui font-medium px-3 py-1.5 rounded bg-sage/10 text-sage border border-sage/20">
                {CT_LABELS[p.contentType] || p.contentType}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm font-ui text-sage-light">Nessun tipo di contenuto — solo lettura</p>
        )}
      </section>

      {/* Card Info */}
      <section className="bg-ivory-medium border border-ivory-dark  p-5">
        <h2 className="text-sm font-heading font-semibold text-charcoal-dark mb-3">Informazioni</h2>
        <div className="grid grid-cols-2 gap-3 text-sm font-ui">
          <div><span className="text-sage-light">Creato il:</span> <span className="text-charcoal">{new Date(user.createdAt).toLocaleDateString("it-IT")}</span></div>
          <div><span className="text-sage-light">Stato:</span> <span className={user.isActive ? "text-sage" : "text-alert-red"}>{user.isActive ? "Attivo" : "Disattivato"}</span></div>
          <div>
            <span className="text-sage-light">Creato da:</span>{" "}
            <span className="text-charcoal">
              {user.createdBy
                ? `${user.createdBy.name} (${ROLE_BADGE[user.createdBy.role]?.label ?? user.createdBy.role})`
                : "HOO"}
            </span>
          </div>
          {user.activatedAt === null && (
            <div className="col-span-2">
              <span className="text-sage-light">Password:</span>{" "}
              <span className="text-charcoal">non ancora impostata (invito in attesa)</span>
            </div>
          )}
        </div>
      </section>

      {/* Azioni */}
      {(can("isActive") || isSuperAdmin) && (
        <div className="pt-2 flex items-center gap-3">
          {can("isActive") && (
            <button onClick={handleDeactivate} disabled={deactivating}
              className={`px-4 py-2 text-sm font-ui font-medium border transition-colors disabled:opacity-50 ${
                user.isActive
                  ? "text-alert-red border-alert-red/30 hover:bg-alert-red/10"
                  : "text-sage border-sage/30 hover:bg-sage/10"
              }`}>
              {deactivating ? "..." : user.isActive ? "Disattiva utente" : "Riattiva utente"}
            </button>
          )}
          {isSuperAdmin && (
            <button onClick={() => { setShowDeleteModal(true); setDeleteError(""); }}
              className="px-4 py-2 text-sm font-ui font-medium text-alert-red border border-alert-red/30 hover:bg-alert-red hover:text-white transition-colors">
              Elimina definitivamente
            </button>
          )}
        </div>
      )}

      {/* Modale eliminazione definitiva (soft-delete) */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-alert-red mb-2">Elimina definitivamente</h3>
            <p className="text-sm font-ui text-charcoal mb-2">
              L&apos;utente <strong>{user.name}</strong> verrà eliminato:
            </p>
            <ul className="text-xs font-ui text-charcoal/60 list-disc list-inside mb-3 space-y-0.5">
              <li>Non potrà più accedere al sistema</li>
              <li>L&apos;email originale (<strong>{user.email}</strong>) sarà liberata per riuso</li>
              <li>Tutti i contenuti firmati, le note, gli eventi workflow e l&apos;audit storico <strong>resteranno intatti</strong></li>
              <li>L&apos;operazione non è reversibile (se serve riattivare, usa &quot;Disattiva utente&quot; invece)</li>
            </ul>
            {deleteError && (
              <p className="text-sm font-ui text-alert-red bg-alert-red/5 border-l-4 border-alert-red px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">
                Annulla
              </button>
              <button onClick={async () => {
                setDeleting(true);
                setDeleteError("");
                try {
                  const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
                  if (res.ok) {
                    router.push("/users");
                    router.refresh();
                  } else {
                    const json = await res.json().catch(() => null);
                    setDeleteError(json?.error || "Errore nella disattivazione");
                  }
                } finally { setDeleting(false); }
              }} disabled={deleting}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-alert-red hover:bg-alert-red/80 disabled:opacity-50 transition-colors">
                {deleting ? "..." : "Elimina definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
