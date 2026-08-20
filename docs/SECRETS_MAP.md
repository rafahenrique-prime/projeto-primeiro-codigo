# IGNITE PRIME — SECRETS MAP

**Status do mapa:** criado no LOTE 001  
**Data:** 2026-08-20  
**Regra de segurança:** este arquivo contém somente nomes e relações estruturais. Não contém tokens, senhas, chaves, valores, payloads ou conteúdo de arquivos `.env`.

> **Decisão arquitetural oficial:** Bitwarden Secrets Manager é o **Source of Truth dos secrets técnicos do IGNITE PRIME**. A documentação anterior que apontava Apple Passwords ou outra fonte como autoridade foi preservada como contexto histórico, mas está **SUBSTITUÍDA pela política Bitwarden-first**. Este documento não migra, rotaciona, altera ou valida valores.

## Mapa estrutural

| Nome do secret/variável | Consumidor | Frontend/Backend | Ambiente | Fonte oficial | Situação | Risco |
|---|---|---|---|---|---|---|
| `VITE_GPTMAKER_TOKEN` | `src/services/chat/gptmaker.js` e frontend GPT Maker | Frontend | Bundle Vite/local/produção aparente | Bitwarden para o valor técnico; confirmar escopo | Nome usado client-side; exposição efetiva não confirmada | **ALTO** |
| `VITE_GPTMAKER_USER_TOKEN` | Cliente GPT Maker e `api/gptmaker-credits.js` | Frontend + serverless | Dashboard/local/produção aparente | Bitwarden | Token com prefixo `VITE_`; arquitetura precisa de confirmação | **ALTO** |
| `VITE_GPTMAKER_EMAIL` | Cliente/admin GPT Maker | Frontend | Local/bundle potencial | Bitwarden se tratado como credencial; não registrar valor | Credencial estrutural documentada | **ALTO** |
| `VITE_GPTMAKER_PASSWORD` | Cliente/admin GPT Maker | Frontend | Local/bundle potencial | Bitwarden | Nome indica senha em variável `VITE_`; presença efetiva não confirmada | **CRÍTICO** |
| `VITE_GPTMAKER_WORKSPACE` | Cliente GPT Maker | Frontend | Local/produção aparente | Bitwarden ou configuração pública, conforme classificação do owner | Identificador; sensibilidade não confirmada | **MÉDIO** |
| `VITE_SUPABASE_URL` | Cliente Supabase | Frontend | Bundle/local/produção | Configuração pública ou Bitwarden conforme classificação formal | URL de projeto, não é secret por si só | **BAIXO/MÉDIO** |
| `VITE_SUPABASE_KEY` | Cliente Supabase | Frontend | Bundle/local/produção | Bitwarden para governança do valor; escopo público deve ser confirmado | Chave client-side; privilégio efetivo não confirmado | **ALTO** |
| `SUPABASE_KEY` | APIs e scripts Supabase | Backend/scripts | Vercel/local | Bitwarden | Server-side aparente | **ALTO** |
| `SUPABASE_SECRET_KEY` | APIs administrativas Supabase | Backend | Vercel/local | Bitwarden | Server-side sensível | **CRÍTICO** |
| `VITE_GROQ_API_KEY` | Cliente/diagnóstico Groq conforme arquivos | Frontend + diagnóstico | Bundle/local/produção aparente | Bitwarden | Consumidor e exposição efetiva devem ser confirmados | **ALTO** |
| `VITE_DEEPSEEK_API_KEY` | Serviços/cliente DeepSeek conforme referências | Frontend/serviços | Bundle/local | Bitwarden | Uso efetivo em produção não confirmado | **ALTO** |
| `VITE_OPENROUTER_KEY` | Serviços/healthcheck/cliente OpenRouter | Frontend + backend | Bundle/local/Vercel | Bitwarden | Risco client-side potencial | **ALTO** |
| `COHERE_API_KEY` | `api/embed-knowledge.js` | Backend | Vercel/local | Bitwarden | Server-side aparente | **ALTO** |
| `PERPLEXITY_API_KEY` | Healthcheck/diagnóstico Perplexity | Backend | Vercel/local | Bitwarden | Consumidor de diagnóstico | **ALTO** |
| `VITE_GOOGLE_DRIVE_API_KEY` | Catálogo rascunho/catalogo público | Frontend/static | Bundle/catalogo público | Bitwarden ou configuração pública conforme classificação do owner | Configuração potencialmente pública | **MÉDIO/ALTO** |
| `VITE_GOOGLE_DRIVE_FOLDER_ID` | Catálogo rascunho/catalogo público | Frontend/static | Bundle/catalogo público | Configuração documentada; Bitwarden se classificada como técnica | Identificador de pasta | **MÉDIO** |
| `GOOGLE_OAUTH_CLIENT_ID` | Scripts OAuth/Drive | Backend/scripts | Local/operacional | Bitwarden | Identificador OAuth | **MÉDIO** |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Scripts OAuth/Drive | Backend/scripts | Local/operacional | Bitwarden | Secret server-side | **CRÍTICO** |
| `CRON_SECRET` | `stuck-check` e healthcheck | Backend/workflow | GitHub Actions/Vercel | Bitwarden | Rota/dispatcher de cron | **ALTO** |
| `BAGY_SYNC_SECRET` | Sync/auditoria Bagy | Backend/workflow | Vercel/operacional | Bitwarden | Integração de catálogo | **ALTO** |
| `BAGY_UI_ACTION_SECRET` | `bagy-sync-run-ui` | Backend/UI | Vercel/operacional | Bitwarden | Ação manual/controlada | **ALTO** |
| `MCP_LITE_SECRET` | `system-tools?tool=mcp` | Backend/MCP | Vercel/operacional | Bitwarden | Tool interna | **ALTO** |
| `NEX_SYNC_SECRET` | `system-tools?tool=nex` | Backend | Vercel/operacional | Bitwarden | Integração NEX | **ALTO** |
| `BRIDGE_TOOLS_SECRET` | Prime Bridge/`consultar-produto` | Backend/POC | Vercel/preview | Bitwarden | POC/preview; rotação não autorizada neste lote | **ALTO** |
| `BRIDGE_MODE` | Handler do Prime Bridge | Backend | Preview/homologação | Configuração controlada; não é secret | Modo de operação | **MÉDIO** |
| `ALERTA_INTELIGENTE_SECRET` | Tool de alerta e Telegram | Backend | Vercel/Gaby Lab | Bitwarden | Integração de alertas | **ALTO** |
| `MENSAGEM_MANUAL_SERVICE_TOKEN` | Base44 e `system-tools?tool=mensagem-manual` | Backend/Base44 | Produção controlada/lab | Bitwarden | Token de serviço | **CRÍTICO** |
| `WHATSAPP_INTERNAL_TOKEN` | Função Base44/provider interno | Backend/Base44 | Produção controlada | Bitwarden | Provider de envio manual | **CRÍTICO** |
| `ZAPI_TOKEN` | POC/provider ZAP-API | Backend/POC | Preview/lab | Bitwarden | Provider WhatsApp experimental | **CRÍTICO** |
| `WEBHOOK_PATH_SECRET` | Webhook/rotas documentadas | Backend | Vercel | Bitwarden | Segredo estrutural de rota | **ALTO** |
| `VERCEL_TOKEN` | Scripts/deploy/diagnóstico | Backend/scripts | Local/CI | Bitwarden | Operacional de deploy | **CRÍTICO** |
| `VERCEL_ORG_ID` | Deploy Vercel | Scripts/CI | Local/CI | Bitwarden ou configuração não sensível, conforme owner | Identificador de organização | **MÉDIO** |
| `VERCEL_PROJECT_ID` | Deploy Vercel | Scripts/CI | Local/CI | Bitwarden ou configuração não sensível, conforme owner | Identificador de projeto | **MÉDIO** |
| `TELEGRAM_BOT_TOKEN` | Cron/alertas Telegram | Backend | Vercel/local | Bitwarden | Token de bot | **CRÍTICO** |
| `TELEGRAM_CHAT_ID` | Destino de alertas | Backend | Vercel/local | Bitwarden ou configuração controlada | Identificador operacional | **MÉDIO** |

## Política documental

`docs/SECURITY/SECRETS.md` permanece como referência histórica de taxonomia e incidentes, mas sua indicação de Apple Passwords como Source of Truth foi substituída. `docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md` é a referência especializada atual para Bitwarden-first, sync controlado e limites de comparação.

O prefixo `VITE_` não deve ser usado como prova de que um valor foi exposto, mas indica que a variável pode ser incorporada ao bundle do frontend. A confirmação segura futura deve verificar apenas presença, escopo e privilégio — sem imprimir valores — e deve ocorrer antes de qualquer rotação ou alteração.

## Proibições deste mapa

Este arquivo não autoriza buscar valores, fazer login, rotacionar tokens, migrar secrets, alterar `.env`, alterar Vercel, alterar Base44, modificar GPT Maker, publicar credenciais ou testar chamadas contra providers. Qualquer discrepância é **ACHADO PARA LOTE FUTURO** até autorização específica.
