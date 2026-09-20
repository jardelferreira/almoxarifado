/**
 * Fachada de compatibilidade para o antigo serviço de movimentações de equipamentos.
 *
 * A lógica operacional atual vive em `movimentacoes-repo.ts`, que trabalha
 * com `estoque_equipamento_id` e com o estado reconstruído do estoque físico.
 * Este módulo antigo não é mais consumido pelas rotas atuais, mas permanece
 * no projeto para evitar referências quebradas em integrações legadas.
 */
export { movimentacoesEquipamentosRepo } from "./movimentacoes-repo";
