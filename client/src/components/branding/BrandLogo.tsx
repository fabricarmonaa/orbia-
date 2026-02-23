import { cn } from "@/lib/utils";

type LegacyVariant = "login" | "sidebar" | "tracking";
type LogoVariant = "mark" | "full";
type AnyVariant = LogoVariant | LegacyVariant;
type LogoSize = "sm" | "md" | "lg";

type BrandLogoProps = {
  src?: string | null;
  alt?: string;
  brandName?: string;
  variant?: AnyVariant;
  size?: LogoSize;
  className?: string;
  legacyVariant?: LegacyVariant;
};

const sizeMap: Record<LogoSize, string> = {
  sm: "h-8 w-8 p-1",
  md: "h-12 w-12 p-1.5",
  lg: "h-20 w-20 p-2",
};

function normalizeVariant(variant?: AnyVariant, legacyVariant?: LegacyVariant): { variant: LogoVariant; size: LogoSize } {
  const v = variant ?? legacyVariant;
  if (v === "full") return { variant: "full", size: "md" };
  if (v === "login") return { variant: "mark", size: "lg" };
  if (v === "tracking") return { variant: "mark", size: "md" };
  return { variant: "mark", size: "sm" };
}

export function BrandLogo({
  src,
  alt = "Logo",
  brandName = "Orbia",
  variant,
  size,
  className,
  legacyVariant,
}: BrandLogoProps) {
  const normalized = normalizeVariant(variant, legacyVariant);
  const logoVariant = normalized.variant;
  const logoSize = size || normalized.size;

  return (
    <div
      className={cn(
        "overflow-hidden bg-transparent border border-white/10 shadow-sm flex items-center justify-center",
        logoVariant === "full" ? "rounded-md px-3" : "rounded-md",
        logoVariant === "full" ? "h-10 min-w-[140px]" : sizeMap[logoSize],
        className
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      ) : logoVariant === "full" ? (
        <span className="font-semibold text-sm text-foreground">{brandName}</span>
      ) : (
        <span className="font-bold text-sm text-primary">{brandName.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
