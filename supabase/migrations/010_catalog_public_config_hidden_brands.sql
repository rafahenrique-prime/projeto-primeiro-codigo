-- Inverte a semântica da config do catálogo público: de "lista de permitidos" pra "lista de escondidos".
-- Motivo: com lista de permitidos, toda pasta nova no Drive fica invisível até ser marcada manualmente.
-- Com lista de escondidos, vazio = nada escondido = mostra tudo (inclusive pastas novas), e só
-- marca-se o que você quer ocultar temporariamente. Rodar manualmente no SQL Editor do Supabase.

alter table catalog_public_config rename column visible_brands to hidden_brands;
