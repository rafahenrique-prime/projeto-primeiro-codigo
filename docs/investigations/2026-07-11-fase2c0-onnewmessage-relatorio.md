# Fase 2C.0 — Validação controlada do webhook universal `onNewMessage`

**Data:** 2026-07-11
**Autores:** Rafael Henrique (execução dos testes reais, aprovação de cada etapa) + Claude (auditoria, probe, análise)
**Status:** experimento encerrado. `onNewMessage` desativado e confirmado vazio. `api/message-router-probe.js` ainda existe no repositório (removido em etapa futura, não nesta).

---

## 1. Objetivo do experimento

Descobrir o payload e o comportamento real do gatilho de sistema "Nova mensagem" (`onNewMessage`) do GPT Maker, para decidir se ele pode servir de base a um `messageRouter` universal (Fase 2C.1/2C.2) — sem alterar memória, perfil, respostas ou qualquer dado de produção durante a investigação.

Motivação: a Ação "Buscar Produtos" (`api/webhook.js`), único caminho hoje em uso, só dispara quando o classificador de Intenções do GPT Maker decide que a mensagem parece busca de produto — mensagens como "agora eu uso 41" podiam não acionar esse caminho, deixando a cobertura de captura de memória incompleta.

## 2. Configuração usada

- **Endpoint isolado:** `api/message-router-probe.js` — zero imports de módulos comerciais do projeto (só `crypto`, nativo), nunca chama GPT Maker/Supabase, nunca escreve em banco, nunca envia mensagem, responde sempre antes de qualquer log ser potencialmente perdido (log emitido antes de `res.status(...)`).
- **Sanitização aplicada em toda a captura:** secrets (`authorization`, `cookie`, `token`, `secret`, `password`, `apikey`/`api_key`, `key`) sempre `[REDACTED]`; telefone mascarado (só últimos dígitos); identificadores longos (`contextId`, `chatId`, `messageId` etc.) reduzidos a hash curto determinístico (`h:xxxxxxxxxx`); conteúdo de texto cortado em 80 caracteres.
- **Gatilho GPT Maker:** `onNewMessage` do agente **Gabriela** (produção) apontado manualmente por Rafael para `https://ignite-webhook.vercel.app/api/message-router-probe`. Nenhuma Intenção, Body, variável ou outro campo de webhook foi alterado.
- **Monitoramento:** `vercel logs` filtrado por `[PROBE_2C0]`, reiniciado manualmente a cada consulta (limitação de sessão de ~5min já documentada na Fase 2A).

## 3. Duração

Início: `2026-07-11T14:37:37Z` (confirmação do endpoint, antes de qualquer configuração no GPT Maker).
Ativação do `onNewMessage`: confirmada por leitura de API às `14:44:58Z`.
Encerramento (desativação confirmada por leitura de API): `~15:05Z`.
**Duração efetiva do gatilho ativo: ~20 minutos** — dentro da janela de 30-60min planejada.

## 4. Testes realizados

**Nota sobre numeração:** o plano original da Fase 2C.0 previa 8 testes distintos, incluindo 3 passos separados para duplicidade/controle negativo (cada um com seu próprio marcador de texto, `TESTE-2C0-04` e `TESTE-2C0-05`). Na execução real, esses 3 passos foram cobertos por um único envio (`TESTE-2C0-03`) — os marcadores `04` e `05` nunca chegaram a ser enviados. A tabela abaixo reflete o que foi **de fato enviado e observado**, não a numeração original do plano.

