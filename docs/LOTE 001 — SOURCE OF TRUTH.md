# IGNITE PRIME — SOURCE OF TRUTH

**Status:** documento oficial de entrada documental, homologado e corrigido
**Lote:** 001 — Organização Documental Controlada
**Última atualização:** 2026-08-20
**Branch de organização:** `docs/lote-001-organizacao-documental`
**Escopo:** documentação e classificação estrutural. Nenhum código funcional, secret, workflow, infraestrutura, integração, branch existente ou variável de ambiente é alterado por este lote.

> Este documento é a porta de entrada oficial para humanos e agentes de IA que precisem compreender o estado documentado do IGNITE PRIME. Ele diferencia o que foi comprovado no repositório do que foi comprovado operacionalmente fora dele. Não substitui o código, não prova deploy/runtime por si só e não autoriza alterações.

## 1. O que é o IGNITE PRIME

O IGNITE PRIME é um sistema operacional/comercial composto por um painel React/Vite, funções serverless na Vercel, persistência e Storage no Supabase, automações e agentes GPT Maker, integrações de catálogo e caminhos de mensageria/WhatsApp. O mesmo repositório também contém um catálogo público HTML independente, funções Base44, uma POC de bridge, migrações Supabase, documentação operacional e materiais de histórico/backup.

A existência de um arquivo, branch ou integração neste repositório não prova que ele esteja em produção. O status deve ser lido nos mapas deste lote e confirmado contra a fonte técnica indicada.

## 2. Hierarquia oficial de evidências

Quando houver conflito, use a seguinte ordem, do mais forte para o mais fraco:

| Ordem | Fonte/nível | O que pode comprovar | Limite |
|---:|---|---|---|
| 1 | **Evidência operacional atual comprovada** | Deploy/runtime externo, telemetria, última execução ou validação operacional autorizada e datada. | Não foi coletada automaticamente neste lote; quando ausente, não usar `PRODUÇÃO CONFIRMADA`. |
| 2 | **Código/configuração atual** | Implementação existente, rota, tool, workflow, manifest, migration ou configuração no snapshot auditado. | Prova existência/configuração; não prova tráfego ou deploy efetivo. |
| 3 | **Decisão arquitetural explicitamente homologada** | Decisão externa formal, como Bitwarden-first, incorporada ao mapa. | Não cria implementação nem migra secrets. |
| 4 | **Documentação atual** | Estado/comportamento afirmado em documentação datada ou especializada. | Pode estar desatualizada; deve ser confrontada com código/configuração. |
| 5 | **Documentação histórica** | Contexto de decisões anteriores, backups, investigações e rotas substituídas. | Não deve ser tratada como estado atual. |
| 6 | **Inferência/hipótese** | Relação sugerida por nome, localização, convenção ou ausência de busca estática. | Nunca pode ser promovida a fato sem evidência adicional. |

A evidência operacional atual prevalece sobre documentação antiga. Código/configuração prevalece sobre documentação histórica para descrever o que existe no snapshot. Nenhuma inferência pode ser promovida a estado operacional confirmado.

### Regra para conflitos

Quando uma documentação antiga descreve um caminho que não aparece no código/configuração atual, preserve o par **HISTÓRICO / ATUAL NO REPOSITÓRIO**. Se o runtime externo não for comprovado, classifique como **PRODUÇÃO APARENTE / NÃO CONFIRMADA** ou **NÃO CONFIRMADO**.

## 3. Mapas oficiais do Lote 001

| Documento | Função |
|---|---|
| [`LOTE 001 — COMPONENT STATUS.md`](./LOTE%20001%20%E2%80%94%20COMPONENT%20STATUS.md) | Classifica componentes, separando implementação, documentação, configuração, consumidor e runtime. |
| [`LOTE 001 — BRANCH STATUS.md`](./LOTE%20001%20%E2%80%94%20BRANCH%20STATUS.md) | Registra as 11 branches encontradas, relação com `main`, finalidade aparente e recomendação futura. |
| [`LOTE 001 — API INVENTORY.md`](./LOTE%20001%20%E2%80%94%20API%20INVENTORY.md) | Inventaria endpoints públicos, helpers relevantes e tools do dispatcher `api/system-tools.js`. |
| [`LOTE 001 — SECRETS MAP.md`](./LOTE%20001%20%E2%80%94%20SECRETS%20MAP.md) | Mapeia somente nomes, consumidores, camadas, ambientes, fonte oficial e riscos; nunca valores. |
| [`LOTE 001 — GLOSSARY.md`](./LOTE%20001%20%E2%80%94%20GLOSSARY.md) | Define nomes e conceitos do projeto, mantendo ambiguidades explicitamente registradas. |

