import { getDB, uid } from "@/db/db";
import type { ClienteFaceApi } from "@/types";

export const clienteFaceApiRepo = {
  async obter(projetoId: string): Promise<ClienteFaceApi | undefined> {
    return getDB().clientes_face_api.where("projeto_id").equals(projetoId).first();
  },

  async salvar(
    projetoId: string,
    dados: Omit<ClienteFaceApi, "id" | "projeto_id" | "criado_em" | "atualizado_em">,
  ): Promise<ClienteFaceApi> {
    const atual = await this.obter(projetoId);
    const agora = new Date().toISOString();
    const cliente: ClienteFaceApi = {
      ...dados,
      id: atual?.id ?? uid(),
      projeto_id: projetoId,
      criado_em: atual?.criado_em ?? agora,
      atualizado_em: agora,
    };
    await getDB().transaction("rw", getDB().clientes_face_api, async () => {
      if (atual?.id) await getDB().clientes_face_api.where("projeto_id").equals(projetoId).delete();
      await getDB().clientes_face_api.put(cliente);
    });
    return cliente;
  },

  async limpar(projetoId: string): Promise<void> {
    await getDB().clientes_face_api.where("projeto_id").equals(projetoId).delete();
  },
};
