-- Fase Ligar-Fios — libera leitura de profile_learning_audit para a chave anon
-- A tabela foi criada em 013 com RLS habilitada e zero policies (só service_role
-- conseguia ler/escrever). Isso bloqueava qualquer tela do painel React de
-- mostrar esse histórico, já que o frontend usa a chave anon (VITE_SUPABASE_KEY).
-- Esta migration libera SOMENTE leitura (select) para anon/authenticated — não
-- libera insert/update/delete, que continuam exclusivos de service_role.
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas).

create policy "allow_select_profile_learning_audit"
  on public.profile_learning_audit
  for select
  to anon, authenticated
  using (true);
