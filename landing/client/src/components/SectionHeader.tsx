import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  badge?: string;
  title: string;
  subtitle?: string;
  className?: string;
  align?: "left" | "center";
  light?: boolean;
}

export function SectionHeader({ 
  badge, 
  title, 
  subtitle, 
  className,
  align = "center",
  light = false
}: SectionHeaderProps) {
  return (
    <div className={cn(
      "max-w-3xl mb-12",
      align === "center" && "mx-auto text-center",
      className
    )}>
      {badge && (
        <span className={cn(
          "inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase mb-4",
          light 
            ? "bg-white/10 text-white border border-white/20" 
            : "bg-primary/10 text-primary border border-primary/20"
        )}>
          {badge}
        </span>
      )}
      <h2 className={cn(
        "text-3xl md:text-4xl font-bold tracking-tight mb-4",
        light ? "text-white" : "text-slate-900"
      )}>
        {title}
      </h2>
      {subtitle && (
        <p className={cn(
          "text-lg",
          light ? "text-slate-300" : "text-slate-600"
        )}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
