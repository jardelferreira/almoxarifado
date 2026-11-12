import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

const PREFIXO = "projetos";
const FORMATO = "ALMOXARIFADO_INVENTARIO_SYNC";
const VERSAO = 1;
const ITERACOES = 100_000;
const LIMITE = 5 * 1024 * 1024;

type Entrada = { projetoId: string; inventarioId: string; senha: string };
type Envio = Entrada & { envelope: string; etagAtual?: string | null };

function validarId(valor: string, campo: string): string {
  if (typeof valor !== "string" || !/^[a-zA-Z0-9_-]{8,160}$/.test(valor.trim()))
    throw new Error(`${campo} inválido.`);
  return valor.trim();
}

function validarSenha(valor: string): string {
  if (typeof valor !== "string" || valor.length < 16 || valor.length > 256)
    throw new Error("A senha de sincronização deve ter entre 16 e 256 caracteres.");
  return valor;
}

function chave(projetoId: string, inventarioId: string) {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/inventarios/${encodeURIComponent(inventarioId)}/estado.enc`;
}

function etag(valor?: string | null) {
  return valor ? valor.replace(/^"|"$/g, "") : null;
}

async function autorizar(projetoId: string, senha: string) {
  const objeto = await env.ALMOXARIFADO_BUCKET.get(
    `${PREFIXO}/${encodeURIComponent(projetoId)}/controle.json`,
  );
  if (!objeto) throw new Error("O projeto ainda não foi configurado para sincronização na nuvem.");
  const controle = (await objeto.json()) as {
    projeto_id?: string;
    senha_hash?: string;
    senha_salt?: string;
    senha_iteracoes?: number;
  };
  if (
    controle.projeto_id !== projetoId ||
    !controle.senha_hash ||
    !controle.senha_salt ||
    controle.senha_iteracoes !== ITERACOES
  )
    throw new Error("O controle remoto do projeto está inválido.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: Uint8Array.from(atob(controle.senha_salt), (c) => c.charCodeAt(0)),
        iterations: ITERACOES,
        hash: "SHA-256",
      },
      material,
      256,
    ),
  );
  const esperado = Uint8Array.from(atob(controle.senha_hash), (c) => c.charCodeAt(0));
  if (hash.length !== esperado.length || hash.some((byte, indice) => byte !== esperado[indice]))
    throw new Error("Senha de sincronização incorreta.");
}

function validarEnvelope(envelope: string, projetoId: string, inventarioId: string) {
  if (typeof envelope !== "string" || envelope.length === 0 || envelope.length > LIMITE)
    throw new Error("O estado criptografado do inventário é inválido ou excede 5 MB.");
  let registro: Record<string, unknown>;
  try {
    registro = JSON.parse(envelope) as Record<string, unknown>;
  } catch {
    throw new Error("O estado criptografado não é um JSON válido.");
  }
  if (
    registro.formato !== FORMATO ||
    registro.versao !== VERSAO ||
    registro.projeto_id !== projetoId ||
    registro.inventario_id !== inventarioId ||
    typeof registro.dados !== "string" ||
    typeof registro.iv !== "string" ||
    typeof registro.salt !== "string" ||
    typeof registro.conteudo_sha256 !== "string"
  )
    throw new Error("O envelope do inventário é inválido.");
}

export const consultarInventarioNuvem = createServerFn({ method: "POST" })
  .validator((data: Entrada) => ({
    projetoId: validarId(data.projetoId, "Projeto"),
    inventarioId: validarId(data.inventarioId, "Inventário"),
    senha: validarSenha(data.senha),
  }))
  .handler(async ({ data }) => {
    await autorizar(data.projetoId, data.senha);
    const objeto = await env.ALMOXARIFADO_BUCKET.head(chave(data.projetoId, data.inventarioId));
    return {
      existe: Boolean(objeto),
      etag: etag(objeto?.httpEtag),
      atualizadoEm: objeto?.uploaded?.toISOString() ?? null,
    };
  });

export const enviarInventarioNuvem = createServerFn({ method: "POST" })
  .validator((data: Envio) => {
    const projetoId = validarId(data.projetoId, "Projeto");
    const inventarioId = validarId(data.inventarioId, "Inventário");
    validarEnvelope(data.envelope, projetoId, inventarioId);
    return {
      projetoId,
      inventarioId,
      senha: validarSenha(data.senha),
      envelope: data.envelope,
      etagAtual: etag(data.etagAtual),
    };
  })
  .handler(async ({ data }) => {
    await autorizar(data.projetoId, data.senha);
    const nome = chave(data.projetoId, data.inventarioId);
    const atual = await env.ALMOXARIFADO_BUCKET.head(nome);
    const remoto = etag(atual?.httpEtag);
    if (atual && data.etagAtual !== remoto)
      throw new Error(
        "CONFLITO_INVENTARIO: outro dispositivo atualizou este inventário. Consulte a versão remota antes de enviar novamente.",
      );
    if (!atual && data.etagAtual)
      throw new Error("CONFLITO_INVENTARIO: o estado remoto foi removido.");
    const salvo = await env.ALMOXARIFADO_BUCKET.put(nome, data.envelope, {
      onlyIf: atual ? { etagMatches: remoto ?? "" } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    if (!salvo) throw new Error("CONFLITO_INVENTARIO: o estado remoto mudou durante o envio.");
    return { etag: etag(salvo.httpEtag), atualizadoEm: salvo.uploaded.toISOString() };
  });

export const baixarInventarioNuvem = createServerFn({ method: "POST" })
  .validator((data: Entrada) => ({
    projetoId: validarId(data.projetoId, "Projeto"),
    inventarioId: validarId(data.inventarioId, "Inventário"),
    senha: validarSenha(data.senha),
  }))
  .handler(async ({ data }) => {
    await autorizar(data.projetoId, data.senha);
    const objeto = await env.ALMOXARIFADO_BUCKET.get(chave(data.projetoId, data.inventarioId));
    if (!objeto) throw new Error("Ainda não existe uma versão remota para este inventário.");
    return {
      envelope: await objeto.text(),
      etag: etag(objeto.httpEtag),
      atualizadoEm: objeto.uploaded.toISOString(),
    };
  });
