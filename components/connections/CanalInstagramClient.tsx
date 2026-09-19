"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useConnectInstagramChannel,
  useInstagramChannel,
} from "@/hooks/channels/useInstagramChannel";
import { copyToClipboard } from "@/lib/clipboard";
import { useT } from "@/hooks/i18n/useT";
import { ChannelAiAccess } from "./ChannelAiAccess";

function ParaColar({
  rotulo,
  valor,
  semValor,
}: {
  rotulo: string;
  valor: string | null;
  semValor?: React.ReactNode;
}) {
  const t = useT();
  if (!valor) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {rotulo}
        </span>
        {semValor}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </span>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md bg-muted px-2 py-1.5 text-xs">{valor}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await copyToClipboard(valor);
            toast.success(t("Copiado."));
          }}
        >
          {t("Copiar")}
        </Button>
      </div>
    </div>
  );
}

export function CanalInstagramClient() {
  const t = useT();
  const { data: estado, isPending } = useInstagramChannel();
  const conectar = useConnectInstagramChannel();
  const [form, setForm] = useState({ instagram_account_id: "", token: "" });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await conectar.mutateAsync(form);
      toast.success(`${t("Conectado:")} ${r.displayName} ${r.instagramUsername ? `(@${r.instagramUsername})` : ""}`.trim());
      setForm((f) => ({ ...f, token: "" }));
    } catch (err: any) {
      toast.error(err.message || t("Erro ao conectar"));
    }
  }

  if (isPending) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;

  return (
    <div className="flex flex-col gap-4" data-testid="canal-instagram-root">
      {estado?.connected ? (
        <Card className="p-4" data-testid="canal-conectado">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{estado.displayName}</span>
            {estado.instagramUsername ? (
              <Badge variant="outline" className="font-mono text-xs">
                @{estado.instagramUsername}
              </Badge>
            ) : null}
            <Badge>{estado.status ?? "—"}</Badge>
            <Badge variant={estado.hasToken ? "outline" : "destructive"}>
              {estado.hasToken ? t("credencial guardada") : t("sem credencial")}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("ID da Conta")}: <span className="font-mono">{estado.instagramAccountId}</span>
          </p>
        </Card>
      ) : null}
      {estado?.channel_session_id && <ChannelAiAccess channelId={estado.channel_session_id} />}

      {estado?.webhook ? (
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("Cole isto no painel da Meta para o Instagram")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Em")} <strong>Webhooks → {t("Instagram")}</strong>
              {t(", cadastre esta URL para receber as mensagens do Direct e comentários.")}
            </p>
          </div>
          <ParaColar rotulo={t("URL de callback")} valor={estado.webhook.callbackUrl} />
          <ParaColar
            rotulo={t("Token de verificação")}
            valor={estado.webhook.verifyToken}
            semValor={
              <span className="flex flex-col items-start gap-1">
                {estado.webhook.verifyTokenOrigem === "instalacao" ? (
                  <span className="text-sm text-muted-foreground">
                    {t("Já cadastrado na administração da instalação.")}
                  </span>
                ) : (
                  <span className="text-sm text-destructive">
                    {t("Ainda não configurado. Quem administra a instalação cadastra em Admin.")}
                  </span>
                )}
                {estado.webhook.configurarEm ? (
                  <Link
                    href={estado.webhook.configurarEm}
                    className="text-sm font-medium underline underline-offset-2"
                  >
                    {t("Abrir API Oficial (Meta) na administração")}
                  </Link>
                ) : null}
              </span>
            }
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("Campos a assinar")}
            </span>
            <div className="flex flex-wrap gap-1">
              {estado.webhook.fields.map((f) => (
                <Badge key={f} variant="outline" className="font-mono text-xs">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="font-medium">
          {estado?.connected ? t("Trocar credencial") : t("Conectar canal Instagram")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Forneça o ID da sua Conta do Instagram e um Token de acesso da Meta Graph API.")}
        </p>

        <form onSubmit={enviar} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="igid">{t("ID da Conta do Instagram")}</Label>
            <Input
              id="igid"
              value={form.instagram_account_id}
              onChange={(e) => setForm((f) => ({ ...f, instagram_account_id: e.target.value }))}
              placeholder="17841400000000000"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tok">{t("Token de acesso")}</Label>
            <Input
              id="tok"
              type="password"
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              placeholder={
                estado?.hasToken ? t("•••• (já guardado — preencha para trocar)") : "EAAG…"
              }
              required
            />
          </div>
          <Button type="submit" disabled={conectar.isPending} data-testid="btn-conectar-instagram">
            {conectar.isPending ? t("Validando com a Meta…") : t("Validar e conectar")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
