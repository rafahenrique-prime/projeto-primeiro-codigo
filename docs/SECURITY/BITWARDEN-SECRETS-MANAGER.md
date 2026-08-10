# Bitwarden Secrets Manager — IGNITE PRIME

**Criado em:** 2026-08-10
**Última atualização:** 2026-08-10
**Mantido por:** Rafael Henrique
**Status:** BITWARDEN SECRETS MANAGER — IMPLANTAÇÃO PRINCIPAL CONCLUÍDA

---

## 1. Objetivo

O Bitwarden Secrets Manager é usado **somente** para API keys, tokens e secrets técnicos consumidos por código/automação do IGNITE PRIME (backend, scripts, CI). Senhas pessoais, logins de sites e credenciais de uso humano continuam fora deste fluxo — isso é gerenciado separadamente (ex.: Apple Passwords, ver `docs/SECURITY/SECRETS.md`).

Bitwarden é o **cofre oficial** dos secrets técnicos do projeto — fonte da verdade, não uma cópia. `.env.local` e as Environment Variables da Vercel continuam existindo como os ambientes consumidores reais, mas o valor de referência, quando há dúvida ou necessidade de rotação, é o que está no Bitwarden.

---

## 2. Bitwarden — configuração

| Item | Valor |
|---|---|
| Serviço | Bitwarden Secrets Manager |
| Projeto | `IGNITE PRIME` |
| CLI | `bws` versão `2.1.0` |
| Caminho de instalação | `~/.local/bin/bws` (global, fora deste repositório) |
| Machine Account (Claude Code) | `CLAUDE CODE - MAC` |
| Armazenamento do token | `BWS_ACCESS_TOKEN` no macOS Keychain (nunca em arquivo) |
| Secrets armazenados | **21** |

O valor do `BWS_ACCESS_TOKEN` **nunca** é registrado neste documento, em nenhum outro arquivo do repositório, nem exibido em terminal/chat.

### 21 secrets atualmente no Bitwarden

```
BAGY_SYNC_SECRET
BAGY_UI_ACTION_SECRET
BASE44_API_KEY
COBRANCA_FRONTEND_TOKEN
COHERE_API_KEY
CRON_SECRET
GERAR_COBRANCA_SECRET
GOOGLE_OAUTH_CLIENT_SECRET
LYRA_WEBHOOK_SECRET
MCP_LITE_SECRET
PERPLEXITY_API_KEY
QWEN_API_KEY
SUPABASE_SECRET_KEY
VERCEL_ACCESS_TOKEN
VITE_DEEPSEEK_API_KEY
VITE_GOOGLE_DRIVE_API_KEY
VITE_GPTMAKER_TOKEN
VITE_GPTMAKER_USER_TOKEN
VITE_GROQ_API_KEY
VITE_SUPABASE_KEY
VITE_GPTMAKER_WORKSPACE
```

Nenhum valor foi registrado em nenhum momento do processo de migração — só nomes e comparações IGUAL/DIFERENTE contra a fonte original.

---

## 3. Claude Code — acesso ao Bitwarden

```
macOS Keychain
   ↓ (security find-generic-password)
BWS_ACCESS_TOKEN (variável de ambiente, só na sessão do shell atual)
   ↓
bws (CLI)
   ↓
Bitwarden Secrets Manager
   ↓
projeto IGNITE PRIME
```

O token é lido do Keychain e exportado como variável de ambiente **apenas dentro do comando que precisa dele** — o estado de shell não persiste entre execuções, então o token não fica residente em nenhum processo depois que o comando termina.

Carregar o token do Keychain sem imprimir o valor:

```bash
export BWS_ACCESS_TOKEN="$(security find-generic-password -a "$USER" -s "BWS_ACCESS_TOKEN" -w)"
```

Confirmar que carregou, sem exibir o conteúdo:

