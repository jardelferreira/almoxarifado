import type { BackupArquivo } from "@/services/backup";

const FORMATO_ENVELOPE = "ALMOXARIFADO_SYNC_ENVELOPE" as const;
const VERSAO_ENVELOPE = 1;
// Web Crypto em navegadores e no runtime Workers rejeita valores acima de
// 100.000 para PBKDF2. O envelope registra este valor para garantir que a
// descriptografia use exatamente os mesmos parâmetros.
const ITERACOES_PBKDF2 = 100_000;
const TAMANHO_SALT = 16;
const TAMANHO_IV = 12;

export interface EnvelopeSincronizacaoProjeto {
  formato: typeof FORMATO_ENVELOPE;
  versao: typeof VERSAO_ENVELOPE;
  projeto_id: string;
  criado_em: string;
  kdf: "PBKDF2-SHA-256";
  iteracoes: number;
  salt: string;
  iv: string;
  conteudo_sha256: string;
  dados: string;
}

export interface SnapshotProjetoCriptografado {
  envelope: EnvelopeSincronizacaoProjeto;
  bytes: Uint8Array;
}

function garantirWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error("Este navegador não oferece os recursos criptográficos necessários para sincronizar o projeto.");
  }
  return globalThis.crypto;
}

function codificarBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function decodificarBase64(valor: string): Uint8Array {
  const binario = atob(valor);
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

function comoBufferSource(bytes: Uint8Array): BufferSource {
  // O TypeScript atual tipa Uint8Array com ArrayBufferLike, enquanto a API
  // Web Crypto exige um ArrayBufferView baseado em ArrayBuffer.
  return bytes as unknown as BufferSource;
}

function validarSenhaSincronizacao(senha: string): void {
  if (senha.length < 16) {
    throw new Error("A senha de sincronização deve ter pelo menos 16 caracteres.");
  }
}

async function derivarChave(senha: string, salt: Uint8Array, usos: KeyUsage[]): Promise<CryptoKey> {
  validarSenhaSincronizacao(senha);
  const crypto = garantirWebCrypto();
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: comoBufferSource(salt),
      iterations: ITERACOES_PBKDF2,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usos,
  );
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await garantirWebCrypto().subtle.digest("SHA-256", comoBufferSource(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textoJson(backup: BackupArquivo): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(backup));
}

/**
 * Criptografa o snapshot antes de qualquer envio. O Worker/R2 recebe somente
 * o envelope e o conteúdo cifrado; a senha nunca sai do navegador.
 */
export async function criptografarSnapshotProjeto(
  projetoId: string,
  backup: BackupArquivo,
  senha: string,
): Promise<SnapshotProjetoCriptografado> {
  if (!projetoId || backup.projeto?.id !== projetoId) {
    throw new Error("O snapshot não pertence ao projeto informado.");
  }

  const crypto = garantirWebCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(TAMANHO_SALT));
  const iv = crypto.getRandomValues(new Uint8Array(TAMANHO_IV));
  const dados = textoJson(backup);
  const chave = await derivarChave(senha, salt, ["encrypt"]);
  const associado = new TextEncoder().encode(`${FORMATO_ENVELOPE}:${VERSAO_ENVELOPE}:${projetoId}`);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: comoBufferSource(iv), additionalData: comoBufferSource(associado) },
      chave,
      comoBufferSource(dados),
    ),
  );
  const envelope: EnvelopeSincronizacaoProjeto = {
    formato: FORMATO_ENVELOPE,
    versao: VERSAO_ENVELOPE,
    projeto_id: projetoId,
    criado_em: new Date().toISOString(),
    kdf: "PBKDF2-SHA-256",
    iteracoes: ITERACOES_PBKDF2,
    salt: codificarBase64(salt),
    iv: codificarBase64(iv),
    conteudo_sha256: await sha256(cifrado),
    dados: codificarBase64(cifrado),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  return { envelope, bytes };
}

export async function descriptografarSnapshotProjeto(
  envelope: EnvelopeSincronizacaoProjeto,
  projetoId: string,
  senha: string,
): Promise<BackupArquivo> {
  if (
    envelope.formato !== FORMATO_ENVELOPE ||
    envelope.versao !== VERSAO_ENVELOPE ||
    envelope.projeto_id !== projetoId ||
    envelope.kdf !== "PBKDF2-SHA-256" ||
    envelope.iteracoes !== ITERACOES_PBKDF2
  ) {
    throw new Error("O arquivo de sincronização não pertence a este projeto ou usa uma versão incompatível.");
  }

  const crypto = garantirWebCrypto();
  const salt = decodificarBase64(envelope.salt);
  const iv = decodificarBase64(envelope.iv);
  const cifrado = decodificarBase64(envelope.dados);
  if ((await sha256(cifrado)) !== envelope.conteudo_sha256) {
    throw new Error("A integridade do snapshot remoto não pôde ser confirmada.");
  }

  const chave = await derivarChave(senha, salt, ["decrypt"]);
  const associado = new TextEncoder().encode(`${FORMATO_ENVELOPE}:${VERSAO_ENVELOPE}:${projetoId}`);
  let dados: ArrayBuffer;
  try {
    dados = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: comoBufferSource(iv), additionalData: comoBufferSource(associado) },
      chave,
      comoBufferSource(cifrado),
    );
  } catch {
    throw new Error("Senha de sincronização incorreta ou snapshot ilegível.");
  }

  const backup = JSON.parse(new TextDecoder().decode(dados)) as BackupArquivo;
  if (backup.projeto?.id !== projetoId) {
    throw new Error("O snapshot descriptografado não pertence ao projeto informado.");
  }
  return backup;
}

export function lerEnvelopeSincronizacao(bytes: ArrayBuffer | Uint8Array): EnvelopeSincronizacaoProjeto {
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as Partial<EnvelopeSincronizacaoProjeto>;
  if (
    envelope.formato !== FORMATO_ENVELOPE ||
    envelope.versao !== VERSAO_ENVELOPE ||
    typeof envelope.projeto_id !== "string" ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.dados !== "string" ||
    typeof envelope.conteudo_sha256 !== "string"
  ) {
    throw new Error("O objeto remoto não é um envelope de sincronização válido.");
  }
  return envelope as EnvelopeSincronizacaoProjeto;
}
