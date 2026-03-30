"use client";

import { useState, useEffect } from "react";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface DepartmentTargetSelectorProps {
  propertyId: string;
  userRole: string;
  userDepartmentId?: string | null;
  selectedDepartmentIds: string[];
  onChange: (departmentIds: string[], allSelected: boolean) => void;
}

export function DepartmentTargetSelector({
  propertyId,
  userRole,
  userDepartmentId,
  selectedDepartmentIds,
  onChange,
}: DepartmentTargetSelectorProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allSelected, setAllSelected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}/departments`);
        if (res.ok) {
          const json = await res.json();
          setDepartments(json.data || []);
        }
      } finally { setLoading(false); }
    };
    if (propertyId) { setLoading(true); fetchDepartments(); }
  }, [propertyId]);

  if (userRole === "HOD") {
    const ownDept = departments.find((d) => d.id === userDepartmentId);
    return (
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparti destinatari</label>
        <div className="border border-ivory-dark bg-ivory-medium/30 px-3 py-2 text-sm text-charcoal">
          {ownDept?.name || "Il tuo reparto"}
        </div>
        <p className="text-xs text-charcoal/40 mt-1">Come Capo Reparto puoi creare contenuti solo per il tuo reparto.</p>
      </div>
    );
  }

  const handleToggleAll = () => {
    if (allSelected) {
      setAllSelected(false);
      onChange([], false);
    } else {
      setAllSelected(true);
      onChange(departments.map((d) => d.id), true);
    }
  };

  const handleToggleDept = (deptId: string) => {
    if (allSelected) {
      const newIds = departments.map((d) => d.id).filter((id) => id !== deptId);
      setAllSelected(false);
      onChange(newIds, false);
    } else {
      const isSelected = selectedDepartmentIds.includes(deptId);
      const newIds = isSelected
        ? selectedDepartmentIds.filter((id) => id !== deptId)
        : [...selectedDepartmentIds, deptId];
      if (newIds.length === departments.length) {
        setAllSelected(true);
        onChange(newIds, true);
      } else {
        onChange(newIds, false);
      }
    }
  };

  if (loading) return <div className="text-sm text-charcoal/40 font-ui">Caricamento reparti...</div>;

  return (
    <div>
      <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparti destinatari</label>
      <label className="flex items-center gap-3 py-2.5 px-3 border border-ivory-dark cursor-pointer hover:bg-ivory-medium/30 transition-colors">
        <input type="checkbox" checked={allSelected} onChange={handleToggleAll} className="w-4 h-4 accent-terracotta" />
        <span className="text-sm font-ui font-medium text-charcoal">Tutti i reparti</span>
      </label>
      <div className="border border-ivory-dark border-t-0 divide-y divide-ivory-dark/50 max-h-[240px] overflow-y-auto">
        {departments.map((dept) => (
          <label key={dept.id} className="flex items-center gap-3 py-2.5 px-3 cursor-pointer hover:bg-ivory-medium/30 transition-colors">
            <input type="checkbox" checked={allSelected || selectedDepartmentIds.includes(dept.id)}
              disabled={allSelected} onChange={() => handleToggleDept(dept.id)}
              className="w-4 h-4 accent-terracotta disabled:opacity-40" />
            <span className="text-sm font-ui text-charcoal">{dept.name}</span>
            <span className="text-xs text-charcoal/40 ml-auto font-ui">{dept.code}</span>
          </label>
        ))}
      </div>
      {!allSelected && selectedDepartmentIds.length === 0 && (
        <p className="text-xs text-alert-red font-ui mt-1.5">Seleziona almeno un reparto destinatario</p>
      )}
      {!allSelected && selectedDepartmentIds.length > 0 && (
        <p className="text-xs text-charcoal/40 font-ui mt-1.5">{selectedDepartmentIds.length} di {departments.length} reparti selezionati</p>
      )}
    </div>
  );
}
