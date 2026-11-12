import type { Inventario, InventarioItem } from "@/types";

const FORMATO = "ALMOXARIFADO_INVENTARIO_SYNC" as const;
const VERSAO = 1 as const;
const ITERACOES = 100_000;

export type SnapshotInventario = {
  inventario: Inventario;
  itens: InventarioItem[];
  gerado_em: string;
  dispositivo_id: string;
};
export type EnvelopeInventario = {
  formato: typeof FORMATO;
  versao: typeof VERSAO;
  projeto_id: string;
  inventario_id: string;
  criado_em: string;
  iteracoes: number;
  salt: string;
  iv: string;
  conteudo_sha256: string;
  dados: string;
};

function cryptoApi() {
  if (!globalThis.crypto?.subtle)
    throw new Error("Este navegador não oferece criptografia para sincronização.");
  return globalThis.crypto;
}
function b64(bytes: Uint8Array) {
  let texto = "";
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto);
}
function bytes(valor: string) {
  return Uint8Array.from(atob(valor), (c) => c.charCodeAt(0));
}
function buf(valor: Uint8Array): BufferSource {
  return valor as unknown as BufferSource;
}
async function chave(senha: string, salt: Uint8Array, uso: KeyUsage[]) {
  if (senha.length < 16)
    throw new Error("A senha de sincronização deve ter pelo menos 16 caracteres.");
  const material = await cryptoApi().subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi().subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations: ITERACOES, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    uso,
  );
}
async function sha256(data: Uint8Array) {
  return Array.from(new Uint8Array(await cryptoApi().subtle.digest("SHA-256", buf(data))), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function criptografarInventario(
  snapshot: SnapshotInventario,
  senha: string,
): Promise<string> {
  const salt = cryptoApi().getRandomValues(new Uint8Array(16));
  const iv = cryptoApi().getRandomValues(new Uint8Array(12));
  const dados = new TextEncoder().encode(JSON.stringify(snapshot));
  const cifrado = new Uint8Array(
    await cryptoApi().subtle.encrypt(
      {
        name: "AES-GCM",
        iv: buf(iv),
        additionalData: buf(
          new TextEncoder().encode(
            `${FORMATO}:${VERSAO}:${snapshot.inventario.projeto_id}:${snapshot.inventario.id}`,
          ),
        ),
      },
      await chave(senha, salt, ["encrypt"]),
      buf(dados),
    ),
  );
  return JSON.stringify({
    formato: FORMATO,
    versao: VERSAO,
    projeto_id: snapshot.inventario.projeto_id,
    inventario_id: snapshot.inventario.id,
    criado_em: new Date().toISOString(),
    iteracoes: ITERACOES,
    salt: b64(salt),
    iv: b64(iv),
    conteudo_sha256: await sha256(cifrado),
    dados: b64(cifrado),
  } satisfies EnvelopeInventario);
}

export async function descriptografarInventario(
  envelopeTexto: string,
  projetoId: string,
  inventarioId: string,
  senha: string,
): Promise<SnapshotInventario> {
  const envelope = JSON.parse(envelopeTexto) as EnvelopeInventario;
  if (
    envelope.formato !== FORMATO ||
    envelope.versao !== VERSAO ||
    envelope.projeto_id !== projetoId ||
    envelope.inventario_id !== inventarioId ||
    envelope.iteracoes !== ITERACOES
  )
    throw new Error("O inventário remoto possui formato incompatível.");
  const cifrado = bytes(envelope.dados);
  if ((await sha256(cifrado)) !== envelope.conteudo_sha256)
    throw new Error("A integridade do inventário remoto não pôde ser confirmada.");
  let dados: ArrayBuffer;
  try {
    dados = await cryptoApi().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: buf(bytes(envelope.iv)),
        additionalData: buf(
          new TextEncoder().encode(`${FORMATO}:${VERSAO}:${projetoId}:${inventarioId}`),
        ),
      },
      await chave(senha, bytes(envelope.salt), ["decrypt"]),
      buf(cifrado),
    );
  } catch {
    throw new Error("Senha incorreta ou inventário remoto ilegível.");
  }
  const snapshot = JSON.parse(new TextDecoder().decode(dados)) as SnapshotInventario;
  if (
    snapshot.inventario.projeto_id !== projetoId ||
    snapshot.inventario.id !== inventarioId ||
    !Array.isArray(snapshot.itens)
  )
    throw new Error("O snapshot remoto do inventário é inválido.");
  return snapshot;
}
