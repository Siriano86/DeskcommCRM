/**
 * Resolve a sessão WaCalls pareada de uma organização — helper compartilhado
 * pelas rotas `app/api/v1/voice/*`. Nunca aceita `channel_session_id`/
 * `wacalls_session_id` vindo do body: sempre relido do banco, escopado pela
 * org da sessão autenticada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WacallsSessionRow {
  channelSessionId: string;
  wacallsSessionId: string;
}

export async function resolveWacallsSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  organizationId: string,
): Promise<WacallsSessionRow | null> {
  const { data } = await supabase
    .from("channel_sessions")
    .select("id, wacalls_session_id")
    .eq("organization_id", organizationId)
    .eq("provider", "wacalls")
    .is("archived_at", null)
    .maybeSingle();
  const row = data as { id: string; wacalls_session_id: string | null } | null;
  if (!row?.wacalls_session_id) return null;
  return { channelSessionId: row.id, wacallsSessionId: row.wacalls_session_id };
}

export async function ensureWacallsSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  organizationId: string,
  wacalls: { createSession: (label: string) => Promise<{ id: string }> },
): Promise<WacallsSessionRow> {
  const existing = await resolveWacallsSession(supabase, organizationId);
  if (existing) return existing;

  const { data: existingRow } = await supabase
    .from("channel_sessions")
    .select("id, wacalls_session_id")
    .eq("organization_id", organizationId)
    .eq("provider", "wacalls")
    .is("archived_at", null)
    .maybeSingle();

  let channelSessionId = (existingRow as { id: string } | null)?.id ?? null;
  let wacallsSessionId =
    (existingRow as { wacalls_session_id: string | null } | null)?.wacalls_session_id ?? null;

  if (!wacallsSessionId) {
    const created = await wacalls.createSession(`org_${organizationId.slice(0, 8)}`);
    wacallsSessionId = created.id;

    if (channelSessionId) {
      await supabase
        .from("channel_sessions")
        .update({ wacalls_session_id: wacallsSessionId })
        .eq("id", channelSessionId);
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("channel_sessions")
        .insert({
          organization_id: organizationId,
          provider: "wacalls",
          wacalls_session_id: wacallsSessionId,
          status: "STARTING",
          webhook_secret_encrypted: Buffer.from([0]),
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        throw new Error(`channel_sessions insert: ${insertErr?.message}`);
      }
      channelSessionId = (inserted as { id: string }).id;
    }
  }

  if (!channelSessionId || !wacallsSessionId) {
    throw new Error("Não foi possível resolver ou criar a sessão WaCalls.");
  }

  return { channelSessionId, wacallsSessionId };
}
