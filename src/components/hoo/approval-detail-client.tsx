"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApprovalActions } from "./approval-actions";
import { RevisionHistory } from "./revision-history";
import { ContentTimeline } from "@/components/shared/content-timeline";

interface ContentData {
  id: string; title: string; body: string; status: string; version: number;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  createdBy: { name: string }; updatedBy: { name: string };
  statusHistory: { id: string; fromStatus: string | null; toStatus: string; note: string | null; changedAt: string; changedBy: { name: string } }[];
  reviews: { id: string; action: string; note: string | null; createdAt: string; reviewer: { name: string } }[];
}

interface Props {
  content: ContentData;
  userRole: string;
  canReview: boolean;
  canEdit: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  REVIEW_ADMIN: "badge-sop",
  REVIEW_HM: "badge-memo",
  RETURNED: "bg-alert-red text-white",
  PUBLISHED: "bg-sage text-white",
  DRAFT: "bg-ivory-dark text-charcoal",
};

export function ApprovalDetailClient({ content, userRole, canReview, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(content.title);
  const [editBody, setEditBody] = useState(content.body);
  const [revisionNote, setRevisionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(content.version);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${content.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, body: editBody, revisionNote: revisionNote || undefined }),
      });
      if (res.ok) {
        const json = await res.json();
        setCurrentVersion(json.data.version);
        setEditing(false);
        setRevisionNote("");
        setRefreshKey((k) => k + 1);
        router.refresh();
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_BADGE[content.status] || "bg-ivory-dark text-charcoal"}`}>
            {content.status}
          </span>
          <span className="text-xs font-ui text-charcoal/45">{content.property.code}</span>
          {content.department && <span className="text-xs font-ui text-charcoal/45">{content.department.name}</span>}
          <span className="text-xs font-ui text-charcoal/45">v{currentVersion}</span>
        </div>
        {editing ? (
          <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
            className="w-full text-2xl font-heading font-semibold text-charcoal-dark" />
        ) : (
          <h1 className="text-2xl font-heading font-semibold text-charcoal-dark">{editTitle}</h1>
        )}
        <div className="flex gap-3 mt-2 text-sm font-ui text-charcoal/45">
          <span>Autore: {content.createdBy.name}</span>
          <span>Ultimo editor: {content.updatedBy.name}</span>
        </div>
      </div>

      {/* Body */}
      {editing ? (
        <div className="space-y-3">
          <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)}
            rows={20} className="w-full font-mono text-sm" />
          <textarea value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)}
            rows={2} className="w-full text-sm" placeholder="Descrivi brevemente le modifiche apportate (opzionale)" />
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
            <button onClick={() => { setEditing(false); setEditTitle(content.title); setEditBody(content.body); setRevisionNote(""); }}
              className="btn-outline">Annulla</button>
          </div>
        </div>
      ) : (
        <article className="prose prose-gray max-w-none bg-ivory border border-ivory-dark p-6 font-body"
          dangerouslySetInnerHTML={{ __html: editBody }} />
      )}

      {/* Azioni */}
      {canReview && !editing && (
        <div className="flex gap-3 items-center">
          <ApprovalActions contentId={content.id} currentStatus={content.status} />
          {canEdit && (
            <button onClick={() => setEditing(true)} className="btn-outline">
              Modifica contenuto
            </button>
          )}
        </div>
      )}

      {/* Cronologia unificata */}
      <ContentTimeline key={refreshKey} contentId={content.id} />
    </div>
  );
}
