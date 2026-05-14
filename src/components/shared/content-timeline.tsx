"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const ROLE_LABELS: Record<string, string> = {
  HOD: "Capo Reparto", HOTEL_MANAGER: "Hotel Manager",
  ADMIN: "HOO", SUPER_ADMIN: "HOO",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Bozza", REVIEW_HM: "In attesa di consultazione", REVIEW_ADMIN: "Da approvare",
  PUBLISHED: "Pubblicato", RETURNED: "Restituito", ARCHIVED: "Archiviato",
};

interface TimelineEvent {
  id: string;
  type: "STATUS_CHANGE" | "REVISION" | "NOTE";
  createdAt: string;
  author: { id: string; name: string; role: string };
  data: Record<string, unknown>;
}

interface ContentTimelineProps {
  contentId: string;
}

export function ContentTimeline({ contentId }: ContentTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/${contentId}/timeline`);
      if (res.ok) { const json = await res.json(); setEvents(json.data); }
    } finally { setLoading(false); }
  }, [contentId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  const handleAddNote = async () => {
    if (!newNote.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/content/${contentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote.trim() }),
      });
      if (res.ok) { setNewNote(""); fetchTimeline(); }
    } finally { setSubmitting(false); }
  };

  const getIcon = (type: string) => {
    if (type === "STATUS_CHANGE") return (
      <div className="w-8 h-8 rounded-full bg-terracotta/10 flex items-center justify-center shrink-0">
        <div className="w-3 h-3 rounded-full bg-terracotta" />
      </div>
    );
    if (type === "REVISION") return (
      <div className="w-8 h-8 rounded-full bg-[#E3F2FD] flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-[#1565C0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </div>
    );
    return (
      <div className="w-8 h-8 rounded-full bg-ivory-dark/50 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-charcoal/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      </div>
    );
  };

  const renderEvent = (event: TimelineEvent) => {
    const roleLabel = ROLE_LABELS[event.author.role] || event.author.role;

    if (event.type === "STATUS_CHANGE") {
      const from = STATUS_LABELS[event.data.fromStatus as string] || event.data.fromStatus;
      const to = STATUS_LABELS[event.data.toStatus as string] || event.data.toStatus;
      return (
        <div>
          <p className="text-sm font-ui text-charcoal">
            <span className="font-medium">{event.author.name}</span>
            <span className="text-xs text-charcoal/45 ml-1">({roleLabel})</span>
          </p>
          <p className="text-sm font-ui text-charcoal/60">
            {event.data.fromStatus ? `${from} → ${to}` : `Creato come ${to}`}
          </p>
          {typeof event.data.note === "string" && event.data.note && <p className="text-sm font-body italic text-charcoal/50 mt-1">{event.data.note}</p>}
        </div>
      );
    }

    if (event.type === "REVISION") {
      const titleChanged = event.data.previousTitle !== event.data.newTitle;
      return (
        <div>
          <p className="text-sm font-ui text-charcoal">
            <span className="font-medium">{event.author.name}</span>
            <span className="text-xs text-charcoal/45 ml-1">({roleLabel})</span>
            <span className="text-[#1565C0] ml-1">— Contenuto modificato</span>
            {titleChanged && <span className="text-xs text-charcoal/45 ml-1">(titolo cambiato)</span>}
          </p>
          {typeof event.data.note === "string" && event.data.note && <p className="text-sm font-body italic text-charcoal/50 mt-1">{event.data.note}</p>}
        </div>
      );
    }

    // NOTE
    return (
      <div>
        <p className="text-sm font-ui text-charcoal">
          <span className="font-medium">{event.author.name}</span>
          <span className="text-xs text-charcoal/45 ml-1">({roleLabel})</span>
        </p>
        <p className="text-sm font-body text-charcoal/70 mt-1 whitespace-pre-wrap">{String(event.data.body)}</p>
      </div>
    );
  };

  if (loading) return <div className="py-8 text-center text-sm text-charcoal/40 font-ui">Caricamento cronologia...</div>;

  return (
    <div className="mt-12">
      <h3 className="font-heading text-lg font-medium text-charcoal-dark mb-6">Cronologia</h3>

      {/* Campo nota */}
      <div className="mb-8 border border-ivory-dark bg-white p-4">
        <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)}
          placeholder="Aggiungi una nota..." rows={3} maxLength={5000}
          className="w-full text-sm font-body resize-none" />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-ui text-charcoal/40">{newNote.length}/5000</span>
          <button onClick={handleAddNote} disabled={!newNote.trim() || submitting}
            className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
            {submitting ? "Invio..." : "Aggiungi nota"}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {events.length === 0 ? (
        <p className="text-sm font-ui text-charcoal/40 text-center py-4">Nessun evento</p>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-ivory-dark" />
          <div className="space-y-6">
            {events.map((event) => (
              <div key={event.id} className="flex gap-4 relative">
                {getIcon(event.type)}
                <div className="flex-1 pb-2">
                  {renderEvent(event)}
                  <p className="text-xs font-ui text-charcoal/40 mt-1">
                    {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true, locale: it })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
