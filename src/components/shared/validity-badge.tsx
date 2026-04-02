"use client";

import { getValidityStatus, formatExpiryInfo, type ValidityStatus } from "@/lib/sop-workflow";

const STATUS_CONFIG: Record<ValidityStatus, { label: string; cls: string } | null> = {
  VALID: { label: "Valida", cls: "bg-[#E8F5E9] text-[#2E7D32]" },
  EXPIRING: { label: "In scadenza", cls: "bg-[#FFF3E0] text-[#E65100]" },
  EXPIRED: { label: "Scaduta", cls: "bg-[#FECACA] text-[#991B1B]" },
  UNKNOWN: null,
};

interface Props {
  reviewDueDate: string | null;
  showDate?: boolean;
  size?: "sm" | "md";
}

export function ValidityBadge({ reviewDueDate, showDate = false, size = "sm" }: Props) {
  const status = getValidityStatus(reviewDueDate);
  const config = STATUS_CONFIG[status];

  if (!config) return null;

  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${textSize} font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${config.cls}`}>
        {config.label}
      </span>
      {showDate && reviewDueDate && (
        <span className={`${textSize} font-ui text-charcoal/45`}>
          {formatExpiryInfo(reviewDueDate)}
        </span>
      )}
    </span>
  );
}
