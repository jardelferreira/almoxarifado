import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Ban,
  Eye,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { getDB } from "@/db/db";
import { estoqueEquipamentosRepo } from "@/services/equipamentos/estoque-repo";
import { movimentacoesEquipamentosRepo } from "@/services/equipamentos/movimentacoes-repo";
import type {
  Empresa,
  Equipe,
  Equipamento,
  EstoqueEquipamento,
  Funcionario,
  MovimentacaoEquipamento,
  MovimentacaoEquipamentoParte,
  MovimentacaoEquipamentoTipo,
} from "@/types";

export const Route = createFileRoute("/app/movimentacoes-equipamentos")({
  ssr: false,
  component: MovimentacoesEquipamentosPage,
});

type EstoqueEquipamentoUI = EstoqueEquipamento & { ativo?: boolean };

type EstadoUI = {
  almoxarifado: number;
  manutencao: number;
  empresa: number;
  funcionarios: Map<string, number>;
  devolvido: number;
  baixado: number;
  saldo: number;
};

type Formulario = {
  tipo: MovimentacaoEquipamentoTipo;
  equipamentoId: string;
  estoqueEquipamentoId: string;
  origemId: string;
  destinoId: string;
  origemParte: MovimentacaoEquipamentoParte | "";
  quantidade: string;
  empresaId: string;
  vinculo: "PROPRIO" | "ALUGADO" | "EMPRESTIMO";
  equipeId: string;
  patrimonio: string;
  identificacao: string;
  serial: string;
  motivoBaixa: string;
  data: string;
  referenciaDocumento: string;
  observacoes: string;
};

const hoje = () => new Date().toISOString().slice(0, 10);

const formularioInicial: Formulario = {
  tipo: "ENTRADA",
  equipamentoId: "",
  estoqueEquipamentoId: "",
  origemId: "",
  destinoId: "",
  origemParte: "",
  quantidade: "1",
  empresaId: "",
  vinculo: "PROPRIO",
  equipeId: "",
  patrimonio: "",
  identificacao: "",
  serial: "",
  motivoBaixa: "",
  data: hoje(),
  referenciaDocumento: "",
  observacoes: "",
};

const tipoLabels: Record<MovimentacaoEquipamentoTipo, string> = {
  ENTRADA: "Entrada no estoque",
  SAIDA: "Saída para funcionário",
  DEVOLUCAO: "Devolução do funcionário",
  TRANSFERENCIA: "Transferência entre funcionários",
  SINALIZAR_MANUTENCAO: "Sinalizar para manutenção",
  ENVIO: "Enviar para manutenção",
  RETORNO_MANUTENCAO: "Retorno da manutenção",
  DEVOLUCAO_FORNECEDOR: "Devolução ao fornecedor",
  BAIXA: "Baixa definitiva",
  REENTRADA: "Reentrada no estoque",
  MANUTENCAO: "Sinalizar para manutenção (histórico)",
  RETIRADA_MANUTENCAO: "Enviar para manutenção (histórico)",
};

const tiposMovimentacaoVisiveis: MovimentacaoEquipamentoTipo[] = [
  "ENTRADA",
  "SAIDA",
  "DEVOLUCAO",
  "TRANSFERENCIA",
  "SINALIZAR_MANUTENCAO",
  "ENVIO",
  "RETORNO_MANUTENCAO",
  "DEVOLUCAO_FORNECEDOR",
  "BAIXA",
  "REENTRADA",
];

const parteLabels: Record<MovimentacaoEquipamentoParte, string> = {
  EMPRESA: "Empresa",
  EQUIPE: "Equipe",
  FUNCIONARIO: "Funcionário",
};

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function nomePessoa(funcionario?: Funcionario) {
  if (!funcionario) return "Funcionário não encontrado";
  return funcionario.matricula
    ? `${funcionario.nome} — ${funcionario.matricula}`
    : funcionario.nome;
}

function nomeParte(
  tipo: MovimentacaoEquipamentoParte,
  id: string,
  empresas: Map<string, Empresa>,
  equipes: Map<string, Equipe>,
  funcionarios: Map<string, Funcionario>,
) {
  if (tipo === "EMPRESA") return empresas.get(id)?.nome ?? "Empresa não encontrada";
  if (tipo === "EQUIPE") return equipes.get(id)?.nome ?? "Equipe não encontrada";
  return nomePessoa(funcionarios.get(id));
}

