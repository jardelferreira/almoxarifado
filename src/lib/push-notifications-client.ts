import { createServerFn } from "@tanstack/react-start";
import type {
  PushNotificationPayload,
  PushSubscriptionInput,
} from "@/types";

/**
 * Client-safe facade for push operations.
 *
 * The implementation that accesses R2, VAPID secrets and cloudflare:workers
 * stays behind the server function boundary and is never bundled for the browser.
 */
export const consultarConfiguracaoPush = createServerFn({ method: "GET" }).handler(async () => {
  const { consultarConfiguracaoPush: consultarNoWorker } = await import(
    "@/lib/push-notifications-r2"
  );
  return consultarNoWorker();
});

export const registrarInscricaoPush = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; cpfHash: string; subscription: PushSubscriptionInput }) => data)
  .handler(async ({ data }) => {
    const { registrarInscricaoPush: registrarNoWorker } = await import(
      "@/lib/push-notifications-r2"
    );
    return registrarNoWorker({ data });
  });

export const removerInscricaoPush = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; endpoint: string }) => data)
  .handler(async ({ data }) => {
    const { removerInscricaoPush: removerNoWorker } = await import(
      "@/lib/push-notifications-r2"
    );
    return removerNoWorker({ data });
  });

export const enviarNotificacaoPush = createServerFn({ method: "POST" })
  .validator(
    (data: {
      projetoId: string;
      senha: string;
      cpfHash?: string;
      payload: PushNotificationPayload;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { enviarNotificacaoPush: enviarNoWorker } = await import(
      "@/lib/push-notifications-r2"
    );
    return enviarNoWorker({ data });
  });
