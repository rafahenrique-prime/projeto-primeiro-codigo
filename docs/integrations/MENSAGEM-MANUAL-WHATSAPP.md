# Mensagem Manual WhatsApp — IGNITE → Base44 → WAHA

**Status:** homologado ponta a ponta em Preview (14-15/08/2026).
**Mantido por:** Rafael Henrique / Claude Sonnet 5.

Playbook do incidente que levou da primeira tentativa (404) até o envio real
confirmado no WhatsApp. Guarda a arquitetura, as 4 causas raiz encontradas em
sequência, os sinais de diagnóstico e como investigar cada camada de novo se
o problema reaparecer (nesta função ou em qualquer outra que reuse WAHA).

## Arquitetura

```
IGNITE (modal EnviarMensagemManualModal.jsx)
  → POST /api/system-tools?tool=mensagem-manual   (Vercel, api/system-tools.js)
  → api/_mensagemManualProxy.js (chamarEnviarMensagemManualWhatsapp)
  → Base44 Function enviarMensagemGeralWhatsApp
      → Cliente/telefone (Base44 entities)
      → base44/shared/whatsappSender.ts → sendViaWaha()
          → PN → LID  (GET .../api/{session}/lids/pn/{phone})
          → Cloudflare Tunnel (trycloudflare.com)
          → WAHA (Docker local, sessão prime-noweb)
          → WhatsApp
      ← resposta { status, error_code, provider_version, ... }
  ← proxy IGNITE (construirRespostaSeguraMensagemManual)
  ← modal (EnviarMensagemManualModal.jsx)
```

## As 4 causas raiz, na ordem em que foram descobertas

### 1. Domínio errado da Function no proxy
`ENVIAR_MENSAGEM_GERAL_URL` usava o App ID do Base44 como subdomínio
(`6a728f9b46a0aea20081a11f.base44.app`), que não roteia nenhuma Backend
Function (404 universal, confirmado testando várias functions no mesmo
domínio). O domínio real, confirmado por teste HTTP e por autorreferência do
próprio código Base44, é `prime-cobrancas-bluider.base44.app`.
**Correção:** `api/_mensagemManualProxy.js` — 1 linha.

### 2. `WHATSAPP_INTERNAL_TOKEN` — snapshot de runtime desatualizado
Depois de corrigir o domínio, a chamada passou a bater 403 Unauthorized.
Rotacionamos o secret nos 3 lados (Base44, Vercel Preview, Vercel
Production) com o mesmo valor — confirmado via sentinel de comparação
SHA-256 (`tokens_match: true`) — e o 403 **continuou**. A causa real: a
Function usa `Deno.env.get()` para ler o secret, não `secrets.get()` do
módulo `base44:runtime`; só este último tem garantia documentada de
auto-redeploy ao rotacionar um secret. **Publicar manualmente a Function
pelo dashboard do Base44** foi o que efetivamente atualizou o runtime.

### 3. Cloudflare Quick Tunnel com processo vivo mas sem conexão
Depois do token resolvido, o erro virou `WAHA_LID_LOOKUP_FAILED`. WAHA local
(Docker) e sessão `prime-noweb` estavam saudáveis, mas o processo
`cloudflared tunnel --url http://localhost:3001` tinha `readyConnections: 0`
no seu próprio endpoint local de diagnóstico (`http://localhost:20241/ready`)
— o processo local existia, mas sem nenhuma conexão útil ao edge da
Cloudflare, então o hostname público (`*.trycloudflare.com`) parou de
resolver (DNS) / retornava HTTP 530.
**Correção:** matar e recriar o processo `cloudflared`, capturar a nova URL,
validar local + público + autenticado, atualizar `WAHA_BASE_URL` no Base44,
republicar a Function.

### 4. Divergência de formato de telefone no lookup PN→LID
Com o túnel resolvido, o erro virou `WAHA_LID_NOT_FOUND` — o WAHA respondia,
mas não achava LID para o número salvo em `Cliente.telefone`. Testado
diretamente contra o WAHA (leitura, sem enviar mensagem):
- `34997257499` (sem DDI) → `lid: null`
- `5534997257499` (DDI 55 + o "9" extra, exatamente como salvo) → `lid: null`
- `553497257499` (DDI 55, **sem** o "9" extra) → `lid` encontrado

O número tem WhatsApp e existe como contato/chat real (`check-exists`
confirmou), só que o WhatsApp normaliza esse número em específico sem o "9"
extra do celular brasileiro — e o código só tentava um formato.
**Correção:** `buildLidLookupCandidates()` em `base44/shared/whatsappSender.ts`
— até 2 tentativas determinísticas (original, depois com/sem o 9), só para
números que já começam com `55` e têm 12 ou 13 dígitos. DDI continua sendo
responsabilidade exclusiva de `normalizePhone()` — este helper nunca adiciona
`55`.

### Bônus: bug de contrato `success`/`status` (não era causa raiz do envio, mas quebrava o feedback visual)
Com as 4 causas acima resolvidas, o backend passou a enviar de verdade — mas
o modal continuava mostrando erro. Duas incompatibilidades de contrato entre
o Builder e o frontend legado (herdado do fluxo Free):
- `construirRespostaSeguraMensagemManual` fazia `Boolean(json?.success)`,
  mas o Builder nunca envia um campo `success` — só `status: 'sucesso'/'erro'`
  (em português). Resultado: `success` virava sempre `false`, mesmo em envio
  bem-sucedido.
- O modal só reconhecia sucesso com `status === 'sent'` (valor do fluxo
  legado), nunca `'sucesso'` (valor real do Builder).
