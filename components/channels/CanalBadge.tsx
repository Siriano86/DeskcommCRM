import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WhatsappLogo, InstagramLogo, TelegramLogo, Phone } from "@/lib/ui/icons";
import { aparenciaDoCanal } from "@/lib/channels/aparencia";

export interface CanalBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  provider?: string | null;
  label?: string | null;
  compact?: boolean;
}

export function CanalBadge({
  provider,
  label,
  compact = false,
  className,
  ...props
}: CanalBadgeProps) {
  const ap = aparenciaDoCanal(provider);

  let icon = <Phone size={9} weight="regular" className="shrink-0" aria-hidden />;
  if (ap.tipo === "instagram") {
    icon = <InstagramLogo size={10} weight="bold" className="shrink-0 text-pink-500" aria-hidden />;
  } else if (ap.tipo === "telegram") {
    icon = <TelegramLogo size={10} weight="bold" className="shrink-0 text-sky-500" aria-hidden />;
  } else if (ap.tipo === "whatsapp") {
    icon = <WhatsappLogo size={10} weight="fill" className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  }

  const texto = label || ap.nomePadrao;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-4 gap-1 px-1.5 text-[10px] font-medium transition-colors",
        ap.badgeClasses,
        className,
      )}
      title={label ? `${ap.nomePadrao}: ${label}` : ap.nomePadrao}
      {...props}
    >
      {icon}
      {!compact && label && <span>{texto}</span>}
    </Badge>
  );
}
