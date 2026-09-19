/**
 * Tradução visual de canal para a UI (ícones, cores, rótulos).
 *
 * Mora em lib/channels/ porque é O ÚNICO LUGAR permitido a inspecionar
 * nomes de providers segundo a doutrina (invariante 1).
 */

export type TipoVisualCanal = "whatsapp" | "instagram" | "telegram" | "generico";

export interface AparenciaCanal {
  tipo: TipoVisualCanal;
  nomePadrao: string;
  badgeClasses: string;
}

export function aparenciaDoCanal(provider?: string | null): AparenciaCanal {
  const p = (provider ?? "").toLowerCase();

  if (p === "instagram") {
    return {
      tipo: "instagram",
      nomePadrao: "Instagram",
      badgeClasses:
        "border-pink-500/30 bg-pink-500/10 text-pink-600 dark:text-pink-400 hover:bg-pink-500/15",
    };
  }

  if (p === "telegram") {
    return {
      tipo: "telegram",
      nomePadrao: "Telegram",
      badgeClasses:
        "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/15",
    };
  }

  if (p === "waha" || p === "meta_cloud" || p === "zernio") {
    return {
      tipo: "whatsapp",
      nomePadrao: "WhatsApp",
      badgeClasses:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }

  return {
    tipo: "generico",
    nomePadrao: "Canal",
    badgeClasses: "border-border text-text-muted",
  };
}