```bash
test -n "$BWS_ACCESS_TOKEN" && echo "BWS_ACCESS_TOKEN carregado"
```

**Regra permanente**: valores de secrets nunca devem ser exibidos — nem no terminal, nem no chat, nem em logs. Acesso validado e usado em produção desde a migração inicial dos 21 secrets.

---

## 4. GitHub Actions — integração

| Item | Valor |
|---|---|
| Machine Account | `GITHUB ACTIONS - IGNITE PRIME` |
| Permissão | Somente leitura no projeto IGNITE PRIME |
| Token | Salvo como Repository Secret `BWS_ACCESS_TOKEN_GITHUB` |
| Action oficial | `bitwarden/sm-action@v3.0.1` |
| Workflow de teste | `.github/workflows/bitwarden-test.yml` — validado com sucesso |

A integração oficial `bitwarden/sm-action` foi testada de ponta a ponta: autenticação, recuperação de um secret de teste (`VITE_GPTMAKER_WORKSPACE`) e confirmação de carregamento — sem nunca expor o valor no log (mascaramento automático do GitHub Actions + workflow desenhado pra nunca imprimir).

`.github/workflows/stuck-check.yml` recebeu uma preparação equivalente para `CRON_SECRET`, mas permanece **desativado** (`disabled_manually`) — não foi reativado nem testado em produção real, por decisão consciente de manter o escopo desta fase restrito a validar o mecanismo, não a colocá-lo em produção imediatamente.

---

## 5. Vercel — comparação (read-only)

**Ferramenta:** `scripts/security/compare-bitwarden-vercel.mjs`

Características:
- Sempre **READ-ONLY** — nenhuma capacidade de escrita em nenhum lugar do código
- Leitura da Vercel roda isolada (diretório temporário do sistema, só com cópia de `.vercel/project.json`, sem `.env`/`.env.local`) — corrige uma contaminação real encontrada durante o desenvolvimento (ver "Limitações conhecidas")
- Identifica `type: sensitive` **antes** de tentar ler, e nunca tenta contornar isso
- Nunca inventa resultado — retorna exatamente um de: `IGUAL` / `DIFERENTE` / `AUSENTE` / `NÃO COMPARÁVEL — VERCEL SENSITIVE/WRITE-ONLY`

**Achado importante registrado**: a primeira versão do comparador reportou "20/20 IGUAL" — esse resultado foi **invalidado** depois da descoberta de que `vercel env run` misturava `.env.local` do diretório de trabalho com o valor real da nuvem, mascarando o fato de que a maioria das comparações não estava, de fato, checando a Vercel. Corrigido isolando a leitura num diretório temporário sem `.env*`.

**Resultado correto, depois da correção**, para os 20 secrets no escopo do comparador:
- **1 comparável/IGUAL** no ambiente prioritário (`BASE44_API_KEY`, o único `encrypted` em Production entre os 20)
- **19 não comparáveis**, por serem `sensitive` no ambiente prioritário escolhido pelo comparador (Production, quando existe)

---

## 6. Vercel — sincronização de secrets `encrypted`

**Ferramenta:** `scripts/security/sync-bitwarden-vercel.mjs` (usa `scripts/security/_shared.mjs`)

Testada de ponta a ponta em **Development**, com `VITE_GPTMAKER_WORKSPACE`, através de uma divergência controlada e reversível criada só para o teste:

```
ANTES: DIFERENTE
   ↓
ESCRITA: SUCESSO
   ↓
DEPOIS: IGUAL
   ↓
ROLLBACK: NÃO NECESSÁRIO
```

Validado de forma independente (segunda leitura isolada, fora da ferramenta) e por `updatedAt`. **Production e Preview permaneceram intocadas** durante todo o teste — confirmado por snapshot antes/depois de toda a configuração da Vercel.

