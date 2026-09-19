/**
 * GET|POST /api/v1/modules/instagram/automations
 * Gerencia as regras de automação Comment-to-DM para postagens do Instagram.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const createAutomationSchema = z.object({
  channel_session_id: z.string().uuid(),
  post_id: z.string().min(1).max(200),
  post_url: z.string().url().optional().nullable(),
  post_caption: z.string().max(1000).optional().nullable(),
  trigger_keyword: z.string().max(100).optional().nullable(),
  match_mode: z.enum(["exact", "contains", "any"]).default("contains"),
  public_reply_enabled: z.boolean().default(true),
  public_replies: z.array(z.string().min(1).max(500)).default([
    "Te mandei no Direct! Dá uma olhada 🚀",
    "Enviado no privado! Confere lá ✅",
  ]),
  dm_message: z.string().min(1).max(2000),
  kanban_stage_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().max(50)).default(["origem:instagram-post"]),
  ai_agent_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data: regras, error } = await admin
    .from("instagram_post_automations")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return fail("database_error", error.message, 500, { requestId });
  }

  return ok(regras ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId });
  if (!authz.ok) return authz.response;

  const body = await req.json().catch(() => null);
  const parsed = createAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos para a automação do post.", 400, {
      requestId,
      details: parsed.error.format(),
    });
  }

  const admin = createAdminClient();

  // Garante que o channel_session_id pertence à mesma organização
  const { data: session } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("id", parsed.data.channel_session_id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (!session) {
    return fail("invalid_session", "Sessão de canal não encontrada.", 404, { requestId });
  }

  const { data: novaRegra, error } = await admin
    .from("instagram_post_automations")
    .insert({
      organization_id: authz.org.orgId,
      channel_session_id: parsed.data.channel_session_id,
      post_id: parsed.data.post_id,
      post_url: parsed.data.post_url,
      post_caption: parsed.data.post_caption,
      trigger_keyword: parsed.data.trigger_keyword,
      match_mode: parsed.data.match_mode,
      public_reply_enabled: parsed.data.public_reply_enabled,
      public_replies: parsed.data.public_replies,
      dm_message: parsed.data.dm_message,
      kanban_stage_id: parsed.data.kanban_stage_id,
      tags: parsed.data.tags,
      ai_agent_id: parsed.data.ai_agent_id,
      is_active: parsed.data.is_active,
    })
    .select("*")
    .single();

  if (error) {
    return fail("database_error", error.message, 500, { requestId });
  }

  void audit({
    action: "automation.rule_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "instagram_post_automation",
    resourceId: novaRegra.id,
    requestId,
    metadata: {
      post_id: parsed.data.post_id,
      trigger_keyword: parsed.data.trigger_keyword,
    },
  });

  return ok(novaRegra, { requestId, status: 201 });
}
