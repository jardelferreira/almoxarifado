export type PushSubscriptionInput = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type RegistroInscricaoPush = {
  id: string;
  projeto_id: string;
  cpf_hash: string;
  subscription: PushSubscriptionInput;
  user_agent: string;
  criado_em: string;
  atualizado_em: string;
};

export type IndiceInscricoesPush = {
  formato: "ALMOXARIFADO_PUSH_SUBSCRIPTIONS";
  versao: 1;
  projeto_id: string;
  atualizado_em: string;
  registros: RegistroInscricaoPush[];
};

export type PushNotificationPayload = {
  titulo: string;
  corpo: string;
  url?: string;
  tag?: string;
};
