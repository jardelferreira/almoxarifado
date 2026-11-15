import {
  buildPushPayload,
  type PushSubscription as WebPushSubscription,
} from "@block65/webcrypto-web-push";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { autorizarProjetoNuvem } from "@/lib/projeto-auth-r2";
import type {
  IndiceInscricoesPush,
  PushNotificationPayload,
  PushSubscriptionInput,
  RegistroInscricaoPush,
} from "@/types";

const PREFIXO = "push-subscriptions";
const FORMATO = "ALMOXARIFADO_PUSH_SUBSCRIPTIONS" as const;
const VERSAO = 1 as const;
const MAX_REGISTROS = 5000;

type PushEnv = {
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

const pushEnv = env as typeof env & PushEnv;

function validarProjetoId(projetoId: string): string {
  const valor = projetoId.trim();
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(valor)) throw new Error("Identificador de projeto inválido.");
  return valor;
}

function validarCpfHash(cpfHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(cpfHash)) throw new Error("Identificador de funcionário inválido.");
  return cpfHash;
}

function validarSubscription(subscription: PushSubscriptionInput): PushSubscriptionInput {
  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    subscription.endpoint.length > 2048 ||
    typeof subscription.keys?.p256dh !== "string" ||
    typeof subscription.keys?.auth !== "string" ||
    subscription.keys.p256dh.length < 20 ||
    subscription.keys.auth.length < 10
  ) {
    throw new Error("A inscrição de notificações é inválida.");
  }
  return {
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expirationTime === "number" ? subscription.expirationTime : null,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  };
}

