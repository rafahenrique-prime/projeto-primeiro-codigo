# Lições Aprendidas — Migração do `whatsappProvider` de Z-API para ZAP-API

**Data da investigação:** 2026-07-29
**Commit da correção:** `edd5f0e`
**Status:** Resolvido
**Categoria:** WhatsApp, Base44, Integrações
**Impacto:** Envio automático de lembrete de cobrança via WhatsApp (`lembreteCobrancas`) ficava indisponível — nenhum cliente real chegou a ser afetado (o piloto ainda opera só sobre um telefone de teste, `WHATSAPP_TEST_PHONE`). Envio manual não foi afetado durante a maior parte da investigação, mas ambos dependiam da mesma instância comprometida.
**Palavras-chave:** whatsapp, zap-api, z-api, whatsappprovider, provider, migração, secrets, base44, lembretecobrancas, cobranças
**Arquivos relacionados:** `base44/functions/whatsappProvider/main.ts`, `base44/functions/lembreteCobrancas/main.ts`, `base44/functions/enviarMensagemManualWhatsapp/main.ts`, `api/_mensagemManualProxy.js`, `api/system-tools.js`, `docs/integrations/GPTMAKER-ZAPAPI-POC.md`

---

## 1. Qual era o sintoma observado?

O envio automático de WhatsApp (`lembreteCobrancas` → `whatsappProvider`) retornava `HTTP 400` / `error_code: bad_request` ao tentar enviar uma mensagem de teste, enquanto o envio manual (validado numa sessão anterior) funcionava normalmente. Uma auditoria anterior já havia confirmado que os dois fluxos usavam o mesmo `whatsappProvider`, mesmo endpoint, mesmas credenciais e mesma instância — o que tornava o sintoma aparentemente contraditório.

## 2. Qual hipótese inicial parecia correta mas depois foi descartada?

A hipótese inicial, bem fundamentada em evidência de código, era que **o payload divergia entre os dois fluxos** — especificamente que o automático enviava `message_type: "pix_text"` (2 chamadas, incluindo o código Pix Copia e Cola bruto como corpo de uma das mensagens) enquanto o manual enviava só `message_type: "text"` (1 chamada). Essa hipótese foi construída em cima do arquivo `base44/functions/whatsappProvider/main.ts` **local**, que continha essa lógica completa. Ela foi descartada quando um pull isolado e autenticado direto do Base44 revelou que **a função realmente publicada não tinha `message_type`, `pix_text` nem `pix_copia_cola` — nenhum desses dois** — ou seja, a comparação inicial estava correta *sobre o código local*, mas o código local não representava o que estava de fato em produção.

## 3. Qual foi a causa raiz verdadeira?

A instância da **Z-API** (`api.z-api.io`) configurada nos secrets do Base44 (`ZAPI_INSTANCE_ID`/`ZAPI_INSTANCE_TOKEN`/`ZAPI_CLIENT_TOKEN`) estava com a **assinatura vencida**. A própria Z-API respondia `HTTP 400` com a mensagem `"To continue sending a message, you must subscribe to this instance again"`. Não era um bug de código — era uma condição de conta/assinatura de um provedor externo. O manual e o automático usavam a mesma instância (mesmo `whatsappProvider`), então ambos teriam falhado da mesma forma se testados no mesmo momento; a diferença observada inicialmente (manual funcionando, automático falhando) refletia apenas **o tempo decorrido entre os dois testes**, não uma diferença estrutural entre os fluxos.

## 4. Como ela foi descoberta?

Em etapas, cada uma reduzindo uma camada de incerteza:
1. Comparação de código local (produziu a hipótese do item 2, depois invalidada).
2. Pull isolado e autenticado do Base44 (nunca sobrescrevendo o projeto local) — revelou que o código publicado era muito mais simples do que o local, e que **duas funções esperadas (`enviarMensagemManualWhatsapp`, `enviarConfirmacaoPagamentoWhatsapp`) nem existiam no app vinculado**.
3. Instrumentação temporária (`console.log` sanitizado, removido logo depois) no `whatsappProvider` publicado, capturando o `responseBody` real da chamada ao provedor externo.
4. Um teste controlado (`lembreteCobrancas` invocado com `{isTest: true}`) reproduziu o erro ao vivo e o log capturou a mensagem exata da Z-API — a causa raiz apareceu em texto simples, sem necessidade de mais inferência.
5. Confronto com o painel visual do usuário ("ZAP-API conectada, trial ativo") revelou a confusão de nomes entre dois provedores diferentes (ver item 12).

## 5. Quais auditorias foram importantes?

