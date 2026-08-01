# Arquitetura de Segredos — IGNITE PRIME

**Criado em:** 2026-08-01
**Última revisão:** 2026-08-01 (revisão textual/estrutural — classificação por categoria, fonte da verdade, processo fechado de criação)
**Escopo:** inventário completo de credenciais do projeto (`api/`, `poc/zap-gptmaker-bridge/`, `scripts/`, frontend `src/`), sua arquitetura de autenticação e a política de rotação/isolamento adotada.

Este documento **nunca contém valores reais de segredo** — só nomes de variáveis, responsabilidades e arquitetura. Os valores em si nunca vivem aqui (ver §2 — Fonte da verdade).

---

## 1. Princípio arquitetural: "uma integração → um segredo"

Confirmado por auditoria direta do código (`api/system-tools.js`, `poc/zap-gptmaker-bridge/server.mjs`) em 2026-08-01: o projeto segue, sem exceção, a regra de que **cada integração/consumidor externo tem seu próprio segredo, nunca compartilhado com outro**. Isso vale inclusive dentro de uma mesma rota — `gerar-cobranca-lyra` usa dois segredos diferentes (`GERAR_COBRANCA_SECRET` para o modo admin, `COBRANCA_FRONTEND_TOKEN` para o modo frontend) mesmo autenticando o mesmo endpoint, porque são dois chamadores com níveis de confiança diferentes.

**Toda nova integração deve seguir este padrão.** Reutilizar um segredo existente para uma finalidade nova é a exceção que este documento existe para impedir.

---

## 2. Fonte da verdade

Decisão registrada nesta revisão:

- **Apple Passwords** — fonte da verdade dos **valores reais** de todo segredo compartilhado/Bearer que exige entrega a um operador humano (ver categoria "segredo real server-side" no §3). É onde o valor gerado vive de forma recuperável, fora do controle de qualquer provedor terceiro.
- **Vercel / Supabase / GPTMaker / Base44 / demais provedores** — **ambientes de execução**. Recebem o valor para uso em runtime, mas não são tratados como lugar de recuperação — em particular, um segredo marcado `Sensitive` na Vercel é **write-only por desenho**: uma vez lá, não volta a ser lido, nem pela CLI, nem pelo painel.
- **`docs/SECURITY/SECRETS.md`** (este arquivo) — documentação de **nomes, responsabilidades, categorias e processo de rotação**. Nunca um lugar onde valores reais são registrados, mesmo temporariamente.

Qualquer processo de geração/rotação (§6) tem, como pré-condição, salvar o valor no Apple Passwords **antes** de configurá-lo como `Sensitive` em qualquer ambiente de execução — nunca depois.

---

## 3. Inventário completo de credenciais, por categoria

**Correção de contagem nesta revisão:** o inventário original citava "32 variáveis" — uma recontagem linha a linha (separando células que agrupavam mais de um nome, ex. `ZAPI_TOKEN` / `ZAPI_INSTANCE_ID`) mostra **39 variáveis distintas**. A tabela abaixo já reflete a contagem correta, separada nas 5 categorias pedidas — nem toda variável encontrada por grep é um segredo real.

### 3.1 Segredo real server-side (10)

Valor gerado por nós (não emitido por nenhum provedor externo), usado como credencial Bearer/compartilhada entre componentes do próprio projeto. Categoria de maior sensibilidade — segue o processo fechado do §6.

