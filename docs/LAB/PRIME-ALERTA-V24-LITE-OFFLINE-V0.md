# PRIME ALERTA V2.4 LITE — Gate offline V0 (10/10/2026)

**Estado: APENAS CODIGO ISOLADO EM BRANCH LAB.** Nao integrado ao webhook. Nenhum deploy ou automacao Base44 foi solicitado. O V2.3 segue como producao homologada.

## Por que nao restaurar os 10 workflows
- Auditoria do Claude encontrou 10.238 execucoes V2.4 com custo **estimado** de 4.095 creditos entre 04 e 09/10.
- Os 10 schedulers (5 piloto + 5 geral), se operassem 24h sem interrupcao, teriam ate 5.760 invocacoes de funcoes por dia (10 * 12/h * 2 * 24h).
- Depois da pausa de 10/10 23h34 BRT, registros 'general_poll_run' cessaram.
- Os alertas V2.3 continuaram gerando entregas em 10/10.
- Valores sao aproximacoes; para economia garantida exigir o Credit Usage oficial Base44.

## Design aprovado
- **V2.3 intocado:** 5-min scanner, historico, Telegram, reavisos, visto, resolver, automatico.
- **V2.4 LITE:** somente sinal/evento elegivel do GPTMaker; leitura do chat direcionado apenas apos reserva atomica, confirmacao humanTalk false->true + TRANSFER_QUEUE recente, watch unico com 1 minuto; alerta compartilha dedupe do V2.3.
- onTransfer funciona em LAB, mas falhou em 2 transferencias Z_API em producao. Nao confiar nele isoladamente.
- onNewMessage da GABY OFICIAL atualmente ja aponta para 'https://ignite-webhook.vercel.app/api/onnewmessage'; NAO reconfigurar.
- onNewMessage gera eventos de roles assistant/tool/system/user; role nao prova transferencia.
- Os 10 workflows de polling V2.4 e restantes pausados em emergencia NAO devem ser reativados neste gate.

## Este checkpoint contem
- 'api/_primeAlertV24LitePolicy.js': filtro puro dos sinais candidatos, sem rede.
- 'tests/primeAlertV24LitePolicy.test.js': testes offline para coalescing, guardas, transferencia, exclusao V2.3.
- Essa politica so retorna PROBE_CANDIDATE, nunca envia Telegram nem cria watch.

## Proximos gates ANTES DE QUALQUER ATIVACAO
1. Validar shape sanitizado de onNewMessage em LAB, incluindo TRANSFER_QUEUE/no explicit type, sem afetar GABY OFICIAL.
2. Elaborar reserva **atomica persistente** por chat para agrupar sinais concorrentes. Coalescing em memoria NAO e suficiente no serverless.
3. Avaliar consistencia eventual: candidato pode chegar antes do estado humanTalk atualizado; uma rechecagem curta condicionada talvez seja necessaria. Garantir que evento colapsado nao suprima transferencia legitima.
4. Aplicar teto rigido de probes por chat e budget diario, com fail-closed e registro minimalista; nao iniciar polling global.
5. Provar 1 transferencia->1 alerta; resposta antes do minuto->0; multiplos eventos->1; V2.3 sem duplicidade; reversibilidade.
6. Medir creditos por evento no Base44 e comparar ao V2.4 antigo; somente entao considerar deploy piloto LAB.
7. Revisar diferencas entre main e render-lab para nao sobrescrever handlers e nao interferir em trabalhos Supplier Shadow que estao em andamento.

**Nenhum dado real de clientes deve entrar nos testes. Nao registrar tokens/URLs com secrets.**

## Testes de codigo
Node 24+:
```bash
node --test tests/primeAlertV24LitePolicy.test.js
```

**Importante:** branch nao conecta automaticamente o helper; publicar a branch nao ativa um novo alerta.
