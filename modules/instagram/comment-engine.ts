/**
 * Motor de processamento de regras Comment-to-DM (Instagram).
 *
 * Avalia comentários recebidos via webhook da Meta contra regras cadastradas
 * em `instagram_post_automations`, envia resposta pública variada (anti-spam)
 * e dispara a mensagem inaugural privada no Direct, cadastrando o lead no CRM.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { graphVersion } from "@/lib/graph-version";
import type {
  InstagramCommentEvent,
  InstagramPostAutomation,
  MatchCommentRuleResult,
} from "./types";

/** Normaliza texto removendo acentos, pontuação e espaços extras para matching seguro. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Avalia se um comentário ativa uma regra específica. */
export function avaliarComentario(
  comentario: string,
  regra: InstagramPostAutomation,
): boolean {
  if (!regra.is_active) return false;

  // Modo 'any' ou sem palavra-chave ativa para qualquer comentário no post
  if (regra.match_mode === "any" || !regra.trigger_keyword?.trim()) {
    return true;
  }

  const textoNorm = normalizarTexto(comentario);
  const keywordNorm = normalizarTexto(regra.trigger_keyword);

  if (regra.match_mode === "exact") {
    return textoNorm === keywordNorm;
  }

  // Modo 'contains' (padrão): palavra ou expressão contida no comentário
  return textoNorm.includes(keywordNorm);
}

/** Escolhe aleatoriamente uma resposta pública para evitar flags de spam da Meta. */
export function escolherRespostaPublica(respostas: string[]): string | null {
  if (!respostas || respostas.length === 0) return null;
  const index = Math.floor(Math.random() * respostas.length);
  return respostas[index] ?? respostas[0] ?? null;
}

/** Envia resposta pública no comentário do Instagram via Graph API. */
export async function responderComentarioPublico(params: {
  commentId: string;
  message: string;
  accessToken: string;
  version?: string;
}): Promise<boolean> {
  const version = params.version || graphVersion();
  const url = `https://graph.facebook.com/${version}/${params.commentId}/replies`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: params.message }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.warn("[instagram.comment] falha ao responder comentário público", {
        comment_id: params.commentId,
        error: err,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("[instagram.comment] erro de rede ao responder comentário", {
      comment_id: params.commentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Envia mensagem privada (Direct) em resposta a um comentário via Graph API. */
export async function enviarDirectDeComentario(params: {
  instagramAccountId: string;
  commentId: string;
  recipientId: string;
  text: string;
  accessToken: string;
  version?: string;
}): Promise<string | null> {
  const version = params.version || graphVersion();
  const url = `https://graph.facebook.com/${version}/${params.instagramAccountId}/messages`;

  // Meta permite responder comentário usando `recipient: { comment_id }`
  // garantindo entrega mesmo se o cliente ainda não tiver aberto conversa
  const body = {
    recipient: { comment_id: params.commentId },
    message: { text: params.text },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
      message_id?: string;
      error?: { message?: string };
    };

    if (!res.ok || data.error) {
      logger.warn("[instagram.comment] falha ao enviar direct inaugural", {
        comment_id: params.commentId,
        error: data.error,
      });
      return null;
    }

    return data.message_id ?? null;
  } catch (err) {
    logger.error("[instagram.comment] erro de conexão no envio do direct", {
      comment_id: params.commentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Executa o fluxo completo do Comment-to-DM:
 * 1. Avalia regras para o post_id
 * 2. Envia resposta pública (se habilitada)
 * 3. Envia mensagem privada no Direct
 * 4. Registra/atualiza lead no CRM
 */
export async function processarComentarioInstagram(
  admin: SupabaseClient,
  event: InstagramCommentEvent,
  channelSessionId: string,
  organizationId: string,
  accessToken: string,
  instagramAccountId: string,
): Promise<MatchCommentRuleResult> {
  // 1. Busca regras ativas para o post
  const { data: regras, error } = await admin
    .from("instagram_post_automations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("channel_session_id", channelSessionId)
    .eq("post_id", event.postId)
    .eq("is_active", true);

  if (error || !regras || regras.length === 0) {
    return { matched: false };
  }

  // 2. Encontra a primeira regra compatível
  const regraAtiva = (regras as InstagramPostAutomation[]).find((r) =>
    avaliarComentario(event.text, r),
  );

  if (!regraAtiva) {
    return { matched: false };
  }

  // 3. Resposta pública opcional (anti-spam com variação)
  let publicReplyText: string | null = null;
  if (regraAtiva.public_reply_enabled) {
    publicReplyText = escolherRespostaPublica(regraAtiva.public_replies);
    if (publicReplyText) {
      await responderComentarioPublico({
        commentId: event.commentId,
        message: publicReplyText,
        accessToken,
      });
    }
  }

  // 4. Envia mensagem no Direct
  const externalMsgId = await enviarDirectDeComentario({
    instagramAccountId,
    commentId: event.commentId,
    recipientId: event.from.id,
    text: regraAtiva.dm_message,
    accessToken,
  });

  // 5. Cadastra ou atualiza o contato no CRM
  const igUsername = event.from.username ? `@${event.from.username.replace(/^@/, "")}` : `Instagram ${event.from.id}`;
  
  const { data: contactId } = await admin.rpc(
    "fn_upsert_wa_contact" as never,
    {
      p_org: organizationId,
      p_kind: "lid",
      p_phone: null,
      p_lid: event.from.id,
      p_chat_id: event.from.id,
      p_notify: igUsername,
    } as never,
  );

  if (contactId) {
    // 6. Garante a conversa aberta
    const { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("channel_session_id", channelSessionId)
      .eq("contact_id", contactId)
      .maybeSingle();

    let conversationId = conv?.id;
    if (!conversationId) {
      const { data: novaConv } = await admin
        .from("conversations")
        .insert({
          organization_id: organizationId,
          channel_session_id: channelSessionId,
          contact_id: contactId,
          status: "active",
        })
        .select("id")
        .single();
      conversationId = novaConv?.id;
    }

    // 7. Registra a mensagem no histórico se obteve externalId
    if (conversationId && externalMsgId) {
      await admin.from("messages").insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        contact_id: contactId,
        channel_session_id: channelSessionId,
        direction: "outbound",
        status: "sent",
        external_id: externalMsgId,
        body: regraAtiva.dm_message,
        type: "text",
        metadata: {
          origin: "instagram_comment_automation",
          post_id: event.postId,
          comment_id: event.commentId,
        },
      });
    }

    // 8. Cria card no Kanban se houver stage_id configurado
    if (regraAtiva.kanban_stage_id) {
      const { data: leadExistente } = await admin
        .from("crm_leads")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("status", "open")
        .maybeSingle();

      if (!leadExistente) {
        await admin.from("crm_leads").insert({
          organization_id: organizationId,
          contact_id: contactId,
          stage_id: regraAtiva.kanban_stage_id,
          title: `Lead ${igUsername}`,
          tags: regraAtiva.tags ?? ["origem:instagram-post"],
          source_metadata: {
            source: "instagram_comment",
            post_id: event.postId,
            comment_id: event.commentId,
            keyword: regraAtiva.trigger_keyword,
          },
        });
      }
    }
  }

  return {
    matched: true,
    rule: regraAtiva,
    publicReply: publicReplyText ?? undefined,
    dmMessage: regraAtiva.dm_message,
  };
}
