# PRIME ALERTA V2.4 LITE V5 — messages-first

LAB OFFLINE apenas. Sem webhook, Base44, GPTMaker, Telegram, V2.3, Render LAB ou banco ativados. As 10 rotinas V2.4 antigas continuam pausadas.

**Evidência real**: no atendimento #2629, o histórico GPT Maker guardou TRANSFER_QUEUE (02:48:41Z) e humanTalk=true, enquanto o webhook Render LAB recebeu 3 sinais não-user sem tipo.

**Estratégia**: após candidato autenticado e pré-reservado atomicamente, consultar primeiro somente as mensagens daquela conversa exata. Sem TRANSFER_QUEUE recente -> interromper depois de UMA leitura. Se existir, confirmar metadados diretamente por ID, estado humanTalk, interação e dedupe V2.3, até QUATRO chamadas a adapters. **Nunca utilizar readFastChatById existente**, porque ele percorre páginas de conversas.

**Bloqueios restantes**: reserva diária atômica no LAB não implementada nem testada em Postgres; endpoint exato de metadados do chat GPTMaker ainda não comprovado. Portanto, sem endpoint específico confirmado, falhar fechado após uma leitura no simulador. Nenhum alerta nem watch é criado, inclusive quando confirmed=true. Sem qualquer medição de custo real.

13 testes sintéticos offline no Node v22.16.0: caminhos, reprodução dos horários #2629, orçamento negado, sem fallback, dedupe, baseline, privacidade e não ativação. Estes testes não comprovam atomicidade entre servidores nem contratos de API reais.
