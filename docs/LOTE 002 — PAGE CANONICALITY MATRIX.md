# LOTE 002 — PAGE CANONICALITY MATRIX

**Pacote:** LOTE 002 — Pacote A — Classificação e Governança Documental
**Base:** `main` em `6f64a6796ae34a9226c1187aab96d6ed142e6462`
**Método:** leitura estática de `src/App.jsx`, `src/components/LeftNav.jsx`, imports e documentos de investigação.
**Estado:** nenhuma página, rota, componente ou menu foi alterado.

> Esta matriz documenta acessibilidade estrutural e gerações aparentes. `CANÔNICA CONFIRMADA` não é usada quando o repositório não contém decisão explícita de produto. Código importado ou rota alcançável não prova uso produtivo ou preferência do usuário.

## 1. Legenda

| Classificação | Uso neste documento |
|---|---|
| `CANÔNICA CONFIRMADA` | Há decisão explícita ou fonte de verdade externa que escolhe a página. Não encontrada para os pares principais. |
| `CANÔNICA APARENTE` | É a página mais exposta pela navegação/rota observada, sem decisão externa suficiente. |
| `GERAÇÃO ANTERIOR` | Implementação distinta que aparenta preceder outra, sem autorização para aposentação. |
| `ALIAS` | Rota ou nome diferente que monta uma implementação já usada em outro contexto. |
| `PARALELA` | Implementação coexistente com outra para o mesmo domínio ou objetivo aparente. |
| `CONSUMIDOR NÃO IDENTIFICADO` | A busca estática não encontrou consumidor suficiente; isso não prova ausência externa/dinâmica. |
| `NÃO CONFIRMADO` | O snapshot não permite concluir canonicidade, runtime ou decisão de produto. |

## 2. Matriz principal

