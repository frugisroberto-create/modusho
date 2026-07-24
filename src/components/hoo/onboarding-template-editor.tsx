"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SopPicker } from "./sop-picker";

const SopEditor = dynamic(
  () => import("@/components/shared/sop-editor").then((m) => m.SopEditor),
  { ssr: false, loading: () => <div className="h-[200px] bg-ivory-dark animate-pulse" /> }
);

// ─── Types ───────────────────────────────────────────────────────────

interface SectionData {
  id: string;
  type: string;
  title: string;
  body: string | null;
  fileUrl: string | null;
  contentId: string | null;
  content: { id: string; code: string; title: string; status: string; type: string } | null;
  sortOrder: number;
  requiresAck: boolean;
}

interface TemplateData {
  id: string;
  propertyId: string;
  departmentId: string | null;
  isActive: boolean;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  sections: SectionData[];
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
  updatedAt: string;
}

interface Props {
  template: TemplateData;
  onUpdate: () => void;
}

type SectionType = "WELCOME" | "RULES" | "JOB_DESCRIPTION" | "DOCUMENT" | "SOP";

const SECTION_TYPE_CONFIG: Record<SectionType, { label: string; icon: string; color: string }> = {
  WELCOME: { label: "Benvenuto", icon: "👋", color: "bg-sage-dark/10 text-sage-dark" },
  RULES: { label: "Regole", icon: "📋", color: "bg-terracotta/10 text-terracotta" },
  JOB_DESCRIPTION: { label: "Job Description", icon: "💼", color: "bg-mauve/10 text-mauve" },
  DOCUMENT: { label: "Documento", icon: "📄", color: "bg-info/10 text-info" },
  SOP: { label: "SOP", icon: "📝", color: "bg-terracotta/10 text-terracotta" },
};

// ─── Main Component ──────────────────────────────────────────────────

