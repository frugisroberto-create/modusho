"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HooSearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/hoo-sop?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="flex max-w-[520px] mx-auto">
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca procedure, documenti, memo..."
        className="flex-1 border border-ivory-dark bg-white px-4 py-3 text-sm font-ui placeholder:text-charcoal/35 focus:outline-none focus:border-terracotta"
        style={{ border: "1px solid #E8E5DC", borderRight: "none", boxShadow: "none" }} />
      <button type="submit" className="btn-primary px-6 py-3 text-xs">CERCA</button>
    </form>
  );
}
