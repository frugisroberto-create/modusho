"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ContentActionsProps {
  contentId: string;
  contentStatus: string;
  userRole: string;
  isFeatured?: boolean;
}

export function ContentActions({ contentId, contentStatus, userRole, isFeatured = false }: ContentActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [archiveModal, setArchiveModal] = useState(false);
  const [featured, setFeatured] = useState(isFeatured);
  const [deleteModal, setDeleteModal] = useState(false);
  const [archiveNote, setArchiveNote] = useState("");
  const [loading, setLoading] = useState(false);

  const canAct = userRole === "HOTEL_MANAGER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  if (!canAct) return null;

  const handleToggleFeature = async () => {
    setOpen(false);
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
      if (res.ok) { router.refresh(); setArchiveModal(false); }
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}`, { method: "DELETE" });
      if (res.ok) { router.push("/hoo-sop"); router.refresh(); }
    } finally { setLoading(false); }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="p-2 text-sage-light hover:text-charcoal hover:bg-ivory-dark rounded-lg transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-ivory border border-ivory-dark rounded-lg shadow-lg z-50 py-1">
            {contentStatus !== "PUBLISHED" && contentStatus !== "ARCHIVED" && (
              <button onClick={() => { setOpen(false); router.push(`/hoo-sop/${contentId}/edit`); }}
                className="w-full text-left px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark transition-colors">
                Modifica
              </button>
            )}
            {contentStatus === "PUBLISHED" && (
              <>
                <button onClick={() => { setOpen(false); router.push(`/hoo-sop/${contentId}/edit`); }}
                  className="w-full text-left px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark transition-colors">
                  Modifica
                </button>
                <button onClick={handleToggleFeature}
                  className="w-full text-left px-4 py-2 text-sm font-ui text-terracotta hover:bg-ivory-dark transition-colors">
                  {featured ? "Rimuovi da evidenza" : "Metti in evidenza"}
                </button>
                <button onClick={() => { setOpen(false); setArchiveModal(true); }}
                  className="w-full text-left px-4 py-2 text-sm font-ui text-sage hover:bg-ivory-dark transition-colors">
                  Archivia
                </button>
              </>
            )}
            <button onClick={() => { setOpen(false); setDeleteModal(true); }}
              className="w-full text-left px-4 py-2 text-sm font-ui text-alert-red hover:bg-alert-red/5 transition-colors">
              Elimina
            </button>
          </div>
        </>
      )}

      {/* Modale archivia */}
      {archiveModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory rounded-xl w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-2">Archivia contenuto</h3>
            <p className="text-sm font-ui text-sage-light mb-4">Il contenuto non sarà più visibile agli operatori.</p>
            <textarea value={archiveNote} onChange={(e) => setArchiveNote(e.target.value)}
              placeholder="Motivo dell'archiviazione (min 5 caratteri)..." rows={3} className="w-full mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setArchiveModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark rounded-lg">Annulla</button>
              <button onClick={handleArchive} disabled={loading || archiveNote.length < 5}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-sage hover:bg-sage-dark rounded-lg disabled:opacity-50">
                {loading ? "..." : "Archivia"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale elimina */}
      {deleteModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory rounded-xl w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-alert-red mb-2">Elimina contenuto</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              Questa azione è reversibile solo dal Super Admin. Sei sicuro?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark rounded-lg">Annulla</button>
              <button onClick={handleDelete} disabled={loading}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-alert-red hover:bg-alert-red/80 rounded-lg disabled:opacity-50">
                {loading ? "..." : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
