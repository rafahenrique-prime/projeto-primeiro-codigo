// PRIME Bridge — Registry de ferramentas do Tool Router, Fase 3, Etapa 3.4
// (revisão pontual — injeção de dependências no registry)
//
// createToolRegistry(deps) monta um array congelado de ToolDefinition, com
// toda dependência de rede sempre injetada explicitamente — nenhuma
// descoberta automática de arquivo, nenhuma mutação em runtime, nenhuma
// leitura de env/segredo aqui, nenhum fetch global usado diretamente. Cada
// chamada devolve um array novo e congelado; não existe estado global
// mutável/configurável — chamar createToolRegistry() duas vezes com deps
// diferentes nunca faz uma influenciar a outra (testado em
// __tests__/consultarProduto.test.js).
//
// Quando o server.mjs (numa etapa futura, separadamente aprovada) precisar
// da ferramenta real, basta chamar:
//   createToolRegistry({ requestToolApi: clienteHttpReal })
// Nenhuma refatoração deste arquivo é necessária para isso.

import { createConsultarProdutoTool } from './consultarProduto.js'

/**
 * @param {{ requestToolApi?: Function }} deps
 * @returns {ReadonlyArray} array congelado de ToolDefinition
 */
export function createToolRegistry(deps = {}) {
  const { requestToolApi } = deps

  return Object.freeze([
    createConsultarProdutoTool({ requestToolApi }),
  ])
}

// Registry padrão, sem nenhuma dependência real injetada — comportamento
// seguro (tool_not_configured) até que um chamador explícito passe
// requestToolApi via createToolRegistry(). Não é um singleton mutável: cada
// chamada aqui delega a uma nova chamada de createToolRegistry(), sem
// nenhuma dependência.
export function getRegisteredTools() {
  return createToolRegistry()
}
