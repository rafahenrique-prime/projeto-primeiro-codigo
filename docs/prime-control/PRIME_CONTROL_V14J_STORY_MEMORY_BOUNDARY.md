# PRIME CONTROL V1.4J — Fronteira de memória entre Stories (LAB)

08/10/2026, após bateria real ST01–ST06. **Somente código/testes do render-lab**; nenhuma ligação à ferramenta GPTMaker ativa.

## Prova da falha original
No histórico QA do GPTMaker, seis mensagens de resposta a Stories, cinco `image/jpeg` e uma `video/mp4`, possuíam os campos `storyId/storyMediaUrl/storyMediaType`. O observador Render correlacionou **6/6** mensagens (`FOUND`) com fingerprint de mídia diferente.

O fluxo comercial ativo `gaby-lab-shadow-context-v1` recebe apenas `pergunta` e `cliente_id`, lê a tabela `bridge_product_context` por `context_id` e por 15 minutos reutiliza `selected_product` e `last_requested_size`. Em ST05, o banco indicou `selected_product=Camiseta Armani Exchange Branca`, `last_requested_size=M`, enquanto a mensagem do novo Story foi `Qual o valor dessa?`. A GABY respondeu com a camiseta antiga e seu preço. O valor de R$129 existia no catálogo, mas o referente estava equivocado. ST06 em vídeo voltou a dizer Armani branca, sem comprovação do conteúdo do vídeo.

## Política proposta, testada, mas NÃO conectada
`api/_primeControlStoryMemoryBoundaryV14j.js`:
- Para mensagem normal COMPROVADAMENTE sem Story: `PRESERVE_NATIVE_SEARCH`, mantendo o fluxo GPTMaker comercial atual e sua memória de produto.
- Para Story atual verificado, com **outro fingerprint**, não permitir herdar `selected_product` anterior. Sem evidência atual verificada: `HOLD_FOR_CURRENT_STORY_EVIDENCE` (não afirmar preço, estoque, tamanho nem modelo).
- Mesmo Story e pergunta nova: **não bloquear por deduplicação do fingerprint**. Novo `messageId` deve ser considerado em futura integração. O mesmo fingerprint é permitido para perguntas subsequentes, mas memória comercial sozinha não vira prova de SKU.
- Com evidência atual vinculada ao fingerprint: reaproveitar **a matriz V1.4I**, inclusive JEV veto e treinamento nativo do GPTMaker; nunca criar um segundo agente nem invocar Gemini/JEV no roteador.
- Contexto de agente/CHAT verificado pelo servidor e janela de mensagem atual <=5 minutos; casos indefinidos ou vencidos bloqueados. Não aceitar sinal `verified` fornecido pelo cliente.
- **Não limpar nem sobrescrever automaticamente** a tabela `bridge_product_context` durante o preview. O plano futuro é isolar a memória por Story e chat, preservando o contexto comercial dos DMs normais.

## Casos
Seis fingerprints reais obtidos de telemetria read-only (não URLs/IDs de cliente) compõem fixtures sintéticas da matriz: ST01 `92501b2adacb3dd7ae77ffd2`; ST02 `498b8f47c09bbd16a596ceef`; ST03 `ed9662532f4de7dbb5f7fc72`; ST04 `9e65b845a6a6cc5f023068bd`; ST05 `5d3d446628685d6c6c0f5b02`; ST06 VIDEO `c47e189e645ae90b9dc12e5d`.

Todos são apresentados no teste com memória de camiseta Armani ficticiamente pré-existente e devem rejeitar o reaproveitamento sem confirmação de identidade visual ligada à mídia atual. Outras provas: mensagem comum, repetição do mesmo Story, Story vencido, origem errada, JEV veto, candidato não confirmado, print já pedido. Sem processamento binário de fotos/vídeo e sem cobrança de IA.

## Plano de reteste sem trabalho duplicado
Stories normais do Instagram ficam disponíveis por cerca de 24 horas desde **cada publicação**. O usuário pode responder novamente aos mesmos Stories enquanto disponíveis, **depois que a ponte real estiver homologada**. Recomenda-se:
1. Guardar respostas antigas como baseline; não apagá-las.
2. Repetir ST05/Story de calça e ST06/vídeo como priorização da memória cruzada, e então os demais se ainda disponíveis.
3. Validar no GPTMaker que novo evento possui Story ID correto, que a ferramenta recebeu contexto **do Story atual**, que o identificador do cliente não se mistura e que preço/modelo/tamanho são rastreáveis.
4. Se já expirou, usar o histórico para QA do roteamento e republicar somente os casos em falta; não depender de tempo de vida do Story para a correção.
5. Atenção: repetir a pergunta **não corrige por si só** a Action atual, que continua sem vínculo direto à correlação do Story. Não pedir reteste antes da integração LAB de ponta a ponta.

**Gate seguinte:** futura integração efetiva com a GABY LAB exigirá contrato nativo de ferramenta e fallback do atendimento normal, autorização e rollback; a GABY OFICIAL fica intocada. Até lá, este é um bloqueio lógico demonstrado, não correção ativa da conversa.
