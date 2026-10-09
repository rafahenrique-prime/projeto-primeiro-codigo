# PRIME CONTROL V1.4K — adaptador de Action GPTMaker, DRY-RUN no LAB

**Data:** 08–09/10/2026. **Escopo:** somente branch `render-lab`, um chat QA GABY LAB. **Não instalar na Action ativa do GPTMaker.**

## Por que existe
Auditoria ST01–ST06: seis Stories recebidos e correlacionados `FOUND`; a Action `Buscar Produtos` usou memória `bridge_product_context` por 15 minutos e associou a `Camiseta Armani Exchange Branca` a Stories diferentes. Foi confirmado no banco que o `context_id` começa com **um único `$`** seguido do `chatId`, e `last_query` inicia com `$` antes da pergunta. É efeito da interpolação atual da Action `{"pergunta":"${pergunta}","cliente_id":"${contextId}"}`. Nenhum dado de clientes foi alterado.

## A prova deste estágio
- `api/prime-control-story-action-adapter-v14k.js` recebe body nos mesmos dois campos `pergunta` e `cliente_id`, tolerando exatamente um `$` inicial para cada um (não aceita `$$`, substituições aninhadas ou outro chat).
- Usa **somente o chat QA allowlisted** na configuração interna do Render. Valida autenticação privada com a chave LAB existente, flag OFF por padrão, pergunta válida e estrita expiração.
- Reutiliza o resolvedor Vercel LAB `resolveStoryPilot` e a fronteira V1.4J `decideStoryMemoryBoundaryV14j`. A correlação Render `_primeControlStoryCorrelationV14c.js` passou a preservar os campos **já devolvidos pela Vercel** `latest_user_time` e `story_media_type`, sem processar mídia.
- Para um **Story atual verificado e recente (até 120 segundos)**, retorna **apenas uma PRÉVIA** com formato de campos `sucesso, contexto, dados` mostrando `produtos=[]`, `should_reuse_previous_product=false` e orientação segura de não apresentar preço/estoque/modelo do Story anterior. Não solicita Vision/JEV, não consulta Shadow, não grava `bridge_product_context` e não envia mensagens.
- Se não for Story comprovado, deliberadamente retorna `NATIVE_SEARCH_HANDOFF_UNPROVEN` em vez de encaminhar para a função comercial com gravações. Se Story estiver velho/fora de escopo/falhar correlação, BLOQUEIA. Assim, não quebra nem substitui o atendimento comum.
- Endereço `POST /api/prime-control-story-action-adapter-v14k` registrado no servidor Render LAB com auth e `PRIME_CONTROL_STORY_ACTION_ADAPTER_V14K_ENABLED` default `false`. É serviço técnico para testes privados, **NÃO alterar URL da intenção ativa GPTMaker para este endereço**.

## Bloqueios para eventual integração ativa
1. **Plugin GPTMaker atual só oferece leitura.** A Action ativa não foi modificada. Não realizar atualização via acesso não autorizado nem pedir usuário mexer em produção.
2. A Action só transmite `pergunta` e `cliente_id`: o resolvedor Vercel comprova último Story e horário, mas **não fornece identidade/hash da pergunta atual**. Se duas mensagens chegarem perto no tempo, a Action não tem como provar que está resolvendo a mesma mensagem. Antes de integrar, providenciar `messageId`/HMAC do texto atualizado do lado autenticado, não confiar só em tempo.
3. Para `NO_VALID_STORY_ON_LATEST_USER`, o resolvedor atual não envia `latest_user_time`. Ainda não há handoff seguro completo para o catálogo comercial **que grava contexto**; é obrigatório preservar perguntas comuns antes de trocar a URL.
4. A política de Story com modelo incerto não substitui reconhecimento visual. Sem Vision/Visual Match/JEV associados à **mídia atual**, só é permitido pedir esclarecimento; não afirmar modelo específico.
5. Sem prova de que GPTMaker irá consumir o retorno e obedecer ao treinamento, não declarar correção final. Compatibilidade de campos não equivale a homologação de atendimento real.

## Critério de sucesso futuro
Verificar no LAB a resposta nativa em novo reply ao mesmo Story e em Story trocado, sem recair no produto anterior; também testar conversa comum, vídeo, foto dupla, print repetido e indisponibilidade do resolvedor. Manter logs sem IDs/tokens/URLs pessoais, rollback rápido da Action, GABY OFICIAL intacta. Evitar repetir publicações enquanto integração não estiver habilitada; baseline de 6 Stories já é suficiente para regressão.
