import Dexie, { type Table } from "dexie";
import type {
  Categoria,
  CategoriaEquipamento,
  Empresa,
  Equipe,
  EquipeMembro,
  Funcionario,
  Local,
  Movimentacao,
  Produto,
  Projeto,
  Unidade,
  Arquivo,
  Equipamento,
  EstoqueEquipamento,
  Apropriacao,
  MovimentacaoEquipamento,
  Configuracao,
  Documento,
  DocumentoItem,
  DocumentoReferencia,
  Inventario,
  InventarioItem,
  InteligenciaAcao,
  ManutencaoEquipamento,
  RegraConsumoEquipamento,
  SubstituicaoEquipamento,
  PerfilParametroCusto,
  ConsumoEquipamento,
  ManutencaoDocumento,
  ApropriacaoFinanceiraEquipamento,
  ClienteFaceApi,
} from "@/types";

export class AlmoxarifadoDB extends Dexie {
  projetos!: Table<Projeto, string>;
  categorias!: Table<Categoria, string>;
  categorias_equipamentos!: Table<CategoriaEquipamento, string>;
  unidades!: Table<Unidade, string>;
  empresas!: Table<Empresa, string>;
  funcionarios!: Table<Funcionario, string>;
  locais!: Table<Local, string>;
  produtos!: Table<Produto, string>;
  movimentacoes!: Table<Movimentacao, string>;
  equipes!: Table<Equipe, string>;
  equipe_membros!: Table<EquipeMembro, string>;
  arquivos!: Table<Arquivo, string>;
  equipamentos!: Table<Equipamento, string>;
  estoque_equipamentos!: Table<EstoqueEquipamento, string>;
  apropriacoes!: Table<Apropriacao, string>;
  movimentacoes_equipamentos!: Table<MovimentacaoEquipamento, string>;
  configuracoes!: Table<Configuracao, string>;
  documentos!: Table<Documento, string>;
  documento_itens!: Table<DocumentoItem, string>;
  documento_referencias!: Table<DocumentoReferencia, string>;
  manutencao_documentos!: Table<ManutencaoDocumento, string>;
  apropriacoes_financeiras_equipamentos!: Table<ApropriacaoFinanceiraEquipamento, string>;
  inventarios!: Table<Inventario, string>;
  inventario_itens!: Table<InventarioItem, string>;
  inteligencia_acoes!: Table<InteligenciaAcao, string>;
  consumos_equipamentos!: Table<ConsumoEquipamento, string>;
  manutencoes_equipamentos!: Table<ManutencaoEquipamento, string>;
  regras_consumo_equipamentos!: Table<RegraConsumoEquipamento, string>;
  perfis_parametros_custos!: Table<PerfilParametroCusto, string>;
  substituicoes_equipamentos!: Table<SubstituicaoEquipamento, string>;
  clientes_face_api!: Table<ClienteFaceApi, string>;

