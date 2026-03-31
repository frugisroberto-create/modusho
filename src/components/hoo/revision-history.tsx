"use client";

import { useState, useEffect } from "react";
import { computeParagraphDiff } from "@/lib/text-diff";

interface Revision {
  id: string;
  previousTitle: string;
  previousBody: string;
  newTitle: string;
  newBody: string;
  note: string | null;
  status: string;
  createdAt: string;
  revisedBy: { id: string; name: string; role: string };
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "HOO", cls: "bg-charcoal-dark text-white" },
  ADMIN: { label: "HOO", cls: "bg-sage text-white" },
  HOTEL_MANAGER: { label: "HM", cls: "bg-terracotta text-white" },
  HOD: { label: "HOD", cls: "bg-mauve text-white" },
};

const STATUS_LABEL: Record<string, string> = {
  REVIEW_HM: "Durante review HM",
  REVIEW_ADMIN: "Durante review HOO",
  PUBLISHED: "Post-pubblicazione",
};

interface RevisionHistoryProps {
  contentId: string;
}

export function RevisionHistory({ contentId }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [expandedRevision, setExpandedRevision] = useState<string | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/content/${contentId}/revisions`);
        if (res.ok) { const json = await res.json(); setRevisions(json.data); }
      } finally { setLoading(false); }
    }
    fetch_();
  }, [contentId]);

  if (loading || revisions.length === 0) return null;

  return (
    <section className="bg-ivory-medium border border-ivory-dark">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-ivory-dark/30 transition-colors">
        <h2 className="text-base font-heading font-medium text-charcoal-dark">
          Cronologia revisioni ({revisions.length})
        </h2>
        <svg className={`w-4 h-4 text-sage-light transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-ivory-dark divide-y divide-ivory-dark/50">
          {revisions.map((rev) => {
            const roleBadge = ROLE_BADGE[rev.revisedBy.role] || { label: rev.revisedBy.role, cls: "bg-ivory-dark text-charcoal" };
            const titleChanged = rev.previousTitle !== rev.newTitle;
            const bodyChanged = rev.previousBody !== rev.newBody;
            const isExpanded = expandedRevision === rev.id;

            return (
              <div key={rev.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${roleBadge.cls}`}>
                      {roleBadge.label}
                    </span>
                    <span className="text-sm font-ui font-medium text-charcoal-dark">{rev.revisedBy.name}</span>
                    <span className="text-[11px] font-ui text-charcoal/45">
                      {STATUS_LABEL[rev.status] || rev.status}
                    </span>
                  </div>
                  <span className="text-[11px] font-ui text-charcoal/45">
                    {new Date(rev.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {rev.note && (
                  <p className="text-sm font-body italic text-charcoal/60 mb-2">{rev.note}</p>
                )}

                {titleChanged && (
                  <div className="text-sm font-ui mb-2">
                    <span className="text-charcoal/45">Titolo: </span>
                    <span className="line-through bg-[#FECACA] text-[#991B1B] px-1">{rev.previousTitle}</span>
                    <span className="mx-1 text-charcoal/30">&rarr;</span>
                    <span className="bg-[#D1FAE5] text-[#065F46] px-1">{rev.newTitle}</span>
                  </div>
                )}

                {bodyChanged && (
                  <div>
                    <button onClick={() => setExpandedRevision(isExpanded ? null : rev.id)}
                      className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:text-terracotta-light transition-colors mb-2">
                      {isExpanded ? "Nascondi diff" : "Mostra diff corpo"}
                    </button>
                    {isExpanded && (
                      <DiffView oldText={rev.previousBody} newText={rev.newBody} />
                    )}
                  </div>
                )}

                {!titleChanged && !bodyChanged && (
                  <p className="text-sm font-ui text-charcoal/45">Nessuna modifica al contenuto</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const blocks = computeParagraphDiff(oldText, newText);

  return (
    <div className="space-y-1 text-sm font-ui">
      {blocks.map((block, i) => {
        if (block.type === "unchanged") {
          return <p key={i} className="text-charcoal/40 py-0.5">{block.text}</p>;
        }
        if (block.type === "removed") {
          return <p key={i} className="bg-[#FECACA] text-[#991B1B] line-through py-0.5 px-2">{block.text}</p>;
        }
        return <p key={i} className="bg-[#D1FAE5] text-[#065F46] py-0.5 px-2">{block.text}</p>;
      })}
    </div>
  );
}
