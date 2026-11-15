import { registrarInscricaoPush, removerInscricaoPush } from "@/lib/push-notifications-r2";

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

async function aguardarComPrazo<T>(promessa: Promise<T>, mensagem: string, prazoMs = 12000): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<T>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error(mensagem)), prazoMs);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

export async function ativarPush(params: {
  projetoId: string;
  cpfHash: string;
  chavePublica: string;
}): Promise<PushSubscriptionJSON> {
  const suporte = verificarSuportePush();
  if (!suporte.suportado) throw new Error(suporte.motivo);
  if (Notification.permission === "denied") {
    throw new Error(
      "As notificações estão bloqueadas neste navegador. Autorize-as nas configurações do site e tente novamente.",
    );
  }
  const permissao = await aguardarComPrazo(
    Notification.requestPermission(),
    "O navegador não respondeu à solicitação de permissão. Verifique as permissões do site e tente novamente.",
  );
  if (permissao !== "granted") throw new Error("A permissão para notificações não foi concedida.");

  const registration = await aguardarComPrazo(
    navigator.serviceWorker.ready,
    "O aplicativo ainda não terminou de preparar as notificações neste dispositivo.",
  );
  let subscription = await aguardarComPrazo(
    registration.pushManager.getSubscription(),
    "O navegador não respondeu ao serviço de notificações.",
  );
  if (!subscription) {
    subscription = await aguardarComPrazo(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(params.chavePublica),
      }),
      "Não foi possível registrar este dispositivo para notificações. Se estiver no iPhone ou iPad, instale o site na tela inicial e abra o aplicativo instalado.",
    );
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
  const registration = await aguardarComPrazo(
    navigator.serviceWorker.ready,
    "O aplicativo ainda não terminou de preparar as notificações neste dispositivo.",
  );
  const subscription = await aguardarComPrazo(
    registration.pushManager.getSubscription(),
    "O navegador não respondeu ao serviço de notificações.",
  );
  if (!subscription) return;
  await removerInscricaoPush({ data: { projetoId, endpoint: subscription.endpoint } });
  await subscription.unsubscribe();
}
