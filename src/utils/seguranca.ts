const ITERACOES_PIN = 120_000;

function bytesParaBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function base64ParaBytes(valor: string): Uint8Array {
  const binario = atob(valor);
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

export function normalizarCpf(valor?: string | null): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos || null;
}

export function formatarCpf(valor?: string | null): string {
  const digitos = String(valor ?? "").replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 3) return digitos;
  if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
  if (digitos.length <= 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

export function validarCpf(valor?: string | null): boolean {
  const cpf = normalizarCpf(valor);
  if (!cpf) return true;
  if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false;

  const calcularDigito = (limite: number) => {
    let soma = 0;
    for (let indice = 0; indice < limite; indice += 1) {
      soma += Number(cpf[indice]) * (limite + 1 - indice);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}

export function validarPin(valor: string): boolean {
  return /^\d{4,8}$/.test(valor);
}

export type PinHash = {
  pin_hash: string;
  pin_salt: string;
  pin_iteracoes: number;
};

export async function criarHashPin(pin: string): Promise<PinHash> {
  if (!validarPin(pin)) throw new Error("O PIN deve conter de 4 a 8 números.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERACOES_PIN, hash: "SHA-256" }, chave, 256);

  return {
    pin_hash: bytesParaBase64(new Uint8Array(bits)),
    pin_salt: bytesParaBase64(salt),
    pin_iteracoes: ITERACOES_PIN,
  };
}

export async function verificarPin(pin: string, registro: PinHash): Promise<boolean> {
  if (!validarPin(pin)) return false;

  const salt = base64ParaBytes(registro.pin_salt);
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new Uint8Array(salt) as unknown as BufferSource, iterations: registro.pin_iteracoes, hash: "SHA-256" }, chave, 256);
  return bytesParaBase64(new Uint8Array(bits)) === registro.pin_hash;
}
