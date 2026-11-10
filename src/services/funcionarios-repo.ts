import { getDB } from "@/db/db";
import { repo } from "@/services/repo";
import { normalizarCpf, validarCpf } from "@/utils/seguranca";
import type { Funcionario } from "@/types";

export async function salvarFuncionario(
  projetoId: string,
  dados: Funcionario,
): Promise<Funcionario> {
  const cpf = normalizarCpf(dados.cpf);
  if (cpf && !validarCpf(cpf)) {
    throw new Error("Informe um CPF válido.");
  }

  if (cpf) {
    const duplicado = await getDB()
      .funcionarios
      .where("projeto_id")
      .equals(projetoId)
      .filter((funcionario) => funcionario.cpf === cpf && funcionario.id !== dados.id)
      .first();

    if (duplicado) {
      throw new Error("Já existe um funcionário com este CPF neste projeto.");
    }
  }

  return repo.funcionarios.save(projetoId, {
    ...dados,
    cpf,
  });
}