Características de segurança da ferramenta:
- Exatamente 1 secret + 1 ambiente por execução — sem `--all`, sem lote, sem wildcard
- `production` exige `--confirm-production` **e** confirmação interativa digitando o nome exato do secret
- Categoria B (secrets de alto blast radius: `CRON_SECRET`, `SUPABASE_SECRET_KEY`, `VERCEL_ACCESS_TOKEN`, `BASE44_API_KEY`) exige também `--acknowledge-caution`, em qualquer ambiente
- Bloqueia automaticamente qualquer tentativa de escrever num secret `sensitive` (não consegue capturar valor anterior → recusa, não inventa rollback)
- Valores nunca em argumento de CLI, nunca em arquivo — só stdin/memória
- Retry limitado (máx. 2 tentativas, só na escrita)
- Rollback automático se a validação pós-escrita não bater, usando o valor capturado em memória antes da escrita

---

## 7. Secrets `Sensitive` — limitação atual e plano futuro

Registrado explicitamente:

- Secrets marcados `sensitive` na Vercel **não são sincronizados** pela ferramenta atual
- A ferramenta **bloqueia por design** — não é um bug, é proteção deliberada
- A Vercel não permite recuperar o valor anterior de uma variável `sensitive` por nenhum método local (CLI, isolado ou não) — é write-only por desenho da própria plataforma, confirmado via documentação oficial e teste empírico
- Rotação futura desses secrets deverá usar um fluxo próprio, não o `sync-bitwarden-vercel.mjs` atual
- Rollback desse fluxo futuro deverá usar a **versão anterior do secret já disponível no Bitwarden** (que versiona secrets nativamente), nunca uma leitura da Vercel — porque essa leitura não existe para `sensitive`

### FASE 5 — FUTURO: ROTAÇÃO DE SECRETS SENSITIVE

**Status: NÃO IMPLEMENTADA. NÃO BLOQUEANTE. Implementar somente quando houver necessidade real de rotacionar um secret Sensitive da Vercel.**

Desenho já discutido e aprovado conceitualmente (não implementado):
```
Bitwarden: nova versão do secret já salva (ANTES de tocar a Vercel)
   ↓
ferramenta separada de rotação (a construir na Fase 5)
   ↓
vercel env update <nome> <ambiente>   (valor via stdin, nunca argumento)
   ↓
confirmação só pelo status da própria chamada de escrita
   (não existe "DEPOIS: IGUAL" possível para sensitive)
   ↓
validação funcional recomendada (testar a integração de verdade,
não só a escrita) antes de considerar a rotação concluída
   ↓
rollback, se necessário: reenviar a versão anterior do Bitwarden
```

Os 19 secrets `sensitive` já migrados continuam plenamente utilizáveis (lidos pelo Bitwarden, consumidos pela Vercel normalmente) — a limitação é só sobre **automatizar uma rotação futura** deles, não sobre seu uso atual.

---

## 8. Regra operacional oficial

### Novo secret

```
NOVO SECRET
   ↓
salvar no Bitwarden Secrets Manager primeiro
   ↓
depois configurar no ambiente consumidor (.env.local / Vercel / etc.)
```

- Nunca registrar o valor do secret em documentação (`docs/`, `CLAUDE.md`, etc.)
- Nunca enviar o valor do secret para o chat/terminal do Claude Code
- Nunca commitar o secret em Git, em nenhuma forma (arquivo, comentário, mensagem de commit)

### Troca/rotação de secret

```
nova credencial gerada
   ↓
atualizar a fonte oficial no Bitwarden Secrets Manager
   ↓
sincronizar no ambiente permitido
   (Development/Preview via sync-bitwarden-vercel.mjs, quando encrypted)
   ↓
validar funcionamento real — nunca assumir que funcionou
   ↓
só depois disso, revogar a credencial antiga na origem
```

### Production

```
Production NUNCA sincroniza automaticamente.
Sempre exige aprovação explícita, por execução, nunca por lote.
```

---

## 9. Limitações conhecidas

