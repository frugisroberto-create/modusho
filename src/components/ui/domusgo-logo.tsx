import { HoLogo } from "./ho-logo";

interface DomusGoLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "dark" | "light";
}

export function DomusGoLogo({ size = "md", variant = "dark" }: DomusGoLogoProps) {
  if (size === "sm") {
    return <HoLogo variant="symbol" color={variant} size={24} />;
  }

  if (size === "md") {
    return <HoLogo variant="horizontal" color={variant} size={180} />;
  }

  if (size === "lg") {
    return <HoLogo variant="horizontal" color={variant} size={240} />;
  }

  // xl
  return <HoLogo variant="horizontal" color={variant} size={320} className="max-w-[80vw]" />;
}
