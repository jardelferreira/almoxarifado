import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

const PREFIXO = "projetos";
const FORMATO_CONTROLE = "ALMOXARIFADO_PROJECT_CONTROL";
const VERSAO_CONTROLE = 1;
// O runtime do Cloudflare Workers limita PBKDF2 a 100.000 iterações.
const ITERACOES_SENHA = 100_000;
const TAMANHO_SALT = 16;
const TAMANHO_CHAVE_RECUPERACAO = 32;
const TAMANHO_MAX_ENVELOPE = 25 * 1024 * 1024;

type ControleProjeto = {
  formato: typeof FORMATO_CONTROLE;
  versao: typeof VERSAO_CONTROLE;
  projeto_id: string;
  senha_hash: string;
  senha_salt: string;
  senha_iteracoes: number;
  criado_em: string;
  recuperacao_hash?: string;
  recuperacao_salt?: string;
  recuperacao_iteracoes?: number;
};

type DadosProjeto = {
  projetoId: string;
  senha: string;
  operacao?: "configurar" | "gerar_recuperacao";
};

type EnvioProjeto = DadosProjeto & {
  envelope: string;
  etagAtual?: string | null;
};

function chaveControle(projetoId: string): string {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/controle.json`;
}

function chaveEstado(projetoId: string): string {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/estado-atual.enc`;
}

function normalizarEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  return etag.replace(/^"|"$/g, "");
}

function validarProjetoId(projetoId: string): string {
  const valor = projetoId.trim();
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(valor)) {
    throw new Error("Identificador de projeto inválido.");
  }
  return valor;
}

function validarSenha(senha: string): string {
  if (typeof senha !== "string" || senha.length < 16 || senha.length > 256) {
    throw new Error("A senha de sincronização deve ter entre 16 e 256 caracteres.");
  }
  return senha;
}