- Secrets `sensitive` da Vercel não são comparáveis por valor depois de gravados — write-only por desenho da plataforma, não uma limitação do Bitwarden ou das ferramentas deste projeto
- Preview e Production podem compartilhar a mesma entrada `sensitive` na Vercel (confirmado com `VITE_GPTMAKER_WORKSPACE` — uma única entrada cobre os dois ambientes) — o que bloqueia teste/sincronização em Preview do mesmo jeito que em Production, para os secrets nessa situação
- Variáveis `VITE_*` continuam sujeitas às regras normais de exposição no bundle do frontend — o Bitwarden centralizar a origem não muda esse risco arquitetural (ver `docs/SECURITY/SECRETS.md` para o detalhe de cada `VITE_*` sensível)
- Bitwarden centraliza secrets, mas **não corrige sozinho** problemas arquiteturais do código (ex.: `VITE_BASE44_API_KEY` exposta no bundle continua sendo um problema de arquitetura do app, independente de onde o secret está armazenado)

---

## 10. Decisões atuais — não mexer agora

- **`VITE_BASE44_API_KEY`** — permanece exatamente como está, por decisão de projeto já registrada (investigação concluída anteriormente)
- **`VITE_GPTMAKER_EMAIL` / `VITE_GPTMAKER_PASSWORD`** — legado, sem consumidor em código, aguardando decisão sobre se a automação de auto-refresh ainda é uma intenção válida antes de migrar ou remover
- **`VITE_AWS_ACCESS_KEY` / `VITE_AWS_SECRET_KEY`** — fora do escopo, pendência arquitetural futura (código sem consumidor ativo)
- **7 secrets Vercel Sensitive ainda fora do Bitwarden** (`OPENROUTER_API_KEY`, `WHATSAPP_INTERNAL_TOKEN`, `BRIDGE_TOOLS_SECRET`, `MENSAGEM_MANUAL_SERVICE_TOKEN`, `NEX_SYNC_SECRET`, `ZAPI_TOKEN`, `WEBHOOK_PATH_SECRET`) — permanecem como pendência futura; valor não recuperável pelo método atual, migração só será possível se o valor for recuperado de outra fonte ou a variável for reconfigurada

---

## 11. Comandos de diagnóstico seguros

```bash
bws --version
which bws
```

Carregar o token do Keychain (sem imprimir valor) e listar projetos/secrets (só nomes — `bws secret list` nunca retorna valor sem um `bws secret get <id>` explícito):

```bash
export BWS_ACCESS_TOKEN="$(security find-generic-password -a "$USER" -s "BWS_ACCESS_TOKEN" -w)"
bws project list
bws secret list <PROJECT_ID>
```

Comparar Bitwarden × Vercel (read-only):

```bash
node scripts/security/compare-bitwarden-vercel.mjs
```

Sincronizar um secret `encrypted` (escrita explícita, um por vez):

```bash
node scripts/security/sync-bitwarden-vercel.mjs <SECRET_NAME> <development|preview>
node scripts/security/sync-bitwarden-vercel.mjs <SECRET_NAME> production --confirm-production
```

Nenhum desses comandos expõe valores de secrets.

---

## 12. Proibições

- Nunca colocar `BWS_ACCESS_TOKEN` em `.env`/`.env.local` do projeto
- Nunca colocar `BWS_ACCESS_TOKEN` em `.zshrc`/`.bashrc`/`.zprofile` em texto puro
- Nunca exibir valores de secrets em logs, terminal ou chat
- Nunca commitar secrets (valor ou token de acesso) em Git, em nenhuma forma
- Nunca remover um secret da fonte original antes de validar que a nova fonte (Bitwarden ou ambiente atualizado) está funcionando
- Nunca sincronizar Production automaticamente — sempre aprovação explícita por execução
- Nunca tentar contornar a proteção `sensitive` da Vercel

---

**Última atualização:** 2026-08-10
