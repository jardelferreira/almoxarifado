import { getDB } from "@/db/db";
import type {
  PainelInventarioDados,
  PublicacaoInventario,
  RegistroPublicacaoInventario,
} from "@/types";
import { hashCpf } from "@/services/painel-funcionarios";
import { normalizarCpf } from "@/utils/seguranca";

const FORMATO = "ALMOXARIFADO_PAINEL_INVENTARIO" as const;

function base64(bytes: Uint8Array) {
  let texto = "";
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto);
}

function bytes(valor: string) {
  return Uint8Array.from(atob(valor), (caractere) => caractere.charCodeAt(0));
}

function buffer(valor: Uint8Array): BufferSource {
  return valor as unknown as BufferSource;
}

async function chave(pinHash: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", buffer(bytes(pinHash)), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function criptografarPainelInventario(
  projetoId: string,
  inventarioId: string,
  cpfHash: string,
  pinHash: string,
  dados: PainelInventarioDados,
): Promise<Pick<RegistroPublicacaoInventario, "iv" | "dados">> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const associado = new TextEncoder().encode(
    `${FORMATO}:1:${projetoId}:${inventarioId}:${cpfHash}`,
  );
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buffer(iv), additionalData: buffer(associado) },
      await chave(pinHash),
      buffer(new TextEncoder().encode(JSON.stringify(dados))),
    ),
  );
  return { iv: base64(iv), dados: base64(cifrado) };
}

export async function descriptografarPainelInventario(
  projetoId: string,
  inventarioId: string,
  cpfHash: string,
  pinHash: string,
  registro: Pick<RegistroPublicacaoInventario, "iv" | "dados">,
): Promise<PainelInventarioDados> {
  const associado = new TextEncoder().encode(
    `${FORMATO}:1:${projetoId}:${inventarioId}:${cpfHash}`,
  );
  const dados = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(bytes(registro.iv)), additionalData: buffer(associado) },
    await chave(pinHash),
    buffer(bytes(registro.dados)),
  );
  return JSON.parse(new TextDecoder().decode(dados)) as PainelInventarioDados;
}

export async function montarPublicacaoPainelInventario(
  projetoId: string,
  inventarioId: string,
): Promise<PublicacaoInventario> {
  const db = getDB();
  const [projeto, inventario, itens, produtos, unidades, equipes, funcionarios] = await Promise.all(
    [
      db.projetos.get(projetoId),
      db.inventarios.get(inventarioId),
      db.inventario_itens.where("inventario_id").equals(inventarioId).toArray(),
      db.produtos.where("projeto_id").equals(projetoId).toArray(),
      db.unidades.toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
    ],
  );
  if (!projeto || !inventario || inventario.projeto_id !== projetoId)
    throw new Error("Inventário não localizado no projeto ativo.");
  if (inventario.status !== "ABERTO")
    throw new Error("Somente inventários abertos podem ser compartilhados para conferência.");

  const produtoMap = new Map(produtos.map((item) => [item.id, item]));
  const unidadeMap = new Map(unidades.map((item) => [item.id, item]));
  const equipeMap = new Map(equipes.map((item) => [item.id, item.nome]));
  const funcionarioMap = new Map(funcionarios.map((item) => [item.id, item]));
  const agora = new Date().toISOString();
  const escopo = inventario.equipe_id
    ? (equipeMap.get(inventario.equipe_id) ?? "Equipe")
    : "Projeto completo";
  const registros: RegistroPublicacaoInventario[] = [];

  for (const participante of inventario.participantes ?? []) {
    const funcionario = funcionarioMap.get(participante.funcionario_id);
    if (
      !funcionario?.cpf ||
      !funcionario.pin_hash ||
      !funcionario.pin_salt ||
      !funcionario.pin_iteracoes
    )
      continue;
    const cpfHash = await hashCpf(normalizarCpf(funcionario.cpf) ?? "");
    const dados: PainelInventarioDados = {
      projeto_id: projetoId,
      projeto_nome: projeto.nome,
      inventario: {
        id: inventario.id,
        status: inventario.status,
        data_abertura: inventario.data_abertura,
        observacao: inventario.observacao,
        escopo,
      },
      funcionario: {
        id: funcionario.id,
        nome: funcionario.nome,
        matricula: funcionario.matricula ?? null,
      },
      itens: itens.map((item) => {
        const produto = produtoMap.get(item.produto_id);
        return {
          id: item.id,
          produto_id: item.produto_id,
          produto: produto?.nome ?? "Produto",
          codigo: produto?.codigo ?? null,
          unidade: unidadeMap.get(produto?.unidade_id ?? "")?.sigla ?? null,
          equipe: equipeMap.get(item.equipe_id) ?? null,
          quantidade_sistema: item.quantidade_sistema,
          quantidade_contada: item.quantidade_contada ?? null,
          observacao: item.observacao ?? null,
        };
      }),
      atualizado_em: agora,
    };
    const protegido = await criptografarPainelInventario(
      projetoId,
      inventario.id,
      cpfHash,
      funcionario.pin_hash,
      dados,
    );
    registros.push({
      inventario_id: inventario.id,
      cpf_hash: cpfHash,
      pin_hash: funcionario.pin_hash,
      pin_salt: funcionario.pin_salt,
      pin_iteracoes: funcionario.pin_iteracoes,
      ...protegido,
      atualizado_em: agora,
    });
  }
  return {
    formato: FORMATO,
    versao: 1,
    projeto_id: projetoId,
    inventario_id: inventarioId,
    atualizado_em: agora,
    registros,
  };
}
