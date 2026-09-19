import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { CHANNEL_PROVIDER_INSTAGRAM } from "@/lib/channels/capabilities";
import { reactivateChannelSession } from "@/lib/channels/reactivate";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { traduzir } from "@/lib/i18n/dicionario";
import { graphVersion } from "@/lib/graph-version";
import { appDaMeta, appDaMetaDoAmbiente } from "@/lib/channels/meta/app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const conectarSchema = z.object({
  instagram_account_id: z.string().min(5),
  token: z.string().min(20),
});

function publicBase(req: NextRequest): string {
  const configurada = env.NEXT_PUBLIC_APP_URL;
  const usavel = configurada && !configurada.includes("placeholder.invalid") ? configurada : null;
  return usavel ?? req.headers.get("origin") ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

async function tokenDeVerificacaoParaATela(): Promise<{
  verifyToken: string | null;
  verifyTokenOrigem: "ambiente" | "instalacao" | null;
}> {
  const { verifyToken: emVigor } = await appDaMeta();
  if (!emVigor) return { verifyToken: null, verifyTokenOrigem: null };
  if (emVigor === appDaMetaDoAmbiente().verifyToken) {
    return { verifyToken: emVigor, verifyTokenOrigem: "ambiente" };
  }
  return { verifyToken: null, verifyTokenOrigem: "instalacao" };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const admin = createAdminClient();
  const consultar = () =>
    admin
      .from("channel_sessions")
      .select(`id, instagram_account_id, instagram_username, metadata, webhook_path_token, status, display_name`)
      .eq("organization_id", orgId)
      .eq("provider", CHANNEL_PROVIDER_INSTAGRAM);

  const { data } = await queryTolerantToMissingArchived(
    () => consultar().is(ARCHIVED_AT, null).maybeSingle(),
    () => consultar().maybeSingle(),
  );

  const meta = (data?.metadata ?? {}) as Record<string, unknown>;
  const hasToken = Boolean(meta.instagram_access_token);

  const base = publicBase(req);
  return ok({
    connected: Boolean(data),
    channel_session_id: data?.id ?? null,
    hasToken,
    instagramAccountId: data?.instagram_account_id ?? null,
    instagramUsername: data?.instagram_username ?? null,
    displayName: data?.display_name ?? null,
    status: data?.status ?? null,
    webhook: data
      ? {
          callbackUrl: `${base}/api/v1/webhooks/instagram/${data.webhook_path_token}`,
          ...(await tokenDeVerificacaoParaATela()),
          fields: ["messages", "messaging_postbacks", "comments"],
        }
      : null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const parsed = conectarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", t("instagram_account_id e token são obrigatórios"), 422, {
      requestId,
    });
  }
  const { instagram_account_id, token } = parsed.data;

  let verifiedName = "Instagram";
  let username = "";
  try {
    const v = graphVersion();
    const res = await fetch(
      `https://graph.facebook.com/${v}/${instagram_account_id}?fields=id,username,name`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      username?: string;
      error?: { message?: string };
    };

    if (!res.ok || body.error) {
      return fail("invalid_request", body.error?.message ?? "Falha ao conectar com Instagram", 422, { requestId });
    }
    if (body.name) verifiedName = body.name;
    if (body.username) username = body.username;
  } catch (err) {
    return fail("invalid_request", "Erro de rede ao validar Instagram", 422, { requestId });
  }

  const admin = createAdminClient();
  const cifrado = await encryptWebhookSecret(admin, token);
  if (!cifrado) {
    return fail(
      "invalid_request",
      t("cifra indisponível nesta instalação (GUC app.nuvemshop_oauth_key ausente) — o token não foi gravado"),
      422,
      { requestId },
    );
  }

  const buscarExistente = (colunas: string) =>
    admin
      .from("channel_sessions")
      .select(colunas)
      .eq("organization_id", orgId)
      .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
      .maybeSingle();

  const { data: existenteRaw } = await queryTolerantToMissingArchived(
    () => buscarExistente(`id, ${ARCHIVED_AT}, metadata`),
    () => buscarExistente("id, metadata"),
  );
  const existente = existenteRaw as { id: string; archived_at?: string | null; metadata?: any } | null;

  const metadataAtual = (existente?.metadata as Record<string, unknown> | null) ?? {};
  const metadataNova = {
    ...metadataInicialDoCanal(),
    ...metadataAtual,
    instagram_access_token: token,
  };

  const linha = {
    organization_id: orgId,
    provider: CHANNEL_PROVIDER_INSTAGRAM,
    instagram_account_id,
    instagram_username: username,
    display_name: verifiedName,
    status: "WORKING",
    metadata: metadataNova,
  };

  const { error } = existente
    ? await reactivateChannelSession(
        admin,
        {
          organizationId: orgId,
          channelSessionId: existente.id,
          archivedAt: existente.archived_at ?? null,
        },
        linha,
        {
          userId: userId,
          requestId,
          metadata: { provider: CHANNEL_PROVIDER_INSTAGRAM },
        },
      )
    : await admin.from("channel_sessions").insert({
        ...linha,
        webhook_secret_encrypted: cifrado,
      });

  if (error) {
    return fail("internal_error", error.message ?? "channel_session_write_failed", 500, {
      requestId,
    });
  }

  return ok({
    connected: true,
    displayName: verifiedName,
    instagramUsername: username,
  });
}