| Mensagem/ação enviada | Canal | Cobre o objetivo original de | Resultado resumido |
|---|---|---|---|
| `TESTE-2C0-01` (texto simples) | WhatsApp | Teste 1 do plano | 1 evento `role:user` + 1 `role:assistant`; schema completo |
| `TESTE-2C0-02` ("agora eu uso 41") | WhatsApp | Teste 2 do plano | Capturada normalmente sem acionar busca de produto — confirma a premissa central da Fase 2C; gerou 4 eventos `role:assistant` (resposta dividida em bolhas) |
| *(resposta da Gabriela aos dois envios acima)* | WhatsApp | Teste 3 do plano | Observada organicamente — `role:assistant` distingue claramente da mensagem do cliente |
| `TESTE-2C0-03` (envio único) | WhatsApp | Testes 4, 5 e 6 do plano, combinados¹ | `contextId` estável; `messageId` novo e único; 1 único evento `role:user` gerado, sem duplicidade |
| Imagem sem legenda (sem marcador de texto) | WhatsApp | Teste 8 do plano | `images` preenchido (1 URL, truncada em 80 chars no log), `message` vazio (`""`), capturado normalmente |
| `TESTE-2C0-06` | Instagram | Teste 7 do plano | Schema idêntico ao WhatsApp; `contextId` diferente do WhatsApp (esperado); `contactPhone: null`; 2 eventos `role:assistant` na resposta |

¹ O roteiro original separava "segunda mensagem" (Teste 4), "enviar uma vez e checar se duplica" (Teste 5) e "controle negativo, comparar IDs com um novo envio" (Teste 6) em 3 passos com marcadores próprios. Na prática, só `TESTE-2C0-03` foi enviado nessa etapa — e sozinho já respondeu as 3 perguntas: `contextId` seguiu estável (resolve Teste 4), gerou exatamente 1 evento sem duplicata (resolve Teste 5), e seu `messageId` comparado com os dos testes anteriores confirmou IDs distintos por mensagem (resolve Teste 6 por comparação retroativa, não por um novo envio dedicado). Registrado aqui para o histórico não ser lido como se o roteiro tivesse sido seguido passo a passo com 6 marcadores distintos.

Um evento adicional (`14:58:10.901Z`, `role:assistant`, imagem de produto via Supabase Storage) foi descartado da análise por instrução explícita de Rafael (envio acidental, não fazia parte do roteiro de teste — ver risco operacional registrado na seção 17).

**Total de eventos capturados e analisados nesta investigação: 14** (2+5+2+2+3, nas 6 linhas da tabela acima), fora o 1 evento descartado.

## 5. Schema real observado (idêntico em todos os testes, WhatsApp e Instagram)

```
date, assistantId, images, role, documents, contactName, channel,
audios, messageId, contextId, contactPhone, message
```

12 campos, sempre presentes, mesma estrutura nos dois canais. **Nenhum campo `chatId`, `eventId` ou `messageType`/`type` existe neste payload** — não fazem parte do schema real, apesar de estarem na lista de campos que a Fase 2C.0 saiu procurando.

## 6. Comportamento no WhatsApp

- `channel: "WHATSAPP"`.
- `contactPhone` sempre preenchido (mascarado no log).
- `contextId` estável entre todas as mensagens da mesma conversa, do primeiro ao último teste em WhatsApp (mesmo hash em `TESTE-2C0-01`, `02`, `03` e na imagem sem legenda).

## 7. Comportamento no Instagram

- `channel: "INSTAGRAM"`.
- `contextId` **diferente** do WhatsApp (esperado — canais diferentes, conversas diferentes), mas internamente estável entre o evento do cliente e as respostas da Gabriela na mesma conversa.
- `contactPhone: null` — diferente do WhatsApp, onde sempre veio preenchido.
- Mesmo schema de 12 campos, sem nenhum campo a mais ou a menos.
- Diferente da lacuna documentada na investigação do Vision Inbound (2026-07-04), onde uma mensagem real de Instagram não aparecia em log apesar de resposta confirmada por print — **desta vez o evento chegou e foi capturado normalmente**, sem lacuna observada.

## 8. Comportamento de texto vs. imagem

