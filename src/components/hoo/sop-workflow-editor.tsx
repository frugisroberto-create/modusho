"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";
import { SopEditor } from "@/components/shared/sop-editor";
import { SopViewRegistry } from "@/components/shared/sop-view-registry";

// ─── Types ───────────────────────────────────────────────────────────

type RaciRole = "R" | "C" | "A";
type ContentStatusType = "DRAFT" | "REVIEW_HM" | "REVIEW_ADMIN" | "RETURNED" | "PUBLISHED" | "ARCHIVED";

interface UserInfo {
  id: string;
  name: string;
  role: string;
}

interface SopWorkflowData {
  id: string;
  contentId: string;
  code: string | null;
  title: string;
  body: string;
  contentStatus: ContentStatusType;
  myRole: RaciRole | null;
  submittedToC: boolean;
  submittedToCAt: string | null;
  submittedToA: boolean;
  submittedToAAt: string | null;
  reviewDueDate: string | null;
  reviewDueMonths: number;
  needsReview: boolean;
  lastSavedAt: string | null;
  textVersionCount: number;
  canEditText: boolean;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  createdBy: UserInfo;
  responsible: UserInfo;
  consulted: UserInfo | null;
  accountable: UserInfo;
  targetAudience: { targetType: string; targetRole: string | null; targetDepartment: { id: string; name: string } | null }[];
  consultedConfirmedAt: string | null;
  consultedConfirmedVersion: number | null;
  consultedConfirmedNote: string | null;
  consultationPending: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface NoteItem {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  author: UserInfo;
}

interface VersionItem {
  id: string;
  versionNumber: number;
  title: string;
  body: string;
  createdAt: string;
  savedBy: UserInfo;
}

interface EventItem {
  id: string;
  eventType: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: UserInfo;
}

interface Props {
  workflowId: string;
  currentUserId: string;
  currentUserRole: string;
  currentUserCanApprove?: boolean;
}

// ─── Main Component ──────────────────────────────────────────────────

export function SopWorkflowEditor({ workflowId, currentUserId, currentUserRole, currentUserCanApprove }: Props) {
  const router = useRouter();
  const [wf, setWf] = useState<SopWorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"note" | "versioni" | "allegati" | "eventi">("note");

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Return modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnNote, setReturnNote] = useState("");

  // Delete draft modal
  const [showDeleteDraftModal, setShowDeleteDraftModal] = useState(false);

  // Delegate to HOD
  const [showDelegatePanel, setShowDelegatePanel] = useState(false);
  const [hodUsers, setHodUsers] = useState<{ id: string; name: string }[]>([]);
  const [selectedHodId, setSelectedHodId] = useState("");
  const [delegateLoading, setDelegateLoading] = useState(false);

