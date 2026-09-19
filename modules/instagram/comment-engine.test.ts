import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  normalizarTexto,
  avaliarComentario,
  escolherRespostaPublica,
  responderComentarioPublico,
  enviarDirectDeComentario,
  processarComentarioInstagram,
} from "./comment-engine";
import type { InstagramPostAutomation } from "./types";

describe("comment-engine (Comment-to-DM)", () => {
  describe("normalizarTexto", () => {
    it("remove acentos, pontuação e converte para minúsculas", () => {
      expect(normalizarTexto("QUERO")).toBe("quero");
      expect(normalizarTexto("  Eu Quero!  ")).toBe("eu quero!");
      expect(normalizarTexto("INFORMAÇÕES")).toBe("informacoes");
      expect(normalizarTexto("Preço")).toBe("preco");
    });
  });

  describe("avaliarComentario", () => {
    const baseRule: InstagramPostAutomation = {
      id: "rule-1",
      organization_id: "org-1",
      channel_session_id: "cs-1",
      post_id: "post-123",
      trigger_keyword: "QUERO",
      match_mode: "contains",
      public_reply_enabled: true,
      public_replies: ["Enviado no direct!"],
      dm_message: "Olá! Aqui está o link solicitado.",
      is_active: true,
    };

    it("retorna false quando regra está inativa", () => {
      expect(avaliarComentario("quero", { ...baseRule, is_active: false })).toBe(false);
    });

    it("retorna true em modo 'any'", () => {
      expect(avaliarComentario("qualquer texto aqui", { ...baseRule, match_mode: "any" })).toBe(true);
    });

    it("avalia corretamente modo 'contains'", () => {
      expect(avaliarComentario("Eu quero muito saber mais", baseRule)).toBe(true);
      expect(avaliarComentario("QUERO", baseRule)).toBe(true);
      expect(avaliarComentario("Achei legal o post", baseRule)).toBe(false);
    });

    it("avalia corretamente modo 'exact'", () => {
      const exactRule = { ...baseRule, match_mode: "exact" as const };
      expect(avaliarComentario("QUERO", exactRule)).toBe(true);
      expect(avaliarComentario("quero", exactRule)).toBe(true);
      expect(avaliarComentario("Eu quero", exactRule)).toBe(false);
    });
  });

  describe("escolherRespostaPublica", () => {
    it("escolhe uma opção dentre a lista informada", () => {
      const lista = ["Opção 1", "Opção 2", "Opção 3"];
      const escolhida = escolherRespostaPublica(lista);
      expect(lista).toContain(escolhida);
    });

    it("retorna null para lista vazia", () => {
      expect(escolherRespostaPublica([])).toBeNull();
    });
  });

  describe("chamadas Graph API", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("responderComentarioPublico envia POST para endpoint do comentário", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "reply-123" }),
      });
      global.fetch = fetchMock;

      const ok = await responderComentarioPublico({
        commentId: "c_123",
        message: "Te mandei no Direct!",
        accessToken: "token_abc",
        version: "v21.0",
      });

      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://graph.facebook.com/v21.0/c_123/replies",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "Te mandei no Direct!" }),
        }),
      );
    });

    it("enviarDirectDeComentario envia mensagem usando recipient.comment_id", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message_id: "m_mid123" }),
      });
      global.fetch = fetchMock;

      const externalId = await enviarDirectDeComentario({
        instagramAccountId: "ig_acc_1",
        commentId: "c_123",
        recipientId: "user_456",
        text: "Oi! Segue o link.",
        accessToken: "token_abc",
        version: "v21.0",
      });

      expect(externalId).toBe("m_mid123");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://graph.facebook.com/v21.0/ig_acc_1/messages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            recipient: { comment_id: "c_123" },
            message: { text: "Oi! Segue o link." },
          }),
        }),
      );
    });
  });
});
