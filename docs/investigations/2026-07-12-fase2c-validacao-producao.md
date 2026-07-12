# Fase 2C — Validação final em produção

**Data:** 2026-07-12
**Status:** encerrado. `onNewMessage` ativo em produção, apontando para `api/onnewmessage.js`.
**Commit avaliado:** `faa8121` (`feat/fase2c-profile-learning`), implantado isoladamente via worktree `../fase2c1-probe-fix`.

---

## 1. Objetivo

Validar em produção, com dados sintéticos controlados e depois com um teste real de ponta a ponta, a cadeia completa: `onNewMessage → api/onnewmessage.js → api/_profileLearning.js → apply_profile_size_learning (migration 013) → customer_profiles/profile_learning_audit`.

## 2. Incidente encontrado e corrigido durante a validação

**Sintoma:** o primeiro teste controlado com perfil sintético (`conv_id = TESTE-2C-FINAL-CTX-0001`, `size` inicial `G`) retornou `HTTP 200` no `POST /api/onnewmessage`, `last_seen` foi atualizado corretamente (prova de que `upsertIdentity()` funcionou), mas `customer_profiles.size` permaneceu `G` e `profile_learning_audit` ficou com 0 linhas.

**Investigação:**
- Log da chamada mostrou a cadeia parando em `findProfile()`, com o evento `profile_not_found_after_identity` — ou seja, `_profileLearning.js` não encontrou o mesmo perfil que `upsertIdentity()` acabara de atualizar.
- Testes HTTP isolados e sanitizados (fora da função de produção, usando a `SUPABASE_SECRET_KEY` manualmente) confirmaram que a Secret Key conseguia ler `customer_profiles` normalmente — descartando permissão/RLS/perfil inexistente como causa.
- Instrumentação temporária foi adicionada a `findByContextId`/`findByConvId` (nunca commitada, removida ao final), registrando por chamada: `stage`, `httpStatus`, `rowCount`, `isArray`, e três booleanos derivados de `VITE_SUPABASE_URL` sem nunca revelar o valor (`urlPresent`, `urlHasOuterWhitespace`, `urlEndsWithSlash`, `projectRefMatches`).
- Resultado: ambas as buscas (`context_id` e `conv_id`) retornavam **HTTP 401**. Como `findByContextId`/`findByConvId` tratam qualquer `!res.ok` como `null` (comportamento existente, não alterado), o 401 virava silenciosamente "perfil não encontrado" — enquanto `upsertIdentity()` (com a `anon` key, não a Secret Key) continuava funcionando normalmente, o que mascarava o problema.

**Causa raiz confirmada:** a variável `SUPABASE_SECRET_KEY` configurada em **Production na Vercel** estava incorreta/desatualizada — não é um problema de código, migration, RLS ou permissão do banco.

**Correção:** a variável foi **recriada em Production** com o valor correto (Rafael executou a rotação manualmente, sem que o valor passasse em nenhum momento por este assistente). Nenhuma mudança de código, migration ou permissão foi necessária.

**Confirmação empírica pós-correção:** o mesmo POST sintético, reenviado após o redeploy com a chave corrigida, retornou `profile_lookup_result` com `httpStatus: 200`, `rowCount: 1`, `isArray: true`, e a cadeia completou com `rpc_applied`.

## 3. Testes controlados com perfil sintético (pós-correção)

| Teste | `messageId` | Resultado | Auditorias após | `size` após |
|---|---|---|---|---|
| `applied` | `TESTE-2C-FINAL-MSG-0001` | `rpc_applied` | 1 | `41` (de `G`) |
| `duplicate` | `TESTE-2C-FINAL-MSG-0001` (repetido) | `rpc_duplicate` | 1 (sem nova linha) | `41` |
| `unchanged` | `TESTE-2C-FINAL-MSG-0002` (novo, mesmo valor `41`) | `rpc_unchanged` | 1 (sem nova linha) | `41` |

Dados sintéticos (`conv_id = TESTE-2C-FINAL-CTX-0001`) removidos ao final — `audit_count = 0` e `profile_count = 0` confirmados no Supabase.

## 4. Remoção da instrumentação temporária

A instrumentação de diagnóstico (`EXPECTED_PROJECT_REF`, `urlDiagnostics()`, `logLookupResult()`, logs `profile_lookup_result`) foi removida por completo antes do deploy final — `api/_profileLearning.js` restaurado byte a byte ao estado do commit `faa8121` (`git checkout -- api/_profileLearning.js`, confirmado por `git diff faa8121` vazio). A instrumentação nunca foi commitada.

## 5. Teste real de ponta a ponta

Com `onNewMessage` já ativo em produção, Rafael executou um teste real no próprio WhatsApp (perfil real, não sintético):

1. Mensagem neutra ("Oi") → sem sinal de tamanho, `extractSize()` retornou `null`, nenhum log de `ProfileLearning`, nenhum I/O — comportamento correto.
2. Resposta da Gabriela → `role: assistant`, ignorada (`ignored_non_user_role`).
3. Declaração real de tamanho ("Meu tamanho é 41.") → cadeia completa, `rpc_applied` (`contextHash: h:99f3c0780d`, `messageHash: h:27fbce3fa7`).
4. Resposta da Gabriela → ignorada novamente, sem qualquer interferência perceptível na conversa.
5. Confirmado no Supabase: perfil real com `size = 41`, `last_seen` no horário exato do teste.

## 6. Conclusão

A Fase 2C está **encerrada e validada em produção**. `onNewMessage` ativo apontando para `https://ignite-webhook.vercel.app/api/onnewmessage`, nenhum outro campo de webhook do GPT Maker foi alterado. O único incidente da validação (Secret Key incorreta em Production) foi de configuração, não de código, e já está corrigido e confirmado por teste real de ponta a ponta.
