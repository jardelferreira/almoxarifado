import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, type ReactNode } from "react";
import {
  ClipboardSignature,
  FileDown,
  PackageCheck,
  UserRound,
  UserRoundMinus,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Combobox } from "@/components/common/Combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { estadoEquipamentosRepo } from "@/services/equipamentos/estado-repo";
import { movimentacoesEquipamentosRepo } from "@/services/equipamentos/movimentacoes-repo";
import type { Equipamento, EstoqueEquipamento, Funcionario } from "@/types";
import { formatarCpf } from "@/utils/seguranca";
import { num } from "@/utils/format";

export const Route = createFileRoute("/app/painel-apropriacoes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Painel de Apropriações" }] }),
  component: PainelApropriacoesPage,
});

type ItemPainel = {
  estoque: EstoqueEquipamento;
  equipamento: Equipamento;
  quantidade: number;
  identificacao: string;
};

type AcaoPainel = "APROPRIAR" | "DEVOLVER";

export function PainelApropriacoesPage() {
  const [projetoId] = useProjetoAtivoId();
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [dialogAcao, setDialogAcao] = useState(false);
  const [acao, setAcao] = useState<AcaoPainel>("APROPRIAR");
  const [estoqueId, setEstoqueId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [salvando, setSalvando] = useState(false);

  const dados = useLiveQuery(async () => {
    if (!projetoId) return null;
    const db = getDB();
    const [funcionarios, equipamentos, estoques, equipes] = await Promise.all([
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
    ]);

    const equipamentoPorId = new Map(equipamentos.map((item) => [item.id, item]));
    const itens: ItemPainel[] = [];
    const disponiveis: Array<ItemPainel & { disponivel: number }> = [];

    const estados = await Promise.all(
      estoques
        .filter((item) => item.ativo !== false)
        .map(async (estoque) => ({
          estoque,
          estado: await estadoEquipamentosRepo.calcular(projetoId, estoque.id),
        })),
    );

    for (const { estoque, estado } of estados) {
      const equipamento = equipamentoPorId.get(estoque.equipamento_id);
      if (!equipamento) continue;
      const identificacao =
        estoque.identificacao || estoque.patrimonio || estoque.serial || "Sem identificação";
      const apropriado = funcionarioId ? (estado.funcionarios.get(funcionarioId) ?? 0) : 0;
      if (apropriado > 0)
        itens.push({ estoque, equipamento, quantidade: apropriado, identificacao });
      if (estado.disponivel > 0)
        disponiveis.push({
          estoque,
          equipamento,
          quantidade: 0,
          identificacao,
          disponivel: estado.disponivel,
        });
    }

    return {
      funcionarios: funcionarios
        .filter((item) => item.status === "ATIVO")
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      equipes,
      itens: itens.sort((a, b) => a.equipamento.nome.localeCompare(b.equipamento.nome, "pt-BR")),
      disponiveis: disponiveis.sort((a, b) =>
        a.equipamento.nome.localeCompare(b.equipamento.nome, "pt-BR"),
      ),
    };
  }, [projetoId, funcionarioId]);

  const funcionario = useMemo(
    () => dados?.funcionarios.find((item) => item.id === funcionarioId),
    [dados, funcionarioId],
  );
  const equipe = useMemo(
    () => dados?.equipes.find((item) => item.id === funcionario?.equipe_raiz_id),
    [dados, funcionario],
  );
  const estoqueSelecionado = dados?.disponiveis.find((item) => item.estoque.id === estoqueId);
  const itemDevolucao = dados?.itens.find((item) => item.estoque.id === estoqueId);

  const abrirApropriacao = () => {
    setAcao("APROPRIAR");
    setEstoqueId(null);
    setQuantidade("1");
    setDialogAcao(true);
  };

  const abrirDevolucao = (item: ItemPainel) => {
    setAcao("DEVOLVER");
    setEstoqueId(item.estoque.id);
    setQuantidade(item.equipamento.tipo_controle === "INDIVIDUAL" ? "1" : "1");
    setDialogAcao(true);
  };

  const almoxarifadoId = () =>
    dados?.equipes.find(
      (item) =>
        item.nome
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase() === "almoxarifado",
    )?.id;

  const salvarAcao = async () => {
    if (!projetoId || !funcionarioId || !funcionario || !estoqueId) {
      toast.error("Selecione o funcionário e o equipamento.");
      return;
    }
    const item = acao === "APROPRIAR" ? estoqueSelecionado : itemDevolucao;
    if (!item) return;
    const quantidadeNumero =
      item.equipamento.tipo_controle === "INDIVIDUAL" ? 1 : Number(quantidade);
    if (!Number.isInteger(quantidadeNumero) || quantidadeNumero <= 0) {
      toast.error("Informe uma quantidade inteira maior que zero.");
      return;
    }
    const equipeAlmoxarifado = almoxarifadoId();
    if (!equipeAlmoxarifado) {
      toast.error("A equipe Almoxarifado não foi encontrada neste projeto.");
      return;
    }

    setSalvando(true);
    try {
      const estado = await estadoEquipamentosRepo.calcular(projetoId, estoqueId);
      if (acao === "APROPRIAR") {
        if (estado.disponivel < quantidadeNumero)
          throw new Error(`Quantidade disponível: ${estado.disponivel}.`);
        await movimentacoesEquipamentosRepo.salvar({
          projeto_id: projetoId,
          estoque_equipamento_id: estoqueId,
          tipo: "SAIDA",
          quantidade: quantidadeNumero,
          tipo_origem: "EQUIPE",
          origem_id: equipeAlmoxarifado,
          tipo_destino: "FUNCIONARIO",
          destino_id: funcionarioId,
          data: new Date().toISOString().slice(0, 10),
          referencia_documento: null,
          observacoes: "Apropriação realizada pelo Painel de Atendimento.",
        });
        toast.success(`Equipamento apropriado para ${funcionario.nome}.`);
      } else {
        const atual = estado.funcionarios.get(funcionarioId) ?? 0;
        if (atual < quantidadeNumero)
          throw new Error(`Quantidade apropriada atualmente: ${atual}.`);
        await movimentacoesEquipamentosRepo.salvar({
          projeto_id: projetoId,
          estoque_equipamento_id: estoqueId,
          tipo: "DEVOLUCAO",
          quantidade: quantidadeNumero,
          tipo_origem: "FUNCIONARIO",
          origem_id: funcionarioId,
          tipo_destino: "EQUIPE",
          destino_id: equipeAlmoxarifado,
          data: new Date().toISOString().slice(0, 10),
          referencia_documento: null,
          observacoes: "Desapropriação realizada pelo Painel de Atendimento.",
        });
        toast.success("Equipamento devolvido ao Almoxarifado.");
      }
      setDialogAcao(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível concluir o atendimento.",
      );
    } finally {
      setSalvando(false);
    }
  };

  if (!projetoId)
    return (
      <p className="text-sm text-muted-foreground">Selecione um projeto para abrir o painel.</p>
    );
  if (!dados)
    return <p className="text-sm text-muted-foreground">Carregando painel de apropriações…</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <ClipboardSignature className="size-4 text-primary" aria-hidden="true" />
            Painéis · Atendimento
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Painel de apropriações
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Atenda o funcionário, confira os equipamentos em seu nome e registre apropriações ou
            devoluções.
          </p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0">
          Atendimento operacional
        </Badge>
      </header>

      <Card>
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Funcionário atendido</h2>
              <p className="text-xs text-muted-foreground">
                Selecione uma pessoa para consultar ou atualizar a ficha.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <Combobox
            opcoes={dados.funcionarios.map((item) => ({
              value: item.id,
              label: item.nome,
              hint: [
                item.matricula && `Matrícula: ${item.matricula}`,
                item.cpf && `CPF: ${formatarCpf(item.cpf)}`,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
            value={funcionarioId}
            onChange={setFuncionarioId}
            placeholder="Pesquisar funcionário…"
            vazio="Nenhum funcionário ativo encontrado."
          />
          {funcionario && (
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Nome</p>
                <p className="font-semibold">{funcionario.nome}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPF</p>
                <p className="font-medium">{formatarCpf(funcionario.cpf) || "Não informado"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Matrícula / função</p>
                <p className="font-medium">
                  {[funcionario.matricula, funcionario.funcao].filter(Boolean).join(" · ") ||
                    "Não informado"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Equipe</p>
                <p className="font-medium">{equipe?.nome ?? "Sem equipe definida"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {funcionario ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Resumo
              label="Itens vinculados"
              valor={dados.itens.length}
              icon={<PackageCheck className="size-4" />}
            />
            <Resumo
              label="Quantidade em uso"
              valor={dados.itens.reduce((total, item) => total + item.quantidade, 0)}
              icon={<UserRound className="size-4" />}
            />
            <Resumo
              label="Unidades disponíveis"
              valor={dados.disponiveis.reduce((total, item) => total + item.disponivel, 0)}
              icon={<UserRoundPlus className="size-4" />}
            />
          </div>
          <Card>
            <CardHeader className="flex flex-col gap-3 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Ficha de atendimento</h2>
                <p className="text-xs text-muted-foreground">
                  Equipamentos atualmente vinculados a este funcionário.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    imprimirAtendimento(funcionario, equipe?.nome ?? "Sem equipe", dados.itens)
                  }
                >
                  <FileDown className="mr-2 size-4" />
                  Imprimir / PDF
                </Button>
                <Button type="button" size="sm" onClick={abrirApropriacao}>
                  <UserRoundPlus className="mr-2 size-4" />
                  Apropriar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {dados.itens.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum equipamento apropriado para este funcionário.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Equipamento</th>
                        <th className="px-4 py-3">Identificação</th>
                        <th className="px-4 py-3 text-right">Quantidade</th>
                        <th className="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dados.itens.map((item) => (
                        <tr key={item.estoque.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.equipamento.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {[item.equipamento.marca, item.equipamento.modelo]
                                .filter(Boolean)
                                .join(" · ") || "Sem modelo"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{item.identificacao}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {num(item.quantidade)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => abrirDevolucao(item)}
                            >
                              <UserRoundMinus className="mr-1.5 size-4" />
                              Desapropriar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-10 text-center">
            <UserRound className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium">Selecione um funcionário para iniciar o atendimento</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A ficha, os equipamentos e as ações aparecerão nesta área.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogAcao} onOpenChange={(open) => !salvando && setDialogAcao(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acao === "APROPRIAR" ? "Apropriar equipamento" : "Desapropriar equipamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <span className="text-muted-foreground">Funcionário: </span>
              <strong>{funcionario?.nome}</strong>
            </div>
            {acao === "APROPRIAR" ? (
              <div className="space-y-2">
                <Label>Equipamento disponível</Label>
                <Combobox
                  opcoes={dados.disponiveis.map((item) => ({
                    value: item.estoque.id,
                    label: `${item.equipamento.nome} · disponível: ${item.disponivel}`,
                    hint: item.identificacao,
                  }))}
                  value={estoqueId}
                  onChange={setEstoqueId}
                  placeholder="Selecionar equipamento…"
                  vazio="Nenhum equipamento disponível."
                />
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium">{itemDevolucao?.equipamento.nome}</p>
                <p className="text-muted-foreground">{itemDevolucao?.identificacao}</p>
              </div>
            )}
            {estoqueSelecionado?.equipamento.tipo_controle === "QUANTITATIVO" ||
            itemDevolucao?.equipamento.tipo_controle === "QUANTITATIVO" ? (
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  max={
                    acao === "APROPRIAR"
                      ? estoqueSelecionado?.disponivel
                      : itemDevolucao?.quantidade
                  }
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Informe a quantidade desta operação.
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogAcao(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void salvarAcao()}
              disabled={salvando || !estoqueId}
            >
              {salvando
                ? "Registrando…"
                : acao === "APROPRIAR"
                  ? "Confirmar apropriação"
                  : "Confirmar devolução"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Resumo({ label, valor, icon }: { label: string; valor: number; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold">{num(valor)}</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

function escapar(valor: unknown): string {
  return String(valor ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function imprimirAtendimento(funcionario: Funcionario, equipe: string, itens: ItemPainel[]) {
  const janela = window.open("", "_blank", "width=1000,height=800");
  if (!janela) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }
  const linhas = itens.length
    ? itens
        .map(
          (item) =>
            `<tr><td>${escapar(item.equipamento.nome)}</td><td>${escapar(item.identificacao)}</td><td>${escapar(item.quantidade)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3">Nenhum equipamento apropriado.</td></tr>`;
  janela.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atendimento de equipamentos — ${escapar(funcionario.nome)}</title><style>@page{size:A4 portrait;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172b3a;font-size:12px;margin:0}.topo{border-bottom:3px solid #17324d;padding-bottom:12px;margin-bottom:18px}.marca{font-size:10px;font-weight:700;letter-spacing:1.5px;color:#17324d;text-transform:uppercase}h1{margin:5px 0;font-size:24px;color:#17324d}.dados{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:18px}.campo{border:1px solid #d9e0e7;border-radius:6px;padding:8px}.rotulo{display:block;color:#667788;font-size:9px;text-transform:uppercase;font-weight:700;margin-bottom:3px}table{width:100%;border-collapse:collapse}th{background:#17324d;color:white;text-align:left;padding:8px;font-size:10px;text-transform:uppercase}td{border-bottom:1px solid #d9e0e7;padding:8px;vertical-align:top}td:last-child,th:last-child{text-align:right}.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:70px}.assinatura{border-top:1px solid #172b3a;text-align:center;padding-top:7px}.rodape{margin-top:30px;border-top:1px solid #d9e0e7;padding-top:8px;color:#667788;font-size:10px}@media print{.acoes{display:none}}</style></head><body><div class="acoes" style="text-align:right;margin-bottom:12px"><button onclick="window.print()">Imprimir / Salvar PDF</button></div><div class="topo"><div class="marca">ALMOXARIFADO · Atendimento de equipamentos</div><h1>Ficha de atendimento</h1><div>Emitido em ${escapar(new Date().toLocaleString("pt-BR"))}</div></div><div class="dados"><div class="campo"><span class="rotulo">Funcionário</span>${escapar(funcionario.nome)}</div><div class="campo"><span class="rotulo">CPF</span>${escapar(formatarCpf(funcionario.cpf) || "Não informado")}</div><div class="campo"><span class="rotulo">Equipe</span>${escapar(equipe)}</div></div><table><thead><tr><th>Equipamento</th><th>Identificação</th><th>Quantidade</th></tr></thead><tbody>${linhas}</tbody></table><div class="assinaturas"><div class="assinatura">Funcionário atendido</div><div class="assinatura">Responsável pelo almoxarifado</div></div><div class="rodape">Documento emitido a partir do estado atual das apropriações do projeto.</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script></body></html>`,
  );
  janela.document.close();
  janela.focus();
}
