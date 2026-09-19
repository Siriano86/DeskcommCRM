"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { InstagramLogo, Plus, Trash, Sparkle } from "@/lib/ui/icons";
import { CanalBadge } from "@/components/channels/CanalBadge";

interface PostAutomationBuilderProps {
  channelSessionId: string;
  channelName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PostAutomationBuilder({
  channelSessionId,
  channelName,
  onSuccess,
  onCancel,
}: PostAutomationBuilderProps) {
  const [postId, setPostId] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [keyword, setKeyword] = useState("QUERO");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(true);
  const [publicReplies, setPublicReplies] = useState<string[]>([
    "Te mandei no Direct! Dá uma olhada 🚀",
    "Enviado no privado! Confere lá ✅",
  ]);
  const [newReply, setNewReply] = useState("");
  const [dmMessage, setDmMessage] = useState(
    "Olá! Vi que você comentou no nosso post. Aqui está o link com todos os detalhes e condições exclusivas: ",
  );
  const [tag, setTag] = useState("origem:instagram-post");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddReply = () => {
    if (!newReply.trim()) return;
    setPublicReplies([...publicReplies, newReply.trim()]);
    setNewReply("");
  };

  const handleRemoveReply = (index: number) => {
    setPublicReplies(publicReplies.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postId.trim()) {
      setErrorMsg("Informe o ID do post ou reels do Instagram.");
      return;
    }
    if (!dmMessage.trim()) {
      setErrorMsg("A mensagem do Direct não pode ser vazia.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/v1/modules/instagram/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_session_id: channelSessionId,
          post_id: postId.trim(),
          post_url: postUrl.trim() || undefined,
          trigger_keyword: keyword.trim() || undefined,
          match_mode: matchMode,
          public_reply_enabled: publicReplyEnabled,
          public_replies: publicReplies,
          dm_message: dmMessage.trim(),
          tags: [tag.trim()],
          is_active: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro ao salvar a regra de automação.");
      }

      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido ao salvar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-left">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
            <InstagramLogo size={20} weight="bold" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Nova Automação Comment-to-DM</h3>
            <p className="text-xs text-text-muted">Responda comentários automaticamente e envie mensagem privada</p>
          </div>
        </div>
        <CanalBadge provider="instagram" label={channelName || "Instagram"} />
      </div>

      {errorMsg && (
        <div className="rounded-md bg-error-bg/10 border border-error-border p-3 text-xs text-error-fg">
          {errorMsg}
        </div>
      )}

      {/* Post do Instagram */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Post ou Reels do Instagram
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Input
              placeholder="ID do Post (ex: 179238491823)"
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              placeholder="Link do Post (opcional)"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Palavra-chave e Modo */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Gatilho do Comentário
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Palavra-chave (ex: QUERO, PROMO, INFO)"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              value={matchMode}
              onChange={(e) => setMatchMode(e.target.value as "contains" | "exact" | "any")}
            >
              <option value="contains">Contém a palavra</option>
              <option value="exact">Exatamente igual</option>
              <option value="any">Qualquer comentário</option>
            </select>
          </div>
        </div>
      </div>

      {/* Respostas Públicas Variadas (Anti-Spam) */}
      <div className="space-y-2 rounded-lg border border-border p-4 bg-surface-elevated/40">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text">Resposta Pública no Comentário</span>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={publicReplyEnabled}
              onChange={(e) => setPublicReplyEnabled(e.target.checked)}
            />
            <div className="h-5 w-9 rounded-full bg-border peer-checked:bg-accent peer-focus:outline-hidden after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>

        {publicReplyEnabled && (
          <div className="space-y-3 pt-2">
            <p className="text-[11px] text-text-subtle">
              A Meta exige variação nas respostas para evitar penalizações de spam. O bot sorteará uma resposta da lista:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {publicReplies.map((rep, idx) => (
                <Badge key={idx} variant="neutral" className="gap-1 py-1 px-2 text-xs">
                  <span>{rep}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveReply(idx)}
                    className="hover:text-error-fg transition-colors"
                  >
                    <Trash size={12} />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar variação de resposta pública..."
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddReply();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddReply}>
                <Plus size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Mensagem Privada no Direct */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Mensagem Inaugural no Direct
          </label>
          <span className="text-[10px] text-text-subtle flex items-center gap-1">
            <Sparkle size={12} className="text-accent" />
            A IA continuará o atendimento a partir daqui
          </span>
        </div>
        <Textarea
          rows={3}
          value={dmMessage}
          onChange={(e) => setDmMessage(e.target.value)}
          placeholder="Escreva o texto que o lead receberá no privado do Instagram..."
          required
        />
      </div>

      {/* Tags do Lead no CRM */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Tag no Kanban / CRM
        </label>
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag atribuída ao card (ex: oferta-black-friday)"
        />
      </div>

      {/* Botões de Ação */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Ativar Automação"}
        </Button>
      </div>
    </form>
  );
}
