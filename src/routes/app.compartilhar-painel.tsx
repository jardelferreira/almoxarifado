import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Copy,
  Download,
  Link2,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Printer,
  QrCode,
  Share2,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { publicarPainelFuncionariosNuvem } from "@/lib/painel-funcionarios-r2";
import { montarPublicacaoPainelFuncionarios } from "@/services/painel-funcionarios";

export const Route = createFileRoute("/app/compartilhar-painel")({
  ssr: false,
  head: () => ({ meta: [{ title: "Compartilhar painel" }] }),
  component: CompartilharPainelPage,
});

type Compartilhamento = {
  url: string;
  qrDataUrl: string;
  publicadoEm: string;
  funcionarios: number;
};

export function CompartilharPainelPage() {
  const [projetoId] = useProjetoAtivoId();
  const [senha, setSenha] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [compartilhamento, setCompartilhamento] = useState<Compartilhamento | null>(null);

  const publicar = async () => {
    if (!projetoId || senha.length < 16) {
      toast.error("Informe a senha do projeto com pelo menos 16 caracteres.");
      return;
    }
    try {
      setPublicando(true);
      const publicacao = await montarPublicacaoPainelFuncionarios(projetoId);
      const resultado = await publicarPainelFuncionariosNuvem({
        data: { projetoId, senha, publicacao },
      });
      const url = `${window.location.origin}/consulta-funcionario?projeto=${encodeURIComponent(projetoId)}`;
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 900,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#17324d", light: "#ffffff" },
      });
      setCompartilhamento({
        url,
        qrDataUrl,
        publicadoEm: resultado.publicadoEm,
        funcionarios: resultado.funcionariosPublicados,
      });
      toast.success(`${resultado.funcionariosPublicados} ficha(s) publicada(s) na Cloudflare.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o painel público.",
      );
    } finally {
      setPublicando(false);
    }
  };

  const copiar = async () => {
    if (!compartilhamento) return;
    try {
      await navigator.clipboard.writeText(compartilhamento.url);
      toast.success("Link do painel copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const compartilharWhatsApp = () => {
    if (!compartilhamento) return;
    const texto = `Acesse o painel de consulta do almoxarifado: ${compartilhamento.url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const baixarQr = () => {
    if (!compartilhamento) return;
    const link = document.createElement("a");
    link.href = compartilhamento.qrDataUrl;
    link.download = `qrcode-painel-funcionarios-${projetoId}.png`;
    link.click();
  };

  const imprimirQr = () => {
    if (!compartilhamento) return;
    const janela = window.open("", "_blank", "width=900,height=900");
    if (!janela) {
      toast.error("O navegador bloqueou a janela de impressão.");
      return;
    }
    janela.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Painel de consulta do funcionário</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{margin:0;background:#f4f7f9;color:#17324d;font-family:Arial,sans-serif}.folha{min-height:265mm;border:1px solid #cbd7df;border-radius:18px;background:#fff;padding:22mm 18mm;position:relative;overflow:hidden}.folha:before{content:"";position:absolute;inset:0 auto 0 0;width:14px;background:#f59e0b}.marca{text-transform:uppercase;letter-spacing:2px;font-size:12px;font-weight:bold;color:#1c5877}h1{font-size:30px;margin:12px 0 8px}p{font-size:16px;line-height:1.55;color:#526777}.qr{display:block;width:132mm;height:132mm;margin:24mm auto 15mm;border:12px solid #fff;box-shadow:0 5px 20px #17324d22}.instrucoes{border-top:2px solid #dbe5ea;padding-top:14px;text-align:center}.rodape{position:absolute;bottom:14mm;left:18mm;right:18mm;border-top:1px solid #dbe5ea;padding-top:8px;color:#708492;font-size:11px;text-align:center}</style></head><body><main class="folha"><div class="marca">Almoxarifado · Atendimento digital</div><h1>Consulte sua ficha</h1><p>Aponte a câmera do celular para o QR Code e informe seu CPF. Se houver PIN cadastrado, o painel solicitará essa confirmação.</p><img class="qr" src="${compartilhamento.qrDataUrl}" alt="QR Code do painel de consulta"><div class="instrucoes"><strong>Consulta de equipamentos e materiais</strong><p>Link: ${escapar(compartilhamento.url)}</p></div><div class="rodape">Informações somente para consulta · Atualização controlada pelo almoxarifado</div></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`,
    );
    janela.document.close();
    janela.focus();
  };

  if (!projetoId)
    return <p className="text-sm text-muted-foreground">Selecione um projeto para continuar.</p>;

  return (
    <div className="space-y-6 text-[15px] lg:text-base">
      <header className="border-b pb-5">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:text-base">
          <QrCode className="size-4 text-primary" aria-hidden="true" /> Painéis · Consulta pública
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight lg:text-4xl">
          Compartilhar painel do funcionário
        </h1>
        <p className="mt-2 max-w-3xl text-base text-muted-foreground lg:text-lg">
          Publique um acesso simples para que cada funcionário consulte sua ficha de equipamentos e
          materiais usando CPF e, quando cadastrado, PIN.
        </p>
      </header>

      <Card className="border-l-4 border-l-violet-500 shadow-sm">
        <CardHeader className="border-b bg-violet-500/[0.04] pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-700">
              <Share2 className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold lg:text-lg">Atualização do painel</h2>
              <p className="text-sm text-muted-foreground lg:text-base">
                O link é único por projeto e os dados publicados são protegidos individualmente.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <LockKeyhole className="size-4 text-primary" /> Senha do projeto
              </span>
              <Input
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Mínimo de 16 caracteres"
                autoComplete="new-password"
                className="h-11"
              />
            </label>
            <Button
              onClick={() => void publicar()}
              disabled={publicando || senha.length < 16}
              className="h-11"
            >
              {publicando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Share2 className="size-4" />
              )}{" "}
              {publicando ? "Atualizando…" : "Atualizar painel"}
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            São publicados somente funcionários ativos com CPF cadastrado. O banco local completo
            nunca é enviado.
          </p>
          {compartilhamento && (
            <div className="grid gap-4 rounded-2xl border bg-muted/15 p-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
              <img
                src={compartilhamento.qrDataUrl}
                alt="QR Code do painel de consulta dos funcionários"
                className="mx-auto aspect-square w-44 rounded-xl border bg-white p-2"
              />
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="font-semibold">Painel atualizado</p>
                  <p className="text-sm text-muted-foreground">
                    {compartilhamento.funcionarios} funcionário(s) publicado(s) em{" "}
                    {new Date(compartilhamento.publicadoEm).toLocaleString("pt-BR")}.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-background p-2">
                  <Link2 className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm">{compartilhamento.url}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void copiar()}
                    aria-label="Copiar link"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={baixarQr}>
                    <Download className="mr-1.5 size-4" /> Baixar QR
                  </Button>
                  <Button size="sm" variant="outline" onClick={imprimirQr}>
                    <Printer className="mr-1.5 size-4" /> Imprimir QR
                  </Button>
                  <Button size="sm" variant="outline" onClick={compartilharWhatsApp}>
                    <MessageCircle className="mr-1.5 size-4" /> WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function escapar(valor: unknown): string {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
