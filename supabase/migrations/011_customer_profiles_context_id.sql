-- Adiciona a coluna context_id em customer_profiles — preparação futura para memória
-- persistente do agente (identificador vindo do webhook do GPT Maker, ${contextId}).
-- Não substitui conv_id nem altera nenhum fluxo existente: coluna nullable, sem default,
-- sem índice — registros antigos continuam funcionando normalmente sem esse valor.
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas).

alter table customer_profiles
add column context_id text;
