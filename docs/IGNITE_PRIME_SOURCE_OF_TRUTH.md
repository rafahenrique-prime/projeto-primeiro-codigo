# IGNITE PRIME — SOURCE OF TRUTH

**Status:** documento oficial de entrada documental  
**Lote:** 001 — Organização Documental Controlada  
**Última atualização:** 2026-08-20  
**Branch de organização:** `docs/lote-001-organizacao-documental`  
**Escopo:** documentação e classificação estrutural. Nenhum código funcional, secret, workflow, infraestrutura, integração, branch existente ou variável de ambiente é alterado por este lote.

> Este documento é a porta de entrada oficial para humanos e agentes de IA que precisem compreender o estado documentado do IGNITE PRIME. Ele não substitui o código nem autoriza alterações. Em caso de conflito, a precedência abaixo determina qual fonte deve ser consultada primeiro.

## 1. O que é o IGNITE PRIME

O IGNITE PRIME é um sistema operacional/comercial composto por um painel React/Vite, funções serverless na Vercel, persistência e Storage no Supabase, automações e agentes GPT Maker, integrações de catálogo e caminhos de mensageria/WhatsApp. O mesmo repositório também contém um catálogo público HTML independente, funções Base44, uma POC de bridge, migrações Supabase, documentação operacional e materiais de histórico/backup.

A existência de um arquivo, branch ou integração neste repositório não prova que ele esteja em produção. O status deve ser lido nos mapas deste lote e confirmado contra a fonte técnica indicada.

## 2. Precedência oficial das fontes

Quando houver conflito, use a seguinte ordem, do mais autoritativo para o menos autoritativo:

| Ordem | Fonte | O que ela determina |
|---:|---|---|
| 1 | Estado efetivo do código e configuração da branch-alvo (`src/`, `api/`, `base44/`, `catalogo-publico/`, `package.json`, `vercel.json`, `.github/workflows/`, `supabase/migrations/`) | Comportamento e caminhos que existem no snapshot auditado. Código/configuração não provam, sozinhos, que um caminho está implantado ou sendo chamado em produção. |
| 2 | `docs/COMPONENT_STATUS.md`, `docs/API_INVENTORY.md`, `docs/BRANCH_STATUS.md`, `docs/SECRETS_MAP.md` e este documento | Classificação documental controlada de componentes, APIs, branches e secrets estruturais. |
| 3 | Documentação especializada atual, especialmente `docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md`, `docs/ARCHITECTURE.md`, `docs/WEBHOOKS.md`, `docs/SUPABASE.md` e `docs/DEPLOY.md` | Contexto técnico, contratos, deploy e decisões. Deve ser confrontada com código/configuração quando a data ou o estado divergir. |
| 4 | `CLAUDE.md`, `AGENTS.md`, `.agents/`, `.claude/` e Skills | Procedimentos para agentes e operação. Seguem a arquitetura atual; não autorizam mudanças por si mesmos. Em conflito entre os dois manuais raiz, prevalece a versão mais recente após validação neste mapa. |
| 5 | Backups, relatórios, investigações, tags e documentos marcados como históricos | Evidência temporal e contexto de decisão. Não devem ser tratados como estado atual sem confirmação. |

### Regra para conflitos

Quando uma documentação antiga descreve um caminho que não aparece no código/configuração atual, preserve o contexto histórico e registre o par **HISTÓRICO / ATUAL**. Não declare automaticamente que o caminho antigo está morto, removível ou sem consumidor.

Quando a configuração declarar um caminho diferente do documento, registre o caminho da configuração como **estado configurado** e o documento antigo como **desatualizado**. Se o runtime efetivo não puder ser confirmado somente pelo repositório, use **NÃO CONFIRMADO**.

## 3. Mapas oficiais do Lote 001

