"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DepartmentTargetSelector } from "@/components/shared/department-target-selector";

interface Property {
  id: string; name: string; code: string;
  departments: { id: string; name: string; code: string }[];
}

interface SubmitActions {
  canSendToReview: boolean;
  canPublishDirectly: boolean;
  reviewLabel: string;
}

interface SopFormProps {
  mode: "create" | "edit";
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string; departmentId: string | null };
  userRole?: string;
  userDepartmentId?: string | null;
}

export function SopForm({ mode, contentId, initialData, userRole = "ADMIN", userDepartmentId }: SopFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [propertyId, setPropertyId] = useState(initialData?.propertyId || "");
  const [targetDepartmentIds, setTargetDepartmentIds] = useState<string[]>(
    initialData?.departmentId ? [initialData.departmentId] : []
  );
  const [targetAllDepartments, setTargetAllDepartments] = useState(!initialData?.departmentId);
  const [properties, setProperties] = useState<Property[]>([]);
  const [submitActions, setSubmitActions] = useState<SubmitActions | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const [propRes, actRes] = await Promise.all([
        fetch("/api/properties"),
        fetch("/api/content/submit-actions"),
      ]);
      if (propRes.ok) {
        const json = await propRes.json();
        setProperties(json.data);
        if (!propertyId && json.data.length > 0) setPropertyId(json.data[0].id);
      }
      if (actRes.ok) {
        const json = await actRes.json();
        setSubmitActions(json.data);
      }

      // In edit mode, load existing targets
      if (mode === "edit" && contentId) {
        const targetRes = await fetch(`/api/content/${contentId}`);
        if (targetRes.ok) {
          const targetJson = await targetRes.json();
          const targets = targetJson.data.targetAudience || [];
          const hasRoleTarget = targets.some((t: { targetType: string }) => t.targetType === "ROLE");
          if (hasRoleTarget) {
            setTargetAllDepartments(true);
            setTargetDepartmentIds([]);
          } else {
            const deptIds = targets
              .filter((t: { targetType: string }) => t.targetType === "DEPARTMENT")
              .map((t: { targetDepartmentId: string }) => t.targetDepartmentId);
            setTargetDepartmentIds(deptIds);
            setTargetAllDepartments(false);
          }
        }
      }
    }
    fetchData();
  }, [propertyId, mode, contentId]);

  const handleSubmit = async (action: "draft" | "sendToReview" | "publishDirectly") => {
    if (!title.trim() || !body.trim() || !propertyId) return;
    if (!targetAllDepartments && targetDepartmentIds.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        title, body, propertyId,
        departmentId: targetAllDepartments ? null : (targetDepartmentIds[0] || null),
        targetDepartmentIds: targetAllDepartments ? [] : targetDepartmentIds,
        targetAllDepartments,
        ...(mode === "create" ? { type: "SOP" } : {}),
        sendToReview: action === "sendToReview",
        publishDirectly: action === "publishDirectly",
      };
      const url = mode === "create" ? "/api/content" : `/api/content/${contentId}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/hoo-sop");
        router.refresh();
      }
    } finally { setLoading(false); }
  };

  const isValid = title.trim() && body.trim() && propertyId && (targetAllDepartments || targetDepartmentIds.length > 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full" placeholder="Titolo della SOP" />
      </div>

      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
        <select value={propertyId}
          onChange={(e) => { setPropertyId(e.target.value); setTargetDepartmentIds([]); setTargetAllDepartments(false); }}
          disabled={mode === "edit"} className="w-full disabled:opacity-50">
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {propertyId && (
        <DepartmentTargetSelector
          propertyId={propertyId}
          userRole={userRole}
          userDepartmentId={userDepartmentId}
          selectedDepartmentIds={targetDepartmentIds}
          onChange={(ids, all) => {
            setTargetDepartmentIds(ids);
            setTargetAllDepartments(all);
          }}
        />
      )}

      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={15}
          className="w-full font-mono text-sm" placeholder="Contenuto della SOP (HTML o testo)" />
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={() => handleSubmit("draft")} disabled={loading || !isValid}
          className="btn-outline disabled:opacity-50">
          {loading ? "..." : "Salva come bozza"}
        </button>

        {submitActions?.canSendToReview && (
          <button onClick={() => handleSubmit("sendToReview")} disabled={loading || !isValid}
            className="btn-primary disabled:opacity-50">
            {loading ? "..." : submitActions.reviewLabel}
          </button>
        )}

        {submitActions?.canPublishDirectly && (
          <button onClick={() => handleSubmit("publishDirectly")} disabled={loading || !isValid}
            className="px-7 py-3 text-[12.6px] font-ui font-semibold uppercase tracking-wider text-white bg-sage hover:bg-sage-dark disabled:opacity-50 transition-colors">
            {loading ? "..." : "Pubblica"}
          </button>
        )}

        <button onClick={() => router.back()}
          className="px-7 py-3 text-[12.6px] font-ui text-charcoal/60 hover:text-charcoal transition-colors">
          Annulla
        </button>
      </div>
    </div>
  );
}
