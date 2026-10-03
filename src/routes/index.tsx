import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Fingerprint,
  FolderOpen,
  HardDrive,
  Linkedin,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useProjetoAtivoId, useProjetos, useOnline } from "@/hooks/useAppData";
import { repo } from "@/services/repo";
import {
  compatibilizarDataset,
  verificarCompatibilidadeImportacao,
  lerArquivo,
  salvarDataset,
  type DatasetImportado,
} from "@/services/excel";
import { formatarData, hoje } from "@/utils/format";
import { uid } from "@/db/db";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Projeto = NonNullable<ReturnType<typeof useProjetos>>[number];

type FormProjeto = {
  codigo: string;
  nome: string;
  empresa: string;
  data_inicio: string;
  data_fim: string;
};

type Filtro = "todos" | "ativos" | "outros";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Gestão de Almoxarifado Offline — Projetos" },
      {
        name: "description",
        content:
          "Aplicativo local-first de gestão de almoxarifado: controle de estoque, movimentações e dashboard, funcionando offline no seu dispositivo.",
      },
      { property: "og:title", content: "Gestão de Almoxarifado Offline" },
      {
        property: "og:description",
        content:
          "Controle de estoque, movimentações e dashboard offline, com importação e exportação em Excel.",
      },
    ],
  }),
  component: Home,
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const MS_DIA = 86_400_000;
const FORM_VAZIO = (): FormProjeto => ({
  codigo: "",
  nome: "",
  empresa: "",
  data_inicio: hoje(),
  data_fim: "",
});

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function paraDia(valor?: string | null) {
  if (!valor) return null;
  const d = new Date(`${valor.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const plural = (n: number, singular: string, pl: string) => `${n} ${n === 1 ? singular : pl}`;

/** Resume o andamento do prazo do projeto para exibir texto + barra de progresso. */
function situacaoPrazo(p: Projeto) {
  const ini = paraDia(p.data_inicio);
  const fim = paraDia(p.data_fim);
  const agora = new Date();
  agora.setHours(0, 0, 0, 0);
  const emDias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MS_DIA);

  const pct =
    ini && fim && fim > ini
      ? Math.min(100, Math.max(0, ((agora.getTime() - ini.getTime()) / (fim.getTime() - ini.getTime())) * 100))
      : null;

  if (!ini && !fim) return { texto: "Sem prazo definido", pct: null, alerta: false };

  if (ini && agora < ini) {
    return { texto: `Começa em ${plural(emDias(agora, ini), "dia", "dias")}`, pct: 0, alerta: false };
  }

  if (fim) {
    const restam = emDias(agora, fim);
    if (restam < 0) {
      return {
        texto: `Prazo encerrado há ${plural(-restam, "dia", "dias")}`,
        pct: 100,
        alerta: p.status === "ATIVO",
      };
    }
    if (restam === 0) return { texto: "Termina hoje", pct, alerta: true };
    return {
      texto: restam === 1 ? "Falta 1 dia" : `Faltam ${restam} dias`,
      pct,
      alerta: restam <= 7 && p.status === "ATIVO",
    };
  }

  return { texto: "Sem data de término", pct: null, alerta: false };
}

function validar(f: FormProjeto) {
  const erros: Partial<Record<keyof FormProjeto, string>> = {};
  if (!f.codigo.trim()) erros.codigo = "Informe o código";
  if (!f.nome.trim()) erros.nome = "Informe o nome";
  if (f.data_inicio && f.data_fim && f.data_fim < f.data_inicio) {
    erros.data_fim = "O término não pode ser antes do início";
  }
  return erros;
}

/* -------------------------------------------------------------------------- */
/* Componentes                                                                */
/* -------------------------------------------------------------------------- */

function PrazoProjeto({ projeto }: { projeto: Projeto }) {
  const s = situacaoPrazo(projeto);
  const temDatas = Boolean(projeto.data_inicio || projeto.data_fim);

  return (
    <div className="space-y-1.5">
      <p
        className={`flex items-center gap-1.5 text-xs font-medium ${
          s.alerta ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        }`}
      >
        <Calendar className="size-3.5 shrink-0" aria-hidden />
        {s.texto}
      </p>
      {s.pct !== null && (
        <div
          role="progressbar"
          aria-label="Andamento do prazo do projeto"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(s.pct)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 ${
              s.alerta ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${s.pct}%` }}
          />
        </div>
      )}
      {temDatas && (
        <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{projeto.data_inicio ? formatarData(projeto.data_inicio) : "—"}</span>
          <span>{projeto.data_fim ? formatarData(projeto.data_fim) : "—"}</span>
        </div>
      )}
    </div>
  );
}

