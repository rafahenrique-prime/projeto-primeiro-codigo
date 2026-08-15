# Consulta_Frete_API — GPT Maker (ação manual) → IGNITE → Frenet

**Status:** validado ponta a ponta em Preview e em conversa real via WhatsApp/Gaby Lab (14-15/08/2026).
**Mantido por:** Rafael Henrique / Claude Sonnet 5.

Registra a implementação da ferramenta `consultar_frete` no MCP Lite do
IGNITE e a configuração da intenção `Consulta_Frete_API` no GPT Maker
(Gaby Lab) que a consome — incluindo um achado de compatibilidade HTTP que
vale para qualquer futura ação manual do GPT Maker.

## Arquitetura

```
Cliente (WhatsApp/Gaby Lab)
  → GPT Maker, intenção "Consulta_Frete_API" (ação manual — URL+Headers+Body,
    NÃO é a conexão MCP nativa)
    → POST <Preview Vercel>/api/system-tools?tool=mcp&x-vercel-protection-bypass=<VERCEL_AUTOMATION_BYPASS_SECRET>
    → Headers: Content-Type / Authorization Bearer <MCP_LITE_SECRET>
    → Body: envelope JSON-RPC 2.0 (tools/call → consultar_frete)
  → api/system-tools.js (tool=mcp) → mcpToolCallDispatch → consultarFrete()
  → api/_consultarFrete.js → Frenet real (POST /shipping/quote)
  → resposta normalizada (structuredContent.opcoes) devolvida no JSON-RPC
  → GPT Maker interpreta a resposta da API (sem persistir variável extra no contato)
  → Gaby responde ao cliente em linguagem natural
```

**Importante — não confundir com `Consulta_CEP_MCP`:** essa é a conexão MCP
nativa do GPT Maker (ele fala JSON-RPC sozinho, descobre ferramentas via
`tools/list`, sem Body manual). `Consulta_Frete_API` é uma **ação manual**
que reaproveita o mesmo endpoint `tool=mcp` do IGNITE, mas com o GPT Maker
montando a chamada HTTP e o envelope JSON-RPC à mão — são dois caminhos de
configuração diferentes para o mesmo backend.

Implementação da ferramenta em si: [api/_consultarFrete.js](../../api/_consultarFrete.js) (helper privado, mesmo padrão de `_consultarCep.js`), registrada em [api/system-tools.js](../../api/system-tools.js) junto de `consultar_cep`/`consultar_cobrancas`. Só `cep_destino` é variável — origem, peso, dimensões e valor declarado são fixos, validados contra a Frenet real (`SellerCEP 01030001`, `ShipmentInvoiceValue 100`).

## Configuração validada no GPT Maker (Consulta_Frete_API)

**Método:** `POST`

**Endpoint:** deployment Preview validado da Vercel, rota `/api/system-tools?tool=mcp`, com o bypass de Deployment Protection como query param:
```
<Preview Vercel>/api/system-tools?tool=mcp&x-vercel-protection-bypass=<VERCEL_AUTOMATION_BYPASS_SECRET>
```
(nunca registrar o valor real do secret aqui — só o placeholder)

**Headers:**

| Nome do campo | Valor do campo |
|---|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <MCP_LITE_SECRET>` |

### ⚠️ Achado reutilizável: nome do header sem `:` no final

Na tela de ação manual do GPT Maker, o **nome** do campo de header não deve
terminar com `:`. Errado: `Content-Type:` / `Authorization:`. Certo:
`Content-Type` / `Authorization`.

Com o `:` sobrando, o executor HTTP do GPT Maker (`okhttp/4.12.0`) falhava
com:
```
HTTP 500 — {"error":"fail on execute request, e:[stream was reset: CANCEL]"}
```
Diagnóstico feito por bisseção: o mesmo Body/headers apontados para
`https://httpbin.org/post` funcionavam normalmente (confirmando que o
executor HTTP do GPT Maker em si funciona), e os logs de runtime da Vercel
não mostravam nenhuma requisição chegando à função durante as tentativas
com erro — evidência de que a falha acontecia na camada de transporte,
antes de qualquer coisa no IGNITE. Corrigir só o nome do header resolveu,
sem qualquer mudança de código, Vercel ou secrets. **Vale para qualquer
ação manual futura configurada no GPT Maker.**