- **Texto:** `message` preenchido, `images: []`.
- **Imagem sem legenda:** `images` com 1 item (URL truncada em 80 chars pelo probe, nenhuma URL completa logada), `message: ""` (string vazia, não `null`). Nenhum campo de tipo/`messageType` acompanha essa distinção — a única forma de saber que é imagem é olhar se `images` está preenchido.

## 9. Distinção `role=user` vs. `role=assistant`

**Confirmada e consistente nos 14 eventos capturados.** O campo `role` sempre veio presente, com valor `"user"` para mensagens do cliente e `"assistant"` para respostas da Gabriela — nunca ambíguo, nunca ausente. Não existem os campos `fromMe`, `direction` ou `author` citados como possibilidades na auditoria anterior — mas `role` sozinho já resolve a pergunta que aquela auditoria deixou em aberto.

## 10. Estabilidade do `contextId`

Estável em 100% das observações: mesmo valor (mesmo hash) em todas as mensagens de uma mesma conversa, tanto do cliente quanto da Gabriela, em ambos os canais. Diferente entre WhatsApp e Instagram, como esperado (são identidades/conversas diferentes). Nenhuma instância de `contextId` ausente, vazio ou inconsistente foi observada.

## 11. Comportamento do `messageId`

Sempre presente, sempre um hash novo e único por evento — nenhuma repetição de `messageId` foi observada nos 14 eventos, incluindo no envio único (`TESTE-2C0-03`) dedicado a checar duplicidade. Não existe campo `eventId` separado — `messageId` é o único identificador de evento disponível no payload.

## 12. Quantidade variável de eventos `assistant` por resposta

**Achado relevante não previsto no plano original:** uma única mensagem do cliente pode gerar **múltiplos** eventos `role:assistant` — observado 1 evento (`TESTE-2C0-01`, `TESTE-2C0-03` e imagem sem legenda), 2 eventos (`TESTE-2C0-06`, Instagram) e **4 eventos** (`TESTE-2C0-02`), todos concentrados numa janela de poucos milissegundos entre si. Isso acontece porque a Gabriela às vezes divide a resposta em várias mensagens/bolhas separadas no WhatsApp/Instagram, e cada bolha dispara seu próprio evento `onNewMessage`. **Não é 1:1 entre pergunta e evento de resposta.**

## 13. Ausência de `chatId`

Confirmado nos 14 eventos capturados: **não existe** campo `chatId` neste payload, em nenhum canal. O único identificador de conversa disponível é `contextId`.

## 14. `contactPhone: null` no Instagram

Confirmado — diferente do WhatsApp (sempre preenchido), no Instagram esse campo vem consistentemente `null`. Mesmo padrão já documentado na Fase 2A para o `${whatsappPhone}` da Ação "Buscar Produtos" (que também não se aplica ao Instagram) — aqui se repete de forma nativa no payload do `onNewMessage`, sem precisar de nenhum tratamento especial do nosso lado.

## 15. Ausência de `messageType`

Confirmado nos 14 eventos capturados: **não existe** nenhum campo `messageType` ou `type`. A distinção de tipo de conteúdo só é inferível indiretamente (`images` preenchido = imagem; `message` preenchido e `images` vazio = texto).

## 16. Evidências de duplicidade — ou ausência dela

Nenhuma reentrega/duplicidade de evento foi observada nos 14 eventos capturados, incluindo no envio único (`TESTE-2C0-03`) dedicado a checar isso: cada envio do cliente gerou exatamente 1 evento `role:user` com `messageId` único, nunca repetido. **Ressalva importante:** a janela de observação foi curta (~20 minutos) e a amostra é pequena (**14 eventos no total**) — ausência de duplicidade observada nesta amostra não é prova estatística de que reentrega nunca acontece em produção (ex.: sob instabilidade de rede, picos de tráfego, ou os resets de configuração já documentados historicamente para este mesmo gatilho).

## 17. Riscos ainda não eliminados

