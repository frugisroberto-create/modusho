"use client";

import { useState, useEffect, useCallback } from "react";
import { useOperatorContext } from "./operator-shell";

interface MemoItem {
  id: string; contentId: string; title: string; body: string;
  publishedAt: string | null; author: string; isPinned: boolean; expiresAt: string | null;
}

export function MemoSection() {
  const { currentPropertyId } = useOperatorContext();
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMemos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memo?propertyId=${currentPropertyId}&pageSize=10`);
      if (res.ok) { const json = await res.json(); setMemos(json.data); }
    } finally { setLoading(false); }
  }, [currentPropertyId]);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);

  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-heading font-semibold text-charcoal-dark">Comunicazioni</h2>
        <div className="h-28 skeleton" />
      </section>
    );
  }

  if (memos.length === 0) return null;

  function stripHtml(html: string) { return html.replace(/<[^>]*>/g, ""); }

  return (
    <section id="comunicazioni" className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-charcoal-dark">Comunicazioni</h2>
      <div className="space-y-3">
        {memos.map((memo) => (
          <div
            key={memo.id}
            className="bg-ivory-medium border border-ivory-dark p-5"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-ui font-medium text-charcoal-dark text-sm truncate">
                    {memo.title}
                  </h3>
                </div>
                <p className="text-sm font-ui text-charcoal/70 line-clamp-3">
                  {stripHtml(memo.body)}
                </p>
                <div className="flex items-center gap-3 mt-3 text-xs font-ui text-sage-light">
                  <span>{memo.author}</span>
                  {memo.publishedAt && (
                    <span>{new Date(memo.publishedAt).toLocaleDateString("it-IT")}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
