/**
 * GET|POST /api/v1/webhooks/instagram/[token] — Webhook do Instagram (Direct e Comentários).
 *
 * GET: Handshake de verificação da Meta Graph API (hub.challenge em texto puro).
 * POST: Ingestão de mensagens diretas e comentários de post (Comment-to-DM) com HMAC SHA-256.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { appDaMeta } from "@/lib/channels/meta/app";
import { verificationChallenge, verifyMetaSignature } from "@/lib/channels/meta/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { processarComentarioInstagram } from "@/modules/instagram/comment-engine";
import type { InstagramCommentEvent } from "@/modules/instagram/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const { token } = await ctx.params;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("webhook_path_token", token)
    .eq("provider", "instagram")
    .is("archived_at", null)
    .maybeSingle();

  if (!session) return new NextResponse("not found", { status: 404 });

  const { verifyToken } = await appDaMeta();
  const challenge = verificationChallenge(req.nextUrl.searchParams, verifyToken ?? "");
  if (challenge === null) return new NextResponse("forbidden", { status: 403 });

  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await ctx.params;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("channel_sessions")
    .select("id, organization_id, instagram_account_id, metadata")
    .eq("webhook_path_token", token)
    .eq("provider", "instagram")
    .is("archived_at", null)
    .maybeSingle();

  if (!session) {
    return fail("not_found", "unknown webhook token", 404, { requestId });
  }

  const rawBody = await req.text();
  const { appSecret } = await appDaMeta();

  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret ?? "")) {
    return fail("unauthorized", "invalid_signature", 401, { requestId });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const accessToken = (meta.instagram_access_token ?? meta.access_token ?? process.env.META_ACCESS_TOKEN ?? "") as string;

  let commentsProcessed = 0;
  let messagesProcessed = 0;

  for (const entry of entries) {
    // 1. Processamento de Comentários em Posts (Comment-to-DM)
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field === "comments" && change.value) {
          const val = change.value;
          if (val.id && val.from && val.media?.id) {
            const commentEvent: InstagramCommentEvent = {
              commentId: String(val.id),
              postId: String(val.media.id),
              text: String(val.text ?? ""),
              from: {
                id: String(val.from.id),
                username: String(val.from.username ?? ""),
              },
              createdTime: val.created_time ? Number(val.created_time) : undefined,
            };

            await processarComentarioInstagram(
              admin,
              commentEvent,
              session.id,
              session.organization_id,
              accessToken,
              session.instagram_account_id ?? String(entry.id),
            );
            commentsProcessed++;
          }
        }
      }
    }

    // 2. Processamento de Mensagens Diretas (1:1 Direct Messaging)
    if (Array.isArray(entry.messaging)) {
      for (const msgItem of entry.messaging) {
        const senderId = msgItem.sender?.id;
        const msg = msgItem.message;

        // Ignora mensagens enviadas pela própria página/conta
        if (!senderId || !msg || senderId === session.instagram_account_id) {
          continue;
        }

        const externalId = msg.mid || `ig_${Date.now()}`;
        const bodyText = msg.text || (msg.attachments ? "[Mídia do Instagram]" : "");

        // Cadastra ou atualiza o contato
        const { data: contactId } = await admin.rpc(
          "fn_upsert_wa_contact" as never,
          {
            p_org: session.organization_id,
            p_kind: "lid",
            p_phone: null,
            p_lid: senderId,
            p_chat_id: senderId,
            p_notify: `Instagram ${senderId}`,
          } as never,
        );

        if (contactId) {
          // Busca ou abre conversa
          let { data: conv } = await admin
            .from("conversations")
            .select("id")
            .eq("organization_id", session.organization_id)
            .eq("channel_session_id", session.id)
            .eq("contact_id", contactId)
            .maybeSingle();

          if (!conv) {
            const { data: novaConv } = await admin
              .from("conversations")
              .insert({
                organization_id: session.organization_id,
                channel_session_id: session.id,
                contact_id: contactId,
                status: "active",
                last_inbound_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            conv = novaConv;
          } else {
            await admin
              .from("conversations")
              .update({
                last_inbound_at: new Date().toISOString(),
                status: "active",
              })
              .eq("id", conv.id);
          }

          if (conv?.id) {
            await admin.from("messages").insert({
              organization_id: session.organization_id,
              conversation_id: conv.id,
              contact_id: contactId,
              channel_session_id: session.id,
              direction: "inbound",
              status: "delivered",
              external_id: externalId,
              body: bodyText,
              type: "text",
            });
            messagesProcessed++;
          }
        }
      }
    }
  }

  logger.info("[instagram.webhook] processado com sucesso", {
    request_id: requestId,
    session_id: session.id,
    comments_count: commentsProcessed,
    messages_count: messagesProcessed,
  });

  return ok({ received: true, comments: commentsProcessed, messages: messagesProcessed }, { requestId });
}