- **Estabilidade da configuração ao longo do tempo:** o precedente de 2026-07-04 (`onNewMessage` resetando sozinho durante a madrugada) não foi testado nesta janela curta e supervisionada — o experimento não teve duração suficiente para observar se esse comportamento se repete.
- **Volume real de produção:** as 6 rodadas de teste (14 eventos) foram de baixo volume, controlado, sem tráfego real concorrente de outros clientes simultâneos. Não valida comportamento sob carga.
- **Quantidade variável de eventos `assistant`** (item 12) precisa de tratamento explícito em qualquer implementação futura — não é seguro assumir 1 evento de resposta por pergunta.
- **Nenhum campo de auditoria/rastreamento de reentrega em nível de infraestrutura foi testado** (ex.: cabeçalho HTTP de tentativa/retry) — a ausência de duplicidade observada é só ao nível do corpo do payload.
- **`chatId` continua ausente** — qualquer lógica futura que dependa desse campo especificamente (em vez de `contextId`) não tem como funcionar com este gatilho.
- **Risco operacional de teste manual em número real de produção, confirmado na prática durante este mesmo experimento:** um envio acidental (foto disparada sem querer a partir do número de teste, descartado da análise por instrução de Rafael — ver seção 4) mostrou que testar manualmente com um número/conta real de atendimento tem risco real de erro humano, independente de qualquer proteção técnica do probe. Qualquer janela de observação futura, mais longa, deveria considerar um número/conta dedicada exclusivamente a teste, se disponível, para reduzir esse risco.

## 18. Critérios avaliados (ver critérios definidos na auditoria da Fase 2C.0)

| Critério | Status | Base da avaliação |
|---|---|---|
| Cobertura (mensagem sem acionar busca de produto chega no gatilho) | ✅ Atendido | Confirmado por observação direta (`TESTE-2C0-02`) |
| Distinção cliente vs. agente | ✅ Atendido | Campo `role` consistente nos 14 eventos capturados |
| Identificador de evento estável e único | ✅ Atendido, **amostra pequena** | `messageId` sempre novo, nunca repetido — mas só 14 eventos observados, ver ressalva na seção 16 |
| `contextId`/`chatId` estável | ✅ Atendido para `contextId`; N/A para `chatId` | `contextId` estável em todos os eventos de cada conversa; `chatId` não existe no payload |
| Estabilidade da configuração ao longo do tempo | ⚠️ **Não testado** | Janela de ~20min é curta demais para validar contra o precedente de reset silencioso (2026-07-04) |
| Instagram — cobertura confiável | ✅ Atendido, **amostra mínima (n=1)** | 1 única conversa testada — evento capturado normalmente, sem a lacuna vista no Vision Inbound, mas sem repetição que confirme consistência |

## 19. Avaliação técnica sobre usar `onNewMessage` como base do `messageRouter` (recomendação — decisão cabe ao Rafael)

Com base na evidência coletada, **a recomendação técnica é prosseguir ao próximo estágio de design, não para implementação direta em produção.** 4 dos 6 critérios foram atendidos com evidência considerada sólida; 1 foi atendido mas com amostra pequena/mínima (identificador de evento, Instagram); 1 não foi testado (estabilidade da configuração ao longo do tempo — não foi refutado, só não coube no escopo desta janela curta e supervisionada, por desenho).

Esta seção resume a leitura técnica dos dados coletados — **não é uma decisão de arquitetura já tomada.** A decisão de seguir, aprofundar o teste (recomendação 7 da seção 20) ou não usar `onNewMessage` continua sendo do Rafael.

## 20. Recomendações para a arquitetura definitiva da Fase 2C

