/**
 * POST /api/v1/voice/sessions/pair — inicia (ou reinicia) o pareamento de
 * chamada de voz WhatsApp da organização.
 *
 * Segundo dispositivo vinculado no MESMO número WhatsApp da sessão de mensagens já
 * pareada — risco aceito, opt-in por org, decisão de produto §1.2 da spec
 * docs/specs/18-spec-voice-calls-wacalls.md. Admin only, igual a
 * channel-sessions/[id]/reconnect.
 *
 * O QR não volta nesta resposta: o WaCalls empurra por SSE (`session-qr`),
 * relayado pra tela via `GET /api/v1/voice/events` (fora de escopo desta
 * rota). Aqui só garante a linha em `channel_sessions` e dispara o pareamento.
 */
import { randomUUID } from "node:crypto";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { exigirVozLigada } from "@/lib/voice/guarda";
import { getWacallsClient, wacallsFriendlyError } from "@/lib/wacalls/client";
import { ensureWacallsSession } from "@/lib/wacalls/session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  // Acompanhamento administrativo somente-leitura não liga, não atende, não
  // desliga e não pareia: o efeito é do tenant, não de quem observa.
  const suporteNegado = await requireSupportWrite();
  if (suporteNegado) return suporteNegado;

  const requestId = randomUUID();

  const authz = await requireRole("admin", {
    requestId,
    resource: "channel_sessions",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;
  const { user, org: activeOrg } = authz;

  const wacalls = getWacallsClient();
  if (!wacalls) {
    return fail(
      "wacalls_not_configured",
      "Chamada de voz não está configurada neste ambiente: falta WACALLS_API_BASE_URL.",
      503,
      { requestId },
    );
  }

  const supabase = await createClient();

  // ⚠️ O CONSENTIMENTO É EXIGIDO AQUI, e este é o lugar certo: parear é o ato
  // que CRIA a exposição — a partir dele existe um segundo aparelho vinculado
  // ao número da empresa, com o risco de o WhatsApp bloquear a CONTA inteira.
  //
  // Sem esta linha, o interruptor de Configurações › Segurança era decorativo
  // pelo caminho de entrada: a tela pedia "eu li o aviso e aceito o risco",
  // e quem fosse direto a Conexões pareava sem passar por ela. Desligar
  // continuava real (o PUT do opt-in despareia de verdade), mas LIGAR nunca foi
  // necessário — e um consentimento que dá para pular não é consentimento.
  //
  // O que NÃO ganha esta guarda, de propósito: `DELETE /sessions` (desparear),
  // `reject` e `hangup`. A porta de saída nunca depende do interruptor — é a
  // mesma razão escrita no cabeçalho da rota de DELETE.
  // `instalacaoOferece: true` porque o `getWacallsClient()` acima já provou
  // o fato e já devolveu 503 se fosse falso — a guarda não o relê pelo env.
  const vozDesligada = await exigirVozLigada(supabase, activeOrg.orgId, {
    requestId,
    instalacaoOferece: true,
  });
  if (vozDesligada) return vozDesligada;

  try {
    const { channelSessionId, wacallsSessionId } = await ensureWacallsSession(
      supabase,
      activeOrg.orgId,
      wacalls,
    );

    await wacalls.pairSession(wacallsSessionId);

    void audit({
      action: "voice.session_pair_started",
      actorUserId: user.id,
      organizationId: activeOrg.orgId,
      resourceType: "channel_session",
      resourceId: channelSessionId,
      requestId,
      metadata: { wacalls_session_id: wacallsSessionId },
    });

    return ok({ channelSessionId, wacallsSessionId }, { requestId });
  } catch (err) {
    logger.error("wacalls: pareamento falhou", {
      request_id: requestId,
      organization_id: activeOrg.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail("wacalls_error", wacallsFriendlyError(err), 502, { requestId });
  }
}
