"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";

interface ContentActionsProps {
  contentId: string;
  contentType?: string;
  contentStatus: string;
  userRole: string;
  isFeatured?: boolean;
  sopWorkflowId?: string;
}

function getListRoute(contentType?: string): string {
  switch (contentType) {
    case "DOCUMENT": return "/library";
    case "MEMO": return "/memo";
    default: return "/hoo-sop";
  }
}

const BTN_DANGER = "btn-outline-sm !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white";

export function ContentActions({ contentId, contentType, contentStatus, userRole, isFeatured = false, sopWorkflowId }: ContentActionsProps) {
  const router = useRouter();
  const [archiveModal, setArchiveModal] = useState(false);
  const [featured, setFeatured] = useState(isFeatured);
  const [editModal, setEditModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [archiveNote, setArchiveNote] = useState("");
  const [loading, setLoading] = useState(false);

  const canAct = userRole === "HOTEL_MANAGER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  if (!canAct) return null;

  const canFeature = canAct; // HM+ can toggle featured

  const handleToggleFeature = async () => {
    try {
      const method = featured ? "DELETE" : "POST";
      const res = await fetch(`/api/content/${contentId}/feature`, { method });
      if (res.ok) { setFeatured(!featured); router.refresh(); }
    } catch {}
  };

  const handleArchive = async () => {
    if (archiveNote.length < 5) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}/archive`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: archiveNote }),
      });
      if (res.ok) { router.push(getListRoute(contentType)); router.refresh(); }
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}`, { method: "DELETE" });
      if (res.ok) { router.push(getListRoute(contentType)); router.refresh(); }
    } finally { setLoading(false); }
  };

  const editHref = sopWorkflowId ? `/sop-workflow/${sopWorkflowId}` : `/hoo-sop/${contentId}/edit`;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <ExportPdfButton contentId={contentId} />

        {contentStatus === "PUBLISHED" && canFeature && (
          <button onClick={handleToggleFeature} className="btn-outline-sm">
            {featured ? "Rimuovi evidenza" : "In evidenza"}
          </button>
        )}

        {(contentStatus === "PUBLISHED" || (contentStatus !== "ARCHIVED")) && (
          <button onClick={() => contentStatus === "PUBLISHED" && contentType === "SOP" ? setEditModal(true) : router.push(editHref)} className="btn-outline-sm">
            Modifica
          </button>
        )}

        {contentStatus === "PUBLISHED" && (
          <button onClick={() => setArchiveModal(true)} className="btn-outline-sm">
            Archivia
          </button>
        )}

        <button onClick={() => setDeleteModal(true)} className={BTN_DANGER}>
          Elimina
        </button>
      </div>

      {/* Modale archivia */}
      {archiveModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-2">Archivia contenuto</h3>
            <p className="text-sm font-ui text-sage-light mb-4">Il contenuto non sarà più visibile agli operatori.</p>
            <textarea value={archiveNote} onChange={(e) => setArchiveNote(e.target.value)}
              placeholder="Motivo dell'archiviazione (min 5 caratteri)..." rows={3} className="w-full mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setArchiveModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
              <button onClick={handleArchive} disabled={loading || archiveNote.length < 5}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-sage hover:bg-sage-dark disabled:opacity-50">
                {loading ? "..." : "Archivia"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale modifica SOP pubblicata */}
      {editModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-2">Modifica SOP pubblicata</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              La SOP rientrerà nel workflow e non sarà più visibile agli operatori fino alla ri-pubblicazione. Vuoi procedere?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
              <button onClick={() => { setEditModal(false); router.push(editHref); }}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light">
                Procedi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale elimina */}
      {deleteModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-alert-red mb-2">Elimina contenuto</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              Questa azione è reversibile solo dal Super Admin. Sei sicuro?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
              <button onClick={handleDelete} disabled={loading}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-alert-red hover:bg-alert-red/80 disabled:opacity-50">
                {loading ? "..." : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
