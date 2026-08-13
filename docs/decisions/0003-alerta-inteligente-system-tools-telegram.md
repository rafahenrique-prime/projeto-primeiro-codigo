# ADR 0003 — Alerta Inteligente dentro de `system-tools.js`, Telegram como canal, resumo sempre best-effort

**Status:** Aceita
**Data:** 2026-08-13

## Decisão

O Alerta Inteligente de handoff humano é implementado como um `case` dentro do dispatcher já existente `api/system-tools.js` (`?tool=alerta-inteligente`), com a lógica de negócio isolada em `api/_alertaInteligente.js` (helper privado, prefixo `_`, não conta como Serverless Function própria). O canal de entrega é o Telegram, reaproveitando o mesmo mecanismo já usado por outros alertas do projeto. A geração de resumo via IA (Groq) é sempre **best-effort**: se falhar em qualquer etapa, o sistema envia o alerta simples já existente (`⚠️ RAFAEL, CLIENTE AGUARDANDO SEM RESPOSTA!`) em vez de não enviar nada.

## Contexto que motivou a decisão

**Limite de Serverless Functions:** o Alerta Inteligente nasceu como `api/alerta-inteligente.js`, arquivo-rota independente. Isso levou a contagem de rotas roteáveis em `api/*.js` de 12 para 13 — acima do limite do plano Vercel Hobby. O deploy do commit correspondente foi rejeitado (`Error` na etapa "Deploying outputs", build em si concluído normalmente). Migrado para dentro de `system-tools.js` — mesmo padrão já usado por `qwen-health`, `consultar-produto`, `stuck-check`, `nex-sync-clientes` e outros, todos pelo mesmo motivo.

**Resiliência do handoff:** um handoff humano é, por definição, um momento em que o cliente já não está sendo bem atendido pela automação — o pior desfecho possível seria a tentativa de "melhorar" o alerta (com resumo de IA) acabar impedindo que ele chegasse. Por isso, IA nunca é uma dependência obrigatória do envio.

## Alternativas consideradas

1. **Manter `api/alerta-inteligente.js` como arquivo-rota próprio, aceitando estourar o limite** — descartada: bloqueava o deploy inteiro do projeto (não só desta feature), efeito colateral inaceitável.
2. **Fazer upgrade do plano Vercel para remover o limite de 12 functions** — descartada por decisão de custo do Rafael, não avaliada tecnicamente como necessária (o padrão de agrupamento em `system-tools.js` já resolve sem custo adicional).
3. **Remover algum endpoint existente para abrir espaço** — descartada sem auditoria própria; consolidar em `system-tools.js` é reversível e não exige decidir "o que descartar".
4. **Bloquear o envio do alerta se o resumo de IA falhar** (em vez de cair no alerta simples) — descartada: transformaria uma falha de terceiro (Groq indisponível, resposta malformada) em ausência total de alerta, o pior cenário possível para um sistema de handoff humano.
5. **Canal diferente de Telegram** (e-mail, SMS, painel interno) — não avaliado a fundo nesta fase: Telegram já era o canal operacional em uso por todos os outros alertas do projeto; trocar exigiria justificativa própria, não levantada.

## Referências

- [`docs/integrations/ALERTA-INTELIGENTE.md`](../integrations/ALERTA-INTELIGENTE.md) — seções 7 (fallback) e 11 (limite de Serverless Functions)
- `api/system-tools.js` — `case 'alerta-inteligente'`
- `api/_alertaInteligente.js` — `enviarFallback()`, `processarAlertaInteligente()`
