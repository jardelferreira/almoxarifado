import { getDB } from "@/db/db";
import type {
  Configuracao,
  ConfiguracaoDocumentos,
  ConfiguracaoEstoque,
  ConfiguracaoInventario,
  ConfiguracaoModulos,
  ConfiguracaoSeguranca,
} from "@/types";
import { criarConfiguracaoPadrao } from "@/types/configuracao";

const mesclarConfiguracao = (
  existente: Partial<Configuracao>,
  padrao: Configuracao,
): Configuracao => ({
  ...padrao,
  ...existente,
  modulos: {
    ...padrao.modulos,
    ...(existente.modulos ?? {}),
  } as ConfiguracaoModulos,
  documentos: {
    ...padrao.documentos,
    ...(existente.documentos ?? {}),
  } as ConfiguracaoDocumentos,
  estoque: {
    ...padrao.estoque,
    ...(existente.estoque ?? {}),
  } as ConfiguracaoEstoque,
  inventario: {
    ...padrao.inventario,
    ...(existente.inventario ?? {}),
  } as ConfiguracaoInventario,
  seguranca: {
    ...padrao.seguranca,
    ...(existente.seguranca ?? {}),
  } as ConfiguracaoSeguranca,
});

export const configuracoesRepo = {
  async obter(projetoId: string): Promise<Configuracao> {
    const db = getDB();
    let existente: Configuracao | undefined;
    try {
      existente = await db.configuracoes.where("projeto_id").equals(projetoId).first();
    } catch (error) {
      // Bancos legados podem chegar com a tabela de configurações ausente.
      // A validação de transações é opcional; nesse cenário, usar o padrão
      // desativado permite que as operações locais continuem funcionando até
      // a migração do IndexedDB ser concluída.
      if (!(error instanceof DOMException) && !(error instanceof Error && error.name === "NotFoundError")) {
        throw error;
      }
      return criarConfiguracaoPadrao(projetoId);
    }
    if (existente) {
      return mesclarConfiguracao(
        existente,
        criarConfiguracaoPadrao(projetoId, existente.criado_em),
      );
    }

    return criarConfiguracaoPadrao(projetoId);
  },

  async inicializar(projetoId: string): Promise<Configuracao> {
    const db = getDB();
    const existente = await db.configuracoes.where("projeto_id").equals(projetoId).first();

    if (existente) {
      const normalizada = mesclarConfiguracao(
        existente,
        criarConfiguracaoPadrao(projetoId, existente.criado_em),
      );

      const precisaAtualizar = JSON.stringify(normalizada) !== JSON.stringify(existente);

      if (precisaAtualizar) {
        await db.configuracoes.put(normalizada);
      }

      return normalizada;
    }

    const nova = criarConfiguracaoPadrao(projetoId);
    await db.configuracoes.put(nova);
    return nova;
  },

  async salvar(
    projetoId: string,
    dados: Omit<Configuracao, "id" | "projeto_id" | "criado_em" | "atualizado_em">,
  ): Promise<Configuracao> {
    const atual = await this.obter(projetoId);
    const nova: Configuracao = {
      ...atual,
      ...dados,
      id: atual.id,
      projeto_id: projetoId,
      criado_em: atual.criado_em,
      atualizado_em: new Date().toISOString(),
    };

    await getDB().configuracoes.put(nova);
    return nova;
  },
};
