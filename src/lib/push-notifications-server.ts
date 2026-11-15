import {
  buildPushPayload,
  type PushSubscription as WebPushSubscription,
} from "@block65/webcrypto-web-push";
import { env } from "cloudflare:workers";
import type {
  IndiceInscricoesPush,
  PushNotificationPayload,
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

async function ler(projetoId: string): Promise<{
  indice: IndiceInscricoesPush;
  etag: string | null;
}> {
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

export async function notificarInscricoesPush(
  projetoId: string,
  payloadData: PushNotificationPayload,
  cpfHashes?: string[],
): Promise<{
  configurado: boolean;
  selecionadas: number;
  enviadas: number;
  falhas: number;
  removidas: number;
}> {
  if (!pushEnv.VAPID_PUBLIC_KEY || !pushEnv.VAPID_PRIVATE_KEY || !pushEnv.VAPID_SUBJECT) {
    return { configurado: false, selecionadas: 0, enviadas: 0, falhas: 0, removidas: 0 };
  }
  const { indice } = await ler(projetoId);
  const permitidos = cpfHashes ? new Set(cpfHashes) : null;
  const selecionados = indice.registros.filter(
    (registro) => !permitidos || permitidos.has(registro.cpf_hash),
  );
  const payload = { data: payloadData, options: { ttl: 300, urgency: "normal" as const } };
  const removidos = new Set<string>();
  let enviadas = 0;
  let falhas = 0;
  for (const registro of selecionados) {
    const subscription: WebPushSubscription = registro.subscription;
    try {
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
      else falhas += 1;
    } catch {
      falhas += 1;
    }
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
    falhas,
    removidas: removidos.size,
  };
}
