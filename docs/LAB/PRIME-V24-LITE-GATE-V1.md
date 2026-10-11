# PRIME ALERTA V2.4 LITE — checkpoint de segurança V1

Status: **LAB OFFLINE APENAS**. Nenhuma integração, trigger, secret, endpoint,
Telegram, Base44, Supabase ou GABY oficial foi alterada. V2.3 intacto.

## Evidência observada
Registros read-only `OperationalFastHandoffSignalAudit` com evento
`human_state_observed`: 44 observações (41 LAB, 3 produção), sendo 14 assistant,
9 tool, 16 system e 5 user; 16 observações sinalizaram transição e somente 5
registraram criação de watch. Isso demonstra fan-out e duplicidade de sinais,
mas **NÃO confirma** quais campos estão presentes no payload do webhook
`onNewMessage` atual; observações já são resultado do detector.

## Novo gate
1. Sinal precisa vir de transport autenticado e permitir confirmar agente oficial.
2. O modo conservador aceita apenas `TRANSFER_QUEUE` explícito, de role
   assistant/tool/system, como **candidato**, nunca alerta confirmado.
3. No modo `lab_shadow`, sinais non-user sem tipo podem virar candidatos para
   avaliar cobertura offline. Esta modalidade não é aprovada para produção.
4. Antes de consultar um único chat GPT Maker, backend precisa adquirir uma
   reserva atomica por hash HMAC SHA-256; nenhum ID bruto ou segredo no banco.
5. SQL de reserva é somente **PROPOSTA NÃO APLICADA**. Serializa por dia,
   limita a 10 probes/dia LAB, cooldown de 120s por chat e lease de 30s.
6. Após a leitura direcionada, exige `humanTalk=false->true`, `TRANSFER_QUEUE`
   recente, mensagem de cliente vinculada e ausência de incidente V2.3 ativo.
7. Watch de 1 minuto pode reutilizar componentes já existentes, mas integração
   ao fluxo real exige prova adicional de atomicidade de incidente, dedupe
   canônico e persistência no caminho de produção.

## Limitações explícitas
- Webhook onTransfer funcionou no Playground LAB, mas falhou em 2 transferências
  reais da GABY oficial via Z_API. Não usar como único sinal.
- `onNewMessage` sem `conversationNotificationType` não aciona probe no modo
  conservador; pode perder alertas rápidos. V2.3 continua como fallback.
- O schema SQL proposto NÃO foi aplicado nem validado em PostgreSQL real.
- Os 15 testes locais incluem um mock atômico em memória, NÃO prova de
  concorrência de banco PostgreSQL nem de idempotência entre workers.
- Sem chamada real de provider: consumo do novo fluxo NÃO foi mensurado.
- `render-lab` tem versão diferente do `main` de `api/onnewmessage.js`; não
  sobrescrever. Nenhuma alteração neste arquivo foi feita.

## Próximo gate
Validar de forma sanitizada e sem payload pessoal se o sinal real recebido
pelo endpoint `onNewMessage` contém `TRANSFER_QUEUE` no evento. Se não contiver,
reprojetar critério seletivo, sob teto estrito, sem varredura 24/7. Em seguida,
validar SQL em banco LAB isolado, conferir custos reais e só depois autorizar
qualquer integração de LAB, sem tocar V2.3.

## Arquivos
- `api/_primeAlertV24LitePolicy.js`: classificação fail-closed.
- `api/_primeAlertV24LiteLease.js`: HMAC + adaptação para reserva atômica injetada.
- `tests/primeAlertV24LiteGate.test.js`: 15 testes locais.
- `docs/LAB/SQL/prime_v24_lite_lab_atomic_gate.sql`: proposta SQL não executada.