| Variável | Integração/consumidor | Armazenada em | Quem deve conhecer | Compartilhada? |
|---|---|---|---|---|
| `WEBHOOK_PATH_SECRET` | PRIME Bridge — segredo de path do webhook (`/webhook/:secret`) | Apple Passwords (fonte) + ambiente de execução da Bridge | Só quem opera a Bridge; colado na URL configurada no painel da ZAP-API | Exclusiva |
| `BRIDGE_TOOLS_SECRET` | PRIME Bridge → IGNITE PRIME Tool API (`?tool=consultar-produto`) | Apple Passwords (fonte) + Vercel (Production) + ambiente de execução da Bridge | Quem opera a Bridge (para configurar o cliente HTTP) + quem administra `system-tools.js` | Exclusiva (ver §5 — nunca reutilizar `WEBHOOK_PATH_SECRET`/`NEX_SYNC_SECRET`) |
| `NEX_SYNC_SECRET` | Módulo NEX (`?tool=nex-sync-clientes`, `nex-cliente`, `nex-health?force=true`) | Apple Passwords (fonte) + Vercel (Production) | Quem opera a sincronização NEX | Exclusiva |
| `MCP_LITE_SECRET` | Cliente MCP (GPT Maker/Gabriela) → `?tool=mcp` | Apple Passwords (fonte) + Vercel (Production) + configurado no cliente MCP (GPT Maker) | Quem administra o servidor MCP + quem configura o cliente GPT Maker | Exclusiva |
| `GERAR_COBRANCA_SECRET` | `?tool=gerar-cobranca-lyra`, modo admin | Apple Passwords (fonte) + Vercel (Production) | Administradores internos (uso via automação/CLI) | Exclusiva |
| `COBRANCA_FRONTEND_TOKEN` | `?tool=gerar-cobranca-lyra`, modo frontend | Apple Passwords (fonte) + Vercel (Production) | Lido pelo frontend em runtime; tratado como token de baixo privilégio, nunca equivalente ao modo admin | Exclusiva (nunca aceito como equivalente a `GERAR_COBRANCA_SECRET`) |
| `LYRA_WEBHOOK_SECRET` | Webhook da Lyra → `?tool=lyra-webhook` | Apple Passwords (fonte) + Vercel (Production) + configurado dentro do app Lyra (Base44) | Quem administra a Lyra | Exclusiva |
| `CRON_SECRET` | GitHub Actions → `?tool=sync-lyra`, `?tool=stuck-check` | Apple Passwords (fonte) + Vercel (Production) + GitHub Actions secrets | Quem administra os workflows de CI | Exclusiva |
| `WHATSAPP_INTERNAL_TOKEN` | `system-tools.js` → Base44 Function `whatsappProvider` (ping de status, somente leitura) | Apple Passwords (fonte) + Vercel (Production) + Base44 (`prime-vip.base44.app`) | Quem administra a integração PRIME↔Base44 | Exclusiva (mesmo token que `lembreteCobrancas` já usa para chamar `whatsappProvider`, mas nunca reutilizado por nenhuma outra tool deste dispatcher) |
| `MENSAGEM_MANUAL_SERVICE_TOKEN` | `_mensagemManualProxy.js` → Base44 (`enviarMensagemManualWhatsapp`) | Apple Passwords (fonte) + Vercel (Production) | Quem administra o proxy de mensagem manual | Exclusiva |

### 3.2 Credencial de terceiro (11)

Emitida por um provedor externo (não gerada por nós) — a rotação depende do painel desse provedor; só o valor final é o que guardamos/configuramos.

| Variável | Provedor | Armazenada em | Quem deve conhecer | Compartilhada? |
|---|---|---|---|---|
| `GPT_TOKEN` | GPTMaker (Conversation API) | Ambiente de execução da Bridge | Quem opera a Bridge | Exclusiva |
| `ZAPI_TOKEN` | ZAP-API | Ambiente de execução da Bridge | Quem opera a Bridge | Exclusiva |
| `BASE44_API_KEY` | Base44 | Vercel (Production) | Administradores internos | Compartilhada **entre os dois apps Base44 do mesmo grupo de negócio** (PRIME e Lyra) — não é reutilizada fora do domínio Base44 |
| `SUPABASE_SECRET_KEY` | Supabase (`service_role`, bypassa RLS) | Vercel (Production) | Só backend (`api/`) — nunca no frontend | Compartilhada entre as tools server-side deste dispatcher que precisam de `service_role`, mas nunca exposta ao frontend nem a nenhum consumidor externo |
| `VERCEL_ACCESS_TOKEN` | Vercel | Vercel (Production) | Administradores internos | Exclusiva |
| `OPENROUTER_API_KEY` | OpenRouter | Vercel (Production) | Administradores internos | Compartilhada entre as 3 tools de OpenRouter (mesmo provedor, mesmo escopo de uso) |
| `PERPLEXITY_API_KEY` | Perplexity | Vercel (Production) | Administradores internos | Exclusiva |
| `QWEN_API_KEY` | Alibaba Qwen | Vercel (Production) | Administradores internos | Exclusiva |
| `TELEGRAM_BOT_TOKEN` | Telegram | Vercel (Production) | Administradores internos | Exclusiva |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google (OAuth) | `.env.local` (propositalmente sem prefixo `VITE_`) | Só quem roda `scripts/fix-drive-permissions.mjs` manualmente | Exclusiva |
| `COHERE_API_KEY` | Cohere | `.env.local` + Vercel | Administradores internos | Exclusiva |

### 3.3 Token semi-público/client-side (9)

