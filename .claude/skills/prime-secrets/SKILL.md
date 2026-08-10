---
name: prime-secrets
description: Como descobrir e usar secrets técnicos do IGNITE PRIME (Bitwarden Secrets Manager) sem pedir credenciais ao Rafael nem vasculhar .env — leitura autorizada por padrão, escrita sempre com aprovação explícita separada
type: reference
version: 1.0.0
last-updated: 2026-08-10
applies-to: [IGNITE PRIME]
load-trigger: auto
load-priority: high
dependencies: [none]
max-size: 4KB
---

# PRIME SECRETS

## Objetivo

Manual operacional + roteador. Não duplica `docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md` — esse documento é a fonte detalhada de verdade (lista dos 21 secrets, config do Bitwarden, comandos completos). Aqui só o suficiente pra saber o que fazer sem perguntar.

## Quando usar

Uma tarefa real precisa de uma credencial pra funcionar (API key, token, secret, senha de serviço) — o momento em que, sem isso, eu pediria a credencial ao Rafael ou sairia procurando em `.env`/`.env.local`.

**Não ativar** só porque a palavra "token"/"key"/"secret" aparece em documentação, comentário, exemplo de código, ou numa discussão conceitual sem uso real.

## Procedimento

1. Identificar o **nome exato** da variável necessária.
2. Checar se já está entre os 21 secrets migrados — lista em `docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md` §2 (não duplicar aqui, consultar lá).
3. **Se existir**: usar via `bws` (Keychain + Machine Account já configurados, comandos em §3/§11 do documento) sem nunca exibir o valor.
4. **Se não existir**: responder
   ```
   SECRET NÃO ENCONTRADO NO BITWARDEN
   AÇÃO MANUAL NECESSÁRIA
   ```
   e explicar o que falta (gerar a credencial, depois seguir o fluxo "Novo secret" abaixo). Nunca inventar, nunca vasculhar arquivos "só pra ver", nunca criar sozinho.

## Leitura × escrita

**Leitura (permitida, rotina)**: `bws secret list/get`, `node scripts/security/compare-bitwarden-vercel.mjs` (sempre read-only).

**Escrita (nunca automática — exige autorização explícita separada, sempre)**: `bws secret create/edit/delete`, qualquer alteração no Bitwarden ou na Vercel, GitHub Secrets, `.env`/`.env.local`, deploy/redeploy, e **`node scripts/security/sync-bitwarden-vercel.mjs`** — mesmo detectando `DIFERENTE`, reportar e pedir autorização; nunca encadear a chamada sozinho.

## Vercel

- `compare-bitwarden-vercel.mjs` = READ-ONLY, sempre seguro de rodar.
- `sync-bitwarden-vercel.mjs` = escrita controlada — nunca disparar sem autorização explícita para aquele secret+ambiente específico.
- **Sensitive/write-only**: nunca tentar contornar, nunca tentar recuperar o valor. Reportar `NÃO COMPARÁVEL — VERCEL SENSITIVE/WRITE-ONLY`.
- **Fase 5 (rotação de Sensitive)**: não implementada, não iniciar implicitamente — só se Rafael pedir explicitamente.
- **Production**: nunca automática. Sempre aprovação explícita por execução, nunca por lote.
- `.env`/`.env.local` **não são fonte oficial** dos secrets migrados — nunca substituir silenciosamente uma consulta ao Bitwarden por eles. `vercel env run` pode sofrer interferência de `.env`/`.env.local` — qualquer comparação com a Vercel usa só as ferramentas isoladas já existentes, nunca um comando `vercel env run` solto.

## Novo secret

```
necessidade identificada → definir nome → Bitwarden primeiro →
ambiente consumidor → validar → documentar
```
Nenhuma criação/distribuição sem autorização explícita.

## Segurança — vocabulário de saída fechado

Nunca imprimir valor, tamanho, hash, prefixo, sufixo, Base64, fragmento ou qualquer transformação do secret. Respostas permitidas sobre estado de um secret:

```
SECRET ENCONTRADO / SECRET AUSENTE
CONFIGURADO / NÃO CONFIGURADO
IGUAL / DIFERENTE / NÃO COMPARÁVEL
AÇÃO MANUAL NECESSÁRIA
```

## Referências

`docs/SECURITY/BITWARDEN-SECRETS-MANAGER.md` (fonte de verdade completa) · `scripts/security/compare-bitwarden-vercel.mjs` · `scripts/security/sync-bitwarden-vercel.mjs` · `scripts/security/_shared.mjs`