  // Review due date edit
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateMonths, setDueDateMonths] = useState(12);

  // Republication acknowledgment modal
  const [showRepubModal, setShowRepubModal] = useState(false);

  const fetchWorkflow = useCallback(async () => {
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore nel caricamento");
      }
      const { data } = await res.json();
      setWf(data);
      setEditTitle(data.title);
      setEditBody(data.body);
      setDueDateMonths(data.reviewDueMonths);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { fetchWorkflow(); }, [fetchWorkflow]);

  // ─── Action Handlers ────────────────────────────────────────────────

  const handleSave = async () => {
    if (!wf) return;
    setSaving(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, body: editBody, expectedVersionCount: wf.textVersionCount }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore nel salvataggio");
      }
      setActionMessage({ type: "success", text: "Bozza salvata" });
      await fetchWorkflow();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (target: "C" | "A" | "C_AND_A") => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore");
      }
      const labelMap = { C: "HM", A: "HOO", C_AND_A: "HM e HOO" };
      setActionMessage({ type: "success", text: `Bozza sottoposta a ${labelMap[target]}` });
      await fetchWorkflow();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!returnNote.trim()) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: returnNote }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore");
      }
      setActionMessage({ type: "success", text: "Bozza restituita" });
      setShowReturnModal(false);
      setReturnNote("");
      await fetchWorkflow();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveClick = () => {
    // Se la SOP era già pubblicata in passato → mostra domanda sulla nuova conferma
    if (wf?.publishedAt) {
      setShowRepubModal(true);
    } else {
      doApprove(undefined);
    }
  };

  const doApprove = async (requiresNewAcknowledgment: boolean | undefined) => {
    setShowRepubModal(false);
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          requiresNewAcknowledgment !== undefined
            ? { requiresNewAcknowledgment }
            : {}
        ),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore");
      }
      setActionMessage({ type: "success", text: "SOP approvata e pubblicata" });
      await fetchWorkflow();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateDueDate = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/review-due-date`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewDueMonths: dueDateMonths }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore");
      }
      setActionMessage({ type: "success", text: "Scadenza revisione aggiornata" });
      setEditingDueDate(false);
      await fetchWorkflow();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setActionLoading(false);
    }
  };

  // Consultation confirmation
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  const handleConfirmConsultation = async () => {
    setConfirmLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/confirm-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: confirmNote || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore");
      }
      setActionMessage({ type: "success", text: "Consultazione confermata" });
      setConfirmNote("");
      await fetchWorkflow();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setConfirmLoading(false);
    }
  };

  // ─── Delegate to HOD ────────────────────────────────────────────────

  const handleOpenDelegate = async () => {
    if (!wf) return;
    setShowDelegatePanel(true);
    setSelectedHodId("");
    try {
      const res = await fetch(`/api/users?role=HOD&propertyId=${wf.property.id}&pageSize=50`);
      if (res.ok) {
        const json = await res.json();
        setHodUsers((json.data || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      }
    } catch { /* ignore */ }
  };

  const handleDelegate = async () => {
    if (!selectedHodId) return;
    setDelegateLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/delegate-to-hod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hodUserId: selectedHodId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore");
      }
      setActionMessage({ type: "success", text: "Redazione delegata a HOD" });
      setShowDelegatePanel(false);
      await fetchWorkflow();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setDelegateLoading(false);
    }
  };

  const handleDeleteDraft = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/content/${wf!.contentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore");
      }
      router.push("/hoo-sop");
      router.refresh();
    } catch (e) {
      setActionMessage({ type: "error", text: e instanceof Error ? e.message : "Errore" });
      setActionLoading(false);
      setShowDeleteDraftModal(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!wf) return <ErrorBanner message="Workflow non trovato" />;

  const isR = wf.myRole === "R";
  const isC = wf.myRole === "C";
  const isA = wf.myRole === "A";
  const isHoo = currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN";
  const isHm = currentUserRole === "HOTEL_MANAGER";
  // Override per HM/HOO: hanno autorità di governance, possono modificare anche se non R/C/A
  const isAdminOverride = !wf.myRole && (isHoo || isHm);
  const draftStatuses: ContentStatusType[] = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];
  const isInLavorazione = draftStatuses.includes(wf.contentStatus);
  const isPubblicata = wf.contentStatus === "PUBLISHED";
  const isSubmitted = wf.submittedToC || wf.submittedToA;

  return (
    <div className="space-y-6">
      {/* ── Testata ── */}
      <SopHeader wf={wf} />

      {/* ── Workflow status banner ── */}
      <WorkflowStatusBanner wf={wf} />

      {/* ── Stato consultazione C — visibile a R, C e A ── */}
      {isInLavorazione && wf.consulted && wf.submittedToC && (
        <ConsultationStatus
          wf={wf}
          isC={isC}
          confirmNote={confirmNote}
          onConfirmNoteChange={setConfirmNote}
          onConfirm={handleConfirmConsultation}
          loading={confirmLoading}
        />
      )}

      {/* ── Action message ── */}
      {actionMessage && (
        <div className={`px-4 py-3 text-sm font-ui border-l-4 ${
          actionMessage.type === "success"
            ? "bg-[#E8F5E9] border-[#2E7D32] text-[#2E7D32]"
            : "bg-[#FECACA] border-alert-red text-alert-red"
        }`}>
          {actionMessage.text}
        </div>
      )}

      {/* ── Editability message for C/A ── */}
      {isInLavorazione && !isR && isSubmitted && (wf.myRole === "C" || wf.myRole === "A") && (
        <div className="px-4 py-3 text-sm font-ui bg-[#FFF3E0] border-l-4 border-[#E65100] text-[#E65100]">
          Questa bozza è attualmente sottoposta a revisione. Il testo può essere modificato solo dal responsabile operativo della procedura. Puoi comunque lasciare note.
        </div>
      )}

      {/* ── Coinvolgi HOD — visibile a R (HM) quando non c'è C e nessun submit attivo ── */}
      {isInLavorazione && (isR || isAdminOverride) && !wf.consulted && !wf.submittedToC && !wf.submittedToA && (currentUserRole === "HOTEL_MANAGER" || currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN") && (
        <div className="bg-ivory border border-ivory-dark p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showDelegatePanel}
              onChange={(e) => { if (e.target.checked) { handleOpenDelegate(); } else { setShowDelegatePanel(false); setSelectedHodId(""); } }}
              className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            <span className="text-sm font-ui font-medium text-charcoal">Coinvolgi HOD nella redazione</span>
          </label>
          <p className="text-xs font-ui text-charcoal/45">
            {showDelegatePanel
              ? "L'HOD sarà il Responsabile (R) della bozza, tu sarai Consultato (C)"
              : "Sei il Responsabile (R) della bozza"
            }
          </p>
          {showDelegatePanel && (
            hodUsers.length === 0 ? (
              <p className="text-xs font-ui text-charcoal/40">Nessun HOD assegnato a questa struttura</p>
            ) : (
              <>
                <select value={selectedHodId} onChange={(e) => setSelectedHodId(e.target.value)} className="w-full">
                  <option value="">Seleziona HOD</option>
                  {hodUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button onClick={handleDelegate} disabled={!selectedHodId || delegateLoading}
                  className="btn-primary disabled:opacity-50">
                  {delegateLoading ? "Delega in corso..." : "Conferma delega"}
                </button>
              </>
            )
          )}
        </div>
      )}

      {/* ── Riassegna RACI (HM/HOO) — visibile su bozze in lavorazione, escluso REVIEW_ADMIN ── */}
      {(isHm || isHoo) && (wf.contentStatus === "DRAFT" || wf.contentStatus === "REVIEW_HM" || wf.contentStatus === "RETURNED") && (
        <RaciReassignPanel
          wf={wf}
          propertyId={wf.property.id}
          onReassigned={fetchWorkflow}
        />
      )}

      {/* ── Review due date (published) ── */}
      {isPubblicata && (
        <ReviewDueDateSection
          wf={wf}
          isA={isA}
          editing={editingDueDate}
          dueDateMonths={dueDateMonths}
          onEdit={() => setEditingDueDate(true)}
          onCancel={() => { setEditingDueDate(false); setDueDateMonths(wf.reviewDueMonths); }}
          onMonthsChange={setDueDateMonths}
          onSave={handleUpdateDueDate}
          loading={actionLoading}
        />
      )}

      {/* ── Text editor / viewer ── */}
      <div className="bg-white border border-ivory-dark">
        <div className="px-5 py-3 bg-ivory border-b border-ivory-dark flex items-center justify-between">
          <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
            {isInLavorazione ? "Bozza" : "Contenuto"}{wf.textVersionCount > 0 && ` — v${wf.textVersionCount}`}
          </span>
          {wf.lastSavedAt && (
            <span className="text-xs font-ui text-charcoal/40">
              Ultimo salvataggio: {formatRelativeDate(wf.lastSavedAt)}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          {wf.canEditText ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => { setEditTitle(e.target.value); setDirty(true); }}
              className="w-full text-xl font-heading font-semibold text-charcoal-dark bg-ivory border border-ivory-dark px-4 py-3 focus:border-terracotta"
              placeholder="Titolo SOP"
            />
          ) : (
            <h2 className="text-xl font-heading font-semibold text-charcoal-dark px-4 py-3">{wf.title}</h2>
          )}

          {/* Body */}
          {wf.canEditText ? (
            <SopEditor
              content={editBody}
              onChange={(html) => { setEditBody(html); setDirty(true); }}
              placeholder="Contenuto della procedura..."
            />
          ) : (
            <article
              className="prose prose-gray max-w-none font-body leading-relaxed px-4 py-3 bg-ivory/50 min-h-[200px]"
              dangerouslySetInnerHTML={{ __html: wf.body }}
            />
          )}
        </div>
      </div>

      {/* ── Action bar ── */}
      {isInLavorazione && (
        <ActionBar
          wf={wf}
          isR={isR}
          isA={isA}
          isHoo={isHoo}
          isAdminOverride={isAdminOverride}
          canApproveFlag={!!currentUserCanApprove}
          canDelete={isHoo || isHm}
          dirty={dirty}
          saving={saving}
          actionLoading={actionLoading}
          onSave={handleSave}
          onSubmit={handleSubmit}
          onReturn={() => setShowReturnModal(true)}
          onApprove={handleApproveClick}
          onDelete={() => setShowDeleteDraftModal(true)}
        />
      )}

      {/* ── Azioni post-pubblicazione (HOO / HM) ── */}
      {isPubblicata && (currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN" || currentUserRole === "HOTEL_MANAGER") && (
        <PublishedActions contentId={wf.contentId} workflowId={workflowId} onRefresh={fetchWorkflow} />
      )}

      {/* ── Registro presa visione (SOP pubblicata) ── */}
      {isPubblicata && (
        <SopViewRegistry contentId={wf.contentId} />
      )}

      {/* ── Tabs: Note / Versioni / Allegati / Eventi ── */}
      <div className="bg-white border border-ivory-dark">
        <div className="flex border-b border-ivory-dark">
          {(["note", "versioni", "allegati", "eventi"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-xs font-ui font-semibold uppercase tracking-wider transition-colors ${
                activeTab === tab
                  ? "text-terracotta border-b-2 border-terracotta bg-ivory"
                  : "text-charcoal/50 hover:text-charcoal/70"
              }`}
            >
              {tab === "note" ? "Note" : tab === "versioni" ? "Versioni" : tab === "allegati" ? "Allegati" : "Eventi"}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "note" && (
            <NotesPanel
              workflowId={workflowId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              contentStatus={wf.contentStatus}
            />
          )}
          {activeTab === "versioni" && <VersionsPanel workflowId={workflowId} />}
          {activeTab === "allegati" && (
            <AttachmentUploader contentId={wf.contentId} canEdit={(isR || isC || isA || isAdminOverride || isHm || isHoo) && isInLavorazione && !wf.submittedToA} />
          )}
          {activeTab === "eventi" && <EventsPanel workflowId={workflowId} />}
        </div>
      </div>

      {/* ── Return modal ── */}
      {showReturnModal && (
        <ReturnModal
          note={returnNote}
          onNoteChange={setReturnNote}
          onConfirm={handleReturn}
          onCancel={() => { setShowReturnModal(false); setReturnNote(""); }}
          loading={actionLoading}
        />
      )}

      {/* ── Delete draft modal ── */}
      {showDeleteDraftModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-alert-red mb-2">Elimina bozza SOP</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              La bozza verrà eliminata (soft delete). L&apos;azione è reversibile solo dal Super Admin. Sei sicuro?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteDraftModal(false)} disabled={actionLoading} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
              <button onClick={handleDeleteDraft} disabled={actionLoading}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-alert-red hover:bg-alert-red/80 disabled:opacity-50">
                {actionLoading ? "..." : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Republication acknowledgment modal ── */}
      {showRepubModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-2">Nuova versione SOP</h3>
            <p className="text-sm font-ui text-charcoal mb-5">
              Questa SOP era già stata pubblicata. La nuova versione richiede una nuova conferma di visualizzazione da parte degli operatori?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => doApprove(true)}
                className="w-full px-4 py-3 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light transition-colors">
                Sì, richiedi nuova conferma
              </button>
              <button onClick={() => doApprove(false)}
                className="w-full px-4 py-3 text-sm font-ui font-medium text-charcoal bg-ivory-dark hover:bg-ivory-medium border border-ivory-dark transition-colors">
                No, mantieni valida la conferma precedente
              </button>
              <button onClick={() => setShowRepubModal(false)}
                className="w-full px-4 py-2 text-sm font-ui text-charcoal/50 hover:text-charcoal transition-colors">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function SopHeader({ wf }: { wf: SopWorkflowData }) {
  const STATUS_LABEL: Record<string, string> = {
    DRAFT: "Bozza",
    REVIEW_HM: "In revisione HM",
    REVIEW_ADMIN: "In revisione HOO",
    RETURNED: "Restituita",
    PUBLISHED: "Pubblicata",
    ARCHIVED: "Archiviata",
  };
  const STATUS_STYLE: Record<string, string> = {
    DRAFT: "bg-[#FFF3E0] text-[#E65100]",
    REVIEW_HM: "bg-mauve/15 text-mauve",
    REVIEW_ADMIN: "bg-terracotta/10 text-terracotta",
    RETURNED: "bg-[#FECACA] text-[#991B1B]",
    PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
    ARCHIVED: "bg-ivory-dark text-charcoal/50",
  };

  return (
    <div className="space-y-4">
      {/* Row 1: status + meta */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_STYLE[wf.contentStatus] || ""}`}>
          {STATUS_LABEL[wf.contentStatus] || wf.contentStatus}
        </span>
        {wf.code && <span className="text-xs font-ui font-semibold text-terracotta tracking-wide">{wf.code}</span>}
        <span className="text-xs font-ui text-charcoal/45">{wf.property.name}</span>
        {wf.department && (
          <>
            <span className="text-xs text-charcoal/30">/</span>
            <span className="text-xs font-ui text-charcoal/45">{wf.department.name}</span>
          </>
        )}
      </div>

      {/* Row 2: title */}
      <h1 className="text-2xl font-heading font-semibold text-charcoal-dark">{wf.title}</h1>

      {/* Row 3: RACI roles */}
      <div className="flex items-center gap-4 flex-wrap">
        <RaciBadge label="R" sublabel="Responsabile" user={wf.responsible} highlight={wf.myRole === "R"} />
        {wf.consulted && (
          <RaciBadge label="C" sublabel="Consultato" user={wf.consulted} highlight={wf.myRole === "C"} />
        )}
        <RaciBadge label="A" sublabel="Accountable" user={wf.accountable} highlight={wf.myRole === "A"} />
      </div>

      {/* Row 4: meta info */}
      <div className="flex gap-4 text-xs font-ui text-charcoal/45 flex-wrap">
        <span>Creata da: {wf.createdBy.name}</span>
        <span>Il: {new Date(wf.createdAt).toLocaleDateString("it-IT")}</span>
        {wf.publishedAt && <span>Pubblicata il: {new Date(wf.publishedAt).toLocaleDateString("it-IT")}</span>}
        {wf.myRole && (
          <span className="text-terracotta font-semibold">Il tuo ruolo: {wf.myRole === "R" ? "Responsabile" : wf.myRole === "C" ? "Consultato" : "Accountable"}</span>
        )}
      </div>
    </div>
  );
}

function RaciBadge({ label, sublabel, user, highlight }: { label: string; sublabel: string; user: UserInfo; highlight: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border ${highlight ? "border-terracotta bg-terracotta/5" : "border-ivory-dark bg-white"}`}>
      <span className={`text-xs font-ui font-bold w-5 h-5 flex items-center justify-center ${
        highlight ? "bg-terracotta text-white" : "bg-ivory-dark text-charcoal/60"
      }`}>
        {label}
      </span>
      <div className="text-xs font-ui">
        <div className="font-semibold text-charcoal-dark">{user.name}</div>
        <div className="text-charcoal/40">{sublabel}</div>
      </div>
    </div>
  );
}

