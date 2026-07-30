# Auditoria de Capacidades do CLI Base44 — Somente Leitura

**Data:** 2026-07-29
**CLI auditado:** `base44` v0.1.6
**Método:** leitura de `--help` de todos os comandos e subcomandos (execução puramente local, sem rede) + resultados já obtidos anteriormente na mesma sessão de trabalho (não re-executados aqui). **Nenhum comando novo de escrita foi executado para produzir este relatório.**

---

## Resumo da auditoria

Esta auditoria mapeia exatamente o que o CLI do Base44 permite consultar sem alterar nada, e — o mais importante — documenta um incidente real em que a **descrição de um comando não correspondeu ao seu comportamento**: `base44 eject`, descrito como "Download the code for an existing Base44 project", na prática **criou um aplicativo novo e publicou 7 funções em produção**. Essa descoberta motiva a regra central desta auditoria: **nunca confiar no nome ou na descrição de um comando — só em comportamento observado e documentado.**

---

## Etapa 1 — Mapeamento dos comandos (por grupo)

| Grupo | Finalidade | Somente leitura? | Risco | Observações |
|---|---|---|---|---|
| `--help` / `help [command]` | Exibe ajuda | ✅ Sim | Nenhum | Execução local, não toca a rede |
| `--version` | Exibe versão do CLI | ✅ Sim | Nenhum | Local |
| `whoami` | Mostra usuário autenticado | ✅ Sim | Nenhum | Já usado nesta sessão — só leitura de sessão |
| `functions list` | Lista funções publicadas | ✅ Sim | Nenhum | Já usado várias vezes nesta sessão, comportamento confirmado somente leitura |
| `functions pull [name]` | Baixa código-fonte de função(ões) publicada(s) para a pasta local `functions/` | ✅ Sim (não altera o remoto) | Baixo — **grava localmente**, por isso deve sempre ser feito em pasta isolada | Já usado extensivamente nesta sessão, sempre em `.tmp/`, nunca sobrescrevendo `base44/functions/` real |
| `secrets list` | Lista **nomes** de secrets | ✅ Sim | Nenhum | Nunca mostra valores |
| `workspace list` / `workspace get <id>` | Lista/inspeciona workspaces | ✅ Sim | Nenhum | Já usado nesta sessão |
| `logs` | Busca logs de execução de funções | ✅ Sim | Nenhum | Não testado nesta sessão além do `--help`; parâmetros (`--function`, `--since`, `--until`, `--env`) sugerem uso seguro de leitura |
| `connectors list-available` | Lista tipos de conector disponíveis (catálogo genérico, não específico do app) | ✅ Sim (provável) | Baixo | Não testado ainda — nome e descrição sugerem leitura, mas **a experiência do `eject` ensina a não presumir**; recomendo confirmar com você antes do primeiro uso real |
| `types generate` | Gera `types.d.ts` **localmente** a partir dos recursos do projeto | ⚠️ Depende — grava arquivo local, mas não deveria alterar o remoto | Baixo, se usado em pasta isolada | Não testado. Nome sugere leitura remota + escrita só local |

---

## Etapa 2 — Capacidades investigadas (via `--help` de cada grupo)

