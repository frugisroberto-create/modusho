"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { OnboardingTemplateEditor } from "@/components/hoo/onboarding-template-editor";

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

export default function OnboardingTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.templateId as string;

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/templates/${templateId}`);
      if (res.ok) {
        const json = await res.json();
        setTemplate(json.data);
      } else if (res.status === 404) {
        router.push("/onboarding");
      }
    } finally {
      setLoading(false);
    }
  }, [templateId, router]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

  if (loading || !template) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-ivory-dark animate-pulse" />
        <div className="h-96 bg-ivory-dark animate-pulse" />
      </div>
    );
  }

  return (
    <OnboardingTemplateEditor
      template={template}
      onUpdate={fetchTemplate}
    />
  );
}
