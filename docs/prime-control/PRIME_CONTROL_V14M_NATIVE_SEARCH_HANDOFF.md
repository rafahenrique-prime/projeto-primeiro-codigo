# PRIME CONTROL V1.4M — Prévia de handoff seguro da busca nativa GPTMaker

Data: 09/10/2026 (BRT). **Somente LAB**, sem alteração da Action `Buscar Produtos`, GABY OFICIAL ou comércio real.

## Por que

O GPTMaker/GABY LAB envia `pergunta` e `cliente_id` à Edge Function de busca `gaby-lab-shadow-context-v1`. Essa função grava `selected_product` e `last_requested_size` por 15 min. Se uma resposta ao Story seguinte for interpretada como simples continuação, a IA pode vender o produto anterior (ST05 calça recebeu camiseta Armani branca). Precisamos separar:

- *Novo Story verificado:* nunca usar produto comercial anterior sem evidência visual da mídia atual (regra V1.4J).
- *Mensagem comum sem Story e sem Story recente no histórico:* preservar a busca GPTMaker nativa e a memória comercial normal, sem trocar catálogo.
- *Mensagem comum logo após Story:* não presumir que é atendimento normal separado; bloquear handoff automático sem confirmação.
- *Histórico/mensagem/identidade não confiável:* falhar fechado; nunca enviar à Action original.

## O que foi implementado

No resolvedor read-only da Vercel LAB `prime-gptmaker-mcp` em `app/api/prime-control-story-resolve-v14c/route.ts`, a leitura da conversa retorna campo booleano `previous_story_within_memory_ttl`: verifica metadados de respostas a Stories anteriores durante 15 min antes da mensagem de usuário mais recente. Campo não inclui chat ID, Story ID, conteúdo bruto ou URL. Continua retornando HMAC normalizado da pergunta atual, contagem de repetição em cinco minutos e horário; agente GABY LAB comprovado e um chat QA permitido.

No Render LAB `api/_primeControlStoryCorrelationV14c.js` o novo booleano é preservado apenas se vier do resolvedor confiável. O `api/prime-control-story-action-adapter-v14k.js`, em **dry run V1.4M**, classifica `NO_VALID_STORY_ON_LATEST_USER`:
1. Verifica `agent_verified`, escopo do chat e último evento do usuário sem Story;
2. Exige tempo até 120 segundos, sem mensagem futura, pergunta idêntica por HMAC, repetição única;
3. Exige `previous_story_within_memory_ttl === false` exatamente. `true`, ausente ou inválido bloqueia;
4. Em sucesso produz `NATIVE_SEARCH_HANDOFF_QA_READY`, **mas não chama** a Action comercial (read-only). Novo status indica somente que as pré-condições de uma transferência futura foram atendidas.
5. Em `FOUND` mantém gate de Story V1.4L, sem reaproveitar `selected_product` do Story anterior.

Testes V1.4M: DM normal verificada sem Story recente, DM logo após Story, informação ausente, repetida, vencida, agente inválido, pergunta diferente, correlação booleana do resolvedor. Nenhuma chamada de Gemini/JEV, nenhum write Supabase, nenhuma mensagem a cliente.

## Limitação de segurança e próximo gate

`previous_story_within_memory_ttl=false` só expressa o que foi observado na janela de mensagens retornada pela API GPTMaker. Se a API paginar/truncar histórico, a ausência de Story **não é prova absoluta** de ausência de Story recente. Portanto esta é **somente uma prévia**, não um proxy ativo ou uma alteração da função comercial.

Antes da ativação: confirmar cobertura/paginação de histórico e identidade inequívoca de turno, criar proxy autenticado com tráfego apenas para a função existente (sem armazenar novas memórias), verificar payload e readback, rollback, testes de conversas comuns e Story, e só então alterar de modo reversível a Action GABY LAB via API autorizada. O plugin PRIME GPTMaker disponível ao ChatGPT nesta sessão continua read-only; Operator MCP de escrita hospedado foi comprovado no GitHub, mas não se confunde com esse plugin. Não alterar a Action por endpoints de escrita não homologados.

Base real de QA: seis respostas aos Stories ST01–ST06 em 08/10/2026, preservadas no Notion PRIME CONTROL. Reteste somente após integração ativa.
