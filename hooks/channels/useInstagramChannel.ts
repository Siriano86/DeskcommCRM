import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface InstagramWebhookInfo {
  callbackUrl: string;
  verifyToken: string | null;
  verifyTokenOrigem: "ambiente" | "instalacao" | null;
  configurarEm: string | null;
  fields: string[];
}

export interface InstagramChannelData {
  connected: boolean;
  channel_session_id: string | null;
  hasToken: boolean;
  instagramAccountId: string | null;
  instagramUsername: string | null;
  displayName: string | null;
  status: "WORKING" | "FAILED" | null;
  webhook: InstagramWebhookInfo | null;
}

export interface ConnectInstagramPayload {
  instagram_account_id: string;
  token: string;
}

export function useInstagramChannel() {
  return useQuery({
    queryKey: ["channels", "instagram"],
    queryFn: async () => {
      const res = await fetch("/api/v1/channels/instagram");
      if (!res.ok) throw new Error("Erro ao buscar status do canal do Instagram");
      const { data } = (await res.json()) as { data: InstagramChannelData };
      return data;
    },
  });
}

export function useConnectInstagramChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ConnectInstagramPayload) => {
      const res = await fetch("/api/v1/channels/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message || "Erro ao conectar canal do Instagram");
      }

      const { data } = (await res.json()) as {
        data: { connected: boolean; displayName: string; instagramUsername: string };
      };
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels", "instagram"] });
      void queryClient.invalidateQueries({ queryKey: ["channel-sessions"] });
    },
  });
}
