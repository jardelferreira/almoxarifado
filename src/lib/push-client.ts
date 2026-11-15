import { registrarInscricaoPush, removerInscricaoPush } from "@/lib/push-notifications-client";

export type SuportePush = {
  suportado: boolean;
  motivo?: string;
};

function base64UrlToBytes(valor: string): Uint8Array {
  const padding = "=".repeat((4 - (valor.length % 4)) % 4);
  const base64 = valor.replaceAll("-", "+").replaceAll("_", "/") + padding;
  const binario = atob(base64);
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

export function verificarSuportePush(): SuportePush {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { suportado: false, motivo: "Notificações só podem ser ativadas no navegador." };
  }
  if (!window.isSecureContext)
    return { suportado: false, motivo: "Notificações exigem uma conexão HTTPS." };
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return { suportado: false, motivo: "Este navegador não oferece suporte a notificações push." };
  }
  return { suportado: true };
}

export async function ativarPush(params: {
  projetoId: string;
  cpfHash: string;
  chavePublica: string;
}): Promise<PushSubscriptionJSON> {
  const suporte = verificarSuportePush();
  if (!suporte.suportado) throw new Error(suporte.motivo);
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error("A permissão para notificações não foi concedida.");

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(params.chavePublica).buffer as ArrayBuffer,
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys["auth"])
    throw new Error("O navegador não retornou uma inscrição válida.");
  await registrarInscricaoPush({
    data: {
      projetoId: params.projetoId,
      cpfHash: params.cpfHash,
      subscription: {
        endpoint: json.endpoint,
        expirationTime: json.expirationTime ?? null,
        keys: { p256dh: json.keys["p256dh"], auth: json.keys["auth"] },
      },
    },
  });
  return json;
}

export async function desativarPush(projetoId: string): Promise<void> {
  const suporte = verificarSuportePush();
  if (!suporte.suportado) throw new Error(suporte.motivo);
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await removerInscricaoPush({ data: { projetoId, endpoint: subscription.endpoint } });
  await subscription.unsubscribe();
}
