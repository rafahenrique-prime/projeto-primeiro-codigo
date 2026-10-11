# PRIME ALERTA V2.4 LITE — LAB V4 / prova direcionada offline

Estado: implementação PURAMENTE ISOLADA; nenhum webhook ativado, nenhuma consulta automática ao GPT Maker, nenhum banco alterado, nenhum Telegram disparado, nenhum deploy em render-lab nem main. V2.3 preservado; dez automações V2.4 antigas continuam pausadas.

## Evidência real do teste 10/10, 23:48 BRT
- Atendimento 2629, GABY LAB COMERCIAL / canal INSTA PRIME CENTRO.
- humanTalk=true, atendimento WAITING.
- Evento armazenado no GPT Maker: TRANSFER_QUEUE em 2026-10-11 02:48:41.368Z, após mensagem de cliente 02:48:08.088Z.
- Observador Render LAB: sinal não-user em 02:48:44.701Z sem tipo explícito (MISSING). Mais 2 eventos simultâneos.
- Portanto, o webhook não trouxe o tipo; o histórico/estado confirma a transferência. Nenhum envio de alerta pelo V2.4 LITE foi feito.

## Entrega V4
- api/_primeAlertV24LiteTargetedProof.js: avaliador de snapshots do chat, mensagens e incidente exatos; execução shadow com clientes injetados; só funciona após candidato já reservado atomicamente e com LAB_SHADOW_ONLY. Sem cliente de API, sem endpoint, sem logs de dados privados.
- tests/primeAlertV24LiteTargetedProof.test.js: testes de replay do protocolo 2629 (APENAS metadados temporais, IDs sintéticos), falso positivo, evento antigo, canal incorreto, dedupe V2.3, ausência de estado anterior, falha de cliente e limites de leituras.
- Para uma leitura direcionada: 1 chat por ID, até 50 mensagens desse chat, 1 interação desse chat e 1 verificação de incidente V2.3. A lógica não faz varredura global.
- Resultado confirmed=true significa SOMENTE prova de histórico no LAB; eligibleToCreateWatch=false em todos os resultados. Não é autorização de Telegram ou fila.

## Travas pendentes antes de ativação real
1. Reserva/limite de custo persistente e atômico, validado em banco LAB isolado, não apenas mocks.
2. Autenticidade/scope do webhook por agente e canal; decisão sobre evento sem TRANSFER_QUEUE explícito. Sinais não-user podem ser conversas normais e não justificam consultas sem um teto baixo.
3. Validar APIs nativas do GPT Maker que permitam leitura direcionada por ID, sem depender de listagem de todos os chats. Adapter não implementado.
4. Resiliência do histórico à consistência eventual: evento pode chegar antes da gravação de TRANSFER_QUEUE. Sem polling 24h, e sem limitar o evento legítimo por cooldown inadequado.
5. Incidente canônico e dedupe V2.3. Nenhum alerta/Watch poderá ser criado enquanto v23IncidentPresent não for comprovadamente false e houver transition baseline.
6. Medição real de custo por evento LAB, prova de comportamento para resposta humana antes do minuto e retorno seguro por feature flag.

Regra de produção: V2.3 intocado; nada de reativar as 10 rotinas V2.4. Não utilizar GABY OFICIAL, INSTA PRIME TIBERY, nem Whats-Gabriela.