Prefixo `VITE_` faz o Vite **embutir o valor no bundle JavaScript** entregue ao navegador — qualquer pessoa que abrir o DevTools do app consegue lê-lo. Tratadas como "chaves de baixo privilégio, públicas por desenho" — **exceto** os dois itens marcados como anomalia abaixo.

| Variável | Provedor/uso | Armazenada em | Observação |
|---|---|---|---|
| `VITE_SUPABASE_KEY` | Supabase (chave `anon`) | `.env.local` + Vercel (Preview + Production) | Protegida só por RLS no Supabase — desenhada para ser pública |
| `VITE_GOOGLE_DRIVE_API_KEY` | Google Drive (leitura pública) | `.env.local` + bundle do frontend | API key de leitura, não é segredo real |
| `VITE_GPTMAKER_TOKEN` | GPTMaker (API key) | `.env.local` + Vercel + bundle do frontend | Injetada no bundle — tratar como semi-pública |
| `VITE_GPTMAKER_USER_TOKEN` | GPTMaker (sessão de navegador, ~24h) | `.env.local` + Vercel (Production, card de créditos) | Curta duração — renovação manual diária por Rafael |
| `VITE_GROQ_API_KEY` | Groq | `.env.local` + Vercel (Preview + Production) | Injetada no bundle |
| `VITE_DEEPSEEK_API_KEY` | DeepSeek | `.env.local` | Injetada no bundle |
| `VITE_BASE44_API_KEY` | Base44 (frontend) | `.env.local` | Injetada no bundle |
| `VITE_GPTMAKER_EMAIL` ⚠️ | GPTMaker (login) | `.env.local` + Vercel | **Anomalia:** é uma credencial de login real (não uma API key de baixo privilégio), mas está com prefixo `VITE_` — deveria estar na categoria "credencial de terceiro", server-side only. Risco conhecido, registrado no §7 |
| `VITE_GPTMAKER_PASSWORD` ⚠️ | GPTMaker (login) | `.env.local` + Vercel | Mesma anomalia acima |

### 3.4 Identificador não secreto (6)

Não protege nada por si só — pode circular livremente sem risco de autenticação indevida.

| Variável | O que identifica |
|---|---|
| `ZAPI_INSTANCE_ID` | Instância da ZAP-API (precisa do `ZAPI_TOKEN` junto para ter efeito) |
| `TELEGRAM_CHAT_ID` | Canal de destino dos alertas do `stuck-check` |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID OAuth do Google (convencionalmente público — só o `CLIENT_SECRET` é sensível) |
| `VITE_GOOGLE_DRIVE_FOLDER_ID` | Pasta raiz do catálogo no Google Drive |
| `VITE_GPTMAKER_WORKSPACE` | Workspace do GPT Maker |
| `VITE_BASE44_APP_ID` | App ID do Base44 (Cobranças) |

### 3.5 URL/configuração não secreta (3)

| Variável | O que configura |
|---|---|
| `VITE_SUPABASE_URL` | Endpoint do projeto Supabase |
| `QWEN_BASE_URL` | Endpoint da API do QwenCloud |
| `QWEN_MODEL` | Nome do modelo Qwen usado no health check |

### 3.6 Resumo de contagem

| Categoria | Quantidade |
|---|---|
| Segredo real server-side | 10 |
| Credencial de terceiro | 11 |
| Token semi-público/client-side | 9 |
| Identificador não secreto | 6 |
| URL/configuração não secreta | 3 |
| **Total** | **39** |

---

## 4. Dependências entre integrações

```
BASE44_API_KEY
 ├── PRIME (Cobranças) — Cliente/Venda/Parcela/HistoricoAtividade
 └── Lyra — Cobranca/Cliente
      (mesma chave autentica os dois apps do mesmo grupo de negócio)

WHATSAPP_INTERNAL_TOKEN
 └── Base44 Function whatsappProvider
      └── usado por: lembreteCobrancas (dentro do Base44) E
          system-tools.js (?tool=prime-cobrancas-status, só leitura de status)

SUPABASE_SECRET_KEY (service_role)
 ├── qwen-health (qwen_health_state)
 ├── NEX (_nexClientes.js — nex_clientes, nex_sync_eventos)
 └── consultar-produto (via supabaseConfig passado pelo dispatcher)

VITE_SUPABASE_KEY (anon)
 ├── frontend (catálogo, produtos, etc.)
 └── stuck-check (codex_alerts, só leitura/escrita de alerta)

BRIDGE_TOOLS_SECRET
 └── (ainda não integrado — Fase 3 da PRIME Bridge, Etapa 3.3 concluída,
     Tool API criada mas não consumida ainda pela Bridge)
```

