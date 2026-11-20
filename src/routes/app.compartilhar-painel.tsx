import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Copy,
  CheckCircle2,
  CloudUpload,
  Download,
  Eye,
  Link2,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Printer,
  QrCode,
  PackageSearch,
  Share2,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { publicarPainelFuncionariosNuvem } from "@/lib/painel-funcionarios-r2";
import { publicarPainelEstoqueNuvem } from "@/lib/painel-estoque-r2";
import { montarPublicacaoPainelFuncionarios } from "@/services/painel-funcionarios";
import { montarPublicacaoPainelEstoque } from "@/services/painel-estoque";

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

type CompartilhamentoEstoque = {
  url: string;
  qrDataUrl: string;
  publicadoEm: string;
  itens: number;
};

const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;

function chaveSessao(projetoId: string): string {
  return `almox.painel.senha.${projetoId}`;
}

function chaveCompartilhamentos(projetoId: string): string {
  return `almox.painel.compartilhamentos.${projetoId}`;
}

export function CompartilharPainelPage() {
  const [projetoId] = useProjetoAtivoId();
  const [senha, setSenha] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [compartilhamento, setCompartilhamento] = useState<Compartilhamento | null>(null);
  const [compartilhamentoEstoque, setCompartilhamentoEstoque] =
    useState<CompartilhamentoEstoque | null>(null);
  const [sessaoExpiraEm, setSessaoExpiraEm] = useState<number | null>(null);

  useEffect(() => {
    if (!projetoId) return;
    try {
      const salvo = sessionStorage.getItem(chaveSessao(projetoId));
      if (!salvo) return;
      const sessao = JSON.parse(salvo) as { senha?: string; expiraEm?: number };
      if (sessao.senha && sessao.expiraEm && sessao.expiraEm > Date.now()) {
        setSenha(sessao.senha);
        setSessaoExpiraEm(sessao.expiraEm);
      } else {
        sessionStorage.removeItem(chaveSessao(projetoId));
      }
    } catch {
      sessionStorage.removeItem(chaveSessao(projetoId));
    }
  }, [projetoId]);

  useEffect(() => {
    if (!projetoId) return;
    const carregar = async () => {
      try {
        const salvo = localStorage.getItem(chaveCompartilhamentos(projetoId));
        if (!salvo) return;
        const armazenado = JSON.parse(salvo) as {
          funcionario?: Omit<Compartilhamento, "qrDataUrl">;
          estoque?: Omit<CompartilhamentoEstoque, "qrDataUrl">;
        };
        if (armazenado.funcionario?.url) {
          const qrDataUrl = await gerarQr(armazenado.funcionario.url);
          setCompartilhamento({ ...armazenado.funcionario, qrDataUrl });
        }
        if (armazenado.estoque?.url) {
          const qrDataUrl = await gerarQr(armazenado.estoque.url);
          setCompartilhamentoEstoque({ ...armazenado.estoque, qrDataUrl });
        }
      } catch {
        localStorage.removeItem(chaveCompartilhamentos(projetoId));
      }
    };
    void carregar();
  }, [projetoId]);

  const guardarSessao = (senhaAtual: string) => {
    if (!projetoId) return;
    sessionStorage.setItem(
      chaveSessao(projetoId),
      JSON.stringify({ senha: senhaAtual, expiraEm: Date.now() + DURACAO_SESSAO_MS }),
    );
    setSessaoExpiraEm(Date.now() + DURACAO_SESSAO_MS);
  };

  const obterSenhaAutorizada = (): string | null => {
    if (!projetoId) return null;
    try {
      const salvo = sessionStorage.getItem(chaveSessao(projetoId));
      if (salvo) {
        const sessao = JSON.parse(salvo) as { senha?: string; expiraEm?: number };
        if (sessao.senha && sessao.expiraEm && sessao.expiraEm > Date.now()) {
          setSenha(sessao.senha);
          setSessaoExpiraEm(sessao.expiraEm);
          return sessao.senha;
        }
      }
    } catch {
      // O formulário abaixo permite renovar a sessão sem bloquear a tela.
    }

    // Na primeira sincronização ainda não existe sessão salva. Nesse caso,
    // aproveita a senha informada no formulário e só cria a sessão depois que
    // o Worker confirmar a publicação com sucesso.
    const senhaDigitada = senha.trim();
    if (senhaDigitada.length >= 16) {
      return senhaDigitada;
    }

    toast.info("Informe a senha do projeto para sincronizar os dados.");
    return null;
  };

  const salvarCompartilhamentos = (dados: {
    funcionario?: Compartilhamento;
    estoque?: CompartilhamentoEstoque;
  }) => {
    if (!projetoId) return;
    const atual = localStorage.getItem(chaveCompartilhamentos(projetoId));
    const anterior = atual ? (JSON.parse(atual) as Record<string, unknown>) : {};
    localStorage.setItem(
      chaveCompartilhamentos(projetoId),
      JSON.stringify({
        ...anterior,
        ...(dados.funcionario
          ? { funcionario: (({ qrDataUrl: _qr, ...rest }) => rest)(dados.funcionario) }
          : {}),
        ...(dados.estoque
          ? { estoque: (({ qrDataUrl: _qr, ...rest }) => rest)(dados.estoque) }
          : {}),
      }),
    );
  };

  const publicar = async () => {
    const senhaAutorizada = obterSenhaAutorizada();
    if (!projetoId || !senhaAutorizada) {
      return;
    }
    try {
      setPublicando(true);
      const publicacao = await montarPublicacaoPainelFuncionarios(projetoId);
      const resultado = await publicarPainelFuncionariosNuvem({
        data: { projetoId, senha: senhaAutorizada, publicacao },
      });
      guardarSessao(senhaAutorizada);
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
      salvarCompartilhamentos({
        funcionario: {
          url,
          qrDataUrl,
          publicadoEm: resultado.publicadoEm,
          funcionarios: resultado.funcionariosPublicados,
        },
      });
      const resumoPush = resultado.push.configurado
        ? ` Avisos: ${resultado.push.enviadas}/${resultado.push.selecionadas} enviados.`
        : " Notificações push ainda não configuradas.";
      toast.success(
        `${resultado.funcionariosPublicados} ficha(s) publicada(s) na Cloudflare.${resumoPush}`,
      );
      if (resultado.push.configurado && resultado.push.falhas > 0) {
        toast.warning(`${resultado.push.falhas} dispositivo(s) não aceitaram o aviso.`, {
          duration: 7000,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o painel público.",
      );
    } finally {
      setPublicando(false);
    }
  };

  const publicarEstoque = async () => {
    const senhaAutorizada = obterSenhaAutorizada();
    if (!projetoId || !senhaAutorizada) {
      return;
    }
    try {
      setPublicando(true);
      const publicacao = await montarPublicacaoPainelEstoque(projetoId);
      const resultado = await publicarPainelEstoqueNuvem({
        data: { projetoId, senha: senhaAutorizada, publicacao },
      });
      guardarSessao(senhaAutorizada);
      const url = `${window.location.origin}/consulta-estoque?projeto=${encodeURIComponent(projetoId)}&acesso=${resultado.token}`;
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 900,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#17324d", light: "#ffffff" },
      });
      setCompartilhamentoEstoque({
        url,
        qrDataUrl,
        publicadoEm: resultado.publicadoEm,
        itens: resultado.itensPublicados,
      });
      salvarCompartilhamentos({
        estoque: {
          url,
          qrDataUrl,
          publicadoEm: resultado.publicadoEm,
          itens: resultado.itensPublicados,
        },
      });
      toast.success(`${resultado.itensPublicados} posição(ões) de estoque publicada(s).`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o painel de estoque.",
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

  const copiarUrl = async (url: string, mensagem: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(mensagem);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const compartilharLink = (url: string, tipo: string) => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`Acesse o painel de consulta ${tipo}: ${url}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const imprimirQrEstoque = () => {
    if (!compartilhamentoEstoque) return;
    const janela = window.open("", "_blank", "width=900,height=900");
    if (!janela) {
      toast.error("O navegador bloqueou a janela de impressão.");
      return;
    }
    janela.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Consulta de estoque</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{margin:0;background:#f4f7f9;color:#17324d;font-family:Arial,sans-serif}.folha{min-height:265mm;border:1px solid #cbd7df;border-radius:18px;background:#fff;padding:22mm 18mm;position:relative;overflow:hidden}.folha:before{content:"";position:absolute;inset:0 auto 0 0;width:14px;background:#f59e0b}.marca{text-transform:uppercase;letter-spacing:2px;font-size:12px;font-weight:bold;color:#1c5877}h1{font-size:30px;margin:12px 0 8px}p{font-size:16px;line-height:1.55;color:#526777}.qr{display:block;width:132mm;height:132mm;margin:24mm auto 15mm;border:12px solid #fff;box-shadow:0 5px 20px #17324d22}.instrucoes{border-top:2px solid #dbe5ea;padding-top:14px;text-align:center}.rodape{position:absolute;bottom:14mm;left:18mm;right:18mm;border-top:1px solid #dbe5ea;padding-top:8px;color:#708492;font-size:11px;text-align:center}</style></head><body><main class="folha"><div class="marca">Almoxarifado · Consulta digital</div><h1>Consulte o estoque</h1><p>Aponte a câmera do celular para o QR Code e consulte os materiais publicados pelo almoxarifado.</p><img class="qr" src="${compartilhamentoEstoque.qrDataUrl}" alt="QR Code do painel de estoque"><div class="instrucoes"><strong>Consulta de saldo, equipe e situação dos materiais</strong><p>Link: ${escapar(compartilhamentoEstoque.url)}</p></div><div class="rodape">Informações somente para consulta · Atualização controlada pelo almoxarifado</div></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`,
    );
    janela.document.close();
    janela.focus();
  };

  if (!projetoId)
    return <p className="text-sm text-muted-foreground">Selecione um projeto para continuar.</p>;

  const sessaoAtiva = Boolean(sessaoExpiraEm && sessaoExpiraEm > Date.now());

  return (
    <div className="space-y-6 text-[15px] lg:text-base">
      <header className="border-b pb-5">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:text-base">
          <QrCode className="size-4 text-primary" aria-hidden="true" /> Painéis · Compartilhamento
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight lg:text-4xl">
          Compartilhar painéis
        </h1>
        <p className="mt-2 max-w-3xl text-base text-muted-foreground lg:text-lg">
          Sincronize os dados quando necessário e compartilhe os acessos já publicados.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="flex items-center gap-3">
            <CloudUpload className="size-5 text-violet-700" />
            <div>
              <p className="font-semibold text-violet-950 dark:text-violet-100">Sincronização</p>
              <p className="text-sm text-violet-800/80 dark:text-violet-200/80">
                Publica uma nova versão na nuvem.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20">
          <div className="flex items-center gap-3">
            <Eye className="size-5 text-sky-700" />
            <div>
              <p className="font-semibold text-sky-950 dark:text-sky-100">Compartilhamentos</p>
              <p className="text-sm text-sky-800/80 dark:text-sky-200/80">
                Copia links, gera QR Codes e envia pelo WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="sincronizacao" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border bg-card p-1">
          <TabsTrigger value="sincronizacao" className="min-h-11 gap-2 text-sm lg:text-base">
            <CloudUpload className="size-4" /> Sincronizar dados
          </TabsTrigger>
          <TabsTrigger value="compartilhar" className="min-h-11 gap-2 text-sm lg:text-base">
            <Eye className="size-4" /> Compartilhar acessos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sincronizacao" className="space-y-4">
          <Card className="border-l-4 border-l-violet-500 shadow-sm">
            <CardHeader className="border-b bg-violet-500/[0.04] pb-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-700">
                  <CloudUpload className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold lg:text-lg">Atualizar dados publicados</h2>
                  <p className="mt-1 text-sm text-muted-foreground lg:text-base">
                    Escolha qual painel receberá os dados atuais do projeto. Esta é a única área que
                    solicita a senha.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
                <label className="block space-y-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <LockKeyhole className="size-4 text-primary" /> Senha do projeto
                  </span>
                  <Input
                    type="password"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    placeholder="Mínimo de 16 caracteres"
                    autoComplete="current-password"
                    className="h-11"
                  />
                  <span className="block text-xs text-muted-foreground">
                    A senha fica válida por 8 horas neste navegador e só é usada para sincronizar.
                  </span>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  onClick={() => void publicar()}
                  disabled={publicando}
                  className="h-auto min-h-14 justify-start whitespace-normal py-3 text-left"
                >
                  <Share2 className="mr-2 size-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">Sincronizar ficha</span>
                    <span className="block text-xs font-normal opacity-85">
                      Funcionários, CPF, PIN e equipamentos
                    </span>
                  </span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void publicarEstoque()}
                  disabled={publicando}
                  className="h-auto min-h-14 justify-start whitespace-normal py-3 text-left"
                >
                  <PackageSearch className="mr-2 size-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">Sincronizar estoque</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Saldo, unidade, equipe e situação
                    </span>
                  </span>
                </Button>
              </div>

              <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>
                  {sessaoAtiva
                    ? `Sessão ativa até ${new Date(sessaoExpiraEm as number).toLocaleString("pt-BR")}.`
                    : "Nenhuma sessão ativa. A senha será validada ao sincronizar."}
                  <span className="mt-1 block text-xs">
                    O banco local completo nunca é enviado; cada painel recebe somente os dados
                    necessários.
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compartilhar" className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Acessos sem nova sincronização</p>
            <p className="mt-1">
              Os links e QR Codes abaixo podem ser reutilizados. A senha não é necessária para
              copiar, baixar, imprimir ou enviar um acesso já publicado.
            </p>
          </div>

          <Card className="border-l-4 border-l-sky-500 shadow-sm">
            <CardHeader className="border-b bg-sky-500/[0.04] pb-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-700">
                  <Share2 className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold lg:text-lg">Ficha do funcionário</h2>
                  <p className="mt-1 text-sm text-muted-foreground lg:text-base">
                    Consulta individual de equipamentos e materiais por CPF.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {compartilhamento ? (
                <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
                  <img
                    src={compartilhamento.qrDataUrl}
                    alt="QR Code da ficha do funcionário"
                    className="mx-auto aspect-square w-44 rounded-xl border bg-white p-2"
                  />
                  <div className="min-w-0 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {compartilhamento.funcionarios} funcionário(s) publicado(s) em{" "}
                      {new Date(compartilhamento.publicadoEm).toLocaleString("pt-BR")}.
                    </p>
                    <div className="flex items-center gap-2 rounded-lg border bg-background p-2">
                      <Link2 className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {compartilhamento.url}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void copiar()}
                        aria-label="Copiar link da ficha"
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
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  A ficha ainda não foi sincronizada. Acesse “Sincronizar dados” para publicá-la.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 shadow-sm">
            <CardHeader className="border-b bg-amber-500/[0.04] pb-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-700">
                  <PackageSearch className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold lg:text-lg">Consulta de estoque</h2>
                  <p className="mt-1 text-sm text-muted-foreground lg:text-base">
                    Consulta pública somente leitura do saldo, unidade, equipe e situação.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {compartilhamentoEstoque ? (
                <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
                  <img
                    src={compartilhamentoEstoque.qrDataUrl}
                    alt="QR Code da consulta de estoque"
                    className="mx-auto aspect-square w-44 rounded-xl border bg-white p-2"
                  />
                  <div className="min-w-0 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {compartilhamentoEstoque.itens} posição(ões) publicada(s) em{" "}
                      {new Date(compartilhamentoEstoque.publicadoEm).toLocaleString("pt-BR")}.
                    </p>
                    <div className="flex items-center gap-2 rounded-lg border bg-background p-2">
                      <Link2 className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {compartilhamentoEstoque.url}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          void copiarUrl(compartilhamentoEstoque.url, "Link do estoque copiado.")
                        }
                        aria-label="Copiar link do estoque"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const link = document.createElement("a");
                          link.href = compartilhamentoEstoque.qrDataUrl;
                          link.download = `qrcode-painel-estoque-${projetoId}.png`;
                          link.click();
                        }}
                      >
                        <Download className="mr-1.5 size-4" /> Baixar QR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => compartilharLink(compartilhamentoEstoque.url, "de estoque")}
                      >
                        <MessageCircle className="mr-1.5 size-4" /> WhatsApp
                      </Button>
                      <Button size="sm" variant="outline" onClick={imprimirQrEstoque}>
                        <Printer className="mr-1.5 size-4" /> Imprimir QR
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  O estoque ainda não foi sincronizado. Acesse “Sincronizar dados” para publicá-lo.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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

async function gerarQr(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 900,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#17324d", light: "#ffffff" },
  });
}