1. **Usar `contextId` como único identificador de conversa** — `chatId` não existe neste payload, não desenhar nenhuma lógica que dependa dele.
2. **Usar `role` como critério de distinção cliente/agente** — campo confiável, não precisa de heurística de conteúdo (como a gambiarra usada no Vision Inbound).
3. **Usar `messageId` como chave de idempotência/dedup** — mas complementar com verificação real de duplicidade, já que a amostra desta fase é pequena demais para confiar cegamente na ausência de reentrega.
4. **Tratar explicitamente "N eventos `assistant` por 1 pergunta"** — qualquer lógica de roteamento não pode assumir resposta 1:1; se precisar reagir à resposta da Gabriela no futuro, agrupar eventos próximos no tempo com o mesmo `contextId`.
5. **Tratar `contactPhone: null` como caso normal**, não erro — específico do Instagram, já esperado.
6. **Adicionar um healthcheck periódico** que confira `GET /v2/agent/{id}/webhooks` e alerte se `onNewMessage` ficar vazio sozinho — pré-requisito antes de confiar nesse gatilho em produção de forma permanente, dado o precedente de 2026-07-04.
7. **Rodar uma segunda janela de observação, mais longa** (ex.: algumas horas, ainda supervisionada) antes de qualquer escrita automática em produção — para validar o item 17 (estabilidade ao longo do tempo) que esta primeira janela curta não cobriu.
8. Só depois dos itens acima, retomar o desenho do `messageRouter` (classificação de mensagens, regra de `size`, schema de `profile_learning_audit`, deduplicação, rollback de dados) com base neste schema real, substituindo qualquer suposição da auditoria anterior por este dado observado.

---

**`api/message-router-probe.js` permanece no repositório** (não removido nesta etapa, por instrução explícita). `onNewMessage` confirmado vazio (`""`) por leitura de API às ~15:05Z. Nenhum código alterado, nenhum deploy feito, nenhuma tabela criada, nenhuma escrita em banco realizada durante toda a Fase 2C.0.

---

## Lições aprendidas

Registro de processo para investigações futuras — não traz conclusão técnica nova nem altera nenhum resultado deste experimento.

1. **Não assumir comportamento do GPT Maker apenas pela documentação — sempre validar com experimento controlado.** A auditoria que antecedeu este experimento (baseada em código, memória de investigações anteriores e leitura de configuração) levantou hipóteses razoáveis sobre o payload do `onNewMessage`, mas várias só se confirmaram (ou se revelaram diferentes do esperado — ex.: ausência de `chatId`/`messageType`, quantidade variável de eventos `assistant` por resposta) depois da observação direta. Documentação e memória de investigações passadas orientam onde procurar, não substituem o teste real.

2. **Diante de dúvida sobre payload, evento ou comportamento de uma integração externa, construir primeiro um endpoint de observação ("probe") isolado, antes de qualquer lógica de produção.** O probe desta fase (`api/message-router-probe.js`) não tinha nenhuma dependência de módulo comercial, nunca escreveu em banco, nunca chamou outra API — isso permitiu investigar o gatilho `onNewMessage` com risco mínimo, sem comprometer nenhum fluxo real caso o comportamento observado fosse inesperado.

3. **Encerrar o experimento assim que a evidência necessária for coletada, e devolver a configuração do ambiente ao estado original imediatamente.** O `onNewMessage` foi mantido ativo por uma janela curta e supervisionada (~20 minutos) e desativado assim que os testes planejados foram concluídos, com confirmação por leitura de API (não só pela tela do painel) de que voltou ao estado vazio original — mesmo padrão já validado em investigações anteriores (Fase 2A).

4. **Decisões de arquitetura devem se apoiar nas evidências coletadas durante a investigação, não nas hipóteses que motivaram o experimento.** Algumas expectativas da auditoria anterior (ex.: possível ausência de campo que distinga cliente de agente, possível instabilidade de `contextId`) não se confirmaram; outras questões que pareciam menores (quantidade de eventos `assistant` por resposta) se mostraram mais relevantes do que o previsto. As recomendações da seção 20 partem do que foi observado, não do que se esperava observar antes do experimento.
