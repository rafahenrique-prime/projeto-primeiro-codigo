-- Adiciona a coluna telefone em customer_profiles — capturado junto com context_id
-- no caminho automático do webhook (api/_profileIdentity.js), Fase 2A. Coluna nullable,
-- sem default, sem índice — mesma lógica de baixo risco da migration 011 (context_id).
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas).

alter table customer_profiles
add column telefone text;