function WorkflowStatusBanner({ wf }: { wf: SopWorkflowData }) {
  const wfDraftStatuses = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];
  if (!wfDraftStatuses.includes(wf.contentStatus)) return null;

  // Banner specifico per SOP restituita
  if (wf.contentStatus === "RETURNED") {
    return (
      <div className="px-4 py-2.5 text-sm font-ui bg-[#FECACA]/30 border-l-4 border-[#991B1B] text-[#991B1B] font-medium">
        Questa SOP è stata restituita — rivedi le note e correggi prima di risottoporre
      </div>
    );
  }

  const parts: string[] = [];
  if (wf.submittedToC && wf.submittedToA) {
    parts.push("Sottoposta a HM e HOO");
  } else if (wf.submittedToC) {
    parts.push("Sottoposta a HM");
  } else if (wf.submittedToA) {
    parts.push("Sottoposta a HOO");
  }

  if (parts.length === 0) {
    return (
      <div className="px-4 py-2.5 text-sm font-ui bg-ivory border border-ivory-dark text-charcoal/60">
        Bozza in lavorazione — non ancora sottoposta a revisione
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 text-sm font-ui bg-mauve/10 border-l-4 border-mauve text-mauve font-medium">
      {parts.join(" — ")}
      {wf.submittedToCAt && (
        <span className="ml-2 text-xs font-normal text-mauve/70">
          (HM dal {new Date(wf.submittedToCAt).toLocaleDateString("it-IT")})
        </span>
      )}
      {wf.submittedToAAt && (
        <span className="ml-2 text-xs font-normal text-mauve/70">
          (HOO dal {new Date(wf.submittedToAAt).toLocaleDateString("it-IT")})
        </span>
      )}
    </div>
  );
}

