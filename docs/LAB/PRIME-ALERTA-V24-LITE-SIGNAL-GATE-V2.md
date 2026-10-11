# PRIME ALERTA V2.4 LITE — Validação dos sinais e observador offline

Status: LAB OFFLINE. Sem instalação de webhooks, sem endpoints ativos, sem Telegram, sem SQL aplicado.

## Fontes lidas
- GPT Maker: chat piloto histórico 5348, páginas 1 e 2, 81 mensagens retornadas.
- Contagem dos campos de notificação das mensagens: 10 TRANSFER_QUEUE; 18 TRANSFER_AGENT; 18 START_INTERACTION_HUMAN; outros registros.
- TRANSFER_QUEUE foi visto como notification de mensagens com role=system.
- **Amostra de mensagens, não do payload HTTP onNewMessage.** A equivalência não está comprovada.
- Vercel Hobby: logs históricos fora da janela de retenção (1 hora). Consulta de 7d/1d falhou por limite do plano.
- Supabase PRIME CATALOGO LAB: projeto INACTIVE; não reativado. Banco de produção não tocado.

## Implementação de observação sanitizada
- api/_primeAlertV24LiteSignalShape.js é uma função pura e desligada, destinada somente ao futuro teste de forma do payload.
- Não imprime texto, telefone, IDs, tokens ou chaves arbitrárias. Retorna apenas enums conhecidos e sinalização booleana.
- tests/primeAlertV24LiteSignalShape.test.js adiciona cinco testes, incluindo proteção contra vazamento de PII.
- 20 testes totais (15 existentes + 5 novos) passaram no Node.js v22.16.0.

## Decisões de segurança
- Não modificar main nem render-lab, o webhook da Gaby oficial ou o V2.3.
- Não reativar as 10 rotinas de polling V2.4 nem qualquer outra rotina pausada.
- Não conectar o observador a serviços reais sem aprovação de um gate LAB e novo teste de isolamento.
- Não executar a proposta SQL do gate sem banco LAB ativo isolado e validação transacional real.
- Não concluir que o onNewMessage envia TRANSFER_QUEUE apenas porque o GPT Maker persiste o evento nas mensagens.
- Se o sinal não existir no webhook, avaliar mecanismo alternativo seletivo sob teto rígido de custo; V2.3 é fallback permanente.

## Próximo gate
Prova controlada em GABY LAB (nunca oficial), sem mudar seu onNewMessage existente, usando estrutura de webhook já autorizada ou ambiente de teste isolado. Primeiro confirmar presença/ausência de notificationType; só depois conectar HMAC + reserva transacional, medir custo e simular 1-min alert sem entrega real.