  constructor() {
    super("almoxarifado");

    /**
     * Versão ÚNICA do schema.
     *
     * A versão 1 é a base do schema atualmente distribuído.
     * A partir da primeira distribuição, qualquer mudança deve ser registrada
     * em uma nova versão, listando somente as stores ou índices adicionados.
     * Nunca edite uma versão já distribuída.
     *
     * Atenção em ambientes de desenvolvimento: um navegador que já abriu este
     * banco em versões anteriores (Dexie 190, por exemplo) recusa abrir uma
     * versão menor ("VersionError"). Apague o banco "almoxarifado" em
     * DevTools > Application > IndexedDB (exporte um backup antes, se
     * precisar dos dados).
     */
    this.version(1).stores({
      // Projeto e catálogos globais
      projetos:
        "id, codigo, nome, status",
      categorias:
        "id, nome, ativo",
      unidades:
        "id, sigla, ativo",

      // Dados operacionais isolados por projeto
      empresas:
        "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais:
        "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      equipes:
        "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos:
        "id, projeto_id, criado_em, tipo, mime_type",
      configuracoes:
        "id, projeto_id",

      // Materiais
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id, documento_id, documento_item_id",
      inventarios:
        "id, projeto_id, equipe_id, status, data_abertura, data_encerramento, responsavel_id",
      inventario_itens:
        "id, inventario_id, produto_id, equipe_id, quantidade_sistema, quantidade_contada, [inventario_id+produto_id+equipe_id]",
      inteligencia_acoes:
        "id, projeto_id, chave, assinatura, origem, tipo, produto_id, equipe_id, referencia_id, status, registrada_em, [projeto_id+chave]",

      // Documentos
      documentos:
        "id, projeto_id, tipo, numero, serie, empresa_id, status, data_emissao",
      documento_itens:
        "id, documento_id, produto_id",
      documento_referencias:
        "id, projeto_id, documento_id, documento_referenciado_id, [documento_id+documento_referenciado_id]",

      // Equipamentos
      categorias_equipamentos:
        "id, projeto_id, nome, ativo",
      equipamentos:
        "id, projeto_id, categoria_id, nome, tipo_controle, ativo",
      estoque_equipamentos:
        "id, projeto_id, equipamento_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes:
        "id, estoque_equipamento_id, funcionario_id, [estoque_equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
      manutencoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, equipamento_id, status_operacional, status_detalhamento, data_abertura, empresa_id, movimento_sinalizacao_id, movimento_envio_id, movimento_retorno_id, [projeto_id+estoque_equipamento_id], [projeto_id+status_operacional]",
      manutencao_documentos:
        "id, projeto_id, manutencao_id, documento_id, [manutencao_id+documento_id]",
      apropriacoes_financeiras_equipamentos:
        "id, projeto_id, tipo, documento_id, documento_item_id, manutencao_id, estoque_equipamento_id, equipamento_id, criado_em, [documento_id+estoque_equipamento_id]",

      // Consumo e custos de equipamentos
      consumos_equipamentos:
        "id, projeto_id, movimentacao_id, estoque_equipamento_id, equipamento_id, data_apropriacao, criado_em, [movimentacao_id+estoque_equipamento_id]",
      regras_consumo_equipamentos:
        "id, projeto_id, equipamento_id, estoque_equipamento_id, produto_id, direcionador, ativo, vigencia_inicio, vigencia_fim, [projeto_id+equipamento_id], [equipamento_id+estoque_equipamento_id], [equipamento_id+produto_id]",
      perfis_parametros_custos:
        "id, projeto_id, perfil_id, versao, atualizado_em, [projeto_id+perfil_id], [perfil_id+versao]",
    });

    // Alguns bancos locais foram criados antes da inclusão do detalhamento
    // de manutenção. A migração cria a object store sem apagar os demais
    // dados, permitindo que os fluxos de movimentação usem a tabela com
    // segurança.
    this.version(2).stores({
      manutencoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, equipamento_id, status_operacional, status_detalhamento, data_abertura, empresa_id, movimento_sinalizacao_id, movimento_envio_id, movimento_retorno_id, [projeto_id+estoque_equipamento_id], [projeto_id+status_operacional]",
    });

    // Bancos criados pela sequência histórica do projeto podem estar na
    // versão 19. A versão 20 mantém a cadeia de upgrade acima da versão
    // máxima já distribuída e garante a mesma store para esses bancos.
    this.version(20).stores({
      manutencoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, equipamento_id, status_operacional, status_detalhamento, data_abertura, empresa_id, movimento_sinalizacao_id, movimento_envio_id, movimento_retorno_id, [projeto_id+estoque_equipamento_id], [projeto_id+status_operacional]",
    });

    // Relação auditável entre o equipamento devolvido e o seu substituto.
    this.version(21).stores({
      substituicoes_equipamentos:
        "id, projeto_id, estoque_origem_id, equipamento_origem_id, estoque_substituto_id, equipamento_substituto_id, movimentacao_devolucao_id, movimentacao_entrada_id, data",
    });

    // CPF e credencial local dos funcionários. O PIN nunca é armazenado em
    // texto puro; o índice composto permite localizar o CPF dentro do projeto.
    this.version(22).stores({
      funcionarios:
        "id, projeto_id, nome, matricula, cpf, empresa_id, encarregado_id, equipe_raiz_id, status, [projeto_id+cpf]",
    });

    // Reforça a migração das stores do inventário para bancos legados que
    // foram abertos antes da cadeia histórica de versões. A alteração é
    // aditiva: preserva os registros e apenas garante as stores/índices
    // necessários ao módulo colaborativo.
    this.version(23).stores({
      inventarios:
        "id, projeto_id, equipe_id, status, data_abertura, data_encerramento, responsavel_id",
      inventario_itens:
        "id, inventario_id, produto_id, equipe_id, quantidade_sistema, quantidade_contada, [inventario_id+produto_id+equipe_id]",
    });

    /**
     * Repara bancos que chegaram a uma versão recente com uma store ausente.
     *
     * Houve versões históricas em que o número da versão avançou sem que
     * todas as stores fossem declaradas no schema efetivo. Nesses bancos o
     * Dexie expõe a tabela no código, mas o IndexedDB não possui a
     * objectStore correspondente; qualquer transação que a inclua falha com
     * NotFoundError. Esta versão declara o schema completo de forma aditiva,
     * preservando os registros existentes e criando apenas stores/índices que
     * estiverem faltando.
     */
    this.version(24).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      categorias_equipamentos: "id, projeto_id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, cpf, empresa_id, encarregado_id, equipe_raiz_id, status, [projeto_id+cpf]",
      locais: "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos: "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id, documento_id, documento_item_id",
      equipes: "id, projeto_id, nome, ativo",
      equipe_membros: "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
      configuracoes: "id, projeto_id",
      inventarios: "id, projeto_id, equipe_id, status, data_abertura, data_encerramento, responsavel_id",
      inventario_itens:
        "id, inventario_id, produto_id, equipe_id, quantidade_sistema, quantidade_contada, [inventario_id+produto_id+equipe_id]",
      inteligencia_acoes:
        "id, projeto_id, chave, assinatura, origem, tipo, produto_id, equipe_id, referencia_id, status, registrada_em, [projeto_id+chave]",
      documentos: "id, projeto_id, tipo, numero, serie, empresa_id, status, data_emissao",
      documento_itens: "id, documento_id, produto_id",
      documento_referencias:
        "id, projeto_id, documento_id, documento_referenciado_id, [documento_id+documento_referenciado_id]",
      equipamentos: "id, projeto_id, categoria_id, nome, tipo_controle, ativo",
      estoque_equipamentos:
        "id, projeto_id, equipamento_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes: "id, estoque_equipamento_id, funcionario_id, [estoque_equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
      manutencoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, equipamento_id, status_operacional, status_detalhamento, data_abertura, empresa_id, movimento_sinalizacao_id, movimento_envio_id, movimento_retorno_id, [projeto_id+estoque_equipamento_id], [projeto_id+status_operacional]",
      manutencao_documentos:
        "id, projeto_id, manutencao_id, documento_id, [manutencao_id+documento_id]",
      apropriacoes_financeiras_equipamentos:
        "id, projeto_id, tipo, documento_id, documento_item_id, manutencao_id, estoque_equipamento_id, equipamento_id, criado_em, [documento_id+estoque_equipamento_id]",
      consumos_equipamentos:
        "id, projeto_id, movimentacao_id, estoque_equipamento_id, equipamento_id, data_apropriacao, criado_em, [movimentacao_id+estoque_equipamento_id]",
      regras_consumo_equipamentos:
        "id, projeto_id, equipamento_id, estoque_equipamento_id, produto_id, direcionador, ativo, vigencia_inicio, vigencia_fim, [projeto_id+equipamento_id], [equipamento_id+estoque_equipamento_id], [equipamento_id+produto_id]",
      perfis_parametros_custos:
        "id, projeto_id, perfil_id, versao, atualizado_em, [projeto_id+perfil_id], [perfil_id+versao]",
      substituicoes_equipamentos:
        "id, projeto_id, estoque_origem_id, equipamento_origem_id, estoque_substituto_id, equipamento_substituto_id, movimentacao_devolucao_id, movimentacao_entrada_id, data",
    });

    // Alguns bancos locais já haviam sido abertos com uma versão posterior
    // durante testes e ainda assim ficaram sem as stores adicionadas nas
    // migrações anteriores. Esta versão é intencionalmente aditiva e repete
    // as stores críticas para forçar uma nova atualização do IndexedDB.
    this.version(25).stores({
      configuracoes: "id, projeto_id",
      manutencoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, equipamento_id, status_operacional, status_detalhamento, data_abertura, empresa_id, movimento_sinalizacao_id, movimento_envio_id, movimento_retorno_id, [projeto_id+estoque_equipamento_id], [projeto_id+status_operacional]",
      substituicoes_equipamentos:
        "id, projeto_id, estoque_origem_id, equipamento_origem_id, estoque_substituto_id, equipamento_substituto_id, movimentacao_devolucao_id, movimentacao_entrada_id, data",
    });

    this.version(26).stores({
      clientes_face_api: "id, projeto_id, client_id, ativo, [projeto_id+ativo]",
    });
  }
}

let dbInstance: AlmoxarifadoDB | null = null;

export function uid(): string {
  return crypto.randomUUID();
}

export function getDB() {
  if (!dbInstance) {
    dbInstance = new AlmoxarifadoDB();
  }

  return dbInstance;
}