function ReviewDueDateSection({ wf, isA, editing, dueDateMonths, onEdit, onCancel, onMonthsChange, onSave, loading }: {
  wf: SopWorkflowData;
  isA: boolean;
  editing: boolean;
  dueDateMonths: number;
  onEdit: () => void;
  onCancel: () => void;
  onMonthsChange: (v: number) => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <div className={`px-4 py-3 border-l-4 text-sm font-ui ${
      wf.needsReview
        ? "bg-[#FFF3E0] border-alert-yellow text-[#E65100]"
        : "bg-ivory border-sage text-charcoal/60"
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          {wf.needsReview ? (
            <span className="font-semibold">Necessita revisione</span>
          ) : (
            <span>Prossima revisione prevista</span>
          )}
          {wf.reviewDueDate && (
            <span className="ml-2">
              {wf.needsReview ? "— scaduta il " : "il "}
              {new Date(wf.reviewDueDate).toLocaleDateString("it-IT")}
            </span>
          )}
        </div>

        {isA && !editing && (
          <button onClick={onEdit} className="text-xs font-ui font-semibold text-terracotta uppercase tracking-wide hover:text-terracotta-light">
            Modifica
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs text-charcoal/50">Mesi dalla pubblicazione:</label>
          <input
            type="number"
            min={1}
            max={60}
            value={dueDateMonths}
            onChange={(e) => onMonthsChange(parseInt(e.target.value, 10) || 12)}
            className="w-20 text-sm px-2 py-1"
          />
          <button onClick={onSave} disabled={loading} className="btn-primary-sm">
            {loading ? "..." : "Salva"}
          </button>
          <button onClick={onCancel} className="text-xs text-charcoal/50 hover:text-charcoal">Annulla</button>
        </div>
      )}
    </div>
  );
}

function ActionBar({ wf, isR, isA, isHoo, isAdminOverride, canApproveFlag, canDelete, dirty, saving, actionLoading, onSave, onSubmit, onReturn, onApprove, onDelete }: {
  wf: SopWorkflowData;
  isR: boolean;
  isA: boolean;
  isHoo: boolean;
  canApproveFlag: boolean;
  canDelete: boolean;
  isAdminOverride: boolean;
  dirty: boolean;
  saving: boolean;
  actionLoading: boolean;
  onSave: () => void;
  onSubmit: (t: "C" | "A" | "C_AND_A") => void;
  onReturn: () => void;
  onApprove: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap bg-white border border-ivory-dark px-5 py-4">
      {/* Save — visibile a chiunque possa modificare il testo (R, C, A, ADMIN override) */}
      {wf.canEditText && (
        <button onClick={onSave} disabled={saving || !dirty} className="btn-primary">
          {saving ? "Salvataggio..." : "Salva bozza"}
        </button>
      )}

      {/* Submit buttons — solo R */}
      {isR && (
        <>
          {wf.consulted && !wf.submittedToC && (
            <button onClick={() => onSubmit("C")} disabled={actionLoading} className="btn-outline">
              Sottoponi a HM
            </button>
          )}
          {!wf.submittedToA && (
            <button onClick={() => onSubmit("A")} disabled={actionLoading} className="btn-outline">
              Sottoponi a HOO
            </button>
          )}
          {wf.consulted && !wf.submittedToC && !wf.submittedToA && (
            <button onClick={() => onSubmit("C_AND_A")} disabled={actionLoading} className="btn-outline">
              Sottoponi a HM e HOO
            </button>
          )}
        </>
      )}

      {/* Utenti con canApprove — possono pubblicare direttamente */}
      {(isHoo || canApproveFlag) && (
        <>
          <button onClick={onApprove} disabled={actionLoading} className="btn-primary !bg-sage hover:!bg-sage-dark">
            {wf.submittedToA ? "Approva e pubblica" : "Pubblica direttamente"}
          </button>
          {wf.submittedToA && (
            <button onClick={onReturn} disabled={actionLoading} className="btn-outline !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white">
              Restituisci
            </button>
          )}
        </>
      )}

      {/* Elimina bozza — solo HM / ADMIN / SUPER_ADMIN */}
      {canDelete && (
        <button onClick={onDelete} disabled={actionLoading} className="btn-outline !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white ml-auto">
          Elimina bozza
        </button>
      )}

    </div>
  );
}

// ─── Consultation Status ────────────────────────────────────────────

function ConsultationStatus({ wf, isC, confirmNote, onConfirmNoteChange, onConfirm, loading }: {
  wf: SopWorkflowData;
  isC: boolean;
  confirmNote: string;
  onConfirmNoteChange: (v: string) => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const isConfirmed = wf.consultedConfirmedVersion === wf.textVersionCount;

  if (isConfirmed) {
    // Consultazione confermata — visibile a tutti
    return (
      <div className="px-4 py-3 text-sm font-ui bg-[#E8F5E9] border-l-4 border-[#2E7D32] text-[#2E7D32]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Consultazione confermata</span>
          <span className="text-[#2E7D32]/70">
            — {wf.consulted?.name}, {wf.consultedConfirmedAt && new Date(wf.consultedConfirmedAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {" "}(v{wf.consultedConfirmedVersion})
          </span>
        </div>
        {wf.consultedConfirmedNote && (
          <p className="mt-1 text-[#2E7D32]/80 pl-6 italic">&ldquo;{wf.consultedConfirmedNote}&rdquo;</p>
        )}
      </div>
    );
  }

  // Consultazione in attesa
  return (
    <div className="px-4 py-3 text-sm font-ui bg-[#FFF3E0] border-l-4 border-[#E65100]">
      <div className="flex items-center gap-2 text-[#E65100]">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium">Consultazione {wf.consulted?.name} in attesa</span>
      </div>

      {/* Solo C vede il form di conferma */}
      {isC && (
        <div className="mt-3 pl-6 flex items-end gap-3">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              value={confirmNote}
              onChange={(e) => onConfirmNoteChange(e.target.value)}
              placeholder="Nota facoltativa..."
              className="w-full text-sm border border-ivory-dark px-3 py-2 bg-white font-ui focus:border-terracotta"
            />
          </div>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn-primary-sm whitespace-nowrap"
          >
            {loading ? "Conferma..." : "Conferma consultazione"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Published Actions ──────────────────────────────────────────────

// ─── Riassegna RACI panel (HM/HOO only) ─────────────────────────────────

function RaciReassignPanel({ wf, propertyId, onReassigned }: {
  wf: SopWorkflowData;
  propertyId: string;
  onReassigned: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [responsibleId, setResponsibleId] = useState(wf.responsible.id);
  const [consultedId, setConsultedId] = useState<string>(wf.consulted?.id ?? "");
  const [accountableId, setAccountableId] = useState(wf.accountable.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    async function loadUsers() {
      const res = await fetch(`/api/users?propertyId=${propertyId}&isActive=true&pageSize=50`);
      if (res.ok) {
        const json = await res.json();
        setUsers(json.data.map((u: { id: string; name: string; role: string }) => ({ id: u.id, name: u.name, role: u.role })));
      }
    }
    loadUsers();
  }, [open, propertyId]);

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sop-workflow/${wf.id}/raci`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsibleId,
          consultedId: consultedId || null,
          accountableId,
        }),
      });
      if (res.ok) {
        await onReassigned();
        setOpen(false);
      } else {
        const json = await res.json();
        setError(json.error || "Errore nella riassegnazione");
      }
    } finally { setLoading(false); }
  };

  const eligibleR = users.filter(u => ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(u.role));
  const eligibleC = users.filter(u => ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(u.role));
  const eligibleA = users.filter(u => ["ADMIN", "SUPER_ADMIN"].includes(u.role));

  if (!open) {
    return (
      <div className="bg-ivory border border-ivory-dark p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-ui font-medium text-charcoal">Modifica ruoli RACI</p>
          <p className="text-xs font-ui text-charcoal/45 mt-0.5">
            Cambia chi è Responsabile, Consultato o Accountable di questa bozza
          </p>
        </div>
        <button onClick={() => setOpen(true)}
          className="btn-outline-sm">
          Riassegna
        </button>
      </div>
    );
  }

  return (
    <div className="bg-ivory border border-ivory-dark p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-ui font-semibold text-charcoal">Riassegna ruoli RACI</p>
        <button onClick={() => { setOpen(false); setError(""); }}
          className="text-xs font-ui text-charcoal/50 hover:text-charcoal">Annulla</button>
      </div>

      <div>
        <label className="block text-[11px] font-ui font-semibold text-charcoal/60 uppercase tracking-wider mb-1">
          Responsabile (R)
        </label>
        <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} className="w-full">
          {eligibleR.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-ui font-semibold text-charcoal/60 uppercase tracking-wider mb-1">
          Consultato (C) — opzionale
        </label>
        <select value={consultedId} onChange={(e) => setConsultedId(e.target.value)} className="w-full">
          <option value="">— Nessuno —</option>
          {eligibleC.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-ui font-semibold text-charcoal/60 uppercase tracking-wider mb-1">
          Accountable (A)
        </label>
        <select value={accountableId} onChange={(e) => setAccountableId(e.target.value)} className="w-full">
          {eligibleA.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
        </select>
      </div>

      {error && <p className="text-xs font-ui text-alert-red">{error}</p>}

      <p className="text-xs font-ui text-charcoal/45">
        Cambiare R o C resetta lo stato di sottomissione e l&apos;eventuale conferma di consultazione.
      </p>

      <button onClick={handleSave} disabled={loading}
        className="btn-primary-sm disabled:opacity-50">
        {loading ? "Salvataggio..." : "Salva nuovi ruoli"}
      </button>
    </div>
  );
}

function PublishedActions({ contentId, workflowId, onRefresh }: { contentId: string; workflowId: string; onRefresh: () => Promise<void> }) {
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReopen = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/reopen`, { method: "POST" });
      if (res.ok) {
        await onRefresh();
        setShowReopenModal(false);
      } else {
        const json = await res.json();
        setError(json.error || "Errore nella riapertura");
      }
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}`, { method: "DELETE" });
      if (res.ok) { router.push("/hoo-sop"); router.refresh(); }
    } finally { setLoading(false); }
  };

  const handleArchive = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/archive`, { method: "POST" });
      if (res.ok) {
        await onRefresh();
        setShowArchiveModal(false);
      } else {
        const json = await res.json();
        setError(json.error || "Errore nell'archiviazione");
      }
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="flex items-center gap-3 bg-white border border-ivory-dark px-5 py-4">
        <button onClick={() => setShowReopenModal(true)}
          className="btn-primary">
          Modifica
        </button>
        <button onClick={() => setShowArchiveModal(true)}
          className="btn-outline">
          Archivia
        </button>
        <button onClick={() => setShowDeleteModal(true)}
          className="btn-outline !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white">
          Elimina
        </button>
      </div>

      {/* Modale riapertura */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-2">Riapri per modifica</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              La SOP tornerà in lavorazione. Dopo le modifiche, solo HOO potrà ri-approvarla e ri-pubblicarla.
            </p>
            {error && (
              <p className="text-sm font-ui text-alert-red mb-4">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowReopenModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
              <button onClick={handleReopen} disabled={loading}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light disabled:opacity-50">
                {loading ? "..." : "Riapri"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale archivia */}
      {showArchiveModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-2">Archivia SOP</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              La SOP non sarà più visibile nelle viste operative. Resterà consultabile nello storico.
            </p>
            {error && (
              <p className="text-sm font-ui text-alert-red mb-4">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
              <button onClick={handleArchive} disabled={loading}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-charcoal hover:bg-charcoal-dark disabled:opacity-50">
                {loading ? "..." : "Archivia"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale elimina */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-alert-red mb-2">Elimina SOP</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              Questa azione è reversibile solo dal Super Admin. Sei sicuro?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
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

// ─── Notes Panel ─────────────────────────────────────────────────────

function NotesPanel({ workflowId, currentUserId, currentUserRole, contentStatus }: {
  workflowId: string;
  currentUserId: string;
  currentUserRole: string;
  contentStatus: string;
}) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN";
  const inLavorazione = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"].includes(contentStatus);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/notes?pageSize=50`);
      if (res.ok) {
        const { data } = await res.json();
        setNotes(data);
      }
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handlePost = async () => {
    if (!newNote.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote }),
      });
      if (res.ok) {
        setNewNote("");
        await fetchNotes();
      }
    } finally {
      setPosting(false);
    }
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editBody.trim()) return;
    setBusyId(noteId);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditBody("");
        await fetchNotes();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Eliminare questa nota?")) return;
    setBusyId(noteId);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/notes/${noteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchNotes();
      }
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="space-y-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
          className="w-full text-sm font-ui"
          placeholder="Aggiungi una nota..."
        />
        <button onClick={handlePost} disabled={posting || !newNote.trim()} className="btn-primary-sm">
          {posting ? "..." : "Aggiungi nota"}
        </button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm font-ui text-charcoal/40 italic">Nessuna nota</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isReturn = note.body.startsWith("[Restituzione]");
            const isAuthor = note.authorId === currentUserId;
            const canManage = isAdmin || (isAuthor && inLavorazione);
            const isEditing = editingId === note.id;
            const wasEdited = note.updatedAt && note.createdAt && new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000;
            const busy = busyId === note.id;

            return (
              <div key={note.id} className={`border-l-4 px-4 py-3 ${
                isReturn ? "border-alert-red bg-[#FFF5F5]" : "border-ivory-dark bg-ivory"
              }`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-ui font-semibold text-charcoal-dark">{note.author.name}</span>
                  <span className="text-[10px] font-ui text-charcoal/40 uppercase">{note.author.role}</span>
                  <span className="text-[10px] font-ui text-charcoal/30">{formatRelativeDate(note.createdAt)}</span>
                  {wasEdited && <span className="text-[10px] font-ui italic text-charcoal/40">(modificata)</span>}
                  {isReturn && <span className="text-[10px] font-ui font-bold text-alert-red uppercase">Restituzione</span>}
                  {canManage && !isEditing && !isReturn && (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => { setEditingId(note.id); setEditBody(note.body); }}
                        disabled={busy}
                        className="text-[10px] font-ui text-terracotta hover:underline disabled:opacity-50"
                      >
                        Modifica
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={busy}
                        className="text-[10px] font-ui text-alert-red hover:underline disabled:opacity-50"
                      >
                        {busy ? "..." : "Elimina"}
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      className="w-full text-sm font-ui"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={busy || !editBody.trim()}
                        className="btn-primary-sm"
                      >
                        {busy ? "..." : "Salva"}
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditBody(""); }}
                        disabled={busy}
                        className="text-xs font-ui text-charcoal hover:underline"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-ui text-charcoal leading-relaxed whitespace-pre-wrap">
                    {isReturn ? note.body.replace("[Restituzione] ", "") : note.body}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Versions Panel ──────────────────────────────────────────────────

function VersionsPanel({ workflowId }: { workflowId: string }) {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sop-workflow/${workflowId}/versions?pageSize=50`);
        if (res.ok) {
          const { data } = await res.json();
          setVersions(data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [workflowId]);

  if (loading) return <PanelSkeleton />;

  if (versions.length === 0) {
    return <p className="text-sm font-ui text-charcoal/40 italic">Nessuna versione salvata</p>;
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div key={v.id} className="border border-ivory-dark bg-ivory">
          <button
            onClick={() => setExpanded(expanded === v.id ? null : v.id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ivory-dark/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-ui font-bold text-terracotta">v{v.versionNumber}</span>
              <span className="text-sm font-ui font-medium text-charcoal-dark">{v.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-ui text-charcoal/45">{v.savedBy.name}</span>
              <span className="text-xs font-ui text-charcoal/30">{formatRelativeDate(v.createdAt)}</span>
              <svg className={`w-4 h-4 text-charcoal/30 transition-transform ${expanded === v.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </button>
          {expanded === v.id && (
            <div className="px-4 py-3 border-t border-ivory-dark bg-white">
              <article className="prose prose-sm prose-gray max-w-none font-body text-sm" dangerouslySetInnerHTML={{ __html: v.body }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Events Panel ────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  DRAFT_CREATED: "Bozza creata",
  TEXT_SAVED: "Testo salvato",
  NOTE_ADDED: "Nota aggiunta",
  ATTACHMENT_ADDED: "Allegato aggiunto",
  ATTACHMENT_REMOVED: "Allegato rimosso",
  ATTACHMENT_REPLACED: "Allegato sostituito",
  SUBMITTED_TO_C: "Sottoposta a HM",
  SUBMITTED_TO_A: "Sottoposta a HOO",
  SUBMITTED_TO_C_AND_A: "Sottoposta a HM e HOO",
  RETURNED_BY_A: "Restituita da A",
  APPROVED: "Approvata",
  PUBLISHED: "Pubblicata",
  REVIEW_DUE_DATE_CHANGED: "Scadenza revisione modificata",
};

const EVENT_ICON_STYLE: Record<string, string> = {
  DRAFT_CREATED: "bg-charcoal/20",
  TEXT_SAVED: "bg-info-blue",
  NOTE_ADDED: "bg-charcoal/30",
  ATTACHMENT_ADDED: "bg-charcoal/30",
  ATTACHMENT_REMOVED: "bg-charcoal/30",
  ATTACHMENT_REPLACED: "bg-charcoal/30",
  SUBMITTED_TO_C: "bg-mauve",
  SUBMITTED_TO_A: "bg-mauve",
  SUBMITTED_TO_C_AND_A: "bg-mauve",
  RETURNED_BY_A: "bg-alert-red",
  APPROVED: "bg-sage",
  PUBLISHED: "bg-sage",
  REVIEW_DUE_DATE_CHANGED: "bg-alert-yellow",
};

function EventsPanel({ workflowId }: { workflowId: string }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sop-workflow/${workflowId}/events?pageSize=50`);
        if (res.ok) {
          const { data } = await res.json();
          setEvents(data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [workflowId]);

  if (loading) return <PanelSkeleton />;

  if (events.length === 0) {
    return <p className="text-sm font-ui text-charcoal/40 italic">Nessun evento registrato</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((evt, i) => (
        <div key={evt.id} className="flex gap-3 py-3 border-b border-ivory-dark last:border-b-0">
          <div className="flex flex-col items-center pt-0.5">
            <div className={`w-2.5 h-2.5 rounded-full ${EVENT_ICON_STYLE[evt.eventType] || "bg-charcoal/20"}`} />
            {i < events.length - 1 && <div className="w-px flex-1 bg-ivory-dark mt-1" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-ui font-medium text-charcoal-dark">
                {EVENT_LABELS[evt.eventType] || evt.eventType}
              </span>
              <span className="text-xs font-ui text-charcoal/45">— {evt.actor.name}</span>
              <span className="text-xs font-ui text-charcoal/30">{formatRelativeDate(evt.createdAt)}</span>
            </div>
            {evt.note && (
              <p className="text-sm font-ui text-charcoal/70 mt-1 whitespace-pre-wrap">{evt.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Return Modal ────────────────────────────────────────────────────

function ReturnModal({ note, onNoteChange, onConfirm, onCancel, loading }: {
  note: string;
  onNoteChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white border border-ivory-dark max-w-lg w-full mx-4 p-6 space-y-4">
        <h3 className="text-lg font-heading font-semibold text-charcoal-dark">Restituisci bozza</h3>
        <p className="text-sm font-ui text-charcoal/60">
          La nota è obbligatoria. Spiega il motivo della restituzione.
        </p>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={4}
          className="w-full text-sm font-ui"
          placeholder="Motivo della restituzione..."
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="text-sm font-ui text-charcoal/50 hover:text-charcoal px-4 py-2">
            Annulla
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !note.trim()}
            className="btn-primary !bg-alert-red hover:!bg-alert-red/80"
          >
            {loading ? "..." : "Restituisci"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 skeleton" />
      <div className="h-8 w-96 skeleton" />
      <div className="h-4 w-64 skeleton" />
      <div className="h-64 w-full skeleton" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="px-4 py-3 text-sm font-ui bg-[#FECACA] border-l-4 border-alert-red text-alert-red">
      {message}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-full skeleton" />
      <div className="h-4 w-3/4 skeleton" />
      <div className="h-4 w-1/2 skeleton" />
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  if (diffDays < 7) return `${diffDays} giorni fa`;
  return date.toLocaleDateString("it-IT");
}
