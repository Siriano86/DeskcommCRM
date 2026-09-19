/**
 * Adapter da Instagram Messaging API (Meta Graph API).
 *
 * Segue a mesma disciplina de lib/channels/adapters/meta-cloud.ts:
 * - Burro de propósito: apenas traduz envelope para o formato da Graph API e retorna externalId.
 * - Regras de negócio (janela de 24h, cap de envio) vivem na esteira before_send.
 */
import { graphVersion } from "@/lib/graph-version";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ChannelAdapter,
  ChannelHealth,
  ChannelTenantScope,
  OutboundEnvelope,
  RecipientInput,
} from "../types";

export interface InstagramCreds {
  token: string;
  instagramAccountId: string;
  graphVersion: string;
}

/**
 * Resolve as credenciais do Instagram para a sessão.
 * Lê de channel_sessions.metadata ou platform_meta_app com fallback para .env.
 */
export async function resolveInstagramCreds(
  admin: ReturnType<typeof createAdminClient>,
  scope: { organizationId: string; instagramAccountId: string },
): Promise<InstagramCreds | null> {
  // 1. Tenta buscar na sessão do canal
  const { data: session } = await admin
    .from("channel_sessions")
    .select("metadata, instagram_account_id")
    .eq("organization_id", scope.organizationId)
    .eq("instagram_account_id", scope.instagramAccountId)
    .eq("provider", "instagram")
    .maybeSingle();

  const meta = (session?.metadata ?? {}) as Record<string, unknown>;
  const sessionToken = (meta.instagram_access_token ?? meta.access_token) as string | undefined;

  const version = graphVersion();
  const token = sessionToken || process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!token) return null;

  return {
    token,
    instagramAccountId: session?.instagram_account_id ?? scope.instagramAccountId,
    graphVersion: version,
  };
}

export const instagramAdapter: ChannelAdapter = {
  provider: "instagram",

  resolveRecipient(input: RecipientInput): string | null {
    if (input.isGroup) return null;
    if (input.instagramId) return input.instagramId.replace(/^@/, "");
    if (input.waIdentity?.startsWith("ig:")) return input.waIdentity.slice(3);
    // Destinatário IGSID em formato numérico
    if (input.phoneNumber && /^\d+$/.test(input.phoneNumber)) {
      return input.phoneNumber;
    }
    return null;
  },

  isConfigured(): boolean {
    return true;
  },

  async checkHealth(
    input: ChannelTenantScope & { sessionRef: string },
  ): Promise<ChannelHealth> {
    const creds = await resolveInstagramCreds(createAdminClient(), {
      organizationId: input.organizationId,
      instagramAccountId: input.sessionRef,
    });
    if (!creds) {
      return { reachable: false, status: null, detail: "sem_credencial_para_a_sessao" };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${creds.graphVersion}/${creds.instagramAccountId}?fields=id,username,name`,
        {
          headers: { Authorization: `Bearer ${creds.token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number };
      };

      if (res.status === 401 || res.status === 403) {
        return { reachable: true, status: "FAILED", detail: null };
      }
      if (!res.ok || body.error) {
        return {
          reachable: true,
          status: "FAILED",
          detail: (body.error?.message ?? "").slice(0, 200) || null,
        };
      }
      return { reachable: true, status: "WORKING", detail: null };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "erro_desconhecido";
      return { reachable: false, status: null, detail: detail.slice(0, 200) };
    }
  },

  codes: {
    notConfigured: "instagram_not_configured",
    sendFailed: "instagram_error",
    unknownError: "instagram_unknown",
  },

  async send(envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    const creds = await resolveInstagramCreds(createAdminClient(), {
      organizationId: envelope.organizationId,
      instagramAccountId: envelope.sessionRef,
    });

    if (!creds) {
      throw new Error(
        "instagram_not_configured: nenhuma credencial do Instagram para esta sessão.",
      );
    }

    let messagePayload: Record<string, unknown>;

    if (envelope.media) {
      let attachmentType = "file";
      if (envelope.kind === "image") attachmentType = "image";
      else if (envelope.kind === "audio") attachmentType = "audio";
      else if (envelope.kind === "video") attachmentType = "video";

      messagePayload = {
        attachment: {
          type: attachmentType,
          payload: {
            url: envelope.media.url,
            is_reusable: true,
          },
        },
      };
    } else {
      messagePayload = {
        text: envelope.body ?? "",
      };
    }

    await envelope.beforeSend?.();

    const url = `https://graph.facebook.com/${creds.graphVersion}/${creds.instagramAccountId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: envelope.to },
        message: messagePayload,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      message_id?: string;
      error?: { code?: number; message?: string; error_subcode?: number };
    };

    if (!res.ok || body.error) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`instagram_send_failed: ${msg}`);
    }

    return {
      externalId: body.message_id ?? null,
    };
  },
};