const movimentoVisual: Record<MovimentacaoEquipamentoTipo, {
  icon: typeof Activity;
  badge: string;
  label: string;
}> = {
  ENTRADA: { icon: ArrowDownToLine, badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Entrada" },
  SAIDA: { icon: ArrowUpFromLine, badge: "bg-blue-50 text-blue-700 border-blue-200", label: "Saída" },
  DEVOLUCAO: { icon: RotateCcw, badge: "bg-sky-50 text-sky-700 border-sky-200", label: "Devolução" },
  TRANSFERENCIA: { icon: ArrowLeftRight, badge: "bg-violet-50 text-violet-700 border-violet-200", label: "Transferência" },
  SINALIZAR_MANUTENCAO: { icon: Wrench, badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Manutenção" },
  ENVIO: { icon: Truck, badge: "bg-orange-50 text-orange-700 border-orange-200", label: "Envio" },
  RETORNO_MANUTENCAO: { icon: RotateCcw, badge: "bg-teal-50 text-teal-700 border-teal-200", label: "Retorno" },
  DEVOLUCAO_FORNECEDOR: { icon: Truck, badge: "bg-rose-50 text-rose-700 border-rose-200", label: "Fornecedor" },
  BAIXA: { icon: Ban, badge: "bg-red-50 text-red-700 border-red-200", label: "Baixa" },
  REENTRADA: { icon: PackageCheck, badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Reentrada" },
  MANUTENCAO: { icon: Wrench, badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Manutenção" },
  RETIRADA_MANUTENCAO: { icon: Truck, badge: "bg-orange-50 text-orange-700 border-orange-200", label: "Envio" },
};

function MovimentoBadge({ tipo }: { tipo: MovimentacaoEquipamentoTipo }) {
  const visual = movimentoVisual[tipo];
  const Icon = visual.icon;
  return (
    <Badge variant="outline" className={`inline-flex items-center gap-1.5 whitespace-nowrap ${visual.badge}`}>
      <Icon className="size-3.5" />
      <span>{visual.label}</span>
    </Badge>
  );
}

function MovimentacoesEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEquipamento[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [estoques, setEstoques] = useState<EstoqueEquipamentoUI[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<MovimentacaoEquipamento | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(formularioInicial);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!projetoId) return;
    const db = getDB();
    const [movs, eqs, stocks, emps, teams, funcs] = await Promise.all([
      movimentacoesEquipamentosRepo.listar(projetoId),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.empresas.where("projeto_id").equals(projetoId).and((x) => x.ativo).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).and((x) => x.ativo).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).and((x) => x.status === "ATIVO").toArray(),
    ]);

    setMovimentacoes([...movs].sort((a, b) => b.data.localeCompare(a.data)));
    setEquipamentos(eqs);
    setEstoques(stocks.map((stock) => stock.ativo === undefined ? { ...stock, ativo: true } : stock));
    setEmpresas(emps);
    setEquipes(teams);
    setFuncionarios(funcs);
  }

  useEffect(() => {
    void carregar();
    // `carregar` is recreated on render, while its only relevant input here
    // is the active project. The callback is also used by the save flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId]);

  const equipamentoPorId = useMemo(
    () => new Map(equipamentos.map((item) => [item.id, item])),
    [equipamentos],
  );
  const equipamentosAtivos = useMemo(
    () => equipamentos.filter((item) => item.ativo !== false),
    [equipamentos],
  );
  const estoquePorId = useMemo(
    () => new Map(estoques.map((item) => [item.id, item])),
    [estoques],
  );
  const empresaPorId = useMemo(
    () => new Map(empresas.map((item) => [item.id, item])),
    [empresas],
  );
  const equipePorId = useMemo(
    () => new Map(equipes.map((item) => [item.id, item])),
    [equipes],
  );
  const funcionarioPorId = useMemo(
    () => new Map(funcionarios.map((item) => [item.id, item])),
    [funcionarios],
  );

  const equipesOperacionais = useMemo(() => {
    const almoxarifado = equipes.find((item) => normalizar(item.nome) === "almoxarifado");
    const manutencao = equipes.find((item) => normalizar(item.nome) === "manutencao");
    return { almoxarifado, manutencao };
  }, [equipes]);

  // Estado operacional é reconstruído a partir do histórico.
  const estados = useMemo(() => {
    const resultado = new Map<string, EstadoUI>();

    for (const stock of estoques) {
      resultado.set(stock.id, {
        almoxarifado: stock.quantidade,
        manutencao: 0,
        empresa: 0,
        funcionarios: new Map(),
        devolvido: 0,
        baixado: 0,
        saldo: stock.quantidade,
      });
    }

    const ordenadas = [...movimentacoes].sort(
      (a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em),
    );

    for (const mov of ordenadas) {
      const estado = resultado.get(mov.estoque_equipamento_id);
      if (!estado) continue;

      const adicionarFuncionario = (id: string, quantidade: number) => {
        estado.funcionarios.set(id, (estado.funcionarios.get(id) ?? 0) + quantidade);
      };
      const removerFuncionario = (id: string, quantidade: number) => {
        const atual = estado.funcionarios.get(id) ?? 0;
        const novo = atual - quantidade;
        if (novo <= 0) estado.funcionarios.delete(id);
        else estado.funcionarios.set(id, novo);
      };

      switch (mov.tipo) {
        case "ENTRADA":
          break;
        case "SAIDA":
          estado.almoxarifado -= mov.quantidade;
          adicionarFuncionario(mov.destino_id, mov.quantidade);
          break;
        case "DEVOLUCAO":
          removerFuncionario(mov.origem_id, mov.quantidade);
          estado.almoxarifado += mov.quantidade;
          break;
        case "TRANSFERENCIA":
          removerFuncionario(mov.origem_id, mov.quantidade);
          adicionarFuncionario(mov.destino_id, mov.quantidade);
          break;
        case "SINALIZAR_MANUTENCAO":
          // Sinalização é somente administrativa.
          break;
        case "MANUTENCAO":
          // Histórico antigo: preserva a semântica física anterior.
          if (mov.tipo_origem === "EQUIPE") {
            estado.almoxarifado -= mov.quantidade;
            estado.manutencao += mov.quantidade;
          } else if (mov.tipo_origem === "FUNCIONARIO") {
            removerFuncionario(mov.origem_id, mov.quantidade);
            estado.manutencao += mov.quantidade;
          }
          break;
        case "ENVIO":
          if (mov.tipo_origem === "EQUIPE") {
            estado.almoxarifado -= mov.quantidade;
          } else if (mov.tipo_origem === "FUNCIONARIO") {
            removerFuncionario(mov.origem_id, mov.quantidade);
          }
          estado.manutencao += mov.quantidade;
          if (mov.tipo_destino === "EMPRESA") estado.empresa += mov.quantidade;
          break;
        case "RETIRADA_MANUTENCAO":
          // Histórico antigo: preserva a semântica anterior.
          if (mov.tipo_origem === "EQUIPE") {
            if (mov.origem_id === equipesOperacionais.manutencao?.id) {
              estado.empresa += mov.quantidade;
            } else {
              estado.almoxarifado -= mov.quantidade;
              estado.manutencao += mov.quantidade;
              estado.empresa += mov.quantidade;
            }
          }
          break;
        case "RETORNO_MANUTENCAO":
          if (mov.tipo_origem === "EQUIPE") {
            estado.manutencao -= mov.quantidade;
          } else {
            estado.empresa -= mov.quantidade;
            estado.manutencao -= mov.quantidade;
          }
          estado.almoxarifado += mov.quantidade;
          break;
        case "BAIXA":
          estado.almoxarifado -= mov.quantidade;
          estado.baixado += mov.quantidade;
          break;
        case "DEVOLUCAO_FORNECEDOR":
          if (mov.tipo_origem === "EQUIPE") {
            if (mov.origem_id === equipesOperacionais.manutencao?.id) {
              estado.manutencao -= mov.quantidade;
            } else {
              estado.almoxarifado -= mov.quantidade;
            }
          }
          estado.devolvido += mov.quantidade;
          break;
      }

      if (mov.tipo === "DEVOLUCAO_FORNECEDOR" || mov.tipo === "BAIXA") {
        estado.saldo = Math.max(0, estado.saldo - mov.quantidade);
      }
    }

    return resultado;
  }, [estoques, movimentacoes, equipesOperacionais]);

  // Funcionários que possuem alguma apropriação atual em qualquer registro de estoque.
  // Esta estrutura é independente do equipamento selecionado e pode ser reutilizada
  // por qualquer operação que precise começar pelo funcionário.
  const funcionariosComApropriacoes = useMemo(() => {
    const quantidades = new Map<string, number>();

    for (const estado of estados.values()) {
      for (const [funcionarioId, quantidade] of estado.funcionarios) {
        quantidades.set(
          funcionarioId,
          (quantidades.get(funcionarioId) ?? 0) + quantidade,
        );
      }
    }

    return funcionarios.filter(
      (funcionario) => (quantidades.get(funcionario.id) ?? 0) > 0,
    );
  }, [funcionarios, estados]);

  // Depois que o funcionário é escolhido, restringimos os registros físicos
  // aos equipamentos que estão efetivamente apropriados para ele.
  const estoquesDoFuncionario = useMemo(() => {
    if (!formulario.origemId) return [];

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;

      const estado = estados.get(stock.id);
      return (estado?.funcionarios.get(formulario.origemId) ?? 0) > 0;
    });
  }, [estoques, estados, equipamentoPorId, formulario.origemId]);

  // Sinalizações pendentes são administrativas e não mudam a localização.
  // Uma sinalização pendente impede nova sinalização até o envio efetivo.
  const sinalizacoesPendentes = useMemo(() => {
    const resultado = new Map<string, number>();
    const porEstoque = new Map<string, MovimentacaoEquipamento[]>();

    for (const mov of movimentacoes) {
      const lista = porEstoque.get(mov.estoque_equipamento_id) ?? [];
      lista.push(mov);
      porEstoque.set(mov.estoque_equipamento_id, lista);
    }

    for (const [estoqueId, lista] of porEstoque) {
      let pendente = 0;
      const ordenadas = [...lista].sort(
        (a, b) => `${a.data}|${a.criado_em}|${a.id}`.localeCompare(`${b.data}|${b.criado_em}|${b.id}`),
      );

      for (const mov of ordenadas) {
        if (mov.tipo === "SINALIZAR_MANUTENCAO" || mov.tipo === "MANUTENCAO") {
          pendente += mov.quantidade;
        } else if (mov.tipo === "ENVIO" || mov.tipo === "RETIRADA_MANUTENCAO") {
          pendente = Math.max(0, pendente - mov.quantidade);
        } else if (mov.tipo === "RETORNO_MANUTENCAO") {
          pendente = 0;
        }
      }

      if (pendente > 0) resultado.set(estoqueId, pendente);
    }

    return resultado;
  }, [movimentacoes]);

  // Registros físicos disponíveis para sinalização.
  const estoquesDaOrigemManutencao = useMemo(() => {
    if (formulario.tipo !== "SINALIZAR_MANUTENCAO" || !formulario.origemParte || !formulario.origemId) {
      return [];
    }

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;

      const estado = estados.get(stock.id);
      if (!estado) return false;

      if ((sinalizacoesPendentes.get(stock.id) ?? 0) > 0) {
        return false;
      }

      if (formulario.origemParte === "EQUIPE") {
        // A manutenção só pode sair da equipe Almoxarifado.
        return (
          formulario.origemId === equipesOperacionais.almoxarifado?.id &&
          estado.almoxarifado > 0
        );
      }

      // Quando a origem é funcionário, somente equipamentos atualmente
      // apropriados a ele podem ser selecionados.
      return (estado.funcionarios.get(formulario.origemId) ?? 0) > 0;
    });
  }, [
    estoques,
    estados,
    equipamentoPorId,
    formulario.tipo,
    formulario.origemParte,
    formulario.origemId,
    equipesOperacionais.almoxarifado?.id,
    sinalizacoesPendentes,
  ]);

  const almoxarifadoTemEquipamentos = useMemo(() => {
    const almoxarifadoId = equipesOperacionais.almoxarifado?.id;
    if (!almoxarifadoId) return false;

    return estoques.some((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;
      return (estados.get(stock.id)?.almoxarifado ?? 0) > 0;
    });
  }, [estoques, estados, equipamentoPorId, equipesOperacionais.almoxarifado?.id]);

  // Registros físicos disponíveis para envio à manutenção.
  // Equipamento que já está em Manutenção não pode ser enviado novamente.
  const estoquesDaOrigemEnvio = useMemo(() => {
    if (formulario.tipo !== "ENVIO" || !formulario.origemParte || !formulario.origemId) {
      return [];
    }

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;

      const estado = estados.get(stock.id);
      if (!estado) return false;

      if (formulario.origemParte === "EQUIPE") {
        return formulario.origemId === equipesOperacionais.almoxarifado?.id && estado.almoxarifado > 0;
      }

      return (estado.funcionarios.get(formulario.origemId) ?? 0) > 0;
    });
  }, [
    formulario.tipo,
    formulario.origemParte,
    formulario.origemId,
    equipesOperacionais.almoxarifado?.id,
    estoques,
    equipamentoPorId,
    estados,
  ]);

  const estoquesParaRetornoManutencao = useMemo(() => {
    if (formulario.tipo !== "RETORNO_MANUTENCAO") return [];

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;
      const estado = estados.get(stock.id);
      if (!estado) return false;
      return estado.manutencao > 0;
    });
  }, [
    formulario.tipo,
    estoques,
    estados,
    equipamentoPorId,
  ]);

  // Equipamentos de terceiros podem ser devolvidos ao fornecedor
  // diretamente da Manutenção, sem passar novamente pelo Almoxarifado.
  // A origem é determinada automaticamente pelo estado atual.
  const estoquesParaDevolucaoFornecedor = useMemo(() => {
    if (formulario.tipo !== "DEVOLUCAO_FORNECEDOR") return [];

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (stock.vinculo === "PROPRIO") return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;

      const estado = estados.get(stock.id);
      if (!estado) return false;

      return estado.almoxarifado > 0 || estado.manutencao > 0;
    });
  }, [formulario.tipo, estoques, estados, equipamentoPorId]);

  const estoquesParaBaixa = useMemo(() => {
    if (formulario.tipo !== "BAIXA") return [];

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;
      const estado = estados.get(stock.id);
      if (!estado) return false;
      return estado.saldo > 0 && estado.almoxarifado === estado.saldo;
    });
  }, [formulario.tipo, estoques, estados, equipamentoPorId]);

  const pendenciasReentrada = useMemo(() => {
    const resultado = new Map<string, { tipo: "DEVOLUCAO_FORNECEDOR" | "BAIXA"; restante: number; origemId: string }>();
    const porEstoque = new Map<string, typeof movimentacoes>();

    for (const mov of movimentacoes) {
      const lista = porEstoque.get(mov.estoque_equipamento_id) ?? [];
      lista.push(mov);
      porEstoque.set(mov.estoque_equipamento_id, lista);
    }

    for (const [estoqueId, lista] of porEstoque) {
      const pendentes: Array<{ tipo: "DEVOLUCAO_FORNECEDOR" | "BAIXA"; restante: number; origemId: string }> = [];
      const ordenadas = [...lista].sort((a, b) => `${a.data}|${a.criado_em}|${a.id}`.localeCompare(`${b.data}|${b.criado_em}|${b.id}`));
      for (const mov of ordenadas) {
        if (mov.tipo === "DEVOLUCAO_FORNECEDOR" || mov.tipo === "BAIXA") {
          pendentes.push({ tipo: mov.tipo, restante: mov.quantidade, origemId: mov.destino_id });
        } else if (mov.tipo === "REENTRADA") {
          let restante = mov.quantidade;
          while (restante > 0 && pendentes.length) {
            const pendencia = pendentes.at(-1);
            if (!pendencia) break;
            const aplicada = Math.min(restante, pendencia.restante);
            pendencia.restante -= aplicada;
            restante -= aplicada;
          }
        }
      }
      const ultima = pendentes.at(-1);
      if (ultima && ultima.restante > 0) resultado.set(estoqueId, ultima);
    }
    return resultado;
  }, [movimentacoes]);

  const estoquesParaReentrada = useMemo(() => {
    if (formulario.tipo !== "REENTRADA") return [];
    return estoques.filter((stock) => {
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;
      const pendencia = pendenciasReentrada.get(stock.id);
      return !!pendencia && pendencia.restante > 0;
    });
  }, [formulario.tipo, estoques, equipamentoPorId, pendenciasReentrada]);

  const estoquesDisponiveis = useMemo(() => {
    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;

      const estado = estados.get(stock.id);
      if (!estado) return false;

      const emUso = [...estado.funcionarios.values()].reduce(
        (total, quantidade) => total + quantidade,
        0,
      );

      switch (formulario.tipo) {
        case "SAIDA":
          // Saída somente pode retirar o que está fisicamente no Almoxarifado.
          return estado.almoxarifado > 0;
        case "DEVOLUCAO":
          // A devolução começa pelo funcionário. A lista de estoque usada
          // pelo formulário é estoquesDoFuncionario.
          return false;
        case "TRANSFERENCIA":
          return emUso > 0;
        case "SINALIZAR_MANUTENCAO":
          // Pode sair do Almoxarifado ou diretamente de um funcionário.
          return estado.almoxarifado > 0 || emUso > 0;
        case "ENVIO":
          return estado.almoxarifado > 0 || estado.manutencao > 0;
        case "RETORNO_MANUTENCAO":
          return estado.manutencao > 0 || estado.empresa > 0;
        case "BAIXA":
          return estado.saldo > 0 && estado.almoxarifado === estado.saldo;
        case "DEVOLUCAO_FORNECEDOR":
          return estado.almoxarifado > 0 || estado.manutencao > 0;
        case "REENTRADA":
          return false;
        case "ENTRADA":
          return false;
        default:
          return false;
      }
    });
  }, [estoques, estados, equipamentoPorId, formulario.tipo]);

  // Se o tipo de movimentação mudar ou o estado do registro deixar de permitir
  // a operação, não mantemos um registro inválido selecionado no formulário.
  useEffect(() => {
    if (formulario.tipo === "ENTRADA" || !formulario.estoqueEquipamentoId) return;

    const listaPermitida = (formulario.tipo === "DEVOLUCAO" || formulario.tipo === "TRANSFERENCIA")
      ? estoquesDoFuncionario
      : formulario.tipo === "SINALIZAR_MANUTENCAO"
        ? estoquesDaOrigemManutencao
        : formulario.tipo === "ENVIO"
          ? estoquesDaOrigemEnvio
          : formulario.tipo === "RETORNO_MANUTENCAO"
            ? estoquesParaRetornoManutencao
            : formulario.tipo === "BAIXA"
              ? estoquesParaBaixa
              : formulario.tipo === "REENTRADA"
                ? estoquesParaReentrada
                : formulario.tipo === "DEVOLUCAO_FORNECEDOR"
                  ? estoquesParaDevolucaoFornecedor
                  : estoquesDisponiveis;

    const permitido = listaPermitida.some(
      (stock) => stock.id === formulario.estoqueEquipamentoId,
    );

    if (!permitido) {
      setFormulario((atual) => ({
        ...atual,
        estoqueEquipamentoId: "",
        // Na devolução, a seleção do funcionário é o primeiro passo e
        // não deve ser apagada só porque ainda não há equipamento escolhido.
        origemId: (atual.tipo === "DEVOLUCAO" || atual.tipo === "TRANSFERENCIA") ? atual.origemId : "",
        destinoId: "",
        quantidade: "1",
      }));
    }
  }, [
    formulario.tipo,
    formulario.estoqueEquipamentoId,
    formulario.origemId,
    estoquesDoFuncionario,
    estoquesDaOrigemManutencao,
    estoquesDaOrigemEnvio,
    estoquesParaRetornoManutencao,
    estoquesParaBaixa,
    estoquesParaReentrada,
    estoquesParaDevolucaoFornecedor,
    estoquesDisponiveis,
  ]);

  const estoqueSelecionado = estoquePorId.get(formulario.estoqueEquipamentoId);
  const equipamentoSelecionado = formulario.tipo === "ENTRADA"
    ? equipamentoPorId.get(formulario.equipamentoId)
    : estoqueSelecionado
      ? equipamentoPorId.get(estoqueSelecionado.equipamento_id)
      : undefined;
  const estadoSelecionado = estoqueSelecionado ? estados.get(estoqueSelecionado.id) : undefined;

  const estoquePorEquipamento = useMemo(() => {
    const mapa = new Map<string, EstoqueEquipamento[]>();
    for (const stock of estoques) {
      const lista = mapa.get(stock.equipamento_id) ?? [];
      lista.push(stock);
      mapa.set(stock.equipamento_id, lista);
    }
    return mapa;
  }, [estoques]);

  const empresaManutencaoPorEstoque = useMemo(() => {
    const mapa = new Map<string, string>();
    const ordenadas = [...movimentacoes].sort((a, b) => {
      const chaveA = `${a.data}|${a.criado_em}`;
      const chaveB = `${b.data}|${b.criado_em}`;
      return chaveA.localeCompare(chaveB);
    });

    for (const movimentacao of ordenadas) {
      if (
        (movimentacao.tipo === "ENVIO" || movimentacao.tipo === "RETIRADA_MANUTENCAO") &&
        movimentacao.tipo_destino === "EMPRESA"
      ) {
        mapa.set(movimentacao.estoque_equipamento_id, movimentacao.destino_id);
      }
      if (movimentacao.tipo === "RETORNO_MANUTENCAO" && movimentacao.tipo_origem === "EMPRESA") {
        mapa.delete(movimentacao.estoque_equipamento_id);
      }
    }

    return mapa;
  }, [movimentacoes]);

  const fluxo = useMemo(() => {
    const tipo = formulario.tipo;
    const almox = equipesOperacionais.almoxarifado;
    const manut = equipesOperacionais.manutencao;

    if (tipo === "ENTRADA") {
      return { origemParte: "EMPRESA" as const, origemId: formulario.empresaId, destinoParte: "EQUIPE" as const, destinoId: almox?.id ?? "", origemLabel: "Empresa proprietária", destinoLabel: "Almoxarifado" };
    }
    if (tipo === "SAIDA") {
      return { origemParte: "EQUIPE" as const, origemId: almox?.id ?? "", destinoParte: "FUNCIONARIO" as const, destinoId: formulario.destinoId, origemLabel: "Almoxarifado", destinoLabel: "Funcionário" };
    }
    if (tipo === "DEVOLUCAO") {
      return { origemParte: "FUNCIONARIO" as const, origemId: formulario.origemId, destinoParte: "EQUIPE" as const, destinoId: almox?.id ?? "", origemLabel: "Funcionário", destinoLabel: "Almoxarifado" };
    }
    if (tipo === "TRANSFERENCIA") {
      return { origemParte: "FUNCIONARIO" as const, origemId: formulario.origemId, destinoParte: "FUNCIONARIO" as const, destinoId: formulario.destinoId, origemLabel: "Funcionário", destinoLabel: "Funcionário" };
    }
    if (tipo === "SINALIZAR_MANUTENCAO") {
      return {
        origemParte: formulario.origemParte as "EQUIPE" | "FUNCIONARIO",
        origemId: formulario.origemId,
        destinoParte: "EQUIPE" as const,
        destinoId: manut?.id ?? "",
        origemLabel: formulario.origemParte === "FUNCIONARIO"
          ? "Funcionário"
          : formulario.origemId
            ? "Almoxarifado"
            : "Origem",
        destinoLabel: "Sinalização de manutenção",
      };
    }
    if (tipo === "ENVIO") {
      return {
        origemParte: formulario.origemParte as "EQUIPE" | "FUNCIONARIO",
        origemId: formulario.origemId,
        destinoParte: "EMPRESA" as const,
        destinoId: formulario.destinoId,
        origemLabel: formulario.origemParte === "FUNCIONARIO"
          ? "Funcionário"
          : formulario.origemId
            ? "Almoxarifado"
            : "Origem",
        destinoLabel: estoqueSelecionado?.vinculo === "PROPRIO"
          ? "Empresa de manutenção"
          : "Empresa do vínculo",
      };
    }
    if (tipo === "RETORNO_MANUTENCAO") {
      const origemEmpresa = (estadoSelecionado?.empresa ?? 0) > 0;
      const empresaId = estoqueSelecionado
        ? empresaManutencaoPorEstoque.get(estoqueSelecionado.id) ?? ""
        : "";
      return {
        origemParte: origemEmpresa ? "EMPRESA" as const : "EQUIPE" as const,
        origemId: origemEmpresa ? empresaId : manut?.id ?? "",
        destinoParte: "EQUIPE" as const,
        destinoId: almox?.id ?? "",
        origemLabel: origemEmpresa ? "Empresa de manutenção" : "Manutenção",
        destinoLabel: "Almoxarifado",
      };
    }
    if (tipo === "REENTRADA") {
      const pendencia = estoqueSelecionado
        ? pendenciasReentrada.get(estoqueSelecionado.id)
        : undefined;
      const equipeDestino = formulario.destinoId
        ? equipes.find((equipe) => equipe.id === formulario.destinoId)
        : undefined;
      return {
        origemParte: "EMPRESA" as const,
        origemId: pendencia?.origemId ?? "",
        destinoParte: "EQUIPE" as const,
        destinoId: formulario.destinoId || almox?.id || "",
        origemLabel: "Empresa",
        destinoLabel: equipeDestino?.nome ?? "Todo o projeto (Almoxarifado)",
      };
    }
    if (tipo === "BAIXA") {
      return {
        origemParte: "EQUIPE" as const,
        origemId: almox?.id ?? "",
        destinoParte: "EMPRESA" as const,
        destinoId: estoqueSelecionado?.empresa_id ?? "",
        origemLabel: "Almoxarifado",
        destinoLabel: "Baixa definitiva",
      };
    }
    return { origemParte: "EQUIPE" as const, origemId: formulario.origemId, destinoParte: "EMPRESA" as const, destinoId: estoqueSelecionado?.empresa_id ?? "", origemLabel: formulario.origemId === manut?.id ? "Manutenção" : "Almoxarifado", destinoLabel: "Empresa proprietária" };
  }, [formulario, equipesOperacionais, equipes, estoqueSelecionado, empresaManutencaoPorEstoque, pendenciasReentrada]);

  const maxQuantidade = useMemo(() => {
    if (formulario.tipo === "ENTRADA") {
      return equipamentoSelecionado?.tipo_controle === "INDIVIDUAL" ? 1 : Number.POSITIVE_INFINITY;
    }
    if (!estadoSelecionado) return 0;

    switch (formulario.tipo) {
      case "SAIDA":
      case "SINALIZAR_MANUTENCAO":
        return formulario.tipo === "SINALIZAR_MANUTENCAO" && formulario.origemParte === "FUNCIONARIO"
          ? estadoSelecionado.funcionarios.get(formulario.origemId) ?? 0
          : estadoSelecionado.almoxarifado;
      case "DEVOLUCAO":
      case "TRANSFERENCIA":
        return estadoSelecionado.funcionarios.get(formulario.origemId) ?? 0;
      case "ENVIO":
        return formulario.origemId === equipesOperacionais.manutencao?.id
          ? estadoSelecionado.manutencao
          : estadoSelecionado.almoxarifado;
      case "RETORNO_MANUTENCAO":
        return estadoSelecionado.empresa > 0
          ? estadoSelecionado.empresa
          : estadoSelecionado.manutencao;
      case "REENTRADA":
        return pendenciasReentrada.get(formulario.estoqueEquipamentoId)?.restante ?? 0;
      case "BAIXA":
        return estadoSelecionado.almoxarifado === estadoSelecionado.saldo
          ? estadoSelecionado.almoxarifado
          : 0;
      case "DEVOLUCAO_FORNECEDOR":
        return estadoSelecionado.manutencao > 0
          ? estadoSelecionado.manutencao
          : estadoSelecionado.almoxarifado;
      default:
        return 0;
    }
  }, [formulario, equipamentoSelecionado, estadoSelecionado, equipesOperacionais, pendenciasReentrada]);

  const movimentacoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return movimentacoes;
    return movimentacoes.filter((mov) => {
      const stock = estoquePorId.get(mov.estoque_equipamento_id);
      const equipamento = stock ? equipamentoPorId.get(stock.equipamento_id) : undefined;
      const origem = nomeParte(mov.tipo_origem, mov.origem_id, empresaPorId, equipePorId, funcionarioPorId);
      const destino = nomeParte(mov.tipo_destino, mov.destino_id, empresaPorId, equipePorId, funcionarioPorId);
      return [
        tipoLabels[mov.tipo], equipamento?.nome, stock?.identificacao, stock?.patrimonio,
        stock?.serial, origem, destino, mov.referencia_documento, mov.observacoes,
      ].some((valor) => String(valor ?? "").toLowerCase().includes(termo));
    });
  }, [busca, movimentacoes, estoquePorId, equipamentoPorId, empresaPorId, equipePorId, funcionarioPorId]);

  function atualizar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  function abrirNovo() {
    setFormulario({ ...formularioInicial, data: hoje() });
    setDialogAberto(true);
  }

  function alterarTipo(tipo: MovimentacaoEquipamentoTipo) {
    setFormulario((atual) => ({
      ...atual,
      tipo,
      equipamentoId: "",
      estoqueEquipamentoId: "",
      origemId: "",
      destinoId: "",
      origemParte: "",
      quantidade: "1",
      empresaId: "",
      equipeId: "",
      patrimonio: "",
      identificacao: "",
      serial: "",
      motivoBaixa: "",
    }));
  }

  function selecionarEstoque(id: string) {
    const stock = estoquePorId.get(id);
    const estado = stock ? estados.get(stock.id) : undefined;

    const origemAutomatica =
      formulario.tipo === "RETORNO_MANUTENCAO"
        ? (estado?.empresa ?? 0) > 0
          ? "__EMPRESA_MANUTENCAO__"
          : equipesOperacionais.manutencao?.id ?? ""
        : formulario.tipo === "DEVOLUCAO_FORNECEDOR"
          ? (estado?.manutencao ?? 0) > 0
            ? equipesOperacionais.manutencao?.id ?? ""
            : equipesOperacionais.almoxarifado?.id ?? ""
          : undefined;

    setFormulario((atual) => ({
      ...atual,
      estoqueEquipamentoId: id,
      // Para retorno da manutenção e devolução ao fornecedor a origem é
      // determinada pelo estado atual do registro físico.
      origemId: origemAutomatica ?? (
        atual.tipo === "DEVOLUCAO" ||
        atual.tipo === "TRANSFERENCIA" ||
        atual.tipo === "SINALIZAR_MANUTENCAO" ||
        atual.tipo === "ENVIO" ||
        atual.tipo === "BAIXA"
          ? atual.origemId
          : ""
      ),
      origemParte: origemAutomatica
        ? "EQUIPE"
        : atual.origemParte,
      destinoId: atual.tipo === "REENTRADA" ? atual.destinoId : "",
      quantidade: "1",
      empresaId: stock?.empresa_id ?? "",
    }));
  }

  function selecionarEquipamentoEntrada(id: string) {
    const equipamento = equipamentoPorId.get(id);
    setFormulario((atual) => ({
      ...atual,
      equipamentoId: id,
      quantidade: equipamento?.tipo_controle === "INDIVIDUAL" ? "1" : "1",
    }));
  }

  async function salvar() {
    if (!projetoId) return;
    if (!formulario.data) {
      toast.error("Informe a data da movimentação.");
      return;
    }
    if (!equipesOperacionais.almoxarifado) {
      toast.error("A equipe Almoxarifado não foi encontrada neste projeto.");
      return;
    }

    const tipo = formulario.tipo;

    try {
      setSalvando(true);

      // ENTRADA é diferente das demais movimentações:
      // seleciona-se o cadastro/modelo e a operação cria um NOVO registro físico no estoque.
      if (tipo === "ENTRADA") {
        const equipamento = equipamentoPorId.get(formulario.equipamentoId);
        if (!equipamento) {
          toast.error("Selecione o equipamento que será recebido.");
          return;
        }
        if (equipamento.ativo === false) {
          toast.error("Este equipamento está inativo e não pode receber uma entrada.");
          return;
        }
        if (!formulario.empresaId) {
          toast.error("Selecione a empresa proprietária.");
          return;
        }
        if (!formulario.vinculo) {
          toast.error("Selecione o vínculo do equipamento.");
          return;
        }

        const quantidade = equipamento.tipo_controle === "INDIVIDUAL" ? 1 : Number(formulario.quantidade);
        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          toast.error("Informe uma quantidade válida.");
          return;
        }
        if (equipamento.tipo_controle === "QUANTITATIVO" && !Number.isInteger(quantidade)) {
          toast.error("A quantidade deve ser inteira.");
          return;
        }

        const stock = await estoqueEquipamentosRepo.salvar(projetoId, {
          equipamento_id: equipamento.id,
          empresa_id: formulario.empresaId,
          vinculo: formulario.vinculo,
          equipe_id: formulario.equipeId || null,
          patrimonio: formulario.patrimonio.trim() || null,
          identificacao: formulario.identificacao.trim() || null,
          serial: formulario.serial.trim() || null,
          quantidade,
          devolvido: 0,
          // status: "ATIVO",
          data_entrada: formulario.data,
          referencia_documento: formulario.referenciaDocumento.trim() || null,
          observacoes: formulario.observacoes.trim() || null,
        });

        try {
          await movimentacoesEquipamentosRepo.salvar({
            projeto_id: projetoId,
            estoque_equipamento_id: stock.id,
            tipo: "ENTRADA",
            quantidade,
            tipo_origem: "EMPRESA",
            origem_id: formulario.empresaId,
            tipo_destino: "EQUIPE",
            destino_id: equipesOperacionais.almoxarifado.id,
            data: formulario.data,
            referencia_documento: formulario.referenciaDocumento.trim() || null,
            observacoes: formulario.observacoes.trim() || null,
          });
        } catch (error) {
          // Não deixa um registro físico órfão se a movimentação de entrada falhar.
          await getDB().estoque_equipamentos.delete(stock.id);
          throw error;
        }

        await carregar();
        setDialogAberto(false);
        setFormulario({ ...formularioInicial, data: hoje() });
        toast.success("Equipamento adicionado ao estoque por movimentação de entrada.");
        return;
      }

      if (!formulario.estoqueEquipamentoId) {
        toast.error("Selecione o equipamento em estoque.");
        return;
      }
      const stock = estoquePorId.get(formulario.estoqueEquipamentoId);
      const equipamento = stock ? equipamentoPorId.get(stock.equipamento_id) : undefined;
      const estado = stock ? estados.get(stock.id) : undefined;
      if (!stock || !equipamento || !estado) {
        toast.error("Não foi possível determinar o equipamento e seu estado atual.");
        return;
      }
      if (tipo !== "REENTRADA" && stock.ativo === false) {
        toast.error("Este registro de estoque está inativo e não pode receber movimentações.");
        return;
      }
      if (tipo === "REENTRADA" && !pendenciasReentrada.has(stock.id)) {
        toast.error("Este equipamento não possui quantidade disponível para reentrada.");
        return;
      }
      if (equipamento.ativo === false) {
        toast.error("Este equipamento está inativo e não pode receber movimentações.");
        return;
      }
      if (tipo === "DEVOLUCAO_FORNECEDOR" && stock.vinculo === "PROPRIO") {
        toast.error("Equipamentos próprios não podem ser devolvidos ao fornecedor.");
        return;
      }
      if (tipo === "REENTRADA" && !pendenciasReentrada.has(stock.id)) {
        toast.error("Este equipamento não possui uma devolução ou baixa pendente para reentrada.");
        return;
      }
      if (tipo === "SINALIZAR_MANUTENCAO" && (sinalizacoesPendentes.get(stock.id) ?? 0) > 0) {
        toast.error("Este equipamento já está sinalizado para manutenção.");
        return;
      }

      if (tipo === "BAIXA" && !formulario.motivoBaixa.trim()) {
        toast.error("Informe o motivo da baixa.");
        return;
      }
      if (tipo === "BAIXA" && (estado.almoxarifado !== estado.saldo || estado.saldo <= 0)) {
        toast.error("A baixa somente pode ser realizada quando o equipamento estiver exclusivamente no Almoxarifado.");
        return;
      }

      if (tipo === "SAIDA" && estado.almoxarifado <= 0) {
        toast.error("Este registro não possui quantidade disponível no Almoxarifado.");
        return;
      }
      if (tipo !== "REENTRADA" && estado.saldo <= 0) {
        toast.error("Este equipamento não possui saldo disponível.");
        return;
      }

      const quantidade = equipamento.tipo_controle === "INDIVIDUAL" ? 1 : Number(formulario.quantidade);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        toast.error("Informe uma quantidade válida.");
        return;
      }
      if (equipamento.tipo_controle === "QUANTITATIVO" && !Number.isInteger(quantidade)) {
        toast.error("A quantidade deve ser inteira.");
        return;
      }
      if (maxQuantidade !== undefined && quantidade > maxQuantidade) {
        toast.error(`A quantidade máxima desta operação é ${maxQuantidade}.`);
        return;
      }

      if (tipo === "DEVOLUCAO" || ((tipo === "SINALIZAR_MANUTENCAO" || tipo === "ENVIO") && formulario.origemParte === "FUNCIONARIO")) {
        const apropriadoAoFuncionario = estado.funcionarios.get(formulario.origemId) ?? 0;
        if (!formulario.origemId) {
          toast.error("Selecione o funcionário de origem.");
          return;
        }
        if (apropriadoAoFuncionario <= 0) {
          toast.error("Este funcionário não possui este equipamento apropriado.");
          return;
        }
        if (quantidade > apropriadoAoFuncionario) {
          toast.error(`O funcionário possui apenas ${apropriadoAoFuncionario} unidade(s) deste equipamento.`);
          return;
        }
      }

      if (tipo === "SINALIZAR_MANUTENCAO") {
        if (formulario.origemParte !== "FUNCIONARIO" && formulario.origemParte !== "EQUIPE") {
          toast.error("Selecione a origem do equipamento.");
          return;
        }
        if (formulario.origemParte === "EQUIPE" && formulario.origemId !== equipesOperacionais.almoxarifado?.id) {
          toast.error("A origem por equipe deve ser o Almoxarifado.");
          return;
        }
      }

      let origemParte: MovimentacaoEquipamentoParte = fluxo.origemParte;
      let origemId = fluxo.origemId;
      let destinoParte: MovimentacaoEquipamentoParte = fluxo.destinoParte;
      let destinoId = fluxo.destinoId;

      if (tipo === "RETORNO_MANUTENCAO") {
        if ((estado.empresa ?? 0) > 0) {
          origemParte = "EMPRESA";
          origemId = empresaManutencaoPorEstoque.get(stock.id) ?? "";
        } else {
          origemParte = "EQUIPE";
          origemId = equipesOperacionais.manutencao?.id ?? "";
        }
        destinoParte = "EQUIPE";
        destinoId = equipesOperacionais.almoxarifado.id;
      }

      if (tipo === "DEVOLUCAO_FORNECEDOR") {
        origemParte = "EQUIPE";
        origemId = estado.manutencao > 0
          ? equipesOperacionais.manutencao?.id ?? ""
          : equipesOperacionais.almoxarifado.id;
        destinoParte = "EMPRESA";
        destinoId = stock.empresa_id;
      }

      if (tipo === "ENVIO") {
        if (!destinoId) {
          if (stock.vinculo === "PROPRIO") {
            toast.error("Selecione a empresa que fará a manutenção.");
            return;
          }
          destinoId = stock.empresa_id;
        }

        if (stock.vinculo !== "PROPRIO" && destinoId !== stock.empresa_id) {
          toast.error("Equipamentos alugados ou emprestados devem ser enviados para a empresa do vínculo.");
          return;
        }

        if (estado.manutencao > 0) {
          toast.error("Este equipamento já está em manutenção.");
          return;
        }

        if (
          formulario.origemParte === "EQUIPE" &&
          formulario.origemId !== equipesOperacionais.almoxarifado?.id
        ) {
          toast.error("O envio por equipe deve partir do Almoxarifado.");
          return;
        }
      }

      if (
        (tipo === "SINALIZAR_MANUTENCAO" || tipo === "ENVIO") &&
        formulario.origemParte !== "FUNCIONARIO" &&
        formulario.origemParte !== "EQUIPE"
      ) {
        toast.error("Selecione a origem do equipamento.");
        return;
      }
      if (tipo === "BAIXA" && formulario.origemId && formulario.origemId !== equipesOperacionais.almoxarifado?.id) {
        toast.error("A baixa somente pode partir do Almoxarifado.");
        return;
      }
      if (!origemId || !destinoId) {
        toast.error("Não foi possível determinar origem e destino.");
        return;
      }
      if (tipo === "REENTRADA" && destinoParte !== "EQUIPE") {
        toast.error("Não foi possível determinar o destino da reentrada.");
        return;
      }
      if (tipo === "TRANSFERENCIA" && origemId === destinoId) {
        toast.error("O funcionário de origem e destino devem ser diferentes.");
        return;
      }

      const dadosMovimentacao = {
        projeto_id: projetoId,
        estoque_equipamento_id: stock.id,
        tipo,
        quantidade,
        tipo_origem: origemParte,
        origem_id: origemId,
        tipo_destino: destinoParte,
        destino_id: destinoId,
        data: formulario.data,
        referencia_documento: formulario.referenciaDocumento.trim() || null,
        observacoes: tipo === "BAIXA" ? formulario.motivoBaixa.trim() : formulario.observacoes.trim() || null,
      };

      try {
        await movimentacoesEquipamentosRepo.salvar(dadosMovimentacao);
      } catch (error) {
        // Bancos criados antes da inclusão da baixa podem não possuir a
        // object store opcional usada pelo repositório para esse tipo. A
        // baixa é apenas um lançamento de histórico, portanto pode ser
        // persistida diretamente na store principal sem perder a operação.
        const mensagem = error instanceof Error ? error.message : String(error);
        if (tipo !== "BAIXA" || !/object.?store|objectStore/i.test(mensagem)) throw error;

        const db = getDB() as any;
        const tabela = db.movimentacoes_equipamentos;
        if (!tabela) throw error;
        await tabela.add({
          id: crypto.randomUUID(),
          criado_em: new Date().toISOString(),
          ...dadosMovimentacao,
        });
      }

      await carregar();
      setDialogAberto(false);
      setFormulario({ ...formularioInicial, data: hoje() });
      toast.success("Movimentação registrada.");
      return;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a movimentação.");
    } finally {
      setSalvando(false);
    }
  }

  if (!projetoId) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum projeto ativo selecionado.</CardContent></Card>;
  }

  const renderEstoqueSelect = () => {
    const porFuncionario = formulario.tipo === "DEVOLUCAO" || formulario.tipo === "TRANSFERENCIA";
    const listaBase = porFuncionario ? estoquesDoFuncionario : estoquesDisponiveis;
    const lista = formulario.tipo === "DEVOLUCAO_FORNECEDOR"
      ? estoquesParaDevolucaoFornecedor
      : listaBase;

    return (
      <div className="space-y-2">
        <Label>Equipamento em estoque</Label>
        <Select
          value={formulario.estoqueEquipamentoId}
          onValueChange={selecionarEstoque}
          disabled={porFuncionario && !formulario.origemId}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                porFuncionario && !formulario.origemId
                  ? "Selecione primeiro o funcionário de origem"
                  : "Selecione o equipamento em estoque"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {lista.length === 0 ? (
              <SelectItem value="__vazio__" disabled>
                {porFuncionario && !formulario.origemId
                  ? "Selecione primeiro o funcionário de origem"
                  : porFuncionario
                    ? "Nenhum equipamento apropriado para este funcionário"
                    : "Nenhum equipamento disponível"}
              </SelectItem>
            ) : lista.map((stock) => {
              const equipamento = equipamentoPorId.get(stock.equipamento_id);
              const estado = estados.get(stock.id);
              const quantidadeDisponivel = formulario.tipo === "DEVOLUCAO_FORNECEDOR"
                ? (estado?.manutencao ?? 0) > 0
                  ? estado?.manutencao ?? 0
                  : estado?.almoxarifado ?? 0
                : porFuncionario
                  ? estado?.funcionarios.get(formulario.origemId) ?? 0
                  : estado?.almoxarifado ?? 0;

              return (
                <SelectItem key={stock.id} value={stock.id}>
                  {equipamento?.nome ?? "Equipamento"}{stock.identificacao ? ` — ${stock.identificacao}` : ""} · disponível: {quantidadeDisponivel}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const totalMovimentacoes = movimentacoes.length;
  const entradas = movimentacoes.filter((mov) => mov.tipo === "ENTRADA" || mov.tipo === "REENTRADA").length;
  const saidas = movimentacoes.filter((mov) => ["SAIDA", "DEVOLUCAO_FORNECEDOR", "BAIXA"].includes(mov.tipo)).length;
  const manutencoes = movimentacoes.filter((mov) => ["SINALIZAR_MANUTENCAO", "ENVIO", "RETORNO_MANUTENCAO"].includes(mov.tipo)).length;

  return (
    <>
      <div className="mx-auto w-full max-w-[1400px] space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Activity className="size-4" />
              Equipamentos / Operação
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Movimentações</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Registre e acompanhe a movimentação física dos equipamentos do projeto.</p>
          </div>
          <Button onClick={abrirNovo} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nova movimentação
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Movimentações", value: totalMovimentacoes, icon: Activity },
            { label: "Entradas", value: entradas, icon: ArrowDownToLine },
            { label: "Saídas", value: saidas, icon: ArrowUpFromLine },
            { label: "Manutenção", value: manutencoes, icon: Wrench },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className="shadow-none">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Icon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
                    <p className="text-xl font-semibold leading-tight">{item.value}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Histórico de movimentações</h2>
                <p className="text-xs text-muted-foreground">Pesquise por equipamento, identificação, origem, destino ou documento.</p>
              </div>
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Pesquisar movimentação..." className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {movimentacoesFiltradas.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                  <Search className="size-5 text-muted-foreground" />
                </div>
                <p className="font-medium">Nenhuma movimentação encontrada</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tente outro termo de pesquisa ou registre uma nova movimentação.</p>
              </div>
            ) : (
              <>
                <div className="divide-y md:hidden">
                  {movimentacoesFiltradas.map((mov) => {
                    const stock = estoquePorId.get(mov.estoque_equipamento_id);
                    const equipamento = stock ? equipamentoPorId.get(stock.equipamento_id) : undefined;
                    const origem = nomeParte(mov.tipo_origem, mov.origem_id, empresaPorId, equipePorId, funcionarioPorId);
                    const destino = nomeParte(mov.tipo_destino, mov.destino_id, empresaPorId, equipePorId, funcionarioPorId);
                    return (
                      <button key={mov.id} type="button" onClick={() => setDetalhe(mov)} className="w-full px-4 py-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <MovimentoBadge tipo={mov.tipo} />
                            <p className="mt-2 truncate font-medium">{equipamento?.nome ?? "Equipamento removido"}</p>
                            {stock?.identificacao && <p className="truncate text-xs text-muted-foreground">{stock.identificacao}</p>}
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{new Date(`${mov.data}T00:00:00`).toLocaleDateString("pt-BR")}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="max-w-[42%] truncate">{origem}</span>
                          <ArrowRight className="size-3.5 shrink-0" />
                          <span className="max-w-[42%] truncate">{destino}</span>
                          <span className="ml-auto shrink-0 rounded-md bg-muted px-2 py-1 font-semibold text-foreground">{mov.quantidade}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/20">
                      <tr className="border-b text-left">
                        <th className="px-4 py-3 font-medium text-muted-foreground">Data</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Movimentação</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Equipamento</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Fluxo</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Qtd.</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimentacoesFiltradas.map((mov) => {
                        const stock = estoquePorId.get(mov.estoque_equipamento_id);
                        const equipamento = stock ? equipamentoPorId.get(stock.equipamento_id) : undefined;
                        const origem = nomeParte(mov.tipo_origem, mov.origem_id, empresaPorId, equipePorId, funcionarioPorId);
                        const destino = nomeParte(mov.tipo_destino, mov.destino_id, empresaPorId, equipePorId, funcionarioPorId);
                        return (
                          <tr key={mov.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                            <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">{new Date(`${mov.data}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                            <td className="px-4 py-3.5"><MovimentoBadge tipo={mov.tipo} /></td>
                            <td className="max-w-[240px] px-4 py-3.5"><div className="truncate font-medium">{equipamento?.nome ?? "Equipamento removido"}</div>{stock?.identificacao && <div className="truncate text-xs text-muted-foreground">{stock.identificacao}</div>}</td>
                            <td className="px-4 py-3.5"><div className="flex max-w-[320px] items-center gap-2"><span className="truncate">{origem}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{destino}</span></div></td>
                            <td className="px-4 py-3.5 font-semibold">{mov.quantidade}</td>
                            <td className="px-4 py-3.5 text-right"><Button variant="ghost" size="icon" aria-label="Ver detalhes" onClick={() => setDetalhe(mov)}><Eye className="h-4 w-4" /></Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogAberto} onOpenChange={(open) => !salvando && setDialogAberto(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova movimentação de equipamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Tipo de movimentação</Label>
              <Select value={formulario.tipo} onValueChange={(value) => alterarTipo(value as MovimentacaoEquipamentoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{tiposMovimentacaoVisiveis.map((value) => <SelectItem key={value} value={value}>{tipoLabels[value]}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {formulario.tipo === "ENTRADA" ? (
              <>
                <div className="space-y-2">
                  <Label>Equipamento do cadastro</Label>
                  <Select value={formulario.equipamentoId} onValueChange={selecionarEquipamentoEntrada}>
                    <SelectTrigger><SelectValue placeholder="Selecione o equipamento que será recebido" /></SelectTrigger>
                    <SelectContent>
                      {equipamentosAtivos.length === 0 ? (
                        <SelectItem value="__vazio__" disabled>Nenhum equipamento ativo cadastrado</SelectItem>
                      ) : equipamentosAtivos.map((equipamento) => {
                        const registros = estoquePorEquipamento.get(equipamento.id) ?? [];
                        const total = registros.reduce((soma, item) => soma + item.quantidade, 0);
                        return <SelectItem key={equipamento.id} value={equipamento.id}>{equipamento.nome}{total > 0 ? ` · já no estoque: ${total}` : ""}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">A entrada cria um novo registro físico no estoque. Os registros que já estão no estoque não são reutilizados.</p>
                </div>

                {equipamentoSelecionado && (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-4">
                    <div><div className="text-muted-foreground">Controle</div><strong>{equipamentoSelecionado.tipo_controle === "INDIVIDUAL" ? "Individual" : "Quantitativo"}</strong></div>
                    <div><div className="text-muted-foreground">Em estoque</div><strong>{estoquePorEquipamento.get(equipamentoSelecionado.id)?.reduce((soma, item) => soma + item.quantidade, 0) ?? 0}</strong></div>
                    <div><div className="text-muted-foreground">Marca</div><strong>{equipamentoSelecionado.marca || "—"}</strong></div>
                    <div><div className="text-muted-foreground">Modelo</div><strong>{equipamentoSelecionado.modelo || "—"}</strong></div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Empresa proprietária</Label><Select value={formulario.empresaId} onValueChange={(value) => atualizar("empresaId", value)}><SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger><SelectContent>{empresas.map((empresa) => <SelectItem key={empresa.id} value={empresa.id}>{empresa.nome}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Vínculo</Label><Select value={formulario.vinculo} onValueChange={(value) => atualizar("vinculo", value as Formulario["vinculo"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PROPRIO">Próprio</SelectItem><SelectItem value="ALUGADO">Alugado</SelectItem><SelectItem value="EMPRESTIMO">Empréstimo</SelectItem></SelectContent></Select></div>
                </div>

                <div className="space-y-2"><Label>Equipe destinada (opcional)</Label><Select value={formulario.equipeId || "__nenhuma__"} onValueChange={(value) => atualizar("equipeId", value === "__nenhuma__" ? "" : value)}><SelectTrigger><SelectValue placeholder="Todo o projeto" /></SelectTrigger><SelectContent><SelectItem value="__nenhuma__">Todo o projeto</SelectItem>{equipes.map((equipe) => <SelectItem key={equipe.id} value={equipe.id}>{equipe.nome}</SelectItem>)}</SelectContent></Select></div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Quantidade</Label><Input type="number" min={1} step={equipamentoSelecionado?.tipo_controle === "INDIVIDUAL" ? 1 : 1} disabled={equipamentoSelecionado?.tipo_controle === "INDIVIDUAL"} value={formulario.quantidade} onChange={(event) => atualizar("quantidade", event.target.value)} /></div>
                  <div className="space-y-2"><Label>Data</Label><Input type="date" value={formulario.data} onChange={(event) => atualizar("data", event.target.value)} /></div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label>Patrimônio</Label><Input value={formulario.patrimonio} onChange={(event) => atualizar("patrimonio", event.target.value)} /></div>
                  <div className="space-y-2"><Label>Identificação</Label><Input value={formulario.identificacao} onChange={(event) => atualizar("identificacao", event.target.value)} /></div>
                  <div className="space-y-2"><Label>Serial</Label><Input value={formulario.serial} onChange={(event) => atualizar("serial", event.target.value)} /></div>
                </div>
              </>
            ) : (
              <>
                {formulario.tipo === "TRANSFERENCIA" && (
                  <div className="space-y-2">
                    <Label>Funcionário origem</Label>
                    <Select
                      value={formulario.origemId}
                      onValueChange={(value) => {
                        atualizar("origemId", value);
                        atualizar("estoqueEquipamentoId", "");
                        atualizar("destinoId", "");
                        atualizar("quantidade", "1");
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione primeiro o funcionário" /></SelectTrigger>
                      <SelectContent>
                        {funcionariosComApropriacoes.length === 0 ? (
                          <SelectItem value="__vazio__" disabled>Nenhum funcionário possui equipamentos apropriados</SelectItem>
                        ) : funcionariosComApropriacoes.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{nomePessoa(f)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formulario.tipo === "DEVOLUCAO" && (
                  <div className="space-y-2">
                    <Label>Funcionário origem</Label>
                    <Select
                      value={formulario.origemId}
                      onValueChange={(value) => {
                        atualizar("origemId", value);
                        atualizar("estoqueEquipamentoId", "");
                        atualizar("quantidade", "1");
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione primeiro o funcionário" /></SelectTrigger>
                      <SelectContent>
                        {funcionariosComApropriacoes.length === 0 ? (
                          <SelectItem value="__vazio__" disabled>Nenhum funcionário possui equipamentos apropriados</SelectItem>
                        ) : funcionariosComApropriacoes.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{nomePessoa(f)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!['SINALIZAR_MANUTENCAO', 'ENVIO', 'RETORNO_MANUTENCAO', 'BAIXA', 'REENTRADA'].includes(formulario.tipo) && renderEstoqueSelect()}

                {formulario.tipo === "ENVIO" && (
                  <>
                    <div className="space-y-2">
                      <Label>Origem do equipamento</Label>
                      <Select
                        value={formulario.origemParte === "FUNCIONARIO" ? `FUNCIONARIO:${formulario.origemId}` : formulario.origemId}
                        onValueChange={(value) => {
                          if (value.startsWith("FUNCIONARIO:")) {
                            atualizar("origemParte", "FUNCIONARIO");
                            atualizar("origemId", value.slice("FUNCIONARIO:".length));
                          } else {
                            atualizar("origemParte", "EQUIPE");
                            atualizar("origemId", value);
                          }
                          atualizar("estoqueEquipamentoId", "");
                          atualizar("quantidade", "1");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                        <SelectContent>
                          {equipesOperacionais.almoxarifado && (
                            <SelectItem value={equipesOperacionais.almoxarifado.id}>
                              Almoxarifado
                            </SelectItem>
                          )}
                          {funcionariosComApropriacoes.map((funcionario) => (
                            <SelectItem key={funcionario.id} value={`FUNCIONARIO:${funcionario.id}`}>
                              {nomePessoa(funcionario)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Selecione a origem do equipamento: Almoxarifado ou Funcionário.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Equipamento em estoque</Label>
                      <Select
                        value={formulario.estoqueEquipamentoId}
                        onValueChange={selecionarEstoque}
                        disabled={!formulario.origemId}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !formulario.origemId
                                ? "Selecione primeiro a origem"
                                : "Selecione o equipamento"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {estoquesDaOrigemEnvio.length === 0 ? (
                            <SelectItem value="__vazio__" disabled>
                              {formulario.origemId
                                ? "Nenhum equipamento disponível nesta origem"
                                : "Selecione primeiro a origem"}
                            </SelectItem>
                          ) : estoquesDaOrigemEnvio.map((stock) => {
                            const equipamento = equipamentoPorId.get(stock.equipamento_id);
                            const estado = estados.get(stock.id);
                            const quantidadeDisponivel = formulario.origemParte === "FUNCIONARIO"
                              ? estado?.funcionarios.get(formulario.origemId) ?? 0
                              : estado?.almoxarifado ?? 0;

                            return (
                              <SelectItem key={stock.id} value={stock.id}>
                                {equipamento?.nome ?? "Equipamento"}{stock.identificacao ? ` — ${stock.identificacao}` : ""} · disponível: {quantidadeDisponivel}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {estoqueSelecionado?.vinculo === "PROPRIO" ? (
                      <div className="space-y-2">
                        <Label>Empresa de manutenção</Label>
                        <Select
                          value={formulario.destinoId}
                          onValueChange={(value) => atualizar("destinoId", value)}
                          disabled={!formulario.estoqueEquipamentoId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a empresa que fará a manutenção" />
                          </SelectTrigger>
                          <SelectContent>
                            {empresas.length === 0 ? (
                              <SelectItem value="__vazio__" disabled>Nenhuma empresa disponível</SelectItem>
                            ) : empresas.map((empresa) => (
                              <SelectItem key={empresa.id} value={empresa.id}>{empresa.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                        <span className="font-medium">Destino:</span>{" "}
                        {empresaPorId.get(estoqueSelecionado?.empresa_id ?? "")?.nome ?? "Empresa do vínculo"}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Equipamentos alugados ou emprestados usam automaticamente a empresa do vínculo.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {formulario.tipo === "RETORNO_MANUTENCAO" && (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                      <strong>{(estadoSelecionado?.empresa ?? 0) > 0 ? "Empresa de manutenção" : "Manutenção"}</strong>
                      <ArrowRight className="mx-2 inline h-4 w-4" />
                      <strong>Almoxarifado</strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        A origem e o destino são determinados automaticamente pelo histórico do equipamento.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Equipamento em manutenção</Label>
                      <Select
                        value={formulario.estoqueEquipamentoId}
                        onValueChange={selecionarEstoque}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o equipamento" />
                        </SelectTrigger>
                        <SelectContent>
                          {estoquesParaRetornoManutencao.length === 0 ? (
                            <SelectItem value="__vazio__" disabled>Nenhum equipamento disponível para retorno</SelectItem>
                          ) : estoquesParaRetornoManutencao.map((stock) => {
                            const equipamento = equipamentoPorId.get(stock.equipamento_id);
                            const estado = estados.get(stock.id);
                            const externo = (estado?.empresa ?? 0) > 0;
                            const quantidadeDisponivel = externo
                              ? estado?.empresa ?? 0
                              : estado?.manutencao ?? 0;
                            return (
                              <SelectItem key={stock.id} value={stock.id}>
                                {equipamento?.nome ?? "Equipamento"}{stock.identificacao ? ` — ${stock.identificacao}` : ""} · {externo ? "Empresa de manutenção" : "Manutenção"} · disponível: {quantidadeDisponivel}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {formulario.tipo === "REENTRADA" && (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                      <strong>Empresa</strong> <ArrowRight className="mx-2 inline h-4 w-4" /> <strong>Equipe</strong>
                      <p className="mt-1 text-xs text-muted-foreground">A empresa de origem é determinada automaticamente pelo histórico. Selecione apenas o equipamento e a equipe que receberá a reentrada.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Equipamento para reentrada</Label>
                      <Select value={formulario.estoqueEquipamentoId} onValueChange={selecionarEstoque}>
                        <SelectTrigger><SelectValue placeholder="Selecione o equipamento que retornou ao projeto" /></SelectTrigger>
                        <SelectContent>
                          {estoquesParaReentrada.length === 0 ? (
                            <SelectItem value="__vazio__" disabled>Nenhum equipamento disponível para reentrada</SelectItem>
                          ) : estoquesParaReentrada.map((stock) => {
                            const equipamento = equipamentoPorId.get(stock.equipamento_id);
                            const pendencia = pendenciasReentrada.get(stock.id);
                            const origem = pendencia?.tipo === "BAIXA" ? "Baixa" : "Devolução ao fornecedor";
                            return (
                              <SelectItem key={stock.id} value={stock.id}>
                                {equipamento?.nome ?? "Equipamento"}{stock.identificacao ? ` — ${stock.identificacao}` : ""} · {origem} · disponível: {pendencia?.restante ?? 0}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Equipe de destino (opcional)</Label>
                      <Select
                        value={formulario.destinoId || "__todo_projeto__"}
                        onValueChange={(value) =>
                          atualizar("destinoId", value === "__todo_projeto__" ? "" : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todo o projeto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__todo_projeto__">Todo o projeto</SelectItem>
                          {equipes
                            .filter((equipe) => equipe.ativo !== false)
                            .map((equipe) => (
                              <SelectItem key={equipe.id} value={equipe.id}>
                                {equipe.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Sem equipe específica, o equipamento retorna ao Almoxarifado e fica disponível para todo o projeto.
                      </p>
                    </div>
                  </div>
                )}

                {formulario.tipo === "BAIXA" && (
                  <>
                    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                      <strong>Almoxarifado</strong> <ArrowRight className="mx-2 inline h-4 w-4" /> <strong>Baixa definitiva</strong>
                      <p className="mt-1 text-xs text-muted-foreground">Somente equipamentos que estejam exclusivamente no Almoxarifado podem receber baixa.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Equipamento em estoque</Label>
                      <Select value={formulario.estoqueEquipamentoId} onValueChange={selecionarEstoque}>
                        <SelectTrigger><SelectValue placeholder="Selecione o equipamento para baixa" /></SelectTrigger>
                        <SelectContent>
                          {estoquesParaBaixa.length === 0 ? (
                            <SelectItem value="__vazio__" disabled>Nenhum equipamento disponível para baixa</SelectItem>
                          ) : estoquesParaBaixa.map((stock) => {
                            const equipamento = equipamentoPorId.get(stock.equipamento_id);
                            const estado = estados.get(stock.id);
                            return (
                              <SelectItem key={stock.id} value={stock.id}>
                                {equipamento?.nome ?? "Equipamento"}{stock.identificacao ? ` — ${stock.identificacao}` : ""} · disponível: {estado?.almoxarifado ?? 0}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Motivo da baixa *</Label>
                      <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formulario.motivoBaixa} onChange={(event) => atualizar("motivoBaixa", event.target.value)} placeholder="Informe o motivo da baixa definitiva..." />
                    </div>
                  </>
                )}

                {formulario.tipo === "SINALIZAR_MANUTENCAO" && (
                  <>
                    <div className="space-y-2">
                      <Label>Origem da manutenção</Label>
                      <Select
                        value={formulario.origemParte === "FUNCIONARIO" ? `FUNCIONARIO:${formulario.origemId}` : formulario.origemParte === "EQUIPE" ? formulario.origemId : ""}
                        onValueChange={(value) => {
                          if (value.startsWith("FUNCIONARIO:")) {
                            atualizar("origemParte", "FUNCIONARIO");
                            atualizar("origemId", value.slice("FUNCIONARIO:".length));
                          } else {
                            atualizar("origemParte", "EQUIPE");
                            atualizar("origemId", value);
                          }
                          atualizar("estoqueEquipamentoId", "");
                          atualizar("quantidade", "1");
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione primeiro a origem" /></SelectTrigger>
                        <SelectContent>
                          {equipesOperacionais.almoxarifado && (
                            <SelectItem value={equipesOperacionais.almoxarifado.id}>
                              Almoxarifado
                              {almoxarifadoTemEquipamentos ? " · possui equipamentos disponíveis" : " · sem equipamentos disponíveis"}
                            </SelectItem>
                          )}
                          {funcionariosComApropriacoes.map((f) => (
                            <SelectItem key={f.id} value={`FUNCIONARIO:${f.id}`}>
                              {nomePessoa(f)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Equipamento em estoque</Label>
                      <Select
                        value={formulario.estoqueEquipamentoId}
                        onValueChange={selecionarEstoque}
                        disabled={!formulario.origemId}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !formulario.origemId
                                ? "Selecione primeiro a origem"
                                : "Selecione o equipamento que será sinalizado para manutenção"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {estoquesDaOrigemManutencao.length === 0 ? (
                            <SelectItem value="__vazio__" disabled>
                              {formulario.origemId ? "Nenhum equipamento disponível nesta origem" : "Selecione primeiro a origem"}
                            </SelectItem>
                          ) : estoquesDaOrigemManutencao.map((stock) => {
                            const equipamento = equipamentoPorId.get(stock.equipamento_id);
                            const estado = estados.get(stock.id);
                            const quantidadeDisponivel = formulario.origemParte === "FUNCIONARIO"
                              ? estado?.funcionarios.get(formulario.origemId) ?? 0
                              : estado?.almoxarifado ?? 0;

                            return (
                              <SelectItem key={stock.id} value={stock.id}>
                                {equipamento?.nome ?? "Equipamento"}{stock.identificacao ? ` — ${stock.identificacao}` : ""} · disponível: {quantidadeDisponivel}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {formulario.tipo === "SAIDA" && (
                  <>
                    <div className="space-y-2"><Label>Funcionário destino</Label><Select value={formulario.destinoId} onValueChange={(value) => atualizar("destinoId", value)}><SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger><SelectContent>{funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{nomePessoa(f)}</SelectItem>)}</SelectContent></Select></div>
                  </>
                )}

                {formulario.tipo === "TRANSFERENCIA" && (
                  <div className="space-y-2">
                    <Label>Funcionário destino</Label>
                    <Select value={formulario.destinoId} onValueChange={(value) => atualizar("destinoId", value)} disabled={!formulario.estoqueEquipamentoId}>
                      <SelectTrigger><SelectValue placeholder={formulario.estoqueEquipamentoId ? "Selecione o funcionário destino" : "Selecione primeiro o equipamento"} /></SelectTrigger>
                      <SelectContent>
                        {funcionarios.filter((f) => f.id !== formulario.origemId).map((f) => (
                          <SelectItem key={f.id} value={f.id}>{nomePessoa(f)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {estadoSelecionado && (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-4">
                    <div><div className="text-muted-foreground">Almoxarifado</div><strong>{estadoSelecionado.almoxarifado}</strong></div>
                    <div><div className="text-muted-foreground">Manutenção</div><strong>{estadoSelecionado.manutencao}</strong></div>
                    <div><div className="text-muted-foreground">Em uso</div><strong>{[...estadoSelecionado.funcionarios.values()].reduce((a, b) => a + b, 0)}</strong></div>
                    <div><div className="text-muted-foreground">Saldo</div><strong>{estadoSelecionado.saldo}</strong></div>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/20 p-3 text-sm"><span className="font-medium">Fluxo:</span> {fluxo.origemLabel} <ArrowRight className="mx-2 inline h-4 w-4" /> {fluxo.destinoLabel}</div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Quantidade</Label><Input type="number" min={1} step={1} disabled={equipamentoSelecionado?.tipo_controle === "INDIVIDUAL"} value={formulario.quantidade} onChange={(event) => atualizar("quantidade", event.target.value)} /><p className="text-xs text-muted-foreground">Máximo nesta operação: {Number.isFinite(maxQuantidade) ? maxQuantidade : "sem limite"}.</p></div>
                  <div className="space-y-2"><Label>Data</Label><Input type="date" value={formulario.data} onChange={(event) => atualizar("data", event.target.value)} /></div>
                </div>
              </>
            )}

            <div className="space-y-2"><Label>Documento de referência</Label><Input value={formulario.referenciaDocumento} onChange={(event) => atualizar("referenciaDocumento", event.target.value)} placeholder="NF, OS, termo, romaneio..." /></div>
            {formulario.tipo !== "BAIXA" && <div className="space-y-2"><Label>Observações</Label><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formulario.observacoes} onChange={(event) => atualizar("observacoes", event.target.value)} placeholder="Defeito, sintoma, serviço, advertências ou outras informações..." /></div>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Registrando..." : "Registrar movimentação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalhe} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Detalhes da movimentação</DialogTitle></DialogHeader>
          {detalhe && (() => {
            const stock = estoquePorId.get(detalhe.estoque_equipamento_id);
            const equipamento = stock ? equipamentoPorId.get(stock.equipamento_id) : undefined;
            return <div className="space-y-4 text-sm"><div><span className="text-muted-foreground">Movimentação</span><div className="font-medium">{tipoLabels[detalhe.tipo]}</div></div><div><span className="text-muted-foreground">Equipamento</span><div className="font-medium">{equipamento?.nome ?? "Equipamento removido"}</div></div><div className="flex items-center gap-2"><span>{nomeParte(detalhe.tipo_origem, detalhe.origem_id, empresaPorId, equipePorId, funcionarioPorId)}</span><ArrowRight className="h-4 w-4" /><span>{nomeParte(detalhe.tipo_destino, detalhe.destino_id, empresaPorId, equipePorId, funcionarioPorId)}</span></div><div><span className="text-muted-foreground">Quantidade</span><div>{detalhe.quantidade}</div></div><div><span className="text-muted-foreground">Data</span><div>{new Date(`${detalhe.data}T00:00:00`).toLocaleDateString("pt-BR")}</div></div>{detalhe.referencia_documento && <div><span className="text-muted-foreground">Documento</span><div>{detalhe.referencia_documento}</div></div>}{detalhe.observacoes && <div><span className="text-muted-foreground">Observações</span><div className="whitespace-pre-wrap">{detalhe.observacoes}</div></div>}</div>;
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

