"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";

// ─── Types ───────────────────────────────────────────────────────────

type RaciRole = "R" | "C" | "A";
type SopStatus = "IN_LAVORAZIONE" | "PUBBLICATA" | "ARCHIVIATA";

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
  sopStatus: SopStatus;
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
}

// ─── Main Component ──────────────────────────────────────────────────

export function SopWorkflowEditor({ workflowId, currentUserId, currentUserRole }: Props) {
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

  // Review due date edit
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateMonths, setDueDateMonths] = useState(12);

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
      const labelMap = { C: "C (Consulted)", A: "A (Accountable)", C_AND_A: "C e A" };
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

  const handleApprove = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/sop-workflow/${workflowId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  // ─── Render ─────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!wf) return <ErrorBanner message="Workflow non trovato" />;

  const isR = wf.myRole === "R";
  const isC = wf.myRole === "C";
  const isA = wf.myRole === "A";
  const isAdminOverride = !wf.myRole && (currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN");
  const isInLavorazione = wf.sopStatus === "IN_LAVORAZIONE";
  const isPubblicata = wf.sopStatus === "PUBBLICATA";
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
            <textarea
              value={editBody}
              onChange={(e) => { setEditBody(e.target.value); setDirty(true); }}
              rows={18}
              className="w-full font-body text-charcoal leading-relaxed bg-ivory border border-ivory-dark px-4 py-3 focus:border-terracotta resize-y"
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
          isAdminOverride={isAdminOverride}
          dirty={dirty}
          saving={saving}
          actionLoading={actionLoading}
          onSave={handleSave}
          onSubmit={handleSubmit}
          onReturn={() => setShowReturnModal(true)}
          onApprove={handleApprove}
        />
      )}

      {/* ── Azioni post-pubblicazione (HOO / HM) ── */}
      {isPubblicata && (currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN" || currentUserRole === "HOTEL_MANAGER") && (
        <PublishedActions contentId={wf.contentId} workflowId={workflowId} onRefresh={fetchWorkflow} />
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
          {activeTab === "note" && <NotesPanel workflowId={workflowId} />}
          {activeTab === "versioni" && <VersionsPanel workflowId={workflowId} />}
          {activeTab === "allegati" && (
            <AttachmentUploader contentId={wf.contentId} canEdit={(isR || isAdminOverride) && isInLavorazione} />
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
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function SopHeader({ wf }: { wf: SopWorkflowData }) {
  const STATUS_LABEL: Record<SopStatus, string> = {
    IN_LAVORAZIONE: "In lavorazione",
    PUBBLICATA: "Pubblicata",
    ARCHIVIATA: "Archiviata",
  };
  const STATUS_STYLE: Record<SopStatus, string> = {
    IN_LAVORAZIONE: "bg-[#FFF3E0] text-[#E65100]",
    PUBBLICATA: "bg-[#E8F5E9] text-[#2E7D32]",
    ARCHIVIATA: "bg-ivory-dark text-charcoal/50",
  };

  return (
    <div className="space-y-4">
      {/* Row 1: status + meta */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_STYLE[wf.sopStatus]}`}>
          {STATUS_LABEL[wf.sopStatus]}
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
  if (wf.sopStatus !== "IN_LAVORAZIONE") return null;

  const parts: string[] = [];
  if (wf.submittedToC && wf.submittedToA) {
    parts.push("Sottoposta a C e A");
  } else if (wf.submittedToC) {
    parts.push("Sottoposta a C");
  } else if (wf.submittedToA) {
    parts.push("Sottoposta ad A");
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
          (C dal {new Date(wf.submittedToCAt).toLocaleDateString("it-IT")})
        </span>
      )}
      {wf.submittedToAAt && (
        <span className="ml-2 text-xs font-normal text-mauve/70">
          (A dal {new Date(wf.submittedToAAt).toLocaleDateString("it-IT")})
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
          <button onClick={onSave} disabled={loading} className="btn-primary !py-1.5 !px-4 !text-[11px]">
            {loading ? "..." : "Salva"}
          </button>
          <button onClick={onCancel} className="text-xs text-charcoal/50 hover:text-charcoal">Annulla</button>
        </div>
      )}
    </div>
  );
}

function ActionBar({ wf, isR, isA, isAdminOverride, dirty, saving, actionLoading, onSave, onSubmit, onReturn, onApprove }: {
  wf: SopWorkflowData;
  isR: boolean;
  isA: boolean;
  isAdminOverride: boolean;
  dirty: boolean;
  saving: boolean;
  actionLoading: boolean;
  onSave: () => void;
  onSubmit: (t: "C" | "A" | "C_AND_A") => void;
  onReturn: () => void;
  onApprove: () => void;
}) {
  // Solo ADMIN/SUPER_ADMIN possono approvare/pubblicare (anche se A nel RACI)
  const canApprovePublish = (isA || isAdminOverride) && (wf.accountable.role === "ADMIN" || wf.accountable.role === "SUPER_ADMIN");

  return (
    <div className="flex items-center gap-3 flex-wrap bg-white border border-ivory-dark px-5 py-4">
      {/* R actions */}
      {isR && (
        <>
          <button onClick={onSave} disabled={saving || !dirty} className="btn-primary !py-2.5 !px-5">
            {saving ? "Salvataggio..." : "Salva bozza"}
          </button>

          {/* Submit buttons — only for R */}
          {wf.consulted && !wf.submittedToC && (
            <button onClick={() => onSubmit("C")} disabled={actionLoading} className="btn-outline !py-2.5 !px-5">
              Sottoponi a C
            </button>
          )}
          {!wf.submittedToA && (
            <button onClick={() => onSubmit("A")} disabled={actionLoading} className="btn-outline !py-2.5 !px-5">
              Sottoponi ad A
            </button>
          )}
          {wf.consulted && !wf.submittedToC && !wf.submittedToA && (
            <button onClick={() => onSubmit("C_AND_A")} disabled={actionLoading} className="btn-outline !py-2.5 !px-5">
              Sottoponi a C e A
            </button>
          )}
        </>
      )}

      {/* A actions (or ADMIN/SUPER_ADMIN override) — when submitted to A, or always for admin override */}
      {canApprovePublish && wf.submittedToA && (
        <>
          <button onClick={onApprove} disabled={actionLoading} className="btn-primary !py-2.5 !px-5 !bg-sage hover:!bg-sage-dark">
            Approva e pubblica
          </button>
          <button onClick={onReturn} disabled={actionLoading} className="btn-outline !py-2.5 !px-5 !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white">
            Restituisci
          </button>
        </>
      )}

      {/* ADMIN/SUPER_ADMIN override — approve/return even without submittedToA */}
      {isAdminOverride && !wf.submittedToA && (
        <>
          <button onClick={onApprove} disabled={actionLoading} className="btn-primary !py-2.5 !px-5 !bg-sage hover:!bg-sage-dark">
            Approva e pubblica
          </button>
          <button onClick={onReturn} disabled={actionLoading} className="btn-outline !py-2.5 !px-5 !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white">
            Restituisci
          </button>
        </>
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
            className="btn-primary !py-2 !px-4 text-sm whitespace-nowrap"
          >
            {loading ? "Conferma..." : "Conferma consultazione"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Published Actions ──────────────────────────────────────────────

function PublishedActions({ contentId, workflowId, onRefresh }: { contentId: string; workflowId: string; onRefresh: () => Promise<void> }) {
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
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

  return (
    <>
      <div className="flex items-center gap-3 bg-white border border-ivory-dark px-5 py-4">
        <button onClick={() => setShowReopenModal(true)}
          className="btn-primary !py-2.5 !px-5">
          Modifica
        </button>
        <button onClick={() => setShowDeleteModal(true)}
          className="btn-outline !py-2.5 !px-5 !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white">
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

function NotesPanel({ workflowId }: { workflowId: string }) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [posting, setPosting] = useState(false);

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
        <button onClick={handlePost} disabled={posting || !newNote.trim()} className="btn-primary !py-2 !px-4 !text-[11px]">
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
            return (
              <div key={note.id} className={`border-l-4 px-4 py-3 ${
                isReturn ? "border-alert-red bg-[#FFF5F5]" : "border-ivory-dark bg-ivory"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-ui font-semibold text-charcoal-dark">{note.author.name}</span>
                  <span className="text-[10px] font-ui text-charcoal/40 uppercase">{note.author.role}</span>
                  <span className="text-[10px] font-ui text-charcoal/30">{formatRelativeDate(note.createdAt)}</span>
                  {isReturn && <span className="text-[10px] font-ui font-bold text-alert-red uppercase">Restituzione</span>}
                </div>
                <p className="text-sm font-ui text-charcoal leading-relaxed whitespace-pre-wrap">
                  {isReturn ? note.body.replace("[Restituzione] ", "") : note.body}
                </p>
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
  SUBMITTED_TO_C: "Sottoposta a C",
  SUBMITTED_TO_A: "Sottoposta ad A",
  SUBMITTED_TO_C_AND_A: "Sottoposta a C e A",
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
            className="btn-primary !py-2.5 !px-5 !bg-alert-red hover:!bg-alert-red/80"
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
