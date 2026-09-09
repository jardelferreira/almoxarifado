import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Eye, Plus, Search } from "lucide-react";
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
import { equipamentosRepo } from "@/services/equipamentos/repo";
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
  MANUTENCAO: "Sinalizar para manutenção",
  RETIRADA_MANUTENCAO: "Enviar para manutenção",
  RETORNO_MANUTENCAO: "Retorno da manutenção",
  DEVOLUCAO_FORNECEDOR: "Devolução ao fornecedor",
  BAIXA: "Baixa definitiva",
};

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
        case "MANUTENCAO":
          if (mov.tipo_origem === "EQUIPE") estado.almoxarifado -= mov.quantidade;
          else removerFuncionario(mov.origem_id, mov.quantidade);
          estado.manutencao += mov.quantidade;
          break;
        case "RETIRADA_MANUTENCAO":
          if (mov.tipo_origem === "EQUIPE") {
            if (mov.origem_id === equipesOperacionais.manutencao?.id) {
              // Continua contado em Manutenção; apenas muda sua localização
              // física para a empresa externa.
              estado.empresa += mov.quantidade;
            } else {
              // Envio direto do Almoxarifado para manutenção externa.
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

  // Registros físicos que podem ser enviados para manutenção a partir da origem
  // atualmente selecionada. Para manutenção existem duas origens possíveis:
  // Almoxarifado ou Funcionário.
  const estoquesDaOrigemManutencao = useMemo(() => {
    if (formulario.tipo !== "MANUTENCAO" || !formulario.origemParte || !formulario.origemId) {
      return [];
    }

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;

      const estado = estados.get(stock.id);
      if (!estado) return false;

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

  // Registros físicos disponíveis para retirada da manutenção.
  // A origem pode ser a equipe Manutenção ou, quando o equipamento estiver
  // no Almoxarifado, o próprio Almoxarifado.
  const estoquesDaOrigemRetirada = useMemo(() => {
    if (formulario.tipo !== "RETIRADA_MANUTENCAO" || !formulario.origemId) {
      return [];
    }

    const origemEhManutencao = formulario.origemId === equipesOperacionais.manutencao?.id;
    const origemEhAlmoxarifado = formulario.origemId === equipesOperacionais.almoxarifado?.id;

    if (!origemEhManutencao && !origemEhAlmoxarifado) return [];

    return estoques.filter((stock) => {
      if (stock.ativo === false) return false;
      if (equipamentoPorId.get(stock.equipamento_id)?.ativo === false) return false;

      const estado = estados.get(stock.id);
      if (!estado) return false;

      return origemEhManutencao
        ? estado.manutencao > 0
        : estado.almoxarifado > 0;
    });
  }, [
    formulario.tipo,
    formulario.origemId,
    equipesOperacionais.manutencao?.id,
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
    formulario.origemId,
    equipesOperacionais.manutencao?.id,
    estoques,
    estados,
    equipamentoPorId,
  ]);

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
        case "MANUTENCAO":
          // Pode sair do Almoxarifado ou diretamente de um funcionário.
          return estado.almoxarifado > 0 || emUso > 0;
        case "RETIRADA_MANUTENCAO":
          return estado.almoxarifado > 0 || estado.manutencao > 0;
        case "RETORNO_MANUTENCAO":
          return estado.manutencao > 0 || estado.empresa > 0;
        case "BAIXA":
          return estado.saldo > 0 && estado.almoxarifado === estado.saldo;
        case "DEVOLUCAO_FORNECEDOR":
          return estado.almoxarifado > 0 || estado.manutencao > 0;
        case "ENTRADA":
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
      : formulario.tipo === "MANUTENCAO"
        ? estoquesDaOrigemManutencao
        : formulario.tipo === "RETIRADA_MANUTENCAO"
          ? estoquesDaOrigemRetirada
          : formulario.tipo === "RETORNO_MANUTENCAO"
            ? estoquesParaRetornoManutencao
            : formulario.tipo === "BAIXA"
              ? estoquesParaBaixa
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
    estoquesDaOrigemRetirada,
    estoquesParaRetornoManutencao,
    estoquesParaBaixa,
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
      if (movimentacao.tipo === "RETIRADA_MANUTENCAO" && movimentacao.tipo_destino === "EMPRESA") {
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
    if (tipo === "MANUTENCAO") {
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
        destinoLabel: "Manutenção",
      };
    }
    if (tipo === "RETIRADA_MANUTENCAO") {
      const origemId = formulario.origemId || manut?.id || almox?.id || "";
      const destinoId = formulario.destinoId || "";
      const origemParte = "EQUIPE" as const;
      return { origemParte, origemId, destinoParte: "EMPRESA" as const, destinoId, origemLabel: origemId === manut?.id ? "Manutenção" : "Almoxarifado", destinoLabel: "Empresa de manutenção" };
    }
    if (tipo === "RETORNO_MANUTENCAO") {
      const origemEmpresa = formulario.origemId === "__EMPRESA_MANUTENCAO__";
      const empresaId = estoqueSelecionado
        ? empresaManutencaoPorEstoque.get(estoqueSelecionado.id) ?? ""
        : "";
      return {
        origemParte: origemEmpresa ? "EMPRESA" as const : "EQUIPE" as const,
        origemId: origemEmpresa ? empresaId : formulario.origemId,
        destinoParte: "EQUIPE" as const,
        destinoId: almox?.id ?? "",
        origemLabel: origemEmpresa ? "Empresa de manutenção" : "Manutenção",
        destinoLabel: "Almoxarifado",
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
  }, [formulario, equipesOperacionais, estoqueSelecionado, empresaManutencaoPorEstoque]);

  const maxQuantidade = useMemo(() => {
    if (formulario.tipo === "ENTRADA") {
      return equipamentoSelecionado?.tipo_controle === "INDIVIDUAL" ? 1 : Number.POSITIVE_INFINITY;
    }
    if (!estadoSelecionado) return 0;

    switch (formulario.tipo) {
      case "SAIDA":
      case "MANUTENCAO":
        return formulario.tipo === "MANUTENCAO" && formulario.origemParte === "FUNCIONARIO"
          ? estadoSelecionado.funcionarios.get(formulario.origemId) ?? 0
          : estadoSelecionado.almoxarifado;
      case "DEVOLUCAO":
      case "TRANSFERENCIA":
        return estadoSelecionado.funcionarios.get(formulario.origemId) ?? 0;
      case "RETIRADA_MANUTENCAO":
        return formulario.origemId === equipesOperacionais.manutencao?.id
          ? estadoSelecionado.manutencao
          : estadoSelecionado.almoxarifado;
      case "RETORNO_MANUTENCAO":
        return formulario.origemId === "__EMPRESA_MANUTENCAO__"
          ? estadoSelecionado.empresa
          : Math.max(0, estadoSelecionado.manutencao - estadoSelecionado.empresa);
      case "BAIXA":
        return estadoSelecionado.almoxarifado === estadoSelecionado.saldo
          ? estadoSelecionado.almoxarifado
          : 0;
      case "DEVOLUCAO_FORNECEDOR":
        return formulario.origemId === equipesOperacionais.manutencao?.id
          ? estadoSelecionado.manutencao
          : estadoSelecionado.almoxarifado;
    }
  }, [formulario, equipamentoSelecionado, estadoSelecionado, equipesOperacionais]);

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
    setFormulario((atual) => ({
      ...atual,
      estoqueEquipamentoId: id,
      // Na devolução, o funcionário é selecionado primeiro e deve permanecer
      // como origem quando o registro físico for escolhido.
      origemId: atual.tipo === "RETORNO_MANUTENCAO"
        ? (estado?.empresa ?? 0) > 0
          ? "__EMPRESA_MANUTENCAO__"
          : equipesOperacionais.manutencao?.id ?? ""
        : (
        atual.tipo === "DEVOLUCAO" ||
        atual.tipo === "TRANSFERENCIA" ||
        atual.tipo === "MANUTENCAO" ||
        atual.tipo === "RETIRADA_MANUTENCAO" ||
        atual.tipo === "BAIXA"
        )
        ? atual.origemId
        : "",
      destinoId: "",
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
    if (!formulario.data) return toast.error("Informe a data da movimentação.");
    if (!equipesOperacionais.almoxarifado) return toast.error("A equipe Almoxarifado não foi encontrada neste projeto.");

    const tipo = formulario.tipo;

    try {
      setSalvando(true);

      // ENTRADA é diferente das demais movimentações:
      // seleciona-se o cadastro/modelo e a operação cria um NOVO registro físico no estoque.
      if (tipo === "ENTRADA") {
        const equipamento = equipamentoPorId.get(formulario.equipamentoId);
        if (!equipamento) return toast.error("Selecione o equipamento que será recebido.");
        if (equipamento.ativo === false) return toast.error("Este equipamento está inativo e não pode receber uma entrada.");
        if (!formulario.empresaId) return toast.error("Selecione a empresa proprietária.");
        if (!formulario.vinculo) return toast.error("Selecione o vínculo do equipamento.");

        const quantidade = equipamento.tipo_controle === "INDIVIDUAL" ? 1 : Number(formulario.quantidade);
        if (!Number.isFinite(quantidade) || quantidade <= 0) return toast.error("Informe uma quantidade válida.");
        if (equipamento.tipo_controle === "QUANTITATIVO" && !Number.isInteger(quantidade)) return toast.error("A quantidade deve ser inteira.");

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

      if (!formulario.estoqueEquipamentoId) return toast.error("Selecione o equipamento em estoque.");
      const stock = estoquePorId.get(formulario.estoqueEquipamentoId);
      const equipamento = stock ? equipamentoPorId.get(stock.equipamento_id) : undefined;
      const estado = stock ? estados.get(stock.id) : undefined;
      if (!stock || !equipamento || !estado) return toast.error("Não foi possível determinar o equipamento e seu estado atual.");
      if (stock.ativo === false) return toast.error("Este registro de estoque está inativo e não pode receber movimentações.");
      if (equipamento.ativo === false) return toast.error("Este equipamento está inativo e não pode receber movimentações.");
      if (tipo === "DEVOLUCAO_FORNECEDOR" && stock.vinculo === "PROPRIO") {
        return toast.error("Equipamentos próprios não podem ser devolvidos ao fornecedor.");
      }
      if (tipo === "BAIXA" && !formulario.motivoBaixa.trim()) {
        return toast.error("Informe o motivo da baixa.");
      }
      if (tipo === "BAIXA" && (estado.almoxarifado !== estado.saldo || estado.saldo <= 0)) {
        return toast.error("A baixa somente pode ser realizada quando o equipamento estiver exclusivamente no Almoxarifado.");
      }

      if (tipo === "SAIDA" && estado.almoxarifado <= 0) {
        return toast.error("Este registro não possui quantidade disponível no Almoxarifado.");
      }
      if (estado.saldo <= 0) return toast.error("Este equipamento não possui saldo disponível.");

      const quantidade = equipamento.tipo_controle === "INDIVIDUAL" ? 1 : Number(formulario.quantidade);
      if (!Number.isFinite(quantidade) || quantidade <= 0) return toast.error("Informe uma quantidade válida.");
      if (equipamento.tipo_controle === "QUANTITATIVO" && !Number.isInteger(quantidade)) return toast.error("A quantidade deve ser inteira.");
      if (quantidade > maxQuantidade) return toast.error(`A quantidade máxima desta operação é ${maxQuantidade}.`);

      if (tipo === "DEVOLUCAO" || (tipo === "MANUTENCAO" && formulario.origemParte === "FUNCIONARIO")) {
        const apropriadoAoFuncionario = estado.funcionarios.get(formulario.origemId) ?? 0;
        if (!formulario.origemId) return toast.error("Selecione o funcionário de origem.");
        if (apropriadoAoFuncionario <= 0) return toast.error("Este funcionário não possui este equipamento apropriado.");
        if (quantidade > apropriadoAoFuncionario) {
          return toast.error(`O funcionário possui apenas ${apropriadoAoFuncionario} unidade(s) deste equipamento.`);
        }
      }

      if (tipo === "MANUTENCAO") {
        if (formulario.origemParte !== "FUNCIONARIO" && formulario.origemParte !== "EQUIPE") {
          return toast.error("Selecione a origem da manutenção.");
        }
        if (formulario.origemParte === "EQUIPE" && formulario.origemId !== equipesOperacionais.almoxarifado?.id) {
          return toast.error("A origem por equipe deve ser o Almoxarifado.");
        }
      }

      let origemParte: MovimentacaoEquipamentoParte = fluxo.origemParte;
      let origemId = fluxo.origemId;
      let destinoParte: MovimentacaoEquipamentoParte = fluxo.destinoParte;
      let destinoId = fluxo.destinoId;

      if (tipo === "MANUTENCAO" && formulario.origemParte !== "FUNCIONARIO" && formulario.origemParte !== "EQUIPE") {
        return toast.error("Selecione a origem da manutenção.");
      }
      if (tipo === "RETORNO_MANUTENCAO" && formulario.origemId !== equipesOperacionais.manutencao?.id && formulario.origemId !== "__EMPRESA_MANUTENCAO__") {
        return toast.error("Selecione se o retorno é da Manutenção interna ou da empresa de manutenção.");
      }
      if (tipo === "BAIXA" && formulario.origemId && formulario.origemId !== equipesOperacionais.almoxarifado?.id) {
        return toast.error("A baixa somente pode partir do Almoxarifado.");
      }
      if (tipo === "RETIRADA_MANUTENCAO" || tipo === "DEVOLUCAO_FORNECEDOR") {
        if (tipo === "RETIRADA_MANUTENCAO") {
          if (formulario.origemId !== equipesOperacionais.manutencao?.id && formulario.origemId !== equipesOperacionais.almoxarifado?.id) {
            return toast.error("Selecione a origem.");
          }
          if (!formulario.destinoId) {
            return toast.error("Selecione a empresa que fará a manutenção.");
          }
          if (formulario.destinoId && !empresas.some((empresa) => empresa.id === formulario.destinoId && empresa.ativo)) {
            return toast.error("A empresa de manutenção selecionada é inválida.");
          }
        } else if (formulario.origemParte !== "EQUIPE") {
          return toast.error("Selecione a equipe de origem.");
        }
      }
      if (!origemId || !destinoId) return toast.error("Não foi possível determinar origem e destino.");
      if (tipo === "TRANSFERENCIA" && origemId === destinoId) return toast.error("O funcionário de origem e destino devem ser diferentes.");

      await movimentacoesEquipamentosRepo.salvar({
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
      });

      await carregar();
      setDialogAberto(false);
      setFormulario({ ...formularioInicial, data: hoje() });
      toast.success("Movimentação registrada.");
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
    // Equipamento próprio pertence à empresa e, portanto, não pode ser devolvido a fornecedor.
    // Na devolução ao fornecedor exibimos somente registros alugados ou em empréstimo.
    const lista = formulario.tipo === "DEVOLUCAO_FORNECEDOR"
      ? listaBase.filter((stock) => stock.vinculo !== "PROPRIO")
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
              const quantidadeDisponivel = porFuncionario
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

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Movimentações de equipamentos</h1>
            <p className="text-sm text-muted-foreground">Controle a entrada, saída, devolução, transferência e manutenção.</p>
          </div>
          <Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />Nova movimentação</Button>
        </div>

        <Card>
          <CardHeader>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Pesquisar movimentação..." className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Movimentação</th>
                    <th className="px-3 py-3">Equipamento</th>
                    <th className="px-3 py-3">Fluxo</th>
                    <th className="px-3 py-3">Qtd.</th>
                    <th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacoesFiltradas.map((mov) => {
                    const stock = estoquePorId.get(mov.estoque_equipamento_id);
                    const equipamento = stock ? equipamentoPorId.get(stock.equipamento_id) : undefined;
                    const origem = nomeParte(mov.tipo_origem, mov.origem_id, empresaPorId, equipePorId, funcionarioPorId);
                    const destino = nomeParte(mov.tipo_destino, mov.destino_id, empresaPorId, equipePorId, funcionarioPorId);
                    return (
                      <tr key={mov.id} className="border-b last:border-0">
                        <td className="px-3 py-3 whitespace-nowrap">{new Date(`${mov.data}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-3"><Badge variant="outline">{tipoLabels[mov.tipo]}</Badge></td>
                        <td className="px-3 py-3 font-medium">{equipamento?.nome ?? "Equipamento removido"}</td>
                        <td className="px-3 py-3"><div className="flex items-center gap-2"><span>{origem}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /><span>{destino}</span></div></td>
                        <td className="px-3 py-3">{mov.quantidade}</td>
                        <td className="px-3 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => setDetalhe(mov)}><Eye className="h-4 w-4" /></Button></td>
                      </tr>
                    );
                  })}
                  {movimentacoesFiltradas.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhuma movimentação encontrada.</td></tr>}
                </tbody>
              </table>
            </div>
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
                <SelectContent>{Object.entries(tipoLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
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

                {!['MANUTENCAO', 'RETIRADA_MANUTENCAO', 'RETORNO_MANUTENCAO', 'BAIXA'].includes(formulario.tipo) && renderEstoqueSelect()}

                {formulario.tipo === "RETIRADA_MANUTENCAO" && (
                  <>
                    <div className="space-y-2">
                      <Label>Origem do equipamento</Label>
                      <Select
                        value={formulario.origemId}
                        onValueChange={(value) => {
                          atualizar("origemId", value);
                          atualizar("estoqueEquipamentoId", "");
                          atualizar("quantidade", "1");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                        <SelectContent>
                          {equipesOperacionais.manutencao && (
                            <SelectItem value={equipesOperacionais.manutencao.id}>
                              Manutenção
                            </SelectItem>
                          )}
                          {equipesOperacionais.almoxarifado && (
                            <SelectItem value={equipesOperacionais.almoxarifado.id}>
                              Almoxarifado
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Selecione primeiro de onde o equipamento será retirado: Almoxarifado ou Manutenção. Depois selecione o equipamento.
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
                          {estoquesDaOrigemRetirada.length === 0 ? (
                            <SelectItem value="__vazio__" disabled>
                              {formulario.origemId
                                ? "Nenhum equipamento disponível nesta origem"
                                : "Selecione primeiro a origem"}
                            </SelectItem>
                          ) : estoquesDaOrigemRetirada.map((stock) => {
                            const equipamento = equipamentoPorId.get(stock.equipamento_id);
                            const estado = estados.get(stock.id);
                            const quantidadeDisponivel = formulario.origemId === equipesOperacionais.manutencao?.id
                              ? estado?.manutencao ?? 0
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
                      <p className="text-xs text-muted-foreground">A empresa selecionada será registrada como destino da movimentação. O equipamento continuará contabilizado em Manutenção.</p>
                    </div>
                  </>
                )}

                {formulario.tipo === "RETORNO_MANUTENCAO" && (
                  <>
                    <div className="space-y-2">
                      <Label>Origem do retorno</Label>
                      <Select
                        value={formulario.origemId}
                        onValueChange={(value) => {
                          atualizar("origemId", value);
                          atualizar("estoqueEquipamentoId", "");
                          atualizar("quantidade", "1");
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione a origem do retorno" /></SelectTrigger>
                        <SelectContent>
                          {equipesOperacionais.manutencao && (
                            <SelectItem value={equipesOperacionais.manutencao.id}>Manutenção</SelectItem>
                          )}
                          {estoques.some((stock) => (estados.get(stock.id)?.empresa ?? 0) > 0) && (
                            <SelectItem value="__EMPRESA_MANUTENCAO__">Empresa de manutenção</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Equipamento em manutenção</Label>
                      <Select
                        value={formulario.estoqueEquipamentoId}
                        onValueChange={selecionarEstoque}
                        disabled={!formulario.origemId}
                      >
                        <SelectTrigger><SelectValue placeholder={!formulario.origemId ? "Selecione primeiro a origem" : "Selecione o equipamento"} /></SelectTrigger>
                        <SelectContent>
                          {estoquesParaRetornoManutencao.length === 0 ? (
                            <SelectItem value="__vazio__" disabled>Nenhum equipamento disponível para retorno</SelectItem>
                          ) : estoquesParaRetornoManutencao.map((stock) => {
                            const equipamento = equipamentoPorId.get(stock.equipamento_id);
                            const estado = estados.get(stock.id);
                            const quantidadeDisponivel = formulario.origemId === "__EMPRESA_MANUTENCAO__"
                              ? Math.min(estado?.empresa ?? 0, estado?.manutencao ?? 0)
                              : estado?.manutencao ?? 0;
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

                {formulario.tipo === "MANUTENCAO" && (
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
                                : "Selecione o equipamento que será enviado para manutenção"
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

                {formulario.tipo === "DEVOLUCAO_FORNECEDOR" && <div className="space-y-2"><Label>Equipe de origem</Label><Select value={formulario.origemId} onValueChange={(value) => atualizar("origemId", value)}><SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger><SelectContent>{(estadoSelecionado?.almoxarifado ?? 0) > 0 && <SelectItem value={equipesOperacionais.almoxarifado?.id ?? "almox"}>Almoxarifado · {estadoSelecionado?.almoxarifado}</SelectItem>}{(estadoSelecionado?.manutencao ?? 0) > 0 && <SelectItem value={equipesOperacionais.manutencao?.id ?? "manut"}>Manutenção · {estadoSelecionado?.manutencao}</SelectItem>}</SelectContent></Select></div>}

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

function stockSaldo(estado: EstadoUI) {
  return estado.almoxarifado +
    estado.manutencao +
    [...estado.funcionarios.values()].reduce((total, quantidade) => total + quantidade, 0);
}
