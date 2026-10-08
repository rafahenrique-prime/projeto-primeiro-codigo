# PRIME CONTROL V1.4I — Mapa de roteamento de cenários (GABY LAB)

**Data:** 08/10/2026. **Ambiente:** `render-lab` apenas. **Natureza:** matriz determinística **sintética**, não ferramenta comercial ativa.

## Por que esta etapa é necessária
Na V1.4H, o caso **histórico** do Story Vans passou do resolvedor GPTMaker para um JSON de formato compatível com `Buscar Produtos`. Isso **não autoriza** a aplicar aquele resultado a novos Stories ou conversas comuns. A Action GPTMaker atual `Buscar Produtos` aponta à Supabase `gaby-lab-shadow-context-v1`, que também grava contexto comercial; a V1.4I não altera, não chama e não substitui essa Action.

## Contrato da nova matriz
`api/_primeControlStoryScenarioRouterV14i.js` exporta `routeStoryScenarioV14i(input,nowMs)` e `runScenarioMatrixV14i()`. A função é **pura**: não acessa GPTMaker, Supabase, Vercel, Render, catálogo ou OpenRouter; não envia mensagens. Os dados `context` e `evidence` devem ser previamente verificados por serviços confiáveis em etapa FUTURA. Nunca aceitar `verified` simplesmente fornecido por um cliente ou prompt.

Entradas principais:
- `scope=GABY_LAB_COMERCIAL` e `context.source=GPTMAKER_MESSAGES_READ_ONLY` + `agent_verified=true`, `chat_allowlisted=true`.
- contexto temporal fresco (idade máxima configurada de 5 minutos) e evidência visual vinculada ao **mesmo fingerprint de mídia**; não aceitar prova velha para Story diferente.
- `context.status` diferencia `FOUND` com `INSTAGRAM_STORY`, `USER_IMAGE_FOUND` com `USER_UPLOADED_IMAGE` e `NO_VALID_STORY_ON_LATEST_USER` comprovadamente `NONE`; falha de resolver, ausência de fonte verificada e estado ambíguo resultam em BLOQUEIO.
- `history` sinaliza print já solicitado/recebido para impedir pergunta repetida.
- Identidade comercial só está verificada com **catalog.exact_sku_verified**, token de identificação verificada da fonte confiável para a mídia, Visual Match forte >=0.95 e JEV `ALLOW_AUTO` na mesma evidência. A autoconfiança do Gemini é indicativa, não percentual probabilístico calibrado. Preço/estoque exigem validação independente; PIX não é mostrado automaticamente.

Decisões:
| Situação | Rota sugerida | Segurança |
|---|---|---|
| Conversa normal comprovada | KEEP_NATIVE_SEARCH | Preserva `Buscar Produtos` atual; não a invoca neste preview |
| Story com modelo não confirmado, sem print pedido | REQUEST_STORY_PRINT | Reaproveita training nativo já cadastrado |
| Print já solicitado / enviado | ASK_ONE_DETAIL | Não repetir pedido de print; pergunta única de desambiguação |
| Cliente enviou nova imagem ainda não analisada | ANALYZE_UPLOADED_IMAGE | Etapa pendente; o preview não executa Gemini |
| Story/imagem com SKU efetivamente confirmado por gates independentes | VERIFIED_PRODUCT | Sem extrapolar preço ou estoque, sem PIX automático |
| Story velho/novo, mídia não correlacionada, falha técnica, outro agente, contexto ambíguo | BLOCK | Não presumir conversa comum nem reutilizar produto antigo |

A matriz inclui **14 cenários sintéticos**, sem dados reais de cliente e sem repetir a análise Gemini/JEV/Vans. O endpoint opcional `POST /api/prime-control-story-routing-preview-v14i` é um teste privado de matriz, não é Action GPTMaker, exige segredo LAB, `PRIME_CONTROL_STORY_ROUTING_V14I_ENABLED=true` (default OFF) e confirmação específica. O campo `sends_messages` é sempre `false`; `writes` sempre `false`.

## Critério para conectar à GABY LAB no futuro
1. Integrar **resolver read-only** com identidade do agente/chat, mídia e mensagem mais recente comprovadas, não apenas fingerprint histórico.
2. Criar contrato real de `screenshot` + histórico de print já pedido, sem nova foto exigida desnecessariamente.
3. Aprovar caminho seguro e rollback para **chats sem Story**; a Action atual deve continuar funcionando e preservando o contexto comercial.
4. Executar testes de conversas QA nativas, registrar latência/custo e **somente depois** alterar a URL da Action da GABY LAB, com autorização de integração e isolamento verificável.
5. Não habilitar na GABY OFICIAL, não gravar produto de fornecedor como PRIME e não usar a prévia como indicação de venda.

**Nota de precisão:** A V1.4I homologa **roteamento lógico**. Não demonstra que o modelo GPTMaker incorporou a regra numa resposta efetiva de atendimento nem testa preço/foto/estoque da Action em produção.