| Página | Rota em `App.jsx` | Importações/consumidores estruturais | Menu/navegação | Geração aparente | Estado comprovado | Canônica? | V1/V2 | Recomendação | Confiança |
|---|---|---|---|---|---|---|---|---|---:|
| `DashboardNewPage.jsx` | `dashboard` | Importada e montada diretamente em `App.jsx`; `LeftNav` expõe botão Dashboard. | Exposta no menu principal. | Nova/atual aparente. | Código e rota confirmados; runtime externo não confirmado. | `CANÔNICA APARENTE`; não confirmada. | V1 atual aparente, possível direção V2. | Comparar KPIs, ações e consumidores com `DashboardPage` antes de qualquer escolha. | 97% |
| `DashboardPage.jsx` | `reports` | Importada e montada diretamente em `App.jsx` sob rota com nome `reports`. | Rota não exposta como Dashboard principal; pode ser alcançada por navegação programática ou referência externa. | Anterior/alternativa aparente. | Código, import e rota confirmados. | `GERAÇÃO ANTERIOR` / `PARALELA`; não confirmada como substituída. | V1 histórico ou alternativa; não inferir V2. | Confirmar owner, métricas e uso real. Não remover por diferença de nome de rota. | 96% |
| `ContactsNewPage.jsx` | `contacts-new` | Importada e montada diretamente em `App.jsx`; `LeftNav` inclui `contacts-new` em Inteligência. | Exposta no menu. | Nova/experimental aparente. | Código, rota e exposição de menu confirmados; runtime externo não confirmado. | `CANÔNICA APARENTE`; não confirmada. | V2/preview aparente, sem decisão de cutover. | Comparar contratos e comportamento com `ContactsPage`; obter decisão de produto. | 99% |
| `ContactsPage.jsx` | `contacts` | Importada e montada diretamente em `App.jsx`; aceita conversas e navegação. | Não aparece no conjunto principal observado de `LeftNav`; pode ser alcançada por estado, link ou consumidor externo. | Anterior/alternativa aparente. | Código, rota e import confirmados; acessibilidade pelo menu não confirmada. | `GERAÇÃO ANTERIOR` / `PARALELA`; não confirmada como aposentada. | V1 histórico/alternativo. | Não excluir; levantar consumidores e decidir canonicidade de Contacts externamente. | 98% |
| `RelatoriosPage.jsx` | `relatorios` | Importada e montada em `App.jsx`. | Exposta no menu de usuário/avatar, não no bloco principal. | Página de relatórios dedicada. | Código, rota e navegação secundária confirmados. | `CANÔNICA APARENTE` somente para relatórios dedicados; não equivale automaticamente a `DashboardPage`. | Atual aparente. | Separar semanticamente relatórios de dashboard antes de consolidar. | 96% |
| `IntelligenceOpsPage.jsx` | `intelligence-ops` e `bagy-audit` | Mesmo componente montado em duas rotas; `bagy-audit` recebe `initialTab="bagy"`. | `intelligence-ops` em item de Inteligência; `bagy-audit` em submenu Análises de IA. | Reuso legítimo com aliases de contexto. | Reuso e duas entradas confirmados. | `ALIAS`/`CANÔNICA APARENTE` por domínio, sem decisão externa. | Atual aparente. | Documentar contrato de abas e manter o reuso; não tratar duas rotas como duas implementações. | 99% |
| `CatalogPage.jsx` | `catalogo` | Importada em `App.jsx`; recebe navegação e produto inicial. | Exposta no espaço de trabalho. | Catálogo formal. | Código, rota, navegação e integração estrutural confirmados. | `CANÔNICA APARENTE` para catálogo oficial; runtime externo não confirmado. | V1 atual aparente. | Manter separada de rascunho até política de publicação. | 97% |
| `DraftCatalogPage.jsx` | `catalogo-rascunho` | Importada e montada em `App.jsx`. | Exposta em Ferramentas/workItems. | Rascunho/preview. | Código, rota e menu confirmados; finalidade de revisão também documentada. | `PARALELA`/`PREVIEW`, não canônica para catálogo oficial. | Preview/V2. | Manter como área de revisão; não confundir com fonte oficial do catálogo. | 98% |
| `CobrancasPage.jsx` | `cobrancas` | Importada e montada em `App.jsx`. | Exposta no espaço de trabalho. | Integração comercial atual aparente. | Código e navegação confirmados; runtime Base44/Lyra não confirmado. | `CANÔNICA APARENTE` apenas como entrada do painel; arquitetura/cutover não confirmados. | V1/V2 não resolvido. | Requer decisão arquitetural externa; não decidir cutover neste pacote. | 94% |
| `ImportCatalogPage.jsx` | `importar` | Importada e montada em `App.jsx`. | Exposta em Ferramentas. | Fluxo de importação atual aparente. | Código, rota e menu confirmados. | `CANÔNICA APARENTE` para importação interativa, sem prova de runtime. | V1 atual aparente. | Comparar com `ImportReviewPage` e scripts de raiz antes de consolidar. | 96% |
| `ImportReviewPage.jsx` | `importar-backup` | Importada e montada em `App.jsx`. | Exposta em Ferramentas/Importar Backup. | Revisão de backup/importação. | Código, rota e menu confirmados. | `PARALELA`/`HISTÓRICO` de revisão; não substituir sem mapear dados. | Preview/histórico. | Relacionar a snapshots e definir fonte de verdade de dados. | 94% |
| `PhotoRecognitionPage.jsx` | `photo` | Importada e montada em `App.jsx`. | Exposta em Análises de IA. | Fluxo de reconhecimento de foto. | Código, rota e menu confirmados; integração produtiva não confirmada. | `CANÔNICA APARENTE` no menu de fotos, não confirmação de runtime. | V1/V2 não resolvido. | Confrontar com `ImageExtractorPage`, `aws-backend-example.js` e `photoFlowService`. | 93% |
| `ImageExtractorPage.jsx` | `image-extractor` | Importada e montada em `App.jsx`. | Rota não identificada no bloco principal de menu observado. | Alternativa/ferramenta paralela. | Código e rota confirmados; consumidor de menu não confirmado. | `PARALELA` / `CONSUMIDOR NÃO IDENTIFICADO`. | Experimental/V2 aparente. | Confirmar uso e relação com `PhotoRecognitionPage` antes de reorganizar. | 91% |
| `ExtractorPage.jsx` | `extrator` | Importada e montada em `App.jsx`. | Exposta em Ferramentas conforme submenu de ferramentas. | Ferramenta de extração. | Código, rota e menu confirmados. | `PARALELA` a `ImageExtractorPage` em sentido amplo; equivalência funcional não confirmada. | V1/V2 não resolvido. | Comparar entradas, saídas e owners; não consolidar por semelhança nominal. | 90% |
| `AgentLabPage.jsx` | `lab` | Importada e montada em `App.jsx`. | Exposta em Análises de IA. | Laboratório. | Código, rota e menu confirmados. | Não canônica para produção; `LAB` confirmado por navegação/nome. | Experimental/V2. | Manter isolada e marcar resultados como não produtivos até validação. | 99% |
| `FollowUpPage.jsx` | `followup` | Importada e montada em `App.jsx`; recebe conversas. | Exposta no menu principal. | Operacional atual aparente. | Código, rota e menu confirmados. | `CANÔNICA APARENTE`; runtime externo não confirmado. | V1 atual aparente. | Manter; revisar consumidores e contratos em etapa funcional própria se necessário. | 97% |
| `OperationsCenterPage.jsx` | `ops-center` | Importada e montada em `App.jsx`. | Exposta no menu principal. | Centro operacional. | Código, rota e menu confirmados. | `CANÔNICA APARENTE`; não prova produção. | V1 atual aparente. | Separar claramente operações de diagnóstico e tools administrativas. | 97% |
| `KnowledgePage.jsx` | `knowledge` | Importada e montada em `App.jsx`. | Exposta em Inteligência. | Conhecimento/base de agentes. | Código, rota e menu confirmados. | `CANÔNICA APARENTE`; runtime não confirmado. | V1 atual aparente. | Confirmar fonte de verdade e owners de conteúdo. | 96% |
| `AgentsPage.jsx` | `agents` | Importada e montada em `App.jsx`. | Exposta no espaço de trabalho. | Gestão de agentes. | Código, rota e menu confirmados. | `CANÔNICA APARENTE`; não prova estado GPT Maker. | V1 atual aparente. | Relacionar com documentação de agentes e separar painel de configuração externa. | 96% |