function base64(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function base64Url(bytes: Uint8Array): string {
  return base64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function bytes(valor: string): Uint8Array {
  const binario = atob(valor);
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

function comoBufferSource(valor: Uint8Array): BufferSource {
  return valor as unknown as BufferSource;
}

async function derivarHashSenha(senha: string, salt: Uint8Array, iteracoes: number): Promise<Uint8Array> {
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
  for (let indice = 0; indice < a.length; indice += 1) diferenca |= (a[indice] ?? 0) ^ (b[indice] ?? 0);
  return diferenca === 0;
}

async function criarControle(projetoId: string, senha: string): Promise<{ controle: ControleProjeto; chaveRecuperacao: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(TAMANHO_SALT));
  const hash = await derivarHashSenha(senha, salt, ITERACOES_SENHA);
  const chaveRecuperacao = base64Url(crypto.getRandomValues(new Uint8Array(TAMANHO_CHAVE_RECUPERACAO)));
  const recuperacaoSalt = crypto.getRandomValues(new Uint8Array(TAMANHO_SALT));
  const recuperacaoHash = await derivarHashSenha(chaveRecuperacao, recuperacaoSalt, ITERACOES_SENHA);
  return {
    chaveRecuperacao,
    controle: {
      formato: FORMATO_CONTROLE,
      versao: VERSAO_CONTROLE,
      projeto_id: projetoId,
      senha_hash: base64(hash),
      senha_salt: base64(salt),
      senha_iteracoes: ITERACOES_SENHA,
      criado_em: new Date().toISOString(),
      recuperacao_hash: base64(recuperacaoHash),
      recuperacao_salt: base64(recuperacaoSalt),
      recuperacao_iteracoes: ITERACOES_SENHA,
    },
  };
}

async function adicionarChaveRecuperacao(controle: ControleProjeto): Promise<{ controle: ControleProjeto; chaveRecuperacao: string }> {
  const chaveRecuperacao = base64Url(crypto.getRandomValues(new Uint8Array(TAMANHO_CHAVE_RECUPERACAO)));
  const recuperacaoSalt = crypto.getRandomValues(new Uint8Array(TAMANHO_SALT));
  const recuperacaoHash = await derivarHashSenha(chaveRecuperacao, recuperacaoSalt, ITERACOES_SENHA);
  return {
    chaveRecuperacao,
    controle: {
      ...controle,
      recuperacao_hash: base64(recuperacaoHash),
      recuperacao_salt: base64(recuperacaoSalt),
      recuperacao_iteracoes: ITERACOES_SENHA,
    },
  };
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
  const camposRecuperacao = [controle.recuperacao_hash, controle.recuperacao_salt, controle.recuperacao_iteracoes];
  if (camposRecuperacao.some((campo) => campo !== undefined) &&
      (typeof controle.recuperacao_hash !== "string" ||
        typeof controle.recuperacao_salt !== "string" ||
        controle.recuperacao_iteracoes !== ITERACOES_SENHA)) {
    throw new Error("O controle remoto possui dados de recuperação incompletos.");
  }
  return controle as ControleProjeto;
}

async function autorizar(projetoId: string, senha: string): Promise<void> {
  const controle = await lerControle(projetoId);
  const hash = await derivarHashSenha(senha, bytes(controle.senha_salt), controle.senha_iteracoes);
  if (!compararBytes(hash, bytes(controle.senha_hash))) {
    throw new Error("Senha de sincronização incorreta.");
  }
}

function validarChaveRecuperacao(chave: string): string {
  if (typeof chave !== "string" || chave.length < 32 || chave.length > 128) {
    throw new Error("A chave de recuperação informada é inválida.");
  }
  return chave;
}

async function autorizarRecuperacao(projetoId: string, chave: string): Promise<ControleProjeto> {
  const controle = await lerControle(projetoId);
  if (!controle.recuperacao_hash || !controle.recuperacao_salt || !controle.recuperacao_iteracoes) {
    throw new Error("Este projeto ainda não possui uma chave de recuperação configurada.");
  }
  const hash = await derivarHashSenha(chave, bytes(controle.recuperacao_salt), controle.recuperacao_iteracoes);
  if (!compararBytes(hash, bytes(controle.recuperacao_hash))) {
    throw new Error("Chave de recuperação incorreta.");
  }
  return controle;
}

function validarEnvelope(envelope: string): void {
  if (typeof envelope !== "string" || envelope.length === 0 || envelope.length > TAMANHO_MAX_ENVELOPE) {
    throw new Error("O snapshot criptografado é inválido ou excede o limite de 25 MB.");
  }
  let objeto: unknown;
  try {
    objeto = JSON.parse(envelope);
  } catch {
    throw new Error("O snapshot criptografado não é um JSON válido.");
  }
  if (!objeto || typeof objeto !== "object") throw new Error("O snapshot criptografado é inválido.");
  const registro = objeto as Record<string, unknown>;
  if (
    registro["formato"] !== "ALMOXARIFADO_SYNC_ENVELOPE" ||
    registro["versao"] !== 1 ||
    typeof registro["projeto_id"] !== "string" ||
    typeof registro["salt"] !== "string" ||
    typeof registro["iv"] !== "string" ||
    typeof registro["dados"] !== "string" ||
    typeof registro["conteudo_sha256"] !== "string"
  ) {
    throw new Error("O snapshot criptografado não possui o formato esperado.");
  }
}

export const criarProjetoNuvem = createServerFn({ method: "POST" })
  .validator((data: DadosProjeto) => ({
    projetoId: validarProjetoId(data.projetoId),
    senha: validarSenha(data.senha),
    operacao: data.operacao,
  }))
  .handler(async ({ data }) => {
    if (data.operacao === "gerar_recuperacao") {
      await autorizar(data.projetoId, data.senha);
      const controleKey = chaveControle(data.projetoId);
      const atual = await env.ALMOXARIFADO_BUCKET.head(controleKey);
      const objeto = await env.ALMOXARIFADO_BUCKET.get(controleKey);
      if (!atual || !objeto) throw new Error("O controle remoto do projeto não foi encontrado.");
      const controle = await objeto.json() as ControleProjeto;
      if (controle.recuperacao_hash) throw new Error("Este projeto já possui uma chave de recuperação configurada.");
      const novo = await adicionarChaveRecuperacao(controle);
      const salvo = await env.ALMOXARIFADO_BUCKET.put(controleKey, JSON.stringify(novo.controle), {
        onlyIf: { etagMatches: normalizarEtag(atual.httpEtag) ?? "" },
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      });
      if (!salvo) throw new Error("CONFLITO_NUVEM: o controle remoto mudou durante a geração da chave.");
      return { chaveRecuperacao: novo.chaveRecuperacao };
    }
    const controleKey = chaveControle(data.projetoId);
    const existente = await env.ALMOXARIFADO_BUCKET.head(controleKey);
    if (existente) throw new Error("Este projeto já possui sincronização configurada na nuvem.");

    const novo = await criarControle(data.projetoId, data.senha);
    const salvo = await env.ALMOXARIFADO_BUCKET.put(controleKey, JSON.stringify(novo.controle), {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    if (!salvo) throw new Error("O projeto foi configurado por outra operação. Tente novamente.");
    return { projetoId: data.projetoId, configuradoEm: novo.controle.criado_em, chaveRecuperacao: novo.chaveRecuperacao };
  });

export const consultarProjetoNuvem = createServerFn({ method: "POST" })
  .validator((data: DadosProjeto) => ({
    projetoId: validarProjetoId(data.projetoId),
    senha: validarSenha(data.senha),
  }))
  .handler(async ({ data }) => {
    await autorizar(data.projetoId, data.senha);
    const estado = await env.ALMOXARIFADO_BUCKET.head(chaveEstado(data.projetoId));
    return {
      existe: Boolean(estado),
      etag: normalizarEtag(estado?.httpEtag),
      atualizadoEm: estado?.uploaded?.toISOString() ?? null,
      tamanho: estado?.size ?? 0,
    };
  });

export const enviarProjetoNuvem = createServerFn({ method: "POST" })
  .validator((data: EnvioProjeto) => {
    const envelope = typeof data.envelope === "string" ? data.envelope : "";
    validarEnvelope(envelope);
    const projetoId = validarProjetoId(data.projetoId);
    const objeto = JSON.parse(envelope) as Record<string, unknown>;
    if (objeto["projeto_id"] !== projetoId) throw new Error("O snapshot não pertence ao projeto informado.");
    return {
      projetoId,
      senha: validarSenha(data.senha),
      envelope,
      etagAtual: data.etagAtual ?? null,
    };
  })
  .handler(async ({ data }) => {
    await autorizar(data.projetoId, data.senha);
    const atual = await env.ALMOXARIFADO_BUCKET.head(chaveEstado(data.projetoId));
    if (atual && !data.etagAtual) throw new Error("CONFLITO_NUVEM: já existe uma versão remota deste projeto.");
    const etagRemoto = normalizarEtag(atual?.httpEtag);
    const etagInformado = normalizarEtag(data.etagAtual);
    if (atual && etagInformado !== etagRemoto) throw new Error("CONFLITO_NUVEM: a versão remota foi alterada por outro dispositivo.");
    if (!atual && data.etagAtual) throw new Error("CONFLITO_NUVEM: a versão remota foi removida.");

    const salvo = await env.ALMOXARIFADO_BUCKET.put(chaveEstado(data.projetoId), data.envelope, {
      onlyIf: atual ? { etagMatches: etagRemoto ?? "" } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    if (!salvo) throw new Error("CONFLITO_NUVEM: o estado remoto mudou durante o envio.");
    return { etag: normalizarEtag(salvo.httpEtag), atualizadoEm: salvo.uploaded.toISOString(), tamanho: salvo.size };
  });

export const baixarProjetoNuvem = createServerFn({ method: "POST" })
  .validator((data: DadosProjeto) => ({
    projetoId: validarProjetoId(data.projetoId),
    senha: validarSenha(data.senha),
  }))
  .handler(async ({ data }) => {
    await autorizar(data.projetoId, data.senha);
    const objeto = await env.ALMOXARIFADO_BUCKET.get(chaveEstado(data.projetoId));
    if (!objeto) throw new Error("Ainda não existe snapshot remoto para este projeto.");
    return {
      envelope: await objeto.text(),
      etag: normalizarEtag(objeto.httpEtag),
      atualizadoEm: objeto.uploaded.toISOString(),
    };
  });