| Documento | Função |
|---|---|
| [`COMPONENT_STATUS.md`](./COMPONENT_STATUS.md) | Classifica componentes por finalidade, status, ambiente, V1/V2, consumidor e evidência. |
| [`BRANCH_STATUS.md`](./BRANCH_STATUS.md) | Registra as 11 branches encontradas, relação com `main`, finalidade aparente e recomendação futura. |
| [`API_INVENTORY.md`](./API_INVENTORY.md) | Inventaria endpoints públicos, helpers relevantes e tools do dispatcher `api/system-tools.js`. |
| [`SECRETS_MAP.md`](./SECRETS_MAP.md) | Mapeia somente nomes, consumidores, camadas, ambientes, fonte oficial e riscos; nunca valores. |
| [`GLOSSARY.md`](./GLOSSARY.md) | Define nomes e conceitos do projeto, mantendo ambiguidades explicitamente registradas. |

## 4. Classificações oficiais

| Classificação | Significado neste mapa |
|---|---|
| `PRODUÇÃO` | Há evidência documental/código de que o componente participa do caminho operacional; implantação efetiva ainda deve ser confirmada quando o repositório não bastar. |
| `LAB` | Caminho destinado a laboratório, agente de teste ou experimentação controlada. |
| `PREVIEW` | Implementação ou branch de pré-visualização/cutover, ainda não declarada como V1 produtiva. |
| `POC` | Prova de conceito com arquitetura ou integração em validação. |
| `EXPERIMENTAL` | Implementação experimental, sem evidência suficiente para tratá-la como produção. |
| `HISTÓRICO` | Backup, snapshot, investigação ou estado temporal preservado para referência. |
| `LEGADO` | Caminho substituído com evidência suficiente de que uma alternativa posterior existe; não é autorização de remoção. |
| `NÃO CONFIRMADO` | A evidência disponível não permite concluir o estado operacional. |
| `CONSUMIDOR NÃO IDENTIFICADO` | Não foi encontrado consumidor estático suficiente; isso não prova ausência de consumidor dinâmico. |

## 5. V1 e V2

O **V1** é o conjunto operacional atual, incluindo o painel React/Vite, catálogo/Supabase, webhook de conhecimento, auto-photo, diagnósticos e integrações que a documentação classifica como produção. O **V2** é direção futura ou caminho de migração; não é uma implementação autorizada por este documento.

O PRIME Bridge, o cutover Builder/Lyra, a separação do dispatcher e a evolução dos providers WhatsApp devem ser classificados como `PREVIEW`, `POC`, `EXPERIMENTAL` ou `MIGRAÇÃO PARA V2` quando houver evidência. Um item não deve ser movido para V2 somente pelo nome de uma branch.

## 6. Política de secrets

A política oficial para documentação deste lote é:

> **Bitwarden Secrets Manager = Source of Truth dos secrets técnicos do IGNITE PRIME.**

`docs/SECURITY/SECRETS.md` é preservado como contexto histórico e taxonomia anterior; sua indicação de Apple Passwords como fonte da verdade foi **SUBSTITUÍDA pela política Bitwarden-first** documentada em `docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md`. Esta decisão documental não migra, rotaciona, altera ou revela qualquer secret.

Os mapas deste lote registram apenas nomes e relações. Valores de tokens, chaves, senhas, IDs sensíveis e conteúdo de `.env` não pertencem a este documento.

## 7. Regras para agentes de IA

Um agente deve começar por este arquivo e seguir os mapas relacionados. Antes de sugerir alteração, deve identificar o componente, seu status, ambiente, consumidor, fonte de evidência e risco de compatibilidade. Se a evidência não for suficiente, deve usar `NÃO CONFIRMADO` ou `CONSUMIDOR NÃO IDENTIFICADO`.

Este documento não autoriza commit, push, merge, exclusão, renomeação, migração, rotação, deploy, alteração de workflow ou alteração de integração. Qualquer ação futura depende de autorização específica e revisão do diff.

## 8. Referências canônicas

- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`docs/WEBHOOKS.md`](./WEBHOOKS.md)
- [`docs/DEPLOY.md`](./DEPLOY.md)
- [`docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md`](./SECURITY/BITWARDEN-SECRETS-MANAGER.md)
- [`docs/SECURITY/SECRETS.md`](./SECURITY/SECRETS.md) — contexto histórico/taxonômico; a autoridade de secrets deste mapa é Bitwarden-first.
- [`CLAUDE.md`](../CLAUDE.md)
- [`AGENTS.md`](../AGENTS.md)

**Estado deste documento:** criado no LOTE 001. Não representa autorização para executar o LOTE 002.