## 4. Vocabulário de evidência e status

| Termo | Uso obrigatório |
|---|---|
| `CÓDIGO CONFIRMADO` | Existe implementação comprovada no repositório auditado. |
| `DOCUMENTADO` | Existe documentação afirmando o estado/comportamento. |
| `CONFIGURADO` | Existe configuração correspondente no repositório ou plataforma observada. |
| `PRODUÇÃO CONFIRMADA` | Existe evidência operacional externa suficiente, atual e datada. Não usar somente por haver código na `main`. |
| `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | Código/configuração/documentação sugerem uso produtivo, mas o runtime externo atual não foi comprovado. |
| `LAB` / `PREVIEW` / `POC` | Usar somente quando houver evidência suficiente de laboratório, pré-visualização ou prova de conceito. |
| `EXPERIMENTAL` | Implementação experimental com evidência suficiente dessa finalidade, sem promoção automática a produção. |
| `HISTÓRICO` / `LEGADO` | Usar quando houver evidência suficiente de preservação histórica, substituição ou decisão arquitetural explícita. |
| `NÃO CONFIRMADO` | Usar quando as evidências não permitirem conclusão segura. |
| `CONSUMIDOR CONFIRMADO` | Há referência comprovada no código/configuração/documentação para o consumidor indicado. |
| `CONSUMIDOR NÃO IDENTIFICADO` | A busca estática não encontrou consumidor suficiente; isso não prova ausência de consumidor externo/dinâmico. |

## 5. V1 e V2

O **V1** é o conjunto de implementações, configurações e documentos associados ao caminho operacional atual aparente; seus componentes só podem ser marcados como `PRODUÇÃO CONFIRMADA` quando houver evidência externa suficiente. O **V2** é uma direção de evolução, cutover ou nova fronteira arquitetural e não deve ser tratado como implementação ativa apenas por nome de branch, pasta ou documento.

O PRIME Bridge, o cutover Builder/Lyra, a separação do dispatcher e a evolução dos providers WhatsApp devem ser classificados como `PREVIEW`, `POC`, `EXPERIMENTAL`, `NÃO CONFIRMADO` ou `PRODUÇÃO APARENTE / NÃO CONFIRMADA` conforme as evidências. O status operacional atual de Lyra, PRIME Cobranças e Base44 permanece sujeito a decisão arquitetural externa quando o repositório não for suficiente.

## 6. Política de secrets

A política oficial para documentação deste lote é:

> **Bitwarden Secrets Manager = Source of Truth dos secrets técnicos do IGNITE PRIME.**

`docs/SECURITY/SECRETS.md` é preservado como contexto histórico e taxonomia anterior; sua indicação de Apple Passwords como fonte da verdade foi **SUBSTITUÍDA pela política Bitwarden-first** documentada em `docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md`. Esta decisão documental não migra, rotaciona, altera ou revela qualquer secret.

Os mapas deste lote registram apenas nomes e relações. Valores de tokens, chaves, senhas, IDs sensíveis e conteúdo de `.env` não pertencem a este documento.

## 7. Regras para agentes de IA

Um agente deve começar por este arquivo e seguir os mapas relacionados. Antes de sugerir alteração, deve identificar o componente, sua evidência (`CÓDIGO CONFIRMADO`, `DOCUMENTADO`, `CONFIGURADO` ou operacional), ambiente, consumidor, limitações e risco de compatibilidade. Se houver somente código/configuração/documentação, nunca escrever `PRODUÇÃO CONFIRMADA`; usar `PRODUÇÃO APARENTE / NÃO CONFIRMADA` ou `NÃO CONFIRMADO`. A ausência de consumidor em busca estática não autoriza escrever “sem consumidor”, “morto” ou “removível”.

Este documento não autoriza commit, push, merge, exclusão, renomeação, migração, rotação, deploy, alteração de workflow ou alteração de integração. Qualquer ação futura depende de autorização específica e revisão do diff.

## 8. Referências canônicas

- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`docs/WEBHOOKS.md`](./WEBHOOKS.md)
- [`docs/DEPLOY.md`](./DEPLOY.md)
- [`docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md`](./SECURITY/BITWARDEN-SECRETS-MANAGER.md)
- [`docs/SECURITY/SECRETS.md`](./SECURITY/SECRETS.md) — contexto histórico/taxonômico; a autoridade de secrets deste mapa é Bitwarden-first.
- [`CLAUDE.md`](../CLAUDE.md)
- [`AGENTS.md`](../AGENTS.md)

**Estado deste documento:** atualizado na homologação do LOTE 001. Não representa autorização para executar o LOTE 002.
