"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

interface UserInfo {
  id: string;
  name: string;
  role: string;
  propertyAssignments: {
    id: string;
    property: { id: string; name: string; code: string };
    department: { id: string; name: string; code: string } | null;
  }[];
}

interface TemplateInfo {
  id: string;
  departmentId: string | null;
  department: { id: string; name: string; code: string } | null;
  sectionCount: number;
  isActive: boolean;
}

interface PreviewSection {
  type: string;
  title: string;
  body: string | null;
  fileUrl: string | null;
  contentId: string | null;
  sortOrder: number;
  requiresAck: boolean;
}

const SECTION_ICONS: Record<string, string> = {
  WELCOME: "👋",
  RULES: "📋",
  JOB_DESCRIPTION: "💼",
  DOCUMENT: "📄",
  SOP: "📝",
};

export default function AssignOnboardingPage() {
  const { userId } = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get("propertyId") ?? "";

  const [user, setUser] = useState<UserInfo | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [preview, setPreview] = useState<PreviewSection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");

  // Fetch user and templates
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [userRes, templatesRes] = await Promise.all([
          fetch(`/api/users/${userId}`),
          propertyId ? fetch(`/api/onboarding/templates?propertyId=${propertyId}`) : null,
        ]);

        if (userRes.ok) {
          const json = await userRes.json();
          setUser(json.data);
        }
        if (templatesRes?.ok) {
          const json = await templatesRes.json();
          setTemplates(json.data.templates.filter((t: TemplateInfo) => t.isActive));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, propertyId]);

  // Find matching templates for user's departments
  const userDeptIds = user?.propertyAssignments
    .filter((a) => a.property.id === propertyId && a.department)
    .map((a) => a.department!.id) ?? [];

  const matchingTemplates = templates.filter((t) =>
    t.departmentId === null || userDeptIds.includes(t.departmentId!)
  );

  const isMultiDept = matchingTemplates.length > 1;

  // Get merge preview for multi-dept
  const handlePreview = useCallback(async () => {
    if (!isMultiDept) return;
    const res = await fetch("/api/onboarding/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        propertyId,
        templateIds: matchingTemplates.map((t) => t.id),
        previewMerge: true,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setPreview(json.data.sections);
    }
  }, [userId, propertyId, matchingTemplates, isMultiDept]);

  useEffect(() => {
    if (isMultiDept && matchingTemplates.length > 0 && !preview) {
      handlePreview();
    }
  }, [isMultiDept, matchingTemplates.length, preview, handlePreview]);

  // Assign onboarding
  const handleAssign = async (customSections?: PreviewSection[]) => {
    setAssigning(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        userId,
        propertyId,
        dueDate: dueDate || undefined,
      };

      if (isMultiDept) {
        body.templateIds = matchingTemplates.map((t) => t.id);
        body.customSections = customSections ?? preview;
      } else if (matchingTemplates.length === 1) {
        body.templateId = matchingTemplates[0].id;
      }

      const res = await fetch("/api/onboarding/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push(`/users/${userId}`);
      } else {
        const json = await res.json();
        setError(json.error || "Errore durante l'assegnazione");
      }
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-ivory-dark animate-pulse" />
        <div className="h-64 bg-ivory-dark animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-charcoal/50 font-ui text-sm">Utente non trovato</p>;
  }

  const property = user.propertyAssignments.find((a) => a.property.id === propertyId)?.property;

  return (
    <div className="max-w-3xl">
      <a href={`/users/${userId}`} className="text-[11px] font-ui text-charcoal/40 hover:text-terracotta uppercase tracking-wider">
        ← Torna al profilo
      </a>
      <h1 className="text-2xl font-heading font-medium text-charcoal-dark mt-2 mb-1">
        Assegna Onboarding
      </h1>
      <p className="text-sm font-ui text-charcoal/50 mb-6">
        {user.name} &middot; {property?.name ?? ""}
      </p>

      {matchingTemplates.length === 0 ? (
        <div className="bg-white border border-ivory-dark p-6 text-center">
          <p className="font-ui text-charcoal/50 text-sm mb-3">
            Nessun template di onboarding configurato per i reparti di questo utente.
          </p>
          <a href="/onboarding" className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:underline">
            Configura template
          </a>
        </div>
      ) : (
        <>
          {/* Template info */}
          <div className="bg-white border border-ivory-dark p-5 mb-4">
            <h2 className="text-sm font-heading font-semibold text-charcoal-dark mb-3">
              {isMultiDept ? "Template da unificare" : "Template"}
            </h2>
            {matchingTemplates.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm font-ui text-charcoal">
                  {t.department?.name ?? "Trasversale"}
                </span>
                <span className="text-[11px] font-ui text-charcoal/40">
                  {t.sectionCount} sezioni
                </span>
              </div>
            ))}
          </div>

          {/* Due date */}
          <div className="bg-white border border-ivory-dark p-5 mb-4">
            <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
              Scadenza onboarding (opzionale)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="px-3 py-2 text-sm font-ui border border-ivory-dark focus:border-terracotta focus:outline-none bg-white"
            />
          </div>

          {/* Preview (multi-dept or single) */}
          {(preview || !isMultiDept) && (
            <div className="bg-white border border-ivory-dark p-5 mb-4">
              <h2 className="text-sm font-heading font-semibold text-charcoal-dark mb-3">
                Anteprima percorso
              </h2>
              {isMultiDept && preview ? (
                <div className="space-y-1.5">
                  {preview.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 text-sm font-ui">
                      <span className="text-charcoal/30 text-xs w-5 text-right">{i + 1}.</span>
                      <span>{SECTION_ICONS[s.type] ?? "?"}</span>
                      <span className="text-charcoal">{s.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-ui text-charcoal/50">
                  Il percorso verra clonato dal template con {matchingTemplates[0]?.sectionCount ?? 0} sezioni.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-alert-red/5 border-l-4 border-alert-red px-4 py-3 mb-4">
              <p className="text-sm font-ui text-alert-red">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => handleAssign()}
              disabled={assigning}
              className="px-6 py-2.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-white bg-terracotta hover:bg-terracotta-light transition-colors disabled:opacity-50"
            >
              {assigning ? "Assegnazione..." : "Assegna onboarding"}
            </button>
            <a
              href={`/users/${userId}`}
              className="px-6 py-2.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 border border-ivory-dark hover:border-charcoal/30 transition-colors"
            >
              Annulla
            </a>
          </div>
        </>
      )}
    </div>
  );
}
