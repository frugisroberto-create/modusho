"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useOperatorContext } from "./operator-shell";
import { MobileHide } from "@/components/mobile-hide";
import { LiveSearchBar } from "@/components/shared/live-search-bar";
import {
  applyAcknowledged,
  applyDepartment,
  applyPage,
  applyProperty,
  applyQuery,
  buildListQuery,
  parseListState,
  reconcileDepartment,
  type ListState,
} from "@/lib/list-url-state";

interface ContentItem {
  id: string; code: string | null; type: string; title: string; publishedAt: string | null;
  department: { id: string; name: string; code: string } | null;
  property: { id: string; name: string; code: string };
  acknowledged: boolean | null; acknowledgedAt: string | null;
}

interface Department { id: string; name: string; code: string }

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "badge-sop" },
  DOCUMENT: { label: "Documento", cls: "badge-document" },
};

interface ContentListProps {
  contentType: "SOP" | "DOCUMENT";
  detailPath: string;
  title: string;
  description?: string;
  createPath?: string;
  createLabel?: string;
  searchPlaceholder?: string;
}

export function ContentList({ contentType, detailPath, title, description, createPath, createLabel, searchPlaceholder }: ContentListProps) {
  const { currentPropertyId, userRole } = useOperatorContext();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // HOD può creare DOCUMENT/MEMO direttamente (limitato al proprio reparto)
  // e può creare SOP attraverso il workflow RACI
  const canCreate = ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  // ── Stato dei filtri ──────────────────────────────────────────────────────
  // Un solo oggetto, seminato UNA VOLTA dall'indirizzo (initializer lazy: gli
  // argomenti dei render successivi non lo rileggono). Da qui in poi la
  // direzione è unica, stato → URL: l'indirizzo non rialimenta mai lo stato,
  // quindi l'effect che scrive e il fetch che osserva non possono rincorrersi.
  const [state, setState] = useState<ListState>(() =>
    parseListState(searchParams, currentPropertyId)
  );

  const [items, setItems] = useState<ContentItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deptsLoaded, setDeptsLoaded] = useState(false);
  const pageSize = 20;

  const roleRequiresSpecificDept = userRole === "OPERATOR" || userRole === "HOD";

  // ── Unico punto che scrive l'indirizzo ────────────────────────────────────
  // `replaceState` SOSTITUISCE la voce di cronologia corrente invece di
  // aggiungerne una: dopo dieci filtraggi il tasto indietro esce dalla pagina
  // in un colpo solo. È l'API nativa, supportata da Next dalla 14.1, e non
  // provoca il giro RSC che `router.replace` comporterebbe a ogni filtro.
  useEffect(() => {
    const url = `${pathname}?${buildListQuery(state)}`;
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url);
    }
  }, [state, pathname]);

  // La struttura la governa la shell. Qui si recepisce, saltando il primo giro:
  // al mount lo stato è già allineato e reagire lo azzererebbe, cancellando i
  // filtri di un link condiviso.
  const knownPropertyRef = useRef(currentPropertyId);
  useEffect(() => {
    if (knownPropertyRef.current === currentPropertyId) return;
    knownPropertyRef.current = currentPropertyId;
    setState((s) => applyProperty(s, currentPropertyId));
  }, [currentPropertyId]);

  // Elenco reparti accessibili (filtrato RBAC lato server).
  useEffect(() => {
    let cancelled = false;
    setDeptsLoaded(false);
    async function fetchDepts() {
      let depts: Department[] = [];
      const res = await fetch(`/api/my-departments?propertyId=${currentPropertyId}`);
      if (res.ok) {
        const json = await res.json();
        depts = json.data;
      }
      if (cancelled) return;
      setDepartments(depts);
      setState((s) => reconcileDepartment(s, depts.map((d) => d.id), roleRequiresSpecificDept));
      setDeptsLoaded(true);
    }
    fetchDepts();
    return () => { cancelled = true; };
  }, [currentPropertyId, roleRequiresSpecificDept]);

  // ── Fetch contenuti ───────────────────────────────────────────────────────
  // Attende `deptsLoaded`: è ciò che evita il secondo fetch al primo
  // caricamento per OPERATOR/HOD con un reparto solo (prima il filtro veniva
  // impostato DOPO una prima richiesta già partita) e impedisce di interrogare
  // l'API con un reparto fuori perimetro arrivato da un link condiviso.
  useEffect(() => {
    if (!deptsLoaded) { setLoading(true); return; }
    let cancelled = false;
    async function fetchContent() {
      setLoading(true);
      const params = new URLSearchParams({
        type: contentType, propertyId: state.propertyId, status: "PUBLISHED",
        page: state.page.toString(), pageSize: pageSize.toString(),
      });
      if (state.departmentId) params.set("departmentId", state.departmentId);
      if (state.acknowledged) params.set("acknowledged", state.acknowledged);
      try {
        const res = await fetch(`/api/content?${params}`);
        if (res.ok) {
          const json = await res.json();
          if (cancelled) return;
          setItems(json.data); setTotal(json.meta.total);
        }
      } finally { if (!cancelled) setLoading(false); }
    }
    fetchContent();
    return () => { cancelled = true; };
  }, [contentType, deptsLoaded, state.propertyId, state.departmentId, state.acknowledged, state.page]);

  const totalPages = Math.ceil(total / pageSize);

  // Un link condiviso può puntare a una pagina che nel perimetro di chi lo
  // riceve non esiste: si rientra sull'ultima disponibile invece di mostrare
  // una lista vuota.
  useEffect(() => {
    if (loading || total === 0 || totalPages === 0) return;
    if (state.page > totalPages) setState((s) => applyPage(s, totalPages));
  }, [loading, total, totalPages, state.page]);

  // ── Ritorno dal dettaglio ─────────────────────────────────────────────────
  // `focus` arriva dall'indirizzo per ENTRAMBE le strade di ritorno: il tasto
  // indietro perché il click sulla voce lo aveva scritto nella voce di
  // cronologia della lista, il link del percorso perché se lo porta dietro in
  // `?back=`. Un solo meccanismo, un solo punto di ripristino.
  const restoredFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !state.focus) return;
    if (restoredFocusRef.current === state.focus) return;
    const el = document.querySelector(`[data-list-item="${CSS.escape(state.focus)}"]`);
    if (!el) return;
    restoredFocusRef.current = state.focus;
    el.scrollIntoView({ block: "center" });
  }, [loading, items, state.focus]);

  return (
    // `data-list-query` espone lo stato EFFETTIVAMENTE applicato: è lo stesso
    // valore che finisce nell'indirizzo e che alimenta la query all'API, quindi
    // mostrato e applicato non possono divergere in silenzio. La guardia
    // automatica ci si appoggia (list-url-state.test.ts, U2).
    <div className="space-y-5 py-6" data-list-query={buildListQuery(state)}>
      {/* Header: titolo + bottone */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-medium text-charcoal-dark">{title}</h1>
          {description && <p className="text-[13px] font-ui text-charcoal/50 mt-1">{description}</p>}
        </div>
        {canCreate && createPath && (
          <MobileHide>
            <Link href={createPath} className="btn-primary">
              {createLabel || "Nuovo"}
            </Link>
          </MobileHide>
        )}
      </div>

      {/* Search bar — full-text con dropdown live. Controllata: il testo vive
          nell'indirizzo e torna al suo posto al ritorno dal dettaglio. La
          ricerca NON viene rilanciata da sola: riaprire un pannello a
          scomparsa sopra la lista contraddirebbe il riposizionamento. */}
      <LiveSearchBar
        propertyId={state.propertyId}
        contentType={contentType}
        status="PUBLISHED"
        placeholder={searchPlaceholder || (contentType === "SOP" ? "Cerca una procedura..." : "Cerca un documento...")}
        value={state.q}
        onValueChange={(q) => setState((s) => applyQuery(s, q))}
      />

      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Reparto</label>
          <select value={state.departmentId} onChange={(e) => setState((s) => applyDepartment(s, e.target.value))}
            className="text-sm font-ui border-ivory-dark px-3 py-2 bg-white"
            disabled={roleRequiresSpecificDept && departments.length <= 1}>
            {!roleRequiresSpecificDept && <option value="">Tutti i reparti</option>}
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Stato</label>
          <select value={state.acknowledged} onChange={(e) => setState((s) => applyAcknowledged(s, e.target.value as ListState["acknowledged"]))}
            className="text-sm font-ui border-ivory-dark px-3 py-2 bg-white">
            <option value="">Tutti gli stati</option>
            <option value="false">Da leggere</option>
            <option value="true">Letti</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-20 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-charcoal/40 font-ui">Nessun contenuto trovato</div>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {items.map((item, index) => {
            const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
            // Lo stato della lista viaggia con il link: `back` lo consegna al
            // percorso in alto nel dettaglio, `focus` marca la voce da
            // ritrovare. Sono la stessa stringa, così le due strade di ritorno
            // ricostruiscono lo stesso indirizzo.
            const listQuery = buildListQuery({ ...state, focus: item.id });
            const isFocused = state.focus === item.id;
            return (
              <Link key={item.id} href={`/${detailPath}/${item.id}?back=${encodeURIComponent(listQuery)}`}
                data-list-item={item.id}
                onClick={(e) => {
                  // Solo il click semplice: cmd/ctrl-click apre in una nuova
                  // scheda e non deve toccare la cronologia di questa.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  // SINCRONO e PRIMA della navigazione (Link invoca l'onClick
                  // dell'utente prima del proprio push): così `focus` finisce
                  // nella voce di cronologia della LISTA, che è quella su cui
                  // il tasto indietro riporterà.
                  window.history.replaceState(null, "", `${pathname}?${listQuery}`);
                  setState((s) => ({ ...s, focus: item.id }));
                }}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-ivory transition-colors ${index < items.length - 1 ? "border-b border-ivory-medium" : ""} ${isFocused ? "bg-ivory ring-1 ring-inset ring-terracotta/40" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                    <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 ${badge.cls}`}>{badge.label}</span>
                    {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                    {item.acknowledged === false && (
                      <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-terracotta/10 text-terracotta">Da leggere</span>
                    )}
                    {item.acknowledged === true && (
                      <span className="text-[10px] font-ui uppercase tracking-wider px-2 py-0.5 bg-[#E8F5E9] text-[#2E7D32]">Letto</span>
                    )}
                  </div>
                  <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
                  <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45 mt-1">
                    {item.code && <span className="font-semibold text-terracotta">{item.code}</span>}
                    {item.publishedAt && <span>{new Date(item.publishedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    {item.acknowledged && item.acknowledgedAt && (
                      <span className="text-[#2E7D32]">Letto il {new Date(item.acknowledgedAt).toLocaleDateString("it-IT")}</span>
                    )}
                  </div>
                </div>
                <svg className="w-5 h-5 text-charcoal/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
          <p className="text-sm font-ui text-charcoal/45">{total} risultat{total === 1 ? "o" : "i"} — Pagina {state.page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setState((s) => applyPage(s, s.page - 1))} disabled={state.page <= 1}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 transition-colors">
              Precedente
            </button>
            <button onClick={() => setState((s) => applyPage(s, Math.min(totalPages, s.page + 1)))} disabled={state.page >= totalPages}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 transition-colors">
              Successivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