| Recurso | Existe comando? | Comando | Somente leitura? | Limitações |
|---|---|---|---|---|
| **Functions** | Sim | `functions list`, `functions pull [name]` | ✅ Sim | `functions deploy` existe mas é de escrita (já usado nesta sessão, com aprovação explícita prévia) |
| **Entities (schema)** | ⚠️ Parcial | `entities push` | ❌ **Só push existe — não há `entities pull`** | Não há comando de leitura dedicado; o schema só apareceu como efeito colateral do `eject` (que não é seguro — ver Etapa 4) |
| **Schemas** | Ver Entities | — | — | Mesma limitação |
| **Workflows** | Não | — | — | Nenhum comando dedicado encontrado. Sabemos que existem (o erro do `eject` mencionou "this app uses Workflows") mas não há como listá-los via CLI |
| **Automations** | Não | — | — | Mesma limitação — só apareceram indiretamente via erro de deploy |
| **Connectors** | Sim | `connectors list-available`, `connectors pull` | `list-available` provavelmente sim; `pull` **sobrescreve arquivos locais de conector** — não é puramente "consulta" | `push`/`initiate` são claramente de escrita (nunca usar sem aprovação) |
| **Integrations** | Ver Connectors | — | — | Mesmo grupo |
| **Secrets (nomes)** | Sim | `secrets list` | ✅ Sim | Nunca mostra valores — `set`/`delete` são de escrita |
| **Permissions** | Não | — | — | Nenhum comando dedicado encontrado |
| **Roles** | Não | — | — | Nenhum comando dedicado encontrado |
| **Environment** | Parcial | `secrets list` (nomes de env vars) | ✅ Sim | Não há comando "environment info" dedicado |
| **Configurações do App** | Parcial | `base44/config.jsonc`/`.app.jsonc` locais (não é comando, é arquivo) | ✅ Sim (leitura local) | Não há comando CLI para ler configuração remota diretamente, fora do que vem embutido em `pull`/`eject` |
| **Metadata do App (nome, domínio, etc.)** | Não, diretamente | `dashboard open` (abre navegador) | Não aplicável via terminal | O nome real do app só apareceu como efeito colateral do `eject` ("Selected project: PRIME STORE - COBRANÇAS INTELIGENTE") — não há como confirmar isso em texto puro sem repetir uma operação arriscada |
| **Histórico de Deploy** | Não | — | — | Nenhum comando dedicado encontrado |
| **Logs** | Sim | `logs` | ✅ Sim | Ver Etapa 1 |
| **Banco de Dados (registros reais)** | Só via `exec` | `base44 exec` (script com SDK autenticado) | ⚠️ **Depende do script** — pode ler (`entities.X.list()`) ou escrever (`entities.X.create()`), o comando em si não distingue | Alto risco de uso incorreto — só seguro se o script executado for auditado linha a linha antes de rodar |
| **Usuários** | Só via `exec` | `base44.entities.User.list()` dentro de um script `exec` | ⚠️ Mesma ressalva do item acima | — |
| **Sandbox remoto (arquivos)** | Sim | `sandbox ls`, `sandbox read`, `sandbox grep` | ✅ Sim, esses três | `sandbox write`/`edit`/`run`/`checkpoint` são de escrita/execução — **nunca usar sem aprovação explícita** |

---

## Etapa 3 — Matriz de capacidades

| Recurso | Pode Ler? | Pode Listar? | Pode Baixar? | Pode Exportar? | Risco | Observações |
|---|---|---|---|---|---|---|
| Functions | ✅ | ✅ | ✅ (`pull`) | — | Baixo | Já usado com segurança várias vezes nesta sessão |
| Entities (schema) | ⚠️ Só via `eject` | ❌ | ⚠️ Só via `eject` | ❌ | **Alto** (o único caminho conhecido tem efeito colateral grave) | Sem comando de leitura dedicado |
| Workflows | ❌ | ❌ | ❌ | ❌ | — | Sem visibilidade via CLI |
| Automations | ❌ | ❌ | ❌ | ❌ | — | Sem visibilidade via CLI |
| Connectors | ⚠️ | ✅ (`list-available`) | ⚠️ (`pull`, mas grava local) | ❌ | Médio | Não testado ainda nesta sessão |
| Secrets (nomes) | ✅ | ✅ | ❌ | ❌ | Nenhum | Nunca expõe valores |
| Permissions/Roles | ❌ | ❌ | ❌ | ❌ | — | Sem comando dedicado |
| Environment (nomes) | ✅ | ✅ | ❌ | ❌ | Nenhum | Via `secrets list` |
| Configuração do App | ✅ (local) | — | — | — | Nenhum | Só o que já está nos arquivos locais `base44/config.jsonc`/`.app.jsonc` |
| Metadata do App (nome real, domínio) | ❌ | ❌ | ❌ | ❌ | — | Só via painel web ou efeito colateral de `eject` (não recomendado) |
| Histórico de Deploy | ❌ | ❌ | ❌ | ❌ | — | Sem comando dedicado |
| Logs de execução | ✅ | ✅ | ❌ | ❌ | Nenhum | Não testado ainda, mas `--help` sugere seguro |
| Banco de Dados (registros) | ⚠️ Só via `exec` | ⚠️ Só via `exec` | ⚠️ Só via `exec` | ❌ | **Alto** se mal auditado | Depende 100% do script escrito |
| Sandbox (arquivos remotos) | ✅ (`ls`/`read`/`grep`) | ✅ | ⚠️ | ❌ | Baixo para os 3 comandos de leitura; alto para `write`/`edit`/`run` | Grupo misto — cuidado ao escolher o subcomando |

---

## Etapa 4 — Limitações (o que o CLI NÃO consegue)

- **Nenhum comando lista Workflows ou Automations** — só sabemos que existem porque um erro de deploy os mencionou incidentalmente. Depende do **painel web** do Base44.
- **Nenhum comando de leitura dedicado para o schema de Entities** — o único caminho conhecido (`eject`) tem efeito colateral grave (cria e publica um app novo). Depende do **suporte oficial da Base44** ou do **painel web** até que (se algum dia existir) um `entities pull` seja disponibilizado.
- **Nenhum comando mostra Permissions/Roles** — depende do painel web.
- **Nenhum comando mostra o nome/domínio real do app em texto puro** — só aparece como efeito colateral de operações arriscadas. Depende do painel web ou de perguntar diretamente a você.
- **Nenhum histórico de deploy consultável** — depende do painel web.
- **Dados reais do banco (registros)** só são acessíveis via `exec` com um script SDK — não é "consulta", é execução de código arbitrário autenticado; depende de auditoria manual cuidadosa do script antes de cada uso, nunca de um comando "seguro por padrão".

