import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { autorizarProjetoNuvem } from "@/lib/projeto-auth-r2";

const PREFIXO = "projetos";
const FORMATO = "ALMOXARIFADO_PROJECT_SHARE";
const VERSAO = 1;
const MAX_ENVELOPE = 25 * 1024 * 1024;

function validarProjetoId(projetoId: string): string {
  const valor = projetoId.trim();
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(valor)) throw new Error("Identificador de projeto inválido.");
  return valor;
}

function validarToken(token: string): string {
  const valor = token.trim();
  if (!/^[a-f0-9]{64}$/.test(valor)) throw new Error("Link de compartilhamento inválido.");
  return valor;
}

function validarExpiracao(expiraEm: string): string {
  const timestamp = Date.parse(expiraEm);
  const agora = Date.now();
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= agora + 60_000 ||
    timestamp > agora + 31 * 86_400_000
  ) {
    throw new Error("A validade do link deve estar entre 1 minuto e 31 dias.");
  }
  return new Date(timestamp).toISOString();
}

function validarEnvelope(envelope: string, projetoId: string): string {
  if (typeof envelope !== "string" || envelope.length === 0 || envelope.length > MAX_ENVELOPE) {
    throw new Error("O projeto compartilhado é inválido ou excede o limite permitido.");
  }
  let objeto: Record<string, unknown>;
  try {
    objeto = JSON.parse(envelope) as Record<string, unknown>;
  } catch {
    throw new Error("O projeto compartilhado não possui um envelope válido.");
  }
  if (
    objeto.formato !== "ALMOXARIFADO_SYNC_ENVELOPE" ||
    objeto.versao !== 1 ||
    objeto.projeto_id !== projetoId ||
    typeof objeto.salt !== "string" ||
    typeof objeto.iv !== "string" ||
    typeof objeto.dados !== "string" ||
    typeof objeto.conteudo_sha256 !== "string"
  ) {
    throw new Error("O envelope do projeto não pertence ao projeto informado.");
  }
  return envelope;
}

function chave(projetoId: string, token: string): string {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/compartilhamentos/${token}.json`;
}

function gerarToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

type RegistroCompartilhamento = {
  formato: typeof FORMATO;
  versao: typeof VERSAO;
  projeto_id: string;
  criado_em: string;
  expira_em: string;
  envelope: string;
};

function validarRegistro(registro: unknown, projetoId: string): RegistroCompartilhamento {
  if (!registro || typeof registro !== "object") throw new Error("Compartilhamento inválido.");
  const item = registro as Partial<RegistroCompartilhamento>;
  if (
    item.formato !== FORMATO ||
    item.versao !== VERSAO ||
    item.projeto_id !== projetoId ||
    typeof item.criado_em !== "string" ||
    typeof item.expira_em !== "string" ||
    Date.parse(item.expira_em) <= Date.now()
  ) {
    throw new Error("Este link de compartilhamento expirou ou é inválido.");
  }
  return {
    formato: FORMATO,
    versao: VERSAO,
    projeto_id: projetoId,
    criado_em: item.criado_em,
    expira_em: item.expira_em,
    envelope: validarEnvelope(item.envelope ?? "", projetoId),
  };
}

export const criarCompartilhamentoProjeto = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; senha: string; envelope: string; expiraEm: string }) => {
    const projetoId = validarProjetoId(data.projetoId);
    return {
      projetoId,
      senha: data.senha,
      envelope: validarEnvelope(data.envelope, projetoId),
      expiraEm: validarExpiracao(data.expiraEm),
    };
  })
  .handler(async ({ data }) => {
    await autorizarProjetoNuvem(data.projetoId, data.senha);
    const token = gerarToken();
    const registro: RegistroCompartilhamento = {
      formato: FORMATO,
      versao: VERSAO,
      projeto_id: data.projetoId,
      criado_em: new Date().toISOString(),
      expira_em: data.expiraEm,
      envelope: data.envelope,
    };
    await env.ALMOXARIFADO_BUCKET.put(chave(data.projetoId, token), JSON.stringify(registro), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
      customMetadata: { projetoId: data.projetoId, expiraEm: data.expiraEm },
    });
    return { token, expiraEm: data.expiraEm };
  });

export const consultarCompartilhamentoProjeto = createServerFn({ method: "GET" })
  .validator((data: { projetoId: string; token: string }) => ({
    projetoId: validarProjetoId(data.projetoId),
    token: validarToken(data.token),
  }))
  .handler(async ({ data }) => {
    const objeto = await env.ALMOXARIFADO_BUCKET.get(chave(data.projetoId, data.token));
    if (!objeto) throw new Error("Link de compartilhamento não localizado ou revogado.");
    const registro = validarRegistro(await objeto.json(), data.projetoId);
    return { envelope: registro.envelope, expiraEm: registro.expira_em };
  });

export const revogarCompartilhamentoProjeto = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; senha: string; token: string }) => ({
    projetoId: validarProjetoId(data.projetoId),
    senha: data.senha,
    token: validarToken(data.token),
  }))
  .handler(async ({ data }) => {
    await autorizarProjetoNuvem(data.projetoId, data.senha);
    const nome = chave(data.projetoId, data.token);
    if (!(await env.ALMOXARIFADO_BUCKET.head(nome)))
      throw new Error("Link de compartilhamento não localizado.");
    await env.ALMOXARIFADO_BUCKET.delete(nome);
    return { revogado: true };
  });
