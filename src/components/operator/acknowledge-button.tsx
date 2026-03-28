"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AcknowledgeButtonProps {
  contentId: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

export function AcknowledgeButton({ contentId, acknowledged, acknowledgedAt }: AcknowledgeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(acknowledged);
  const [doneAt, setDoneAt] = useState(acknowledgedAt);

  if (done) {
    return (
      <div className="flex items-center gap-2 px-5 py-3.5 bg-sage/10 border border-sage/20 rounded-lg">
        <svg className="w-5 h-5 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-ui text-sage">
          Presa visione confermata il{" "}
          {doneAt ? new Date(doneAt).toLocaleString("it-IT") : ""}
        </span>
      </div>
    );
  }

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}/acknowledge`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setDone(true);
        setDoneAt(json.data.acknowledgedAt);
        router.refresh();
      }
    } finally { setLoading(false); }
  };

  return (
    <button onClick={handleAcknowledge} disabled={loading}
      className="px-6 py-3 text-sm font-ui font-semibold text-white bg-terracotta rounded-lg hover:bg-terracotta-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
      {loading ? "Conferma in corso..." : "Confermo presa visione"}
    </button>
  );
}