---

## Etapa 5 — Comandos seguros × comandos proibidos

### 100% seguros para auditorias futuras (nenhum efeito colateral conhecido)

| Comando | Motivo |
|---|---|
| `base44 --help`, `base44 <grupo> --help` | Execução local, não toca rede |
| `base44 --version` | Local |
| `base44 whoami` | Só lê sessão atual |
| `base44 functions list` | Só lista, comprovado nesta sessão |
| `base44 functions pull [name]` (em pasta isolada) | Só grava localmente, comprovado nesta sessão |
| `base44 secrets list` | Só nomes, nunca valores |
| `base44 workspace list` / `workspace get <id>` | Só leitura de metadados de workspace |
| `base44 sandbox ls` / `sandbox read` / `sandbox grep` | Nome e assinatura (sem flag de escrita) indicam leitura — recomendo validar com um teste mínimo antes do primeiro uso real |
| `base44 logs` | Nome e parâmetros indicam leitura — recomendo validar com um teste mínimo antes do primeiro uso real |

### Nunca executar automaticamente (exigem aprovação explícita, caso a caso)

| Comando | Motivo |
|---|---|
| `base44 eject` | **Comprovadamente NÃO é somente leitura** — cria app novo e publica funções (incidente real desta sessão) |
| `base44 deploy` | Deploy explícito de todos os recursos do projeto |
| `base44 functions deploy` | Deploy de função(ões) — usado antes só com aprovação explícita item a item |
| `base44 create` | Cria projeto/app novo |
| `base44 link --create` | Cria projeto novo (vinculando) |
| `base44 scaffold` | Baixa template para um app — grava arquivos, pode confundir com projeto principal |
| `base44 entities push` | Sobrescreve entidades remotas |
| `base44 agents push` | Sobrescreve TODOS os agentes remotos |
| `base44 agents pull` | Sobrescreve TODOS os configs locais de agente |
| `base44 connectors push` | Sobrescreve conectores remotos |
| `base44 connectors initiate` | Inicia fluxo OAuth real |
| `base44 connectors pull` | Sobrescreve configs locais de conector |
| `base44 auth push` | Sobrescreve configuração de autenticação do app |
| `base44 auth pull` | Sobrescreve arquivo local de auth |
| `base44 secrets set` / `secrets delete` | Escreve/apaga secrets |
| `base44 site deploy` | Publica o site |
| `base44 visibility <level>` | Altera visibilidade pública do app |
| `base44 workspace move` | Move o app entre workspaces |
| `base44 exec` (sem auditar o script antes) | Executa código arbitrário autenticado — pode ler OU escrever, dependendo só do script |
| `base44 sandbox write` / `edit` / `run` / `checkpoint` | Escrevem ou executam comandos no sandbox remoto |
| `base44 dev` | Sobe servidor local — baixo risco, mas fora do escopo de "auditoria", não necessário |
| `base44 login` / `logout` | Altera sessão de autenticação — nunca trocar de conta sem instrução explícita |

---

## Melhores práticas e recomendações para futuras auditorias

1. **Nunca confiar no nome ou na descrição (`--help`) de um comando** — validar comportamento real com um teste mínimo e reversível antes de generalizar seu uso, exatamente como o incidente do `eject` ensinou.
2. **Toda operação que grava algo localmente deve ser feita em pasta isolada** (`.tmp/`), nunca sobrescrevendo `base44/functions/`, `src/`, `api/` ou `docs/` do projeto principal.
3. **`entities`/`workflows`/`automations`/`permissions`/histórico de deploy não têm caminho de leitura seguro via CLI hoje** — qualquer necessidade real de inspecioná-los deve passar pelo painel web do Base44 ou por uma pergunta direta a você, nunca por uma tentativa de comando não validado.
4. **`base44 exec` só deve rodar depois de o script ser lido e aprovado explicitamente** — o comando em si não distingue leitura de escrita, isso depende inteiramente do conteúdo do script.
5. **Antes de qualquer comando não listado como "100% seguro" acima, parar e pedir autorização explícita**, mesmo que pareça óbvio pelo nome.

---

## Conclusão

Este documento é somente informativo. Nenhum comando de escrita foi executado durante esta auditoria — só `--help` (local) e referência a resultados já obtidos com segurança comprovada em turnos anteriores desta mesma sessão. Aguardando sua aprovação antes de qualquer próximo passo.