**Body (envelope JSON-RPC 2.0 completo — não existe endpoint REST simples para essa ferramenta):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "consultar_frete",
    "arguments": {
      "cep_destino": "{{cep_destino}}"
    }
  }
}
```

O campo `"id"` é **obrigatório**. Sem ele, `mcpHandleMessage()` em `api/system-tools.js` trata a mensagem como notificação JSON-RPC 2.0 (protocolo, não bug) e retorna `HTTP 202` sem corpo — sintoma observado numa etapa intermediária do teste, antes de confirmar que o Body estava completo.

**Dados de Saída:** "Resposta do agente deve ser baseada em: Na interpretação da resposta da API" — sem persistir variável adicional no contato.

**Variável `cep_destino`:** Texto. Aceita com ou sem hífen — `consultarFrete()` normaliza (remove tudo que não é dígito) antes de montar o payload para a Frenet.

## Testes ponta a ponta validados

1. **CEP válido com hífen** (`38405-040`) → consulta realizada corretamente.
2. **CEP válido sem hífen** (`38405040`) → normalizado corretamente para `38405-040`.
3. **CEP incompleto** (`123`) → Gaby pediu o CEP completo com 8 dígitos, não inventou frete.
4. **Pergunta sem CEP** ("Quanto custa o frete?") → Gaby pediu o CEP antes de consultar.
5. **CEP informado anteriormente na conversa** → após ajuste de treinamento de comportamento (ver abaixo), Gaby reutilizou o CEP já informado sem pedir de novo.
6. **CEP sem modalidade disponível** (`00001-040`) → Gaby informou que nenhuma modalidade foi encontrada, sem inventar valor/prazo.
7. **Frenet real** → retornou modalidades reais (Loggi, Jadlog Package, PAC, Sedex observadas nos testes). Valores e prazos são dinâmicos — não documentar como fixos.

## Treinamento de comportamento (Gaby Lab)

Foi ajustado o training de comportamento da consulta de frete pra cobrir:
- reutilizar CEP válido já existente no contexto recente da conversa;
- pedir CEP somente quando necessário (não repetir se já foi informado);
- sempre usar `Consulta_Frete_API` para valor/prazo — nunca calcular ou estimar;
- usar o CEP mais recente quando o cliente informar outro depois;
- tratar corretamente a ausência de modalidades retornadas.

Esse ajuste resolveu um problema observado em teste onde a Gaby pedia de
novo um CEP que o cliente já tinha informado antes na mesma conversa.

## Regra comercial de frete (referência, não decisão nova)

- Frete grátis em compras acima de R$ 400,00.
- Abaixo desse valor, calculado por CEP através da ferramenta/Frenet.
- Nunca informar valor ou prazo de frete sem consultar a ferramenta.

Fonte: training "ENTREGAS E FRETE" da Gaby Lab (mesmo bloco onde vive a regra de retirada, abaixo).

## Retirada na loja (auditoria de uma afirmação espontânea da Gaby)

Durante os testes, a Gaby respondeu espontaneamente que "a retirada na
loja é gratuita e o pedido fica disponível após 2 horas". Investigação
confirmou que **não é alucinação** — é uma regra comercial real, presente
no training oficial "ENTREGAS E FRETE" (`3F795EEE1658E0ECBEBA6EA3EEAB912E`),
adicionada deliberadamente em 13/08/2026 (ver `docs/backups/gabylab-reconstrucao-homologacao-2026-08-13.md`, itens 74-78). Backup de origem:
[docs/backups/gabylab-trainings-backup-POST-ENTREGASRETIRADA-2026-08-13.json](../backups/gabylab-trainings-backup-POST-ENTREGASRETIRADA-2026-08-13.json).

Trecho relevante do training:
```
RETIRADA NA LOJA:
Retirada na loja é gratuita. O pedido fica disponível para retirada após 2 horas.
```

Existe também uma versão legada mais detalhada (com horário de
funcionamento Seg-Sex 10h-20h / Sáb 9h-16h) em
`docs/backups/gabylab-legacy-knowledgebase-backup-2026-08-13.json:279` —
não é a fonte da resposta atual da Gaby (é conhecimento legado, não o
training ativo), só um registro de que esse detalhe existe em arquivo caso
se decida incluir no training oficial no futuro.

## Padrão reutilizável para futuras ações do GPT Maker

Este fluxo estabelece um padrão reaproveitável pra ligar qualquer
ferramenta MCP já existente no IGNITE a uma intenção do GPT Maker, sem
precisar criar um endpoint REST dedicado por ferramenta:

```
GPT Maker (ação manual)
  → HTTP POST
  → Authorization: Bearer <MCP_LITE_SECRET>
  → Body: envelope JSON-RPC 2.0 (tools/call → nome da ferramenta MCP existente)
  → /api/system-tools?tool=mcp
```

Candidatas identificadas (avaliação, **não implementadas**):
- `consultar_cep` — já existe em `MCP_TOOLS`, mesma autenticação; poderia virar `Consulta_CEP_API` no futuro, mantendo `Consulta_CEP_MCP` separada como teste da conexão MCP nativa.
- `consultar_cobrancas` — mesmo padrão técnico, mas exige revisão dedicada antes de ligar numa intenção real, por expor dado financeiro.

Cada ferramenta futura deve ser avaliada individualmente antes de ativação — este documento não autoriza nenhuma ativação nova.

## Segurança

- `FRENET_TOKEN` nunca vai para o GPT Maker — fica só em `process.env.FRENET_TOKEN`, usado dentro de `_consultarFrete.js` no servidor.
- `MCP_LITE_SECRET` é usado somente no header `Authorization` da ação manual.
- `VERCEL_AUTOMATION_BYPASS_SECRET` fica somente no parâmetro de bypass da URL do Preview, enquanto essa validação estiver rodando contra um deployment protegido — não é um padrão pretendido para Production (Production usa domínio próprio, fora de `all_except_custom_domains`, sem precisar de bypass).
- Nenhum secret foi registrado com valor real neste documento nem em nenhum outro arquivo do repositório.

## Status

**Consulta_Frete_API: ENCERRADA/VALIDADA.** Fluxo completo (GPT Maker → IGNITE → Frenet → resposta ao cliente) confirmado em Preview e em conversa real via WhatsApp. Production não foi tocada.
