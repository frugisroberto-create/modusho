/* eslint-disable @next/next/no-img-element */

interface HoLogoProps {
  variant: "horizontal" | "vertical" | "symbol";
  color?: "dark" | "light";
  size?: number;
  className?: string;
}

const CONFIG = {
  horizontal: { src: "/images/ho-logo-orizzontale.png", ratio: 709 / 3509, defaultSize: 200 },
  vertical: { src: "/images/ho-logo-verticale.png", ratio: 517 / 842, defaultSize: 200 },
  symbol: { src: "/images/ho-simbolo.png", ratio: 2364 / 1772, defaultSize: 40 },
};

export function HoLogo({ variant, color = "dark", size, className = "" }: HoLogoProps) {
  const cfg = CONFIG[variant];
  const w = size ?? cfg.defaultSize;
  const filterStyle = color === "light" ? { filter: "brightness(0) invert(1)" } : {};

  return (
    <img
      src={cfg.src}
      alt="HO Collection"
      width={w}
      height={Math.round(w * cfg.ratio)}
      style={filterStyle}
      className={className}
    />
  );
}
