import { getDB } from "@/db/db";
import { verificarPin } from "@/utils/seguranca";
import type {
  MovimentacaoEquipamentoTipo,
  MovimentacaoEquipamentoParte,
  Funcionario,
} from "@/types";
import type {
  MetodoValidacaoDisponivel,
  PapelValidacaoTransacao,
  ValidacaoTransacaoEntrada,
  ValidacaoTransacaoRegistro,
} from "@/types/validacao-transacao";

export type RascunhoMovimentacaoValidavel = {
  projeto_id: string;
  tipo: MovimentacaoEquipamentoTipo;
  tipo_origem: MovimentacaoEquipamentoParte;
  origem_id: string;
  tipo_destino: MovimentacaoEquipamentoParte;
  destino_id: string;
};

export type RequisitoValidacaoTransacao = {
  funcionario_id: string;
  funcionario_nome: string;
  papel: PapelValidacaoTransacao;
};

/**
 * Catálogo extensível. Digital e facial ficam explicitamente registrados como
 * métodos futuros, sem fingir que estão disponíveis no ambiente atual.
 */
export function listarMetodosValidacaoTransacao(): MetodoValidacaoDisponivel[] {
  return [
    {
      id: "PIN",
      nome: "PIN de segurança",
      disponivel: true,
      descricao: "Confirmação local usando o PIN cadastrado do funcionário.",
    },
    {
      id: "DIGITAL",
      nome: "Biometria digital",
      disponivel: false,
      descricao: "Preparado para integração com o serviço local de biometria.",
    },
    {
      id: "FACIAL",
      nome: "Reconhecimento facial",
      disponivel: false,
      descricao: "Preparado para um módulo facial local, sem enviar imagem para a nuvem.",
    },
  ];
}

function adicionarRequisito(
  requisitos: RequisitoValidacaoTransacao[],
  funcionario: Pick<Funcionario, "id" | "nome" | "pin_hash" | "pin_salt" | "pin_iteracoes">,
  papel: PapelValidacaoTransacao,
) {
  if (funcionario.pin_hash && funcionario.pin_salt && funcionario.pin_iteracoes) {
    requisitos.push({ funcionario_id: funcionario.id, funcionario_nome: funcionario.nome, papel });
  }
}

/**
 * A validação é exigida somente quando o participante possui PIN, preservando
 * a compatibilidade com funcionários antigos que ainda não cadastraram um.
 */
export async function obterRequisitosValidacaoTransacao(
  movimento: RascunhoMovimentacaoValidavel,
): Promise<RequisitoValidacaoTransacao[]> {
  const db = getDB();
  const requisitos: RequisitoValidacaoTransacao[] = [];

  if (movimento.tipo_origem === "FUNCIONARIO") {
    const funcionario = await db.funcionarios.get(movimento.origem_id);
    if (funcionario && funcionario.projeto_id === movimento.projeto_id) {
      adicionarRequisito(requisitos, funcionario, "ORIGEM");
    }
  }

  if (movimento.tipo_destino === "FUNCIONARIO") {
    const funcionario = await db.funcionarios.get(movimento.destino_id);
    if (funcionario && funcionario.projeto_id === movimento.projeto_id) {
      adicionarRequisito(requisitos, funcionario, "DESTINO");
    }
  }

  return requisitos;
}

/** Valida os PINs e devolve apenas evidências não sensíveis para persistência. */
export async function validarTransacaoPorPin(
  movimento: RascunhoMovimentacaoValidavel,
  entradas: ValidacaoTransacaoEntrada[],
): Promise<ValidacaoTransacaoRegistro[]> {
  const requisitos = await obterRequisitosValidacaoTransacao(movimento);
  if (requisitos.length === 0) return [];

  const registros: ValidacaoTransacaoRegistro[] = [];
  for (const requisito of requisitos) {
    const entrada = entradas.find(
      (item) =>
        item.metodo === "PIN" &&
        item.funcionario_id === requisito.funcionario_id &&
        item.papel === requisito.papel,
    );
    if (!entrada) {
      throw new Error(`Informe o PIN de ${requisito.funcionario_nome}.`);
    }

    const funcionario = await getDB().funcionarios.get(requisito.funcionario_id);
    if (
      !funcionario?.pin_hash ||
      !funcionario.pin_salt ||
      !funcionario.pin_iteracoes ||
      !(await verificarPin(entrada.pin, {
        pin_hash: funcionario.pin_hash,
        pin_salt: funcionario.pin_salt,
        pin_iteracoes: funcionario.pin_iteracoes,
      }))
    ) {
      throw new Error(`PIN inválido para ${requisito.funcionario_nome}.`);
    }

    registros.push({
      metodo: "PIN",
      funcionario_id: requisito.funcionario_id,
      papel: requisito.papel,
      validado_em: new Date().toISOString(),
    });
  }

  return registros;
}
