"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApprovalActionsProps {
  contentId: string;
  currentStatus: string;
}

export function ApprovalActions({ contentId, currentStatus }: ApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [note, setNote] = useState("");

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVED" }),
      });
      if (res.ok) { router.push("/approvals"); router.refresh(); }
    } finally { setLoading(false); }
  };

  const handleReturn = async () => {
    if (!note.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RETURNED", note }),
      });
      if (res.ok) { router.push("/approvals"); router.refresh(); }
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-ivory-medium border border-ivory-dark  p-5 space-y-4">
      <h3 className="text-sm font-heading font-semibold text-charcoal-dark">Azioni</h3>
      {!showReturn ? (
        <div className="flex gap-3">
          <button onClick={handleApprove} disabled={loading}
            className="px-5 py-2.5 text-sm font-ui font-medium text-white bg-sage hover:bg-sage-dark  disabled:opacity-50 transition-colors">
            {loading ? "Approvazione..." : currentStatus === "REVIEW_HM" ? "Approva e inoltra" : "Approva e pubblica"}
          </button>
          <button onClick={() => setShowReturn(true)}
            className="px-5 py-2.5 text-sm font-ui font-medium text-terracotta border border-terracotta/30 hover:bg-terracotta/10  transition-colors">
            Restituisci
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Nota obbligatoria — motivo della restituzione..." rows={3}
            className="w-full" />
          <div className="flex gap-2">
            <button onClick={handleReturn} disabled={loading || !note.trim()}
              className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
              {loading ? "Invio..." : "Conferma restituzione"}
            </button>
            <button onClick={() => { setShowReturn(false); setNote(""); }}
              className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark  transition-colors">
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