- **Auditoria de fonte da verdade** (comparar `git log`/`git status` do `base44/functions/` contra o que realmente está publicado) — revelou que **todo o diretório nunca foi versionado no Git**, então nenhuma comparação de código local podia ser tratada como autoritativa sem confirmação direta no Base44.
- **Pull isolado repetido** (em pastas temporárias descartáveis, nunca sobrescrevendo `base44/functions/` real) — o mecanismo central que permitiu comparar código local × live com segurança, sem risco de corromper o estado do projeto.
- **Auditoria de secrets** (`base44 secrets list`, só nomes) — revelou que **dois conjuntos completos de credenciais** (Z-API e ZAP-API) coexistiam no mesmo app, e que um secret (`WHATSAPP_PROVIDER`) já existia mas não tinha efeito nenhum no código publicado.

## 6. Quais erros evitamos durante a investigação?

- **Não tratamos o código local como verdade absoluta** — quando o Base44 (via relato do usuário) contradisse a análise inicial, paramos e reauditamos em vez de insistir na primeira hipótese.
- **Nunca sobrescrevemos `base44/functions/` real durante os pulls** — todo pull de verificação foi feito em pastas isoladas (`.tmp/`), descartáveis, com seu próprio `base44/config.jsonc`/`--app-id`.
- **Não publicamos a versão expandida "de uma vez"** — a tentação de simplesmente publicar o rascunho local completo (que já "parecia" ter a lógica de multi-provider pronta) foi resistida em favor de um patch cirúrgico (ver item 7).
- **Não fizemos deploy em lote** — cada deploy/pull/teste foi de uma função por vez, nomeada explicitamente, sem `--force` (que apagaria funções remotas não presentes localmente).
- **Reconhecemos e relatamos um erro operacional próprio** — uma tentativa de teste controlado disparou 2 chamadas reais em vez de 1 (por uma falha de serialização local no script, não no código auditado); isso foi admitido explicitamente, não escondido.

## 7. Por que o patch mínimo foi escolhido em vez da versão expandida?

A versão local expandida trazia, junto da correção necessária (trocar Z-API por ZAP-API), **funcionalidades completamente não relacionadas e nunca testadas em produção**: dispatcher multi-provider, suporte a `message_type`/`pix_text` (envio de Pix dinâmico em 2 mensagens) e uma ação `action:"status"` nova. Publicar tudo isso de uma vez misturaria 3 mudanças de risco e escopo diferentes num único deploy, dificultando isolar a causa se algo desse errado. O patch mínimo trocou só os 4 pontos estritamente necessários (secrets, endpoint, headers, payload), preservando 100% da validação, autenticação, idempotência e formato de resposta já em produção — menor superfície de risco, rollback trivial (bastava reverter para o SHA-256 original já registrado).

## 8. Como foi validada a correção?

1. Deploy isolado só da função `whatsappProvider` (nunca em lote).
2. Pull isolado pós-deploy confirmando, por SHA-256, que o publicado era byte a byte igual ao patch aplicado.
3. Teste controlado único (`lembreteCobrancas` com `{isTest: true}`), usando exclusivamente a parcela de teste "RAFAEL TESTE" (nunca um cliente real) — mesmo mecanismo de teste já embutido na função, não uma invenção nova.
4. Confirmação de `HTTP 200` e `message_id` real retornado pela ZAP-API.
5. Confirmação manual do usuário de recebimento real no telefone de teste.
6. Confirmação de que os registros esperados (`HistoricoEnvioWhatsApp`, `LogNotificacao`) foram criados com `status: "sucesso"`.

## 9. Boas práticas definidas para futuras migrações de provider

- **Nunca confiar em código local não versionado como fonte da verdade** — sempre confirmar com um pull isolado e autenticado antes de agir.
- **Isolar toda verificação em pastas descartáveis** — nunca sobrescrever o diretório real do projeto durante uma investigação.
- **Migrar credenciais/endpoint em um patch cirúrgico, separado de qualquer funcionalidade nova** — mesmo que uma versão "mais completa" já exista pronta, publicar só o necessário para resolver o problema atual.
- **Guardar o hash (SHA-256) da versão anterior antes de qualquer deploy**, para rollback imediato e verificável.
- **Testar com um único registro de teste identificado**, nunca em lote e nunca contra clientes reais.
- **Instrumentação temporária de observabilidade deve ser sanitizada antes de publicar** (mascarar tokens/segredos) e **removida imediatamente depois de capturar a evidência necessária** — nunca deixada em produção "só por precaução".

## 10. Checklist para migração de integrações externas