Nenhuma outra dependência cruzada foi encontrada — cada segredo restante autentica exatamente um par (chamador → rota), sem ramificação.

---

## 5. Segredos que nunca devem ser reutilizados entre si

Combinações **explicitamente proibidas**, com o motivo:

| Nunca reutilizar... | ...para autenticar | Motivo |
|---|---|---|
| `NEX_SYNC_SECRET` | PRIME Bridge / `consultar-produto` | Consumidores sem nenhuma relação funcional — NEX é sincronização de clientes de e-commerce, a Bridge é atendimento via WhatsApp. Reutilizar quebraria isolamento e menor privilégio (auditoria completa em 2026-08-01, ver histórico de decisões desta sessão) |
| `WEBHOOK_PATH_SECRET` | `BRIDGE_TOOLS_SECRET` | Um protege a **entrada** de mensagens na Bridge (ZAP-API → Bridge); o outro protege a **saída** da Bridge para a Tool API (Bridge → IGNITE PRIME). São direções e ameaças diferentes — comprometer um não deve automaticamente comprometer o outro |
| `SUPABASE_SECRET_KEY` | Qualquer consumidor externo (Bridge, GPTMaker, NEX) | É a chave `service_role`, bypassa toda RLS — só pode circular entre código server-side do próprio projeto, nunca ser entregue a um chamador externo como credencial de autenticação de API |
| `GERAR_COBRANCA_SECRET` | `COBRANCA_FRONTEND_TOKEN` | Já implementado como dois segredos distintos mesmo na mesma rota — o modo frontend tem escopo deliberadamente mais restrito (só `dryRun=false` com body fechado), nunca deve ser tratado como equivalente ao modo admin |
| `MCP_LITE_SECRET` | Qualquer coisa fora de `?tool=mcp` | Único ponto de entrada MCP — reutilizá-lo noutra rota ampliaria o que um cliente MCP comprometido conseguiria alcançar |
| Qualquer segredo `Sensitive` na Vercel | — | Uma vez marcado `Sensitive`, o valor é **write-only por desenho** (nem CLI, nem painel leem de volta) — reforça por que o Apple Passwords (§2) precisa ter o valor **antes** desse ponto, nunca depois |

---

## 6. Política de rotação — processo padrão de criação/rotação

- **Rotina:** não há rotação automática/agendada hoje — rotação acontece sob demanda (suspeita de vazamento, expiração natural como `VITE_GPTMAKER_USER_TOKEN`, ou necessidade de rotacionar por falta de cópia recuperável, como descrito no §7 para `NEX_SYNC_SECRET`).
- **Fluxo fechado, obrigatório para todo segredo da categoria "real server-side" (§3.1):**

  ```
  1. Gerar localmente (ex.: openssl rand -hex 32)
       ↓
  2. Mostrar uma única vez ao operador responsável
       ↓
  3. Operador salva no Apple Passwords
       ↓
  4. Confirmar explicitamente que foi salvo
       ↓
  5. Configurar no ambiente de execução (Vercel etc.) como Sensitive
       ↓
  6. Redeploy, quando necessário, para o valor entrar em vigor
       ↓
  7. Validar o consumidor com uma chamada real (só leitura sempre que possível)
       ↓
  8. Nunca depender de ler o valor de volta do provedor — o Apple Passwords
     (passo 3) é a única via de recuperação a partir daqui
  ```

  Nenhum passo pode ser pulado ou reordenado — em particular, o passo 5 (marcar `Sensitive`) **nunca** acontece antes dos passos 2-4 (entrega + confirmação de que o operador já tem uma cópia recuperável).

- **Por que este processo existe:** foi exatamente pular os passos 2-4 que deixou `NEX_SYNC_SECRET` sem cópia recuperável sob controle do operador em 2026-08-01 (detalhe completo no §7) — o valor foi gerado e gravado como `Sensitive` num único fluxo automatizado, sem que o Apple Passwords chegasse a recebê-lo antes.
- **Segredos que não seguem esse fluxo:** os da categoria "credencial de terceiro" (§3.2) são gerados nos próprios painéis desses provedores — a rotação segue o processo de cada provedor; só a configuração no ambiente de execução (Vercel) é local, e o valor também deve ser salvo no Apple Passwords assim que emitido pelo provedor, pelo mesmo motivo.

---

## 7. Diagrama da arquitetura de autenticação

