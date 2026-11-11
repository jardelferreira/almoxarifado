import { getDB } from "@/db/db";
import { estadoEquipamentosRepo } from "@/services/equipamentos/estado-repo";
import type {
  PainelFuncionarioDados,
  PublicacaoPainelFuncionarios,
  RegistroPublicacaoFuncionario,
} from "@/types";
import { normalizarCpf } from "@/utils/seguranca";

const FORMATO = "ALMOXARIFADO_PAINEL_FUNCIONARIOS" as const;

function base64(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function bytes(valor: string): Uint8Array {
  const binario = atob(valor);
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

function buffer(bytesValue: Uint8Array): BufferSource {
  return bytesValue as unknown as BufferSource;
}

async function sha256(valor: string): Promise<{ hexadecimal: string; bytes: Uint8Array }> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor)),
  );
  return {
    hexadecimal: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    bytes: digest,
  };
}

async function chaveCriptografia(credencialHash: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", buffer(bytes(credencialHash)), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function rotuloMovimentacao(tipo: string): "SAIDA" | "DEVOLUCAO" | "OUTRA" {
  if (tipo === "SAIDA") return "SAIDA";
  if (tipo === "DEVOLUCAO") return "DEVOLUCAO";
  return "OUTRA";
}

async function protegerDados(
  projetoId: string,
  cpfHash: string,
  credencialHash: string,
  dados: PainelFuncionarioDados,
): Promise<Pick<RegistroPublicacaoFuncionario, "iv" | "dados">> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const associado = new TextEncoder().encode(`${FORMATO}:1:${projetoId}:${cpfHash}`);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buffer(iv), additionalData: buffer(associado) },
      await chaveCriptografia(credencialHash),
      buffer(new TextEncoder().encode(JSON.stringify(dados))),
    ),
  );
  return { iv: base64(iv), dados: base64(cifrado) };
}

export async function montarPublicacaoPainelFuncionarios(
  projetoId: string,
): Promise<PublicacaoPainelFuncionarios> {
  const db = getDB();
  const [
    projeto,
    funcionarios,
    equipamentos,
    estoques,
    equipes,
    produtos,
    unidades,
    locais,
    movimentacoes,
  ] = await Promise.all([
    db.projetos.get(projetoId),
    db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
    db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
    db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
    db.equipes.where("projeto_id").equals(projetoId).toArray(),
    db.produtos.where("projeto_id").equals(projetoId).toArray(),
    db.unidades.toArray(),
    db.locais.where("projeto_id").equals(projetoId).toArray(),
    db.movimentacoes.where("projeto_id").equals(projetoId).toArray(),
  ]);
  if (!projeto) throw new Error("Projeto ativo não localizado.");

  const equipamentoPorId = new Map(equipamentos.map((item) => [item.id, item]));
  const equipePorId = new Map(equipes.map((item) => [item.id, item]));
  const produtoPorId = new Map(produtos.map((item) => [item.id, item]));
  const unidadePorId = new Map(unidades.map((item) => [item.id, item]));
  const localPorId = new Map(locais.map((item) => [item.id, item]));
  const registros: RegistroPublicacaoFuncionario[] = [];
  const agora = new Date().toISOString();

  for (const funcionario of funcionarios.filter((item) => item.status === "ATIVO")) {
    const cpf = normalizarCpf(funcionario.cpf);
    if (!cpf) continue;
    const cpfDigest = await sha256(cpf);
    const equipe = equipePorId.get(funcionario.equipe_raiz_id ?? "");
    const equipamentosFuncionario: PainelFuncionarioDados["equipamentos"] = [];

    for (const estoque of estoques) {
      const equipamento = equipamentoPorId.get(estoque.equipamento_id);
      if (!equipamento) continue;
      const estado = await estadoEquipamentosRepo.calcular(projetoId, estoque.id);
      const quantidade = estado.funcionarios.get(funcionario.id) ?? 0;
      if (quantidade <= 0) continue;
      equipamentosFuncionario.push({
        nome: equipamento.nome,
        marca: equipamento.marca ?? null,
        modelo: equipamento.modelo ?? null,
        identificacao:
          estoque.identificacao || estoque.patrimonio || estoque.serial || "Sem identificação",
        quantidade,
      });
    }

    const materiais = movimentacoes
      .filter((item) => item.funcionario_id === funcionario.id)
      .map((item) => {
        const produto = produtoPorId.get(item.produto_id);
        return {
          id: item.id,
          data: item.data,
          tipo: rotuloMovimentacao(item.tipo),
          produto: produto?.nome ?? "Produto não localizado",
          codigo: produto?.codigo ?? null,
          unidade: unidadePorId.get(produto?.unidade_id ?? "")?.sigla ?? null,
          quantidade: Math.abs(item.quantidade),
          equipe: equipePorId.get(item.equipe_id)?.nome ?? null,
          local: localPorId.get(item.local_id ?? "")?.nome ?? null,
          observacao: item.observacao ?? null,
        };
      })
      .sort((a, b) => `${b.data}-${b.id}`.localeCompare(`${a.data}-${a.id}`));

    const dados: PainelFuncionarioDados = {
      projeto_id: projetoId,
      projeto_nome: projeto.nome,
      funcionario: {
        id: funcionario.id,
        nome: funcionario.nome,
        matricula: funcionario.matricula ?? null,
        funcao: funcionario.funcao ?? null,
        equipe: equipe?.nome ?? null,
      },
      equipamentos: equipamentosFuncionario.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      materiais,
      atualizado_em: agora,
    };
    const pinExiste = Boolean(
      funcionario.pin_hash && funcionario.pin_salt && funcionario.pin_iteracoes,
    );
    const credencialHash = pinExiste ? funcionario.pin_hash! : base64(cpfDigest.bytes);
    const protegido = await protegerDados(projetoId, cpfDigest.hexadecimal, credencialHash, dados);
    registros.push({
      cpf_hash: cpfDigest.hexadecimal,
      pin_hash: pinExiste ? (funcionario.pin_hash ?? null) : null,
      pin_salt: pinExiste ? (funcionario.pin_salt ?? null) : null,
      pin_iteracoes: pinExiste ? (funcionario.pin_iteracoes ?? null) : null,
      protecao: pinExiste ? "PIN" : "CPF",
      ...protegido,
    });
  }

  return {
    formato: FORMATO,
    versao: 1,
    projeto_id: projetoId,
    atualizado_em: agora,
    funcionarios: registros,
  };
}

export async function descriptografarPainelFuncionario(
  projetoId: string,
  cpfHash: string,
  credencialHash: string,
  registro: Pick<RegistroPublicacaoFuncionario, "iv" | "dados">,
): Promise<PainelFuncionarioDados> {
  const associado = new TextEncoder().encode(`${FORMATO}:1:${projetoId}:${cpfHash}`);
  const dados = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(bytes(registro.iv)), additionalData: buffer(associado) },
    await chaveCriptografia(credencialHash),
    buffer(bytes(registro.dados)),
  );
  return JSON.parse(new TextDecoder().decode(dados)) as PainelFuncionarioDados;
}

export async function hashCpf(valor: string): Promise<string> {
  return (await sha256(normalizarCpf(valor) ?? "")).hexadecimal;
}

export function hashCpfParaCredencial(cpfHash: string): string {
  const bytesHash = new Uint8Array(
    cpfHash.match(/.{2}/g)?.map((item) => Number.parseInt(item, 16)) ?? [],
  );
  return base64(bytesHash);
}