export function OnboardingTemplateEditor({ template, onUpdate }: Props) {
  const [sections, setSections] = useState<SectionData[]>(template.sections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<SectionType | null>(null);
  const [saving, setSaving] = useState(false);

  const maxSops = template.departmentId ? 10 : 15;
  const currentSopCount = sections.filter((s) => s.type === "SOP").length;

  // ─── Add section ───────────────────────────────────────────────────

  const handleAddSection = useCallback(async (type: SectionType, data: { title: string; body?: string; fileUrl?: string; contentId?: string }) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding/templates/${template.id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: data.title,
          body: data.body ?? null,
          fileUrl: data.fileUrl ?? null,
          contentId: data.contentId ?? null,
          sortOrder: sections.length,
          requiresAck: true,
        }),
      });
      if (res.ok) {
        setAddingType(null);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  }, [template.id, sections.length, onUpdate]);

  // ─── Update section ────────────────────────────────────────────────

  const handleUpdateSection = useCallback(async (sectionId: string, data: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding/templates/${template.id}/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditingId(null);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  }, [template.id, onUpdate]);

  // ─── Delete section ────────────────────────────────────────────────

  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (!confirm("Rimuovere questa sezione dal template?")) return;
    const res = await fetch(`/api/onboarding/templates/${template.id}/sections/${sectionId}`, {
      method: "DELETE",
    });
    if (res.ok) onUpdate();
  }, [template.id, onUpdate]);

  // ─── Reorder ───────────────────────────────────────────────────────

  const handleMove = useCallback(async (index: number, direction: "up" | "down") => {
    const newSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;

    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setSections(newSections);

    await fetch(`/api/onboarding/templates/${template.id}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: newSections.map((s, i) => ({ id: s.id, sortOrder: i })),
      }),
    });
  }, [sections, template.id]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/onboarding" className="text-[11px] font-ui text-charcoal/40 hover:text-terracotta uppercase tracking-wider">
            ← Torna alla lista
          </Link>
          <h1 className="text-2xl font-heading font-medium text-charcoal-dark mt-2">
            Template Onboarding — {template.department?.name ?? "Trasversale"}
          </h1>
          <p className="text-sm font-ui text-charcoal/50 mt-1">
            {template.property.name} &middot; {sections.length} sezioni
          </p>
        </div>
      </div>

      {/* Section list */}
      <div className="space-y-3 mb-8">
        {sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            totalSections={sections.length}
            isEditing={editingId === section.id}
            saving={saving}
            propertyId={template.propertyId}
            departmentId={template.departmentId}
            onEdit={() => setEditingId(editingId === section.id ? null : section.id)}
            onUpdate={(data) => handleUpdateSection(section.id, data)}
            onDelete={() => handleDeleteSection(section.id)}
            onMoveUp={() => handleMove(index, "up")}
            onMoveDown={() => handleMove(index, "down")}
          />
        ))}

        {sections.length === 0 && !addingType && (
          <div className="text-center py-12 text-charcoal/40 font-ui text-sm border border-dashed border-ivory-dark bg-white">
            Nessuna sezione configurata. Aggiungi la prima sezione qui sotto.
          </div>
        )}
      </div>

      {/* Add section form */}
      {addingType ? (
        <AddSectionForm
          type={addingType}
          propertyId={template.propertyId}
          departmentId={template.departmentId}
          saving={saving}
          onSave={(data) => handleAddSection(addingType, data)}
          onCancel={() => setAddingType(null)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SECTION_TYPE_CONFIG) as SectionType[]).map((type) => {
            const config = SECTION_TYPE_CONFIG[type];
            const disabled = type === "SOP" && currentSopCount >= maxSops;
            return (
              <button
                key={type}
                onClick={() => setAddingType(type)}
                disabled={disabled}
                className="px-4 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider border border-ivory-dark hover:border-terracotta hover:text-terracotta transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white"
              >
                {config.icon} Aggiungi {config.label}
                {type === "SOP" && ` (${currentSopCount}/${maxSops})`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section Row ─────────────────────────────────────────────────────

function SectionRow({
  section,
  index,
  totalSections,
  isEditing,
  saving,
  propertyId,
  departmentId,
  onEdit,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  section: SectionData;
  index: number;
  totalSections: number;
  isEditing: boolean;
  saving: boolean;
  propertyId: string;
  departmentId: string | null;
  onEdit: () => void;
  onUpdate: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const config = SECTION_TYPE_CONFIG[section.type as SectionType] ?? { label: section.type, icon: "?", color: "bg-ivory-dark" };

  return (
    <div className="bg-white border border-ivory-dark">
      {/* Row header */}
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Sort controls */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0}
            className="text-charcoal/30 hover:text-charcoal disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none">
            ▲
          </button>
          <button onClick={onMoveDown} disabled={index === totalSections - 1}
            className="text-charcoal/30 hover:text-charcoal disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none">
            ▼
          </button>
        </div>

        {/* Type badge */}
        <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${config.color}`}>
          {config.icon} {config.label}
        </span>

        {/* Title */}
        <span className="font-ui font-medium text-charcoal-dark text-sm flex-1 truncate">
          {section.title}
        </span>

        {/* SOP code */}
        {section.content && (
          <span className="text-[11px] font-ui text-charcoal/40">
            {section.content.code}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit}
            className="text-[11px] font-ui font-medium text-terracotta hover:underline">
            {isEditing ? "Chiudi" : "Modifica"}
          </button>
          <button onClick={onDelete}
            className="text-[11px] font-ui font-medium text-alert-red/60 hover:text-alert-red">
            Rimuovi
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      {isEditing && (
        <div className="border-t border-ivory-dark px-5 py-4">
          <SectionEditForm
            section={section}
            saving={saving}
            propertyId={propertyId}
            departmentId={departmentId}
            onSave={onUpdate}
          />
        </div>
      )}
    </div>
  );
}

// ─── Section Edit Form ───────────────────────────────────────────────

function SectionEditForm({
  section,
  saving,
  propertyId,
  departmentId,
  onSave,
}: {
  section: SectionData;
  saving: boolean;
  propertyId: string;
  departmentId: string | null;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [body, setBody] = useState(section.body ?? "");
  const [fileUrl, setFileUrl] = useState(section.fileUrl ?? "");

  const type = section.type as SectionType;
  const hasRichText = type === "WELCOME" || type === "RULES" || type === "JOB_DESCRIPTION";

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
          Titolo
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 text-sm font-ui border border-ivory-dark focus:border-terracotta focus:outline-none bg-white"
        />
      </div>

      {hasRichText && (
        <div>
          <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
            Contenuto
          </label>
          <SopEditor content={body} onChange={setBody} minHeight="200px" />
        </div>
      )}

      {type === "DOCUMENT" && (
        <div>
          <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
            URL Documento
          </label>
          <input
            type="text"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="URL del file (es. link S3, Google Drive, ecc.)"
            className="w-full px-3 py-2 text-sm font-ui border border-ivory-dark focus:border-terracotta focus:outline-none bg-white"
          />
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => onSave({ title, body: hasRichText ? body : undefined, fileUrl: type === "DOCUMENT" ? fileUrl : undefined })}
          disabled={saving || !title.trim()}
          className="px-5 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-white bg-terracotta hover:bg-terracotta-light transition-colors disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva"}
        </button>
      </div>
    </div>
  );
}

// ─── Add Section Form ────────────────────────────────────────────────

function AddSectionForm({
  type,
  propertyId,
  departmentId,
  saving,
  onSave,
  onCancel,
}: {
  type: SectionType;
  propertyId: string;
  departmentId: string | null;
  saving: boolean;
  onSave: (data: { title: string; body?: string; fileUrl?: string; contentId?: string }) => void;
  onCancel: () => void;
}) {
  const config = SECTION_TYPE_CONFIG[type];
  const [title, setTitle] = useState(config.label);
  const [body, setBody] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [selectedSopId, setSelectedSopId] = useState<string | null>(null);
  const [selectedSopTitle, setSelectedSopTitle] = useState("");

  const hasRichText = type === "WELCOME" || type === "RULES" || type === "JOB_DESCRIPTION";

  const handleSave = () => {
    if (type === "SOP") {
      if (!selectedSopId) return;
      onSave({ title: selectedSopTitle || title, contentId: selectedSopId });
    } else if (type === "DOCUMENT") {
      onSave({ title, fileUrl });
    } else {
      onSave({ title, body });
    }
  };

  return (
    <div className="bg-white border border-terracotta p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${config.color}`}>
          {config.icon} Nuova sezione: {config.label}
        </span>
        <button onClick={onCancel} className="text-[11px] font-ui text-charcoal/40 hover:text-charcoal">
          Annulla
        </button>
      </div>

      {type === "SOP" ? (
        <SopPicker
          propertyId={propertyId}
          departmentId={departmentId}
          onSelect={(sop) => {
            setSelectedSopId(sop.id);
            setSelectedSopTitle(sop.title);
          }}
          selectedId={selectedSopId}
        />
      ) : (
        <>
          <div>
            <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
              Titolo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm font-ui border border-ivory-dark focus:border-terracotta focus:outline-none bg-white"
            />
          </div>

          {hasRichText && (
            <div>
              <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
                Contenuto
              </label>
              <SopEditor content={body} onChange={setBody} minHeight="200px" />
            </div>
          )}

          {type === "DOCUMENT" && (
            <div>
              <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
                URL Documento
              </label>
              <input
                type="text"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="URL del file"
                className="w-full px-3 py-2 text-sm font-ui border border-ivory-dark focus:border-terracotta focus:outline-none bg-white"
              />
            </div>
          )}
        </>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || (type === "SOP" ? !selectedSopId : !title.trim())}
          className="px-5 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-white bg-terracotta hover:bg-terracotta-light transition-colors disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Aggiungi"}
        </button>
      </div>
    </div>
  );
}
