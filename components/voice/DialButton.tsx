"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CircleNotch, Phone } from "@/lib/ui/icons";
import { useVoiceCall } from "@/components/voice/VoiceCallContext";
import { useVoiceSessionStatus } from "@/hooks/voice/useVoiceSessionStatus";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  contactId: string;
  /** Contato sem telefone não tem pra onde ligar — o chamador já sabe disso. */
  hasPhone: boolean;
}

/**
 * Botão "Ligar" do Customer 360 (spec §5.1). Só aparece quando a org pareou
 * chamada de voz — feature opt-in (§1.2), nunca ligada por padrão.
 */
export function DialButton({ contactId, hasPhone }: Props) {
  const { data: sessionStatus } = useVoiceSessionStatus();
  const { call, startCall } = useVoiceCall();
  const [iniciando, setIniciando] = useState(false);
  const t = useT();

  if (!sessionStatus?.configured || !sessionStatus.paired || !hasPhone) return null;

  const jaEmLigacao = !!call && call.status !== "ended";

  const handleCall = async () => {
    if (iniciando || jaEmLigacao) return;
    setIniciando(true);
    try {
      await startCall(contactId);
    } finally {
      setIniciando(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="shrink-0"
      disabled={jaEmLigacao || iniciando}
      onClick={() => void handleCall()}
    >
      {iniciando ? (
        <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
      ) : (
        <Phone size={16} weight="bold" aria-hidden />
      )}
      <span>{iniciando ? t("Iniciando…") : jaEmLigacao ? t("Em ligação") : t("Chamar")}</span>
    </Button>
  );
}