```
                              ┌─────────────────────────┐
                              │   Clientes finais         │
                              │  (WhatsApp / Instagram)   │
                              └──────────────┬─────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────┐
   WEBHOOK_PATH_SECRET  ───▶  │      PRIME Bridge         │  ◀─── GPT_TOKEN (→ GPTMaker)
   (path secreto do            │  (poc/zap-gptmaker-bridge)│  ◀─── ZAPI_TOKEN (→ ZAP-API)
    webhook de entrada)         └──────────────┬─────────────┘
                                             │
                                             │ BRIDGE_TOOLS_SECRET
                                             │ (ainda não integrado —
                                             │  Fase 3, Etapa 3.3)
                                             ▼
                     ┌───────────────────────────────────────────────────┐
                     │        api/system-tools.js  (dispatcher único)      │
                     │  ?tool= consultar-produto | nex-* | mcp | ...        │
                     └───────────────────────────┬───────────────────────┘
                                                 │
      ┌───────────────┬──────────────┬───────────┼───────────────┬──────────────────┐
      ▼               ▼              ▼           ▼               ▼                  ▼
 NEX_SYNC_SECRET  MCP_LITE_SECRET  CRON_SECRET  LYRA_WEBHOOK_   GERAR_COBRANCA_   VERCEL_ACCESS_
 (NEX)            (GPT Maker MCP) (GH Actions)  SECRET (Lyra)   SECRET/           TOKEN, etc.
      │               │              │              │           COBRANCA_
      ▼               ▼              ▼              ▼           FRONTEND_TOKEN
 nex_clientes    consultar_cobrancas/  sync-lyra/            ▼
 (Supabase,      consultar_cep         stuck-check      BASE44_API_KEY
  SUPABASE_                                              (PRIME + Lyra)
  SECRET_KEY)                                                 │
                                                                ▼
                                                    WHATSAPP_INTERNAL_TOKEN
                                                    → whatsappProvider (Base44)

 Frontend (React, bundle público)
      │
      ▼
 VITE_SUPABASE_KEY (anon) / VITE_GPTMAKER_TOKEN / VITE_GROQ_API_KEY / ...
 → tratadas como semi-públicas (visíveis no bundle), protegidas só por
   RLS (Supabase) ou pelo próprio desenho de baixo privilégio da chave
```

---

## 8. Status conhecido

- **`NEX_SYNC_SECRET`:**
  - Está **configurada e ativa** no ambiente Production da Vercel.
  - A Vercel **injeta o valor normalmente em runtime** para a função — o endpoint `nex-health`/`nex-sync-clientes`/`nex-cliente` funciona corretamente para qualquer chamador que apresente o Bearer correto.
  - O valor **não pode ser lido de volta** por estar marcado como `Sensitive` (comportamento por desenho da Vercel, não uma falha).
  - **Não existe hoje uma cópia recuperável sob controle do operador** — o valor foi gerado e gravado num único fluxo automatizado, sem passar pelos passos 2-4 do processo do §6 (mostrar ao operador → salvar no Apple Passwords → confirmar).
  - **Portanto:** para qualquer teste manual autenticado ou para configurar um novo consumidor externo que precise chamar essas rotas, a variável **deverá ser rotacionada** seguindo o fluxo fechado do §6.
  - **Após a rotação, o novo valor deve ser salvo no Apple Passwords antes de ser enviado à Vercel como `Sensitive`** — nunca depois.
- **`VITE_GPTMAKER_EMAIL`/`VITE_GPTMAKER_PASSWORD`** (ver §3.3, anomalia): usam prefixo `VITE_`, o que as expõe ao bundle do frontend — deveriam, em algum momento, migrar para variáveis sem prefixo `VITE_`, lidas só server-side, e passar a ser tratadas como categoria "credencial de terceiro" (§3.2).

---

## 9. Manutenção deste documento

Sempre que uma nova credencial for criada (nova integração, novo consumidor, nova ferramenta da Bridge), atualizar:
1. A tabela da categoria correspondente no §3 (nova linha) — nunca assumir por padrão que é "segredo real server-side"; classificar de acordo com quem emite e onde circula.
2. O resumo de contagem (§3.6).
3. A §4 se houver nova dependência entre integrações.
4. A §5 se a nova credencial tiver alguma combinação explicitamente proibida de reutilização.
5. O diagrama da §7.

Consistente com a Regra 12 do `CLAUDE.md` raiz do projeto (documentação atualizada no mesmo commit que introduz o código correspondente).
