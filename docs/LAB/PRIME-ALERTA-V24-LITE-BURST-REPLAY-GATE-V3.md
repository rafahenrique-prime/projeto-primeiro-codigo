# PRIME ALERTA V2.4 LITE — replay de rajadas de eventos (gate V3)

**Status:** apenas offline em branch LAB. Nada conectado a produção, nenhuma mudança em Base44, GPTMaker, Render LAB ativo ou webhook. V2.3 permanece preservado.

## Origem e resultado (somente leitura)
- Render `ignite-prime-render-lab-api`, logs de 09/10/2026 entre 19:55 e 20:30 UTC.
- Observador `PrimeControlStoryObserver`: **12 registros** sanitizados, sendo **9** com `source_role=OTHER` (não-user) e **3** `source_role=USER`.
- Observador antigo registrou `event_type_present=false` em todos os 12. Esse campo antigo verifica apenas `root.event`, `root.type`, `data.event`; NÃO verifica `conversationNotificationType`. Portanto, não prova ausência de notificação de transferência no webhook.
- Reprodução local apenas dos intervalos relativos dos timestamps, sem conteúdo de clientes nem IDs. Em janelas de 1,5s: 9 sinais não-user produziram 3 rajadas (tamanhos 1, 5, 3). **67% menos grupos candidatos do que sinais**. É redução hipotética de verificações, não economia medida em créditos.
- No chat piloto do GPTMaker, as mensagens armazenadas contêm notificações de transferência `TRANSFER_QUEUE`. Isso NÃO implica que o `onNewMessage` envie esse mesmo campo.
- Logs de Vercel em Hobby não cobrem a janela histórica exigida. Supabase PRIME CATALOGO LAB está INACTIVE; não religado.

## Código novo
- `api/_primeAlertV24LiteBurstReplay.js`: planejamento puro por rajadas, sem I/O. Nenhum alerta nem observação GPT Maker é executado.
- `tests/primeAlertV24LiteBurstReplay.test.js`: cinco testes de rajadas, segregação, input inválido, tempestades e limite offline.
- Testes locais Node v22.16.0, todos os arquivos na pasta LAB: **31/31 PASS**.
- A função de replay *não* implementa uma fila de produção nem deduplicação atômica entre workers. O limite é ilustrativo: cap transacional real ainda não instalado.

## Critérios para futuro piloto
1. Confirmar a forma dos webhooks em LAB, usando observador isolado ou evolução segura do existente, sem substituir o `onNewMessage` já usado por Story na GABY LAB COMERCIAL.
2. Nunca confiar em `OTHER` sozinho para criar uma transferência; só após leitura única dirigida ao chat, `humanTalk false -> true`, `TRANSFER_QUEUE` recente e dedupe compatível com V2.3.
3. Criar execução por evento/filas com coalescing persistente e atômico, atrasos curtos por conversa, teto de custo; sem polling global.
4. Evitar que um cooldown longo esconda uma transferência depois de um evento não relevante. A janela offline de 1,5s agrupa rajadas sem significar cooldown de 120s.
5. Ensaiar concorrência de verdade em banco isolado somente quando for seguro, sem reativar projetos Supabase inativos por padrão.
6. Medir custo real de LAB antes de qualquer ativação de Telegram/produção.

## Compatibilidade de testes
O teste V0 em `tests/primeAlertV24LitePolicy.test.js` foi atualizado para a interface da política conservadora de V1 (não depende mais de `previousState` implícito). A bateria completa de módulos V2.4 LITE foi executada localmente em Node v22.16.0: **31 testes, 31 aprovados**.
