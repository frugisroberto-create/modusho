/* eslint-disable @next/next/no-img-element */

const PALETTE = ["#964733", "#4E564F", "#7E636B", "#5B7B8A", "#7A3828", "#323E2E"];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface PropertyAvatarProps {
  name: string;
  code: string;
  logoUrl?: string | null;
  size?: number;
}

export function PropertyAvatar({ name, code, logoUrl, size = 48 }: PropertyAvatarProps) {
  if (logoUrl) {
    return <img src={logoUrl} alt={name} width={size} height={size} className="rounded-lg object-contain" />;
  }

  const initials = name.split(" ").filter(w => w.length > 2).map(w => w[0]).join("").substring(0, 2).toUpperCase();
  const color = PALETTE[hashCode(code) % PALETTE.length];

  return (
    <div
      className="rounded-lg flex items-center justify-center font-heading font-semibold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}