function CartaoProjeto({
  projeto,
  ultimo,
  ocupado,
  onAbrir,
  onDuplicar,
  onEditar,
  onExcluir,
}: {
  projeto: Projeto;
  ultimo: boolean;
  ocupado: boolean;
  onAbrir: () => void;
  onDuplicar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const ativo = projeto.status === "ATIVO";

  return (
    <Card
      className={`min-w-0 max-w-full gap-0 overflow-hidden py-0 motion-safe:transition-shadow hover:shadow-md ${
        ultimo ? "border-primary/50 ring-1 ring-primary/20" : ativo ? "border-primary/30" : ""
      }`}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Abrir projeto ${projeto.codigo} ${projeto.nome}`}
        className="flex w-full min-w-0 flex-col gap-3 p-4 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-display text-sm font-semibold text-primary">{projeto.codigo}</span>
            <h3 className="mt-0.5 line-clamp-2 break-words text-base font-semibold leading-snug">
              {projeto.nome}
            </h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={ativo ? "default" : "secondary"}>{projeto.status}</Badge>
            {ultimo && (
              <Badge variant="outline" className="text-[10px]">
                Último aberto
              </Badge>
            )}
          </div>
        </div>
        <PrazoProjeto projeto={projeto} />
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
        <Button size="sm" className="gap-1.5" onClick={onAbrir}>
          <FolderOpen className="size-4" /> Abrir
        </Button>
        <div className="flex items-center">
          <Button
            size="icon"
            variant="ghost"
            className="size-10 sm:size-9"
            title="Duplicar"
            aria-label={`Duplicar ${projeto.nome}`}
            disabled={ocupado}
            onClick={onDuplicar}
          >
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-10 sm:size-9"
            title="Editar"
            aria-label={`Editar ${projeto.nome}`}
            onClick={onEditar}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-10 text-destructive hover:text-destructive sm:size-9"
            title="Excluir"
            aria-label={`Excluir ${projeto.nome}`}
            onClick={onExcluir}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Campo({
  id,
  label,
  erro,
  className = "",
  children,
}: {
  id: string;
  label: string;
  erro?: string | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

function CabecalhoDialogo({
  icone,
  titulo,
  descricao,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <DialogHeader className="min-w-0 flex-row items-center gap-3 rounded-lg border border-border bg-primary/10 p-3 pr-10 text-left sm:pr-12">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <DialogTitle className="break-words text-left text-base leading-tight sm:text-lg">{titulo}</DialogTitle>
        <DialogDescription className="mt-0.5 break-words text-left text-xs sm:text-sm">
          {descricao}
        </DialogDescription>
      </span>
    </DialogHeader>
  );
}

function DialogoProjeto({
  aberto,
  onFechar,
  modo,
  valor,
  onChange,
  salvando,
  onSalvar,
}: {
  aberto: boolean;
  onFechar: () => void;
  modo: "criar" | "editar";
  valor: FormProjeto;
  onChange: (v: FormProjeto) => void;
  salvando: boolean;
  onSalvar: () => void;
}) {
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (aberto) setTentou(false);
  }, [aberto]);

  const erros = tentou ? validar(valor) : {};
  const criar = modo === "criar";

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (Object.keys(validar(valor)).length > 0) return;
    onSalvar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl grid-cols-1 gap-4 overflow-x-hidden overflow-y-auto p-4 sm:w-full sm:p-6 [&>*]:min-w-0">
        <CabecalhoDialogo
          icone={criar ? <Plus className="size-5" /> : <Pencil className="size-5" />}
          titulo={criar ? "Novo projeto" : "Editar projeto"}
          descricao={
            criar ? "Código e nome já bastam para começar." : "Atualize os dados principais do projeto."
          }
        />
        <form onSubmit={submeter} noValidate className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="proj-codigo" label="Código" erro={erros.codigo}>
              <Input
                id="proj-codigo"
                autoComplete="off"
                value={valor.codigo}
                aria-invalid={!!erros.codigo}
                aria-describedby={erros.codigo ? "proj-codigo-erro" : undefined}
                onChange={(e) => onChange({ ...valor, codigo: e.target.value })}
                placeholder="032 ou 115..."
              />
            </Campo>
            <Campo id="proj-nome" label="Nome" erro={erros.nome}>
              <Input
                id="proj-nome"
                autoComplete="off"
                value={valor.nome}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? "proj-nome-erro" : undefined}
                onChange={(e) => onChange({ ...valor, nome: e.target.value })}
                placeholder="Nome do Projeto - Etapa ou Fase"
              />
            </Campo>
            {criar && (
              <Campo id="proj-empresa" label="Empresa (opcional)" className="sm:col-span-2">
                <Input
                  id="proj-empresa"
                  autoComplete="off"
                  value={valor.empresa}
                  onChange={(e) => onChange({ ...valor, empresa: e.target.value })}
                  placeholder="Nome da Empresa"
                />
              </Campo>
            )}
            <Campo id="proj-inicio" label="Data de início">
              <Input
                id="proj-inicio"
                type="date"
                value={valor.data_inicio}
                onChange={(e) => onChange({ ...valor, data_inicio: e.target.value })}
              />
            </Campo>
            <Campo id="proj-fim" label="Data de término" erro={erros.data_fim}>
              <Input
                id="proj-fim"
                type="date"
                value={valor.data_fim}
                min={valor.data_inicio || undefined}
                aria-invalid={!!erros.data_fim}
                aria-describedby={erros.data_fim ? "proj-fim-erro" : undefined}
                onChange={(e) => onChange({ ...valor, data_fim: e.target.value })}
              />
            </Campo>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
            <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" className="gap-2 font-semibold shadow-sm" disabled={salvando}>
              {salvando ? <Loader2 className="size-4 animate-spin" /> : criar ? <Plus className="size-4" /> : <CheckCircle2 className="size-4" />}
              {criar ? "Criar projeto" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Tela                                                                       */
/* -------------------------------------------------------------------------- */

function Home() {
  const projetos = useProjetos();
  const [projetoAtivoId, setProjetoAtivo] = useProjetoAtivoId();
  const navigate = useNavigate();
  const online = useOnline();

  const [novoAberto, setNovoAberto] = useState(false);
  const [form, setForm] = useState<FormProjeto>(FORM_VAZIO);
  const [criando, setCriando] = useState(false);

  const [editando, setEditando] = useState<Projeto | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormProjeto>(FORM_VAZIO);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [excluindo, setExcluindo] = useState<Projeto | null>(null);
  const [excluindoEmCurso, setExcluindoEmCurso] = useState(false);
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null);

  const [limparAberto, setLimparAberto] = useState(false);
  const [confirmacaoLimpar, setConfirmacaoLimpar] = useState("");
  const [limpando, setLimpando] = useState(false);

  const [preview, setPreview] = useState<DatasetImportado | null>(null);
  const [compatibilizando, setCompatibilizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const inputXlsx = useRef<HTMLInputElement>(null);

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const [arrastando, setArrastando] = useState(false);
  const contadorArraste = useRef(0);

  const lista = projetos ?? [];
  const carregando = projetos === undefined;
  const ultimo = lista.find((p) => p.id === projetoAtivoId) ?? null;

  const temAtivos = lista.some((p) => p.status === "ATIVO");
  const temOutros = lista.some((p) => p.status !== "ATIVO");
  const mostrarFiltros = temAtivos && temOutros;
  const mostrarBusca = lista.length >= 5;
  const filtrando = busca.trim() !== "" || filtro !== "todos";

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return lista.filter((p) => {
      if (filtro === "ativos" && p.status !== "ATIVO") return false;
      if (filtro === "outros" && p.status === "ATIVO") return false;
      if (!termo) return true;
      return normalizar(`${p.codigo} ${p.nome}`).includes(termo);
    });
  }, [lista, busca, filtro]);

  /* ------------------------------ PWA install ------------------------------ */

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

    setIsInstalled(standalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const instalar = async () => {
    if (!installPrompt) {
      toast.info("A instalação pode ser feita pelo menu do navegador.");
      return;
    }

    const promptEvent = installPrompt;
    setInstallPrompt(null);

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;

      if (outcome === "accepted") {
        setIsInstalled(true);
      }
    } catch (error) {
      console.warn("Não foi possível abrir a instalação do aplicativo", error);
      toast.info("A instalação pode ser feita pelo menu do navegador.");
    }
  };

  /* -------------------------------- Projetos ------------------------------- */

  const abrir = (id: string) => {
    setProjetoAtivo(id);
    navigate({ to: "/app" });
  };

  const abrirNovo = () => {
    setForm(FORM_VAZIO());
    setNovoAberto(true);
  };

  const criar = async () => {
    setCriando(true);
    try {
      // Primeiro criamos o projeto para obter seu ID.
      const p = await repo.saveProjeto({
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        empresa_id: null,
        status: "ATIVO",
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        observacao: null,
      });

      // A empresa depende do projeto, portanto é criada depois.
      let empresaId: string | null = null;

      if (form.empresa.trim()) {
        const emp = await repo.empresas.save(p.id, {
          projeto_id: p.id,
          nome: form.empresa.trim(),
          tipo: "PROPRIA",
          ativo: true,
        });

        empresaId = emp.id;

        // Atualiza o projeto com a empresa recém-criada.
        await repo.saveProjeto({
          ...p,
          empresa_id: empresaId,
        });
      }

      toast.success("Projeto criado");
      setNovoAberto(false);
      abrir(p.id);
    } catch (error) {
      console.error(error);
      toast.error(
        `Não foi possível criar o projeto: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`,
      );
    } finally {
      setCriando(false);
    }
  };

  const duplicar = async (p: Projeto) => {
    setDuplicandoId(p.id);
    try {
      await repo.duplicarProjeto(p.id);
      toast.success(`Projeto ${p.codigo} duplicado`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível duplicar o projeto");
    } finally {
      setDuplicandoId(null);
    }
  };

  const abrirEdicao = (p: Projeto) => {
    setFormEdicao({
      codigo: p.codigo,
      nome: p.nome,
      empresa: "",
      data_inicio: p.data_inicio ?? "",
      data_fim: p.data_fim ?? "",
    });
    setEditando(p);
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setSalvandoEdicao(true);
    try {
      await repo.saveProjeto({
        ...editando,
        codigo: formEdicao.codigo.trim(),
        nome: formEdicao.nome.trim(),
        data_inicio: formEdicao.data_inicio || null,
        data_fim: formEdicao.data_fim || null,
      });
      toast.success("Projeto atualizado");
      setEditando(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o projeto");
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    setExcluindoEmCurso(true);
    try {
      await repo.deleteProjeto(excluindo.id);
      toast.success("Projeto excluído");
      setExcluindo(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o projeto");
    } finally {
      setExcluindoEmCurso(false);
    }
  };

  /* -------------------------------- Planilha ------------------------------- */

  const onXlsx = async (file: File) => {
    try {
      const ds = lerArquivo(await file.arrayBuffer());
      if (!ds.projetos.length) {
        const base = file.name.replace(/\.xlsx?$/i, "");
        ds.projetos = [
          {
            id: uid(),
            codigo: base.slice(0, 20),
            nome: base,
            status: "ATIVO",
          },
        ];
      }
      const compatibilidade = await verificarCompatibilidadeImportacao(ds);
      if (compatibilidade.compativel) {
        ds.compatibilizado = {
          idsGerados: 0,
          catalogosReutilizados: 0,
        };
      }
      setPreview(ds);
    } catch (e) {
      toast.error(`Não foi possível ler a planilha: ${(e as Error).message}`);
    }
  };

  const tornarPlanilhaCompativel = async () => {
    if (!preview || preview.compatibilizado) return;

    setCompatibilizando(true);
    try {
      const compatibilizado = await compatibilizarDataset(preview);
      setPreview(compatibilizado);

      if (compatibilizado.problemas.length > 0) {
        toast.error("A planilha foi reidentificada, mas ainda possui inconsistências que precisam ser corrigidas.");
        return;
      }

      toast.success(
        `Planilha compatível: ${compatibilizado.compatibilizado?.idsGerados ?? 0} IDs recriados e relações preservadas.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível tornar a planilha compatível.",
      );
    } finally {
      setCompatibilizando(false);
    }
  };

  const confirmarImportacao = async () => {
    if (!preview) return;
    if (!preview.compatibilizado) {
      toast.error("Torne a planilha compatível antes de importar.");
      return;
    }
    if (preview.problemas.length > 0) {
      toast.error("A planilha possui inconsistências e não pode ser importada.");
      return;
    }
    setImportando(true);
    try {
      await salvarDataset(preview);
      toast.success("Projeto importado com sucesso");
      const id = preview.projetos[0]?.id;
      setPreview(null);
      if (id) abrir(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o projeto.");
    } finally {
      setImportando(false);
    }
  };

  /* Arrastar e soltar uma planilha em qualquer ponto da tela */
  const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const aoEntrarArraste = (e: DragEvent) => {
    if (!temArquivo(e)) return;
    e.preventDefault();
    contadorArraste.current += 1;
    setArrastando(true);
  };

  const aoSairArraste = (e: DragEvent) => {
    if (!temArquivo(e)) return;
    contadorArraste.current = Math.max(0, contadorArraste.current - 1);
    if (contadorArraste.current === 0) setArrastando(false);
  };

  const aoSoltar = (e: DragEvent) => {
    if (!temArquivo(e)) return;
    e.preventDefault();
    contadorArraste.current = 0;
    setArrastando(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      toast.error("Arquivo não suportado. Envie uma planilha .xlsx");
      return;
    }
    void onXlsx(f);
  };

  /* ------------------------------ Limpar dados ----------------------------- */

  const limparDados = async () => {
    setLimpando(true);
    try {
      if ("indexedDB" in window && typeof indexedDB.databases === "function") {
        const bancos = await indexedDB.databases();
        await Promise.all(
          bancos
            .filter((db) => db.name)
            .map(
              (db) =>
                new Promise<void>((resolve, reject) => {
                  const request = indexedDB.deleteDatabase(db.name!);
                  request.onsuccess = () => resolve();
                  request.onerror = () => reject(request.error ?? new Error("Erro ao limpar banco de dados"));
                  request.onblocked = () => resolve();
                }),
            ),
        );
      }

      localStorage.clear();
      sessionStorage.clear();
      toast.success("Dados do app limpos");
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível limpar todos os dados do app");
      setLimpando(false);
    }
  };

  /* --------------------------------- Render -------------------------------- */

  const modulosPreview = preview
    ? ([
        ["Produtos", preview.contagens["produtos"]],
        ["Movimentações", preview.contagens["movimentacoes"]],
        ["Equipamentos", preview.contagens["equipamentos"]],
        ["Estoque de equipamentos", preview.contagens["estoque_equipamentos"]],
        ["Mov. equipamentos", preview.contagens["movimentacoes_equipamentos"]],
        ["Manutenções", preview.contagens["manutencoes_equipamentos"]],
        ["Documentos", preview.contagens["documentos"]],
        ["Itens de documentos", preview.contagens["documento_itens"]],
        ["Inventários", preview.contagens["inventarios"]],
        ["Itens de inventário", preview.contagens["inventario_itens"]],
        ["Consumos", preview.contagens["consumos_equipamentos"]],
        ["Regras de consumo", preview.contagens["regras_consumo_equipamentos"]],
        ["Perfis de custos", preview.contagens["perfis_parametros_custos"]],
        ["Inteligência", preview.contagens["inteligencia_acoes"]],
      ] as [string, number | undefined][]).filter(([, n]) => Number(n) > 0)
    : [];

  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-clip bg-background"
      onDragEnter={aoEntrarArraste}
      onDragOver={(e) => temArquivo(e) && e.preventDefault()}
      onDragLeave={aoSairArraste}
      onDrop={aoSoltar}
    >
      {arrastando && (
        <div
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/85 p-6 backdrop-blur-sm"
          aria-hidden
        >
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card px-8 py-10 text-center shadow-lg">
            <Upload className="size-10 text-primary" />
            <p className="font-display text-xl font-semibold">Solte a planilha para importar</p>
            <p className="text-sm text-muted-foreground">Você poderá revisar tudo antes de gravar.</p>
          </div>
        </div>
      )}

      <header className="border-b border-border bg-sidebar px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))] text-sidebar-foreground shadow-md sm:px-6 sm:pb-20 sm:pt-10">
        <div className="mx-auto max-w-5xl">
          <Badge className="gap-1.5 bg-sidebar-primary text-sidebar-primary-foreground">
            <span
              className={`size-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`}
              aria-hidden
            />
            {online ? "Online" : "Modo offline — dados salvos neste dispositivo"}
          </Badge>
          <h1 className="mt-3 font-display text-3xl font-bold uppercase tracking-wide text-sidebar-foreground sm:mt-4 md:text-5xl">
            Gestão de Almoxarifado
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sidebar-foreground/75">
            Controle de estoque, movimentações e consumo de obra. Tudo fica salvo no seu dispositivo,
            com Excel apenas para importar e exportar.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl min-w-0 px-4 pb-10 sm:px-6">
        {/* Painel principal: sobe sobre o cabeçalho */}
        <section aria-label="Ações rápidas" className="-mt-10 space-y-3 sm:-mt-12">
          {ultimo && (
            <Card className="gap-0 overflow-hidden border-primary/40 py-0 shadow-lg">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Continuar de onde parou</p>
                    <p className="mt-1 flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-display text-lg font-semibold text-primary">
                        {ultimo.codigo}
                      </span>
                      <span className="line-clamp-2 break-words font-display text-xl font-semibold leading-tight">
                        {ultimo.nome}
                      </span>
                    </p>
                  </div>
                  <div className="max-w-sm">
                    <PrazoProjeto projeto={ultimo} />
                  </div>
                </div>
                <Button size="lg" className="w-full gap-2 font-semibold sm:w-auto" onClick={() => abrir(ultimo.id)}>
                  <FolderOpen className="size-5" />
                  Abrir projeto
                </Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              className="h-auto flex-col items-start justify-start gap-2 whitespace-normal p-4 text-left shadow-md sm:flex-row sm:items-center sm:gap-3"
              onClick={abrirNovo}
            >
              <Plus className="size-5 shrink-0" />
              <span>
                <span className="block font-semibold">Novo projeto</span>
                <span className="block text-xs font-normal opacity-80">Começar do zero</span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col items-start justify-start gap-2 whitespace-normal bg-card p-4 text-left shadow-md sm:flex-row sm:items-center sm:gap-3"
              onClick={() => inputXlsx.current?.click()}
            >
              <FileSpreadsheet className="size-5 shrink-0" />
              <span>
                <span className="block font-semibold">Importar planilha</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  <span className="hidden sm:inline">Arraste ou escolha um </span>.xlsx
                </span>
              </span>
            </Button>
          </div>

          {!isInstalled && (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <Download className="size-4" />
              </span>
              <p className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">Instale o aplicativo</span>
                <span className="block text-xs text-muted-foreground">
                  {installPrompt
                    ? "Abre direto da tela inicial, mesmo sem internet"
                    : "Disponível pelo menu do navegador"}
                </span>
              </p>
              <Button size="sm" variant="secondary" onClick={() => void instalar()}>
                Instalar
              </Button>
            </div>
          )}
        </section>

        <input
          ref={inputXlsx}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onXlsx(f);
            e.target.value = "";
          }}
        />

        {/* Projetos */}
        <section aria-labelledby="titulo-projetos" className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
            <div className="flex items-baseline gap-2">
              <h2 id="titulo-projetos" className="font-display text-2xl font-semibold uppercase tracking-wide">
                Projetos
              </h2>
              <span className="text-sm font-medium text-muted-foreground" aria-live="polite">
                {filtrando && !carregando ? `${visiveis.length} de ${lista.length}` : lista.length}
              </span>
            </div>
            {mostrarFiltros && (
              <div className="flex gap-1.5" role="group" aria-label="Filtrar por status">
                {(
                  [
                    ["todos", "Todos"],
                    ["ativos", "Ativos"],
                    ["outros", "Outros"],
                  ] as [Filtro, string][]
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={filtro === valor}
                    onClick={() => setFiltro(valor)}
                    className={`h-8 rounded-full border px-3 text-xs font-medium outline-none motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                      filtro === valor
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>

          {mostrarBusca && (
            <div className="relative mt-3">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por código ou nome"
                aria-label="Buscar projetos"
                className="h-11 pl-9 pr-10"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  aria-label="Limpar busca"
                  className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}

          <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
            {carregando &&
              [0, 1].map((i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-xl border border-border bg-muted/50 motion-reduce:animate-none"
                  aria-hidden
                />
              ))}

            {!carregando && lista.length === 0 && (
              <div className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
                <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FolderOpen className="size-6" />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold">Nenhum projeto ainda</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Crie um projeto novo ou importe a planilha modelo para começar.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button className="gap-2" onClick={abrirNovo}>
                    <Plus className="size-4" /> Novo projeto
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => inputXlsx.current?.click()}>
                    <FileSpreadsheet className="size-4" /> Importar planilha
                  </Button>
                </div>
              </div>
            )}

            {!carregando && lista.length > 0 && visiveis.length === 0 && (
              <div className="col-span-full flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhum projeto encontrado com esses filtros.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBusca("");
                    setFiltro("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            )}

            {visiveis.map((p) => (
              <CartaoProjeto
                key={p.id}
                projeto={p}
                ultimo={p.id === ultimo?.id}
                ocupado={duplicandoId === p.id}
                onAbrir={() => abrir(p.id)}
                onDuplicar={() => void duplicar(p)}
                onEditar={() => abrirEdicao(p)}
                onExcluir={() => setExcluindo(p)}
              />
            ))}
          </div>
        </section>

        {/* Dados e rodapé */}
        <section className="mt-10 space-y-4 border-t border-border pt-5" aria-label="Dados do dispositivo">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <HardDrive className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Os dados ficam somente neste navegador. Faça backup e exportação periodicamente em{" "}
                <strong className="text-foreground">Dados</strong>.
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full shrink-0 gap-2 border-destructive/40 text-destructive hover:text-destructive sm:w-auto"
              onClick={() => {
                setConfirmacaoLimpar("");
                setLimparAberto(true);
              }}
            >
              <Trash2 className="size-4" /> Limpar dados
            </Button>
          </div>

          <footer className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Desenvolvido por <strong className="text-foreground">Jardel Ferreira</strong>
            </span>
            <a
              href="https://www.linkedin.com/in/jardel-ferreira-557936162/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary"
              aria-label="LinkedIn de Jardel Ferreira"
            >
              <Linkedin className="size-3.5" />
              LinkedIn
            </a>
          </footer>
        </section>
      </main>

      {/* Novo projeto */}
      <DialogoProjeto
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        modo="criar"
        valor={form}
        onChange={setForm}
        salvando={criando}
        onSalvar={() => void criar()}
      />

      {/* Editar projeto */}
      <DialogoProjeto
        aberto={!!editando}
        onFechar={() => setEditando(null)}
        modo="editar"
        valor={formEdicao}
        onChange={setFormEdicao}
        salvando={salvandoEdicao}
        onSalvar={() => void salvarEdicao()}
      />

      {/* Excluir projeto */}
      <Dialog open={!!excluindo} onOpenChange={(o) => !o && !excluindoEmCurso && setExcluindo(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-md grid-cols-1 gap-4 overflow-x-hidden overflow-y-auto p-4 sm:w-full sm:p-6 [&>*]:min-w-0">
          <CabecalhoDialogo
            icone={<Trash2 className="size-5" />}
            titulo="Excluir projeto"
            descricao="Esta ação não pode ser desfeita."
          />
          {excluindo && (
            <p className="break-words text-sm">
              Excluir <strong>{excluindo.codigo} · {excluindo.nome}</strong> e todas as suas movimentações?
            </p>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
            <Button variant="outline" disabled={excluindoEmCurso} onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={excluindoEmCurso}
              onClick={() => void confirmarExclusao()}
            >
              {excluindoEmCurso ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Excluir projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Limpar dados */}
      <Dialog open={limparAberto} onOpenChange={(o) => !o && !limpando && setLimparAberto(false)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-md grid-cols-1 gap-4 overflow-x-hidden overflow-y-auto p-4 sm:w-full sm:p-6 [&>*]:min-w-0">
          <CabecalhoDialogo
            icone={<AlertTriangle className="size-5" />}
            titulo="Limpar todos os dados"
            descricao="Remove tudo o que está salvo neste dispositivo."
          />
          <div className="space-y-3 text-sm">
            <p>
              Projetos, estoque, movimentações e backups locais serão apagados. Não é possível desfazer.
            </p>
            <Campo id="limpar-confirmacao" label="Digite LIMPAR para confirmar">
              <Input
                id="limpar-confirmacao"
                autoComplete="off"
                autoCapitalize="characters"
                value={confirmacaoLimpar}
                onChange={(e) => setConfirmacaoLimpar(e.target.value)}
                placeholder="LIMPAR"
              />
            </Campo>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
            <Button variant="outline" disabled={limpando} onClick={() => setLimparAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={limpando || confirmacaoLimpar.trim().toUpperCase() !== "LIMPAR"}
              onClick={() => void limparDados()}
            >
              {limpando ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Apagar tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pré-visualização da importação */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && !importando && setPreview(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-lg grid-cols-1 gap-4 overflow-x-hidden overflow-y-auto p-4 sm:w-full sm:p-6 [&>*]:min-w-0">
          <CabecalhoDialogo
            icone={<FileSpreadsheet className="size-5" />}
            titulo="Revisar importação"
            descricao="Nada é gravado até todas as validações passarem."
          />
          {preview && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="font-display text-lg font-semibold">
                  {Object.values(preview.contagens).reduce((total, quantidade) => total + quantidade, 0)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">registros em</span>{" "}
                  {Object.values(preview.contagens).filter(Boolean).length}{" "}
                  <span className="text-sm font-normal text-muted-foreground">módulos</span>
                </p>
                {preview.projetos[0] && (
                  <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                    Projeto a criar:{" "}
                    <strong className="text-foreground">
                      {preview.projetos[0].codigo} · {preview.projetos[0].nome}
                    </strong>
                  </p>
                )}
              </div>

              {modulosPreview.length > 0 && (
                <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3">
                  {/* rótulos longos quebram em vez de estourar a coluna */}
                  {modulosPreview.map(([label, n]) => (
                    <div key={label} className="min-w-0 rounded-lg border border-border bg-muted/30 p-2">
                      <p className="num text-lg font-semibold">{n}</p>
                      <p className="break-words text-xs leading-tight text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              {preview.problemas.length === 0 ? (
                <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <CheckCircle2 className="size-4 shrink-0" />
                    {preview.compatibilizado
                      ? "Planilha compatível com este dispositivo."
                      : "A estrutura está válida, mas existem conflitos de identidade que precisam ser resolvidos."}
                  </p>
                  {!preview.compatibilizado && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      A planilha só precisa ser reidentificada quando houver conflito com dados já existentes neste dispositivo. Em um dispositivo sem o projeto, a exportação original pode ser importada diretamente.
                    </p>
                  )}
                  {preview.compatibilizado && preview.compatibilizado.idsGerados > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {preview.compatibilizado.idsGerados} IDs foram recriados.
                      {preview.compatibilizado.catalogosReutilizados > 0
                        ? ` ${preview.compatibilizado.catalogosReutilizados} itens de catálogo foram reutilizados.`
                        : ""}
                    </p>
                  )}
                </div>
              ) : (
                <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="size-4 shrink-0" />
                    {plural(preview.problemas.length, "problema impede", "problemas impedem")} a importação
                  </p>
                  <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-destructive">
                    {preview.problemas.map((p) => (
                      <li key={p} className="break-words">
                        {p}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Corrija a planilha e importe novamente.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
            <Button
              variant="outline"
              disabled={importando || compatibilizando}
              onClick={() => setPreview(null)}
            >
              Cancelar
            </Button>
            {!preview?.compatibilizado && (
              <Button
                size="lg"
                variant="secondary"
                className="gap-2 font-semibold"
                onClick={() => void tornarPlanilhaCompativel()}
                disabled={!preview || compatibilizando}
              >
                {compatibilizando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Fingerprint className="size-4" />
                )}
                Tornar compatível
              </Button>
            )}
            <Button
              size="lg"
              className="gap-2 font-semibold shadow-sm"
              onClick={() => void confirmarImportacao()}
              disabled={!preview?.compatibilizado || preview.problemas.length > 0 || importando || compatibilizando}
            >
              {importando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Importar projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}