## 3. Observações de canonicidade

1. `DashboardNewPage` e `ContactsNewPage` são expostas no menu e, por isso, têm **canonicidade aparente**, mas o repositório não contém uma decisão externa que as declare definitivas.
2. `ContactsPage` continua importada e roteada, embora não apareça no conjunto principal de itens do `LeftNav` observado. Isso é evidência de coexistência, não de código morto.
3. `DashboardPage` é montada sob `reports`, enquanto `RelatoriosPage` possui a rota `relatorios`. A sobreposição semântica exige decisão de produto; não se deve inferir substituição pelo nome.
4. `IntelligenceOpsPage` montada em duas rotas é um caso de reuso/alias, não uma duplicidade de implementação.
5. A acessibilidade do menu é apenas um indicador estrutural. Não prova tráfego, deploy, preferência do usuário ou runtime externo.

## 4. Decisões que permanecem externas

A canonicidade definitiva de Dashboard, Contacts, Reports/Relatórios, Catalog, Photo e Cobrancas permanece `NÃO CONFIRMADO` quando não houver decisão de produto ou telemetria. O Pacote A não altera rotas, imports, menu, componentes ou nomenclatura.

## Referências

[1]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/src/App.jsx "Roteamento principal"
[2]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/src/components/LeftNav.jsx "Menu principal"
[3]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/tree/main/src/pages "Páginas do frontend"

## Encerramento

**Matriz criada para governança; nenhuma decisão de canonicidade foi aplicada ao código.**