**Correção:** proxy deriva `success` de `status === 'sucesso'` quando o
campo booleano não vem (preserva compatibilidade com quem já manda
`success` explícito); modal aceita `'sucesso'` além de `'sent'`.

## Sinais de diagnóstico — o que cada erro significa

| Sinal | Significa | Investigar |
|---|---|---|
| `403` na chamada IGNITE→Base44 | Autenticação falhou | `WHATSAPP_INTERNAL_TOKEN` — mas confirme com um sentinel de hash antes de assumir divergência; pode ser snapshot de runtime desatualizado (`Deno.env.get()`) |
| `404` em qualquer Function do domínio | Domínio errado, não function específica | Confirmar o domínio publicado real (autorreferência no próprio código, ou `secrets.get`/painel) |
| `WAHA_LID_LOOKUP_FAILED` | A consulta ao WAHA **não conseguiu ser executada** (rede/túnel/HTTP) | Camada de rede: container, sessão, túnel, `readyConnections` — nessa ordem |
| `WAHA_LID_NOT_FOUND` | O WAHA **respondeu normalmente**, mas não achou LID pra esse PN | Formato do telefone — DDI, dígito 9 extra, ou o número realmente não tem WhatsApp |
| `status: 'sucesso'` no backend + banner de erro no frontend | Bug de contrato entre camadas, não falha de envio | Comparar o schema real da resposta (`status`/`success`) com o que cada camada downstream espera |

## Como diagnosticar a camada Cloudflare Tunnel → WAHA

1. **Processo `cloudflared` rodando NÃO significa túnel saudável.**
   `ps aux | grep cloudflared` só confirma que o processo existe.
2. Verificar `readyConnections` no endpoint local de métricas do próprio
   cloudflared: `curl http://localhost:20241/ready` → `readyConnections: 0`
   = túnel sem conexão útil ao edge, mesmo com o processo vivo.
3. Testar WAHA local: `GET http://localhost:{porta}/api/server/status`
   (401 sem API key já prova que o servidor está de pé).
4. Testar a URL pública do túnel com o mesmo endpoint, sem auth — timeout
   ou "could not resolve host" indica túnel morto; 401 indica alcançável.
5. Testar a URL pública **autenticada** (com `X-Api-Key`) — HTTP 200 confirma
   ponta a ponta (Base44 conseguiria chegar até o WAHA).
6. Só depois disso investigar PN→LID — nunca antes de confirmar
   conectividade.

⚠️ **Quick Tunnel (`trycloudflare.com`) é temporário.** Pode cair ou trocar
de URL a qualquer momento (sem aviso, sem persistência). Não é uma
arquitetura adequada pra estabilidade de produção — considerar Cloudflare
Named Tunnel com domínio estável no futuro. **Não implementado agora,
fora do escopo desta correção.**

## PN → LID — comportamento atual

`buildLidLookupCandidates()` em `base44/shared/whatsappSender.ts`:
- Número que **não** começa com `55` → 1 candidato, sem mutação (DDI é
  responsabilidade de `normalizePhone()`, nunca duplicada aqui).
- `55` + DDD + 8 dígitos (12 total) → tenta original, depois com o "9"
  inserido.
- `55` + DDD + 9 + 8 dígitos (13 total) → tenta original, depois sem o "9".
- Qualquer outro formato → 1 candidato, sem mutação.
- Máximo 2 tentativas, sempre nessa ordem, para no primeiro sucesso.
- `WAHA_LID_LOOKUP_FAILED` só se **nenhuma** tentativa obteve resposta HTTP
  2xx válida; `WAHA_LID_NOT_FOUND` se **pelo menos uma** respondeu 2xx sem
  achar `lid` (`hadSuccessfulLookupResponse`, não confundir os dois).

## `secrets.get()` vs `Deno.env.get()` — o que foi observado (hipótese, não fato universal)

A documentação oficial do Base44 descreve auto-redeploy de Backend Functions
ao rotacionar um secret **especificamente para `secrets.get()`** do módulo
`base44:runtime`. Nesta investigação, uma Function usando `Deno.env.get()`
diretamente continuou respondendo com o valor antigo do secret mesmo depois
da rotação confirmada — só voltou a refletir o valor novo depois de
republicar manualmente. Isso é consistente com "`Deno.env.get()` não tem a
mesma garantia de propagação automática", mas não foi confirmado como
comportamento documentado/garantido pela Base44 — trate como sinal de alerta
prático (funções que leem secrets via `Deno.env.get()` podem precisar de
republish manual após rotação), não como regra universal.

## Base44 é nuvem — WAHA local não é diretamente alcançável

Toda vez que uma Function do Base44 precisar falar com um serviço rodando
localmente (WAHA, ou qualquer outro), é obrigatório expor esse serviço
publicamente de forma segura (túnel ou host próprio) — `localhost`/IP
privado nunca é alcançável a partir do runtime do Base44. Antes de suspeitar
do WAHA em si, seguir a ordem: container → sessão → endpoint local → túnel →
`readyConnections` → endpoint público → só então PN→LID.

## Artefatos temporários (já removidos)

Durante o diagnóstico foram usados sentinels condicionais (header
`X-Diag-Check`) tanto no IGNITE (`case 'diag-auth-header'` em
`api/system-tools.js`) quanto na Function Base44 (dois blocos condicionais
em `entry.ts`) para comparar hashes de token e headers sem revelar secrets.
Todos removidos após o fechamento do incidente (commit
`chore(mensagem-manual): remove instrumentação/sentinels temporários de
diagnóstico`, mais a limpeza equivalente publicada manualmente no Base44).
