import { env } from "cloudflare:workers";

const PREFIXO = "projetos";
const FORMATO_CONTROLE = "ALMOXARIFADO_PROJECT_CONTROL";
const VERSAO_CONTROLE = 1;
const ITERACOES_SENHA = 100_000;

type ControleProjeto = {
  formato: typeof FORMATO_CONTROLE;
  versao: typeof VERSAO_CONTROLE;
  projeto_id: string;
  senha_hash: string;
  senha_salt: string;
  senha_iteracoes: number;
  painel_estoque_token?: string;
};

function chaveControle(projetoId: string): string {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/controle.json`;
}

function bytes(valor: string): Uint8Array {
  const binario = atob(valor);
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

function comoBufferSource(valor: Uint8Array): BufferSource {
  return valor as unknown as BufferSource;
}

async function derivarHashSenha(
  senha: string,
  salt: Uint8Array,
  iteracoes: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const resultado = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: comoBufferSource(salt), iterations: iteracoes, hash: "SHA-256" },
    material,
    256,
  );
  return new Uint8Array(resultado);
}

function compararBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let indice = 0; indice < a.length; indice += 1) {
    diferenca |= (a[indice] ?? 0) ^ (b[indice] ?? 0);
  }
  return diferenca === 0;
}

async function lerControle(projetoId: string): Promise<ControleProjeto> {
  const objeto = await env.ALMOXARIFADO_BUCKET.get(chaveControle(projetoId));
  if (!objeto) throw new Error("O projeto ainda não foi configurado para sincronização na nuvem.");
  const controle = (await objeto.json()) as Partial<ControleProjeto>;
  if (
    controle.formato !== FORMATO_CONTROLE ||
    controle.versao !== VERSAO_CONTROLE ||
    controle.projeto_id !== projetoId ||
    typeof controle.senha_hash !== "string" ||
    typeof controle.senha_salt !== "string" ||
    controle.senha_iteracoes !== ITERACOES_SENHA
  ) {
    throw new Error("O controle remoto do projeto está inválido.");
  }
  return controle as ControleProjeto;
}

export async function autorizarProjetoNuvem(projetoId: string, senha: string): Promise<void> {
  const controle = await lerControle(projetoId);
  const hash = await derivarHashSenha(senha, bytes(controle.senha_salt), controle.senha_iteracoes);
  if (!compararBytes(hash, bytes(controle.senha_hash))) {
    throw new Error("Senha de sincronização incorreta.");
  }
}

export async function autorizarEObterTokenPainelEstoque(
  projetoId: string,
  senha: string,
): Promise<string> {
  const controle = await lerControle(projetoId);
  const hash = await derivarHashSenha(senha, bytes(controle.senha_salt), controle.senha_iteracoes);
  if (!compararBytes(hash, bytes(controle.senha_hash))) {
    throw new Error("Senha de sincronização incorreta.");
  }
  if (controle.painel_estoque_token) return controle.painel_estoque_token;

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const objeto = await env.ALMOXARIFADO_BUCKET.get(chaveControle(projetoId));
  if (!objeto) throw new Error("O controle remoto do projeto não foi encontrado.");
  const atualizado = { ...controle, painel_estoque_token: token };
  await env.ALMOXARIFADO_BUCKET.put(chaveControle(projetoId), JSON.stringify(atualizado), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
  });
  return token;
}
