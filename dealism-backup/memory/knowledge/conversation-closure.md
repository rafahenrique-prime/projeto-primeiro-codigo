### 2026-05-07 [conversation-closure-policy] [investigation] [chat]
**chunk_id**: auto-generated
**file_path**: knowledge/conversation-closure.md
**content_hash**: auto-generated
**category**: knowledge
**content_category_tags**: policy
**product_or_service**: Política de Encerramento de Atendimento
**search_keys**: atendimento finalizado, encerrar conversa, parar follow-up, conversation closure, stop automation
**index_text**: Política de encerramento automático de atendimento. Quando o atendimento é considerado finalizado e como parar mensagens automáticas repetidas.
**source_type**: text
**asset_path**: workspace/unknown

**POLÍTICA DE ENCERRAMENTO DE ATENDIMENTO**

**Objetivo:**
Evitar que clientes recebam mensagens automáticas repetidas após finalização do atendimento.

**Quando considerar atendimento FINALIZADO:**
1. ✅ Cliente confirmou que não quer mais nada ("tá ok", "obrigado", "não precisa mais")
2. ✅ Pagamento confirmado + mensagem pós-venda enviada
3. ✅ Cliente parou de responder por mais de 24h após última interação completa
4. ✅ Cliente explicitamente disse "não quero mais", "depois eu volto", "vou pensar"

**Quando NÃO considerar finalizado:**
1. ❌ Cliente ainda está fazendo perguntas
2. ❌ Cliente pediu para "aguardar" mas não finalizou
3. ❌ Cliente está no meio de processo de compra (escolhendo produtos, cores, tamanhos)
4. ❌ Cliente aguardando resposta do vendedor (humano)

**Sistema de Follow-up Automático:**
- **Script:** `workspace/scripts/monitor_followups.py`
- **Frequência:** A cada 5 minutos
- **Gatilhos:**
  - 30 minutos sem resposta → "Ainda está por aí?"
  - 23h45min sem resposta → "Lembrete antes de 24h"
  - 24h sem resposta → "Follow-up final"

**Como PARAR mensagens automáticas:**
1. Marcar conversa como "finalizada" → ainda não implementado (ver solução abaixo)
2. Cliente responde qualquer coisa → timer reseta

**PROBLEMA IDENTIFICADO: Cliente Phietra Marques (553498436205)**
- **Situação:** Cliente recebeu mensagens automáticas DEPOIS de finalizar atendimento
- **Causa raiz:** Sistema de follow-up não detecta "atendimento finalizado"
- **Última mensagem da Gabriela:** 2026-05-07 16:33:56 (20 minutos atrás)
- **Comportamento esperado:** NÃO enviar mais mensagens automáticas

**SOLUÇÃO IMPLEMENTADA:**

**Nova regra de encerramento automático:**
1. Se última mensagem do cliente foi confirmação passiva ("tá ok", "obrigado", "pode ser")
2. E última mensagem da Gabriela foi pós-venda OU despedida
3. E passou mais de 1 hora sem nova interação
4. → Marcar como "atendimento_finalizado" e PARAR follow-ups

**Implementação técnica:**
- Adicionar campo `"status": "active" | "closed"` no USER.md de cada buyer
- Modificar `monitor_followups.py` para verificar status antes de enviar
- Quando detectar encerramento natural, atualizar status para "closed"

**Comandos para vendedor:**
- "Encerra atendimento [nome]" → Para follow-ups daquele cliente
- "Reativa atendimento [nome]" → Volta a enviar follow-ups

**IMPORTANTE:**
Esta política se aplica APENAS a follow-ups automáticos. Se o vendedor enviar mensagem manual via "sessions_send", a mensagem SEMPRE deve ser enviada independente do status.
