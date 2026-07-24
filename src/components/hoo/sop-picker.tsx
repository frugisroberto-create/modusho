"use client";

import { useState, useEffect, useCallback } from "react";

interface SopItem {
  id: string;
  code: string | null;
  title: string;
  department: { id: string; name: string; code: string } | null;
}

interface SopPickerProps {
  propertyId: string;
  departmentId: string | null;
  onSelect: (sop: SopItem) => void;
  selectedId: string | null;
}

export function SopPicker({ propertyId, departmentId, onSelect, selectedId }: SopPickerProps) {
  const [sops, setSops] = useState<SopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchSops = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/content?propertyId=${propertyId}&type=SOP&status=PUBLISHED&pageSize=50`;
      if (departmentId) url += `&departmentId=${departmentId}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setSops(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [propertyId, departmentId]);

  useEffect(() => { fetchSops(); }, [fetchSops]);

  const filtered = search
    ? sops.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.code?.toLowerCase().includes(search.toLowerCase())
      )
    : sops;

  if (loading) {
    return <div className="h-32 bg-ivory-dark animate-pulse" />;
  }

  return (
    <div>
      <label className="block text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-1">
        Seleziona SOP
      </label>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cerca per titolo o codice..."
        className="w-full px-3 py-2 text-sm font-ui border border-ivory-dark focus:border-terracotta focus:outline-none bg-white mb-2"
      />
      <div className="max-h-[240px] overflow-y-auto border border-ivory-dark bg-white">
        {filtered.length === 0 ? (
          <div className="text-center py-4 text-charcoal/40 font-ui text-sm">
            Nessuna SOP trovata
          </div>
        ) : (
          filtered.map((sop) => (
            <button
              key={sop.id}
              onClick={() => onSelect(sop)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-ivory-medium last:border-b-0 transition-colors ${
                selectedId === sop.id
                  ? "bg-terracotta/5 border-l-2 border-l-terracotta"
                  : "hover:bg-ivory"
              }`}
            >
              <div className="flex-1">
                <span className="font-ui font-medium text-charcoal-dark text-sm">{sop.title}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  {sop.code && <span className="text-[10px] font-ui text-charcoal/40">{sop.code}</span>}
                  {sop.department && <span className="text-[10px] font-ui text-charcoal/40">{sop.department.name}</span>}
                </div>
              </div>
              {selectedId === sop.id && (
                <span className="text-terracotta text-sm">✓</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