function chave(projetoId: string): string {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}.json`;
}

function vazio(projetoId: string): IndiceInscricoesPush {
  return {
    formato: FORMATO,
    versao: VERSAO,
    projeto_id: projetoId,
    atualizado_em: new Date().toISOString(),
    registros: [],
  };
}

async function ler(
  projetoId: string,
): Promise<{ indice: IndiceInscricoesPush; etag: string | null }> {
  const objeto = await env.ALMOXARIFADO_BUCKET.get(chave(projetoId));
  if (!objeto) return { indice: vazio(projetoId), etag: null };
  const valor = (await objeto.json()) as Partial<IndiceInscricoesPush>;
  if (
    valor.formato !== FORMATO ||
    valor.versao !== VERSAO ||
    valor.projeto_id !== projetoId ||
    !Array.isArray(valor.registros)
  ) {
    throw new Error("O cadastro remoto de notificações está inválido.");
  }
  return {
    indice: { ...valor, registros: valor.registros } as IndiceInscricoesPush,
    etag: objeto.httpEtag,
  };
}

async function salvarComConflito(
  projetoId: string,
  alterar: (registros: RegistroInscricaoPush[]) => RegistroInscricaoPush[],
): Promise<void> {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const atual = await ler(projetoId);
    const registros = alterar(atual.indice.registros).slice(-MAX_REGISTROS);
    const novo: IndiceInscricoesPush = {
      ...atual.indice,
      atualizado_em: new Date().toISOString(),
      registros,
    };
    const salvo = await env.ALMOXARIFADO_BUCKET.put(chave(projetoId), JSON.stringify(novo), {
      ...(atual.etag
        ? { onlyIf: { etagMatches: atual.etag } }
        : { onlyIf: { etagDoesNotMatch: "*" } }),
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    });
    if (salvo) return;
  }
  throw new Error(
    "CONFLITO_NOTIFICACOES: outro dispositivo atualizou as inscrições. Tente novamente.",
  );
}

export const consultarConfiguracaoPush = createServerFn({ method: "GET" }).handler(async () => ({
  configurado: Boolean(
    pushEnv.VAPID_PUBLIC_KEY && pushEnv.VAPID_PRIVATE_KEY && pushEnv.VAPID_SUBJECT,
  ),
  chavePublica: pushEnv.VAPID_PUBLIC_KEY ?? null,
}));

export const registrarInscricaoPush = createServerFn({ method: "POST" })
  .validator(
    (data: { projetoId: string; cpfHash: string; subscription: PushSubscriptionInput }) => ({
      projetoId: validarProjetoId(data.projetoId),
      cpfHash: validarCpfHash(data.cpfHash),
      subscription: validarSubscription(data.subscription),
    }),
  )
  .handler(async ({ data }) => {
    const agora = new Date().toISOString();
    const registro: RegistroInscricaoPush = {
      id: crypto.randomUUID(),
      projeto_id: data.projetoId,
      cpf_hash: data.cpfHash,
      subscription: data.subscription,
      user_agent: "server-registration",
      criado_em: agora,
      atualizado_em: agora,
    };
    await salvarComConflito(data.projetoId, (registros) => [
      ...registros.filter((item) => item.subscription.endpoint !== data.subscription.endpoint),
      registro,
    ]);
    return { registrado: true };
  });

export const removerInscricaoPush = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; endpoint: string }) => {
    const projetoId = validarProjetoId(data.projetoId);
    if (typeof data.endpoint !== "string" || !data.endpoint.startsWith("https://"))
      throw new Error("Inscrição inválida.");
    return { projetoId, endpoint: data.endpoint };
  })
  .handler(async ({ data }) => {
    await salvarComConflito(data.projetoId, (registros) =>
      registros.filter((item) => item.subscription.endpoint !== data.endpoint),
    );
    return { removido: true };
  });

export async function notificarInscricoesPush(
  projetoId: string,
  payloadData: PushNotificationPayload,
  cpfHashes?: string[],
): Promise<{ configurado: boolean; selecionadas: number; enviadas: number; removidas: number }> {
  if (!pushEnv.VAPID_PUBLIC_KEY || !pushEnv.VAPID_PRIVATE_KEY || !pushEnv.VAPID_SUBJECT) {
    return { configurado: false, selecionadas: 0, enviadas: 0, removidas: 0 };
  }
  const { indice } = await ler(projetoId);
  const permitidos = cpfHashes ? new Set(cpfHashes) : null;
  const selecionados = indice.registros.filter(
    (registro) => !permitidos || permitidos.has(registro.cpf_hash),
  );
  const payload = { data: payloadData, options: { ttl: 300, urgency: "normal" as const } };
  const removidos = new Set<string>();
  let enviadas = 0;
  for (const registro of selecionados) {
    const subscription: WebPushSubscription = registro.subscription;
    const resposta = await fetch(
      subscription.endpoint,
      await buildPushPayload(payload, subscription, {
        subject: pushEnv.VAPID_SUBJECT,
        publicKey: pushEnv.VAPID_PUBLIC_KEY,
        privateKey: pushEnv.VAPID_PRIVATE_KEY,
      }),
    );
    if (resposta.status === 404 || resposta.status === 410) removidos.add(subscription.endpoint);
    else if (resposta.ok) enviadas += 1;
  }
  if (removidos.size > 0) {
    await salvarComConflito(projetoId, (registros) =>
      registros.filter((item) => !removidos.has(item.subscription.endpoint)),
    );
  }
  return {
    configurado: true,
    selecionadas: selecionados.length,
    enviadas,
    removidas: removidos.size,
  };
}

export const enviarNotificacaoPush = createServerFn({ method: "POST" })
  .validator(
    (data: {
      projetoId: string;
      senha: string;
      cpfHash?: string;
      payload: PushNotificationPayload;
    }) => {
      const projetoId = validarProjetoId(data.projetoId);
      if (typeof data.senha !== "string" || data.senha.length < 16)
        throw new Error("Informe a senha de sincronização do projeto.");
      if (data.cpfHash !== undefined) validarCpfHash(data.cpfHash);
      if (
        !data.payload ||
        typeof data.payload.titulo !== "string" ||
        typeof data.payload.corpo !== "string"
      )
        throw new Error("Mensagem inválida.");
      if (data.payload.titulo.length > 80 || data.payload.corpo.length > 240)
        throw new Error("A mensagem excede o limite permitido.");
      return { ...data, projetoId };
    },
  )
  .handler(async ({ data }) => {
    await autorizarProjetoNuvem(data.projetoId, data.senha);
    const resultado = await notificarInscricoesPush(
      data.projetoId,
      data.payload,
      data.cpfHash ? [data.cpfHash] : undefined,
    );
    if (!resultado.configurado) {
      throw new Error(
        "Push não configurado no Worker. Cadastre os segredos VAPID antes de enviar notificações.",
      );
    }
    return resultado;
  });