- [ ] Confirmar, com uma chamada real e autenticada (não só leitura de código local), qual é o comportamento *atualmente publicado*.
- [ ] Levantar todos os secrets relacionados (nomes apenas) e identificar se há conjuntos de credenciais duplicados/órfãos de uma migração anterior incompleta.
- [ ] Isolar a menor mudança possível que resolve a causa raiz, sem empacotar funcionalidades não relacionadas.
- [ ] Guardar hash/SHA-256 da versão anterior antes de qualquer deploy.
- [ ] Publicar/testar uma função por vez, nunca em lote, nunca com flags que possam apagar outras funções.
- [ ] Validar com um teste único, controlado, com destinatário de teste explicitamente identificado.
- [ ] Confirmar os efeitos colaterais esperados (registros de histórico/log) antes de considerar a migração concluída.
- [ ] Atualizar comentários/documentação que mencionem o provedor antigo, para não confundir a próxima pessoa que ler o código.
- [ ] Registrar a decisão e a evidência (causa raiz real, não hipótese) em um documento de fácil acesso futuro.

## 11. Melhorias arquiteturais identificadas para uma fase futura (fora desta correção)

- `base44/functions/` nunca foi versionado no Git — todo o histórico de decisões sobre essas funções depende de memória/documentação, não de `git log`. Vale avaliar formalmente se deve passar a ser versionado.
- O card "PRIME Cobranças Status" (`?tool=prime-cobrancas-status`) chama `whatsappProvider action:"status"` — uma ação que **não existe na versão publicada hoje**; a função real provavelmente recebe uma resposta de validação de mensagem malformada em vez de um status de conexão real. Precisa de investigação e correção própria, separada desta.
- `enviarMensagemManualWhatsapp` e `enviarConfirmacaoPagamentoWhatsapp` não aparecem no `functions list` do app vinculado, apesar de terem sido usadas com sucesso numa sessão anterior — permanece sem explicação definitiva (função removida? listagem incompleta?).
- Comentários mencionando "Z-API" ainda existem em `api/system-tools.js`, `src/services/crm/primeCobrancasStatusService.js`, e possivelmente `PROJECT_CONTEXT.md`/`api/cron-diagnosis.js` (estes dois últimos com ambiguidade não resolvida sobre se se referem a este mesmo piloto ou a um canal diferente, Gabriela/GPT Maker).
- `main.original.ts`/`main.esbuild-output.js` (dentro de `base44/functions/whatsappProvider/`) ficaram desatualizados após esta migração — decidir se são regenerados, arquivados ou removidos.
- O secret `WHATSAPP_PROVIDER` existe no Base44 mas não é lido por nenhum código publicado hoje — ou remover, ou usar de fato (se um dispatcher multi-provider for revisitado no futuro, de forma isolada e testada).

## 12. O que aprendemos sobre Z-API × ZAP-API neste projeto

São **dois provedores de API para WhatsApp completamente diferentes**, com nomes propositalmente parecidos:

| | Z-API | ZAP-API |
|---|---|---|
| Domínio | `api.z-api.io` | `api.zap-api.tech` |
| Autenticação | Header `Client-Token` + `instanceId`/`instanceToken` no path da URL | Header `Authorization: Bearer {token}` |
| Payload de envio | `{ phone, message }` | `{ phone, type: "text", body: message }` |
| Secrets neste projeto | `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN` | `ZAPAPI_INSTANCE_ID`, `ZAPAPI_TOKEN` |

O projeto tinha **secrets de ambos configurados simultaneamente**, o que por si só já era um sinal de migração incompleta. O painel que o usuário consultava para verificar "conexão/trial ativo" era da **ZAP-API**, mas o código publicado até este momento chamava exclusivamente a **Z-API** — daí a aparente contradição entre "painel diz que está tudo certo" e "erro real de assinatura vencida": eram dois serviços diferentes, e só um deles (o que o código realmente usava) estava com problema.

---

## Resumo Executivo

O envio automático de WhatsApp (`lembreteCobrancas`) falhava com HTTP 400, enquanto o manual funcionava — mesma função, mesmas credenciais, segundo auditoria anterior. A hipótese inicial (payload `pix_text` divergente) foi descartada ao confirmar, via pull isolado e autenticado do Base44, que o código local analisado não era o publicado. A causa raiz real: a instância **Z-API** configurada tinha assinatura vencida (erro "subscribe again" da própria Z-API), enquanto o painel que o usuário conferia era de um provedor diferente, a **ZAP-API** — cujos secrets já existiam no projeto, mas nunca eram usados pelo código publicado. Aplicamos um patch mínimo (só credenciais/endpoint/headers/payload), publicado isoladamente, validado com um teste único controlado (RAFAEL TESTE): HTTP 200, `message_id` real, recebimento confirmado, registros de histórico criados. A versão local foi sincronizada, comentários desatualizados corrigidos, e a correção registrada no commit `edd5f0e` — sem push. Pendências identificadas (não corrigidas agora): possível quebra do card de status, funções ausentes no `functions list`, comentários residuais em outros arquivos, e destino dos arquivos de backup agora desatualizados.
