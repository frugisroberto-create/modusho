"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useHooContext } from "@/components/hoo/hoo-shell";

interface TemplateInfo {
  id: string;
  propertyId: string;
  departmentId: string | null;
  department: { id: string; name: string; code: string } | null;
  isActive: boolean;
  sectionCount: number;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string;
}

interface DepartmentInfo {
  id: string;
  name: string;
  code: string;
}

export default function OnboardingPage() {
  const { currentPropertyId, properties } = useHooContext();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  const selectedPropertyId = currentPropertyId || properties[0]?.id;

  const fetchData = useCallback(async () => {
    if (!selectedPropertyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/templates?propertyId=${selectedPropertyId}`);
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.data.templates);
        setDepartments(json.data.departments);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (departmentId: string | null) => {
    if (!selectedPropertyId) return;
    setCreating(departmentId ?? "__cross__");
    try {
      const res = await fetch("/api/onboarding/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: selectedPropertyId, departmentId }),
      });
      if (res.ok) {
        const json = await res.json();
        window.location.href = `/onboarding/${json.data.id}`;
      } else if (res.status === 409) {
        const json = await res.json();
        window.location.href = `/onboarding/${json.existingId}`;
      }
    } finally {
      setCreating(null);
    }
  };

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  if (!selectedPropertyId) {
    return (
      <div className="text-center py-16 text-charcoal/50 font-ui text-sm">
        Seleziona una struttura per gestire i template di onboarding.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-medium text-charcoal-dark">
            Onboarding
          </h1>
          {selectedProperty && (
            <p className="text-sm font-ui text-charcoal/50 mt-1">
              Template per {selectedProperty.name}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-ivory-dark animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {departments.map((dept) => {
            const template = templates.find((t) => t.departmentId === dept.id);
            return (
              <DepartmentRow
                key={dept.id}
                department={dept}
                template={template}
                creating={creating === dept.id}
                onCreate={() => handleCreate(dept.id)}
              />
            );
          })}

          {/* Cross-department template */}
          {(() => {
            const crossTemplate = templates.find((t) => t.departmentId === null);
            return (
              <DepartmentRow
                key="__cross__"
                department={{ id: "__cross__", name: "Trasversale (tutti i reparti)", code: "ALL" }}
                template={crossTemplate}
                creating={creating === "__cross__"}
                onCreate={() => handleCreate(null)}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}

function DepartmentRow({
  department,
  template,
  creating,
  onCreate,
}: {
  department: DepartmentInfo;
  template?: TemplateInfo;
  creating: boolean;
  onCreate: () => void;
}) {
  const hasTemplate = !!template;

  return (
    <div className="flex items-center justify-between bg-white border border-ivory-dark px-6 py-4">
      <div className="flex items-center gap-4">
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            hasTemplate ? "bg-sage-dark" : "bg-ivory-dark"
          }`}
        />
        <div>
          <p className="font-ui font-medium text-charcoal-dark text-sm">
            {department.name}
          </p>
          {hasTemplate && (
            <p className="text-[11px] font-ui text-charcoal/40 mt-0.5">
              {template.sectionCount} sezioni — aggiornato{" "}
              {new Date(template.updatedAt).toLocaleDateString("it-IT")}
              {template.updatedBy && ` da ${template.updatedBy.name}`}
            </p>
          )}
        </div>
      </div>

      {hasTemplate ? (
        <Link
          href={`/onboarding/${template.id}`}
          className="px-4 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors"
        >
          Modifica
        </Link>
      ) : (
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-white bg-terracotta hover:bg-terracotta-light transition-colors disabled:opacity-50"
        >
          {creating ? "Creazione..." : "Configura"}
        </button>
      )}
    </div>
  );
}
