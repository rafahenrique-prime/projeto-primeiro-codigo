# POC 2 — Ponte ZAP-API Trial ↔ GPTMaker Conversation API

POC isolada e descartável. Nenhuma dependência nova, nenhum arquivo do projeto principal tocado.

## Passo 1 — Subir o servidor local

```bash
AGENT_ID="..." \
GPT_TOKEN="..." \
ZAPI_INSTANCE_ID="..." \
ZAPI_TOKEN="..." \
node poc/zap-gptmaker-bridge/server.mjs
```

Onde:
- `AGENT_ID` / `GPT_TOKEN` → mesmos da POC 1 (Gabi teste)
- `ZAPI_INSTANCE_ID` → ID da instância ZAP-API Trial
- `ZAPI_TOKEN` → token `tk_...` da instância (usado como `Authorization: Bearer`)

Não há Client-Token nesse provedor — a doc oficial (zap-api.tech) usa só `Authorization: Bearer tk_...`.

## Passo 2 — Abrir túnel público (em outro terminal)

```bash
npx localtunnel --port 3344
```

Isso imprime uma URL tipo `https://algo-aleatorio.loca.lt`. A URL do webhook será:

```
https://algo-aleatorio.loca.lt/webhook
```

## Passo 3 — Configurar o webhook na ZAP-API Trial

No painel da instância Trial, configurar o Webhook para o evento `message.received`, colando a URL do túnel + `/webhook`.

## Passo 4 — Testar

Do celular, mandar "teste prime" pro número de teste conectado na instância Trial.

Acompanhar os logs no terminal do `server.mjs` — cada etapa é impressa (recebido → chamando Gabi → resposta → enviando → latência total).

## Encerrar a POC

`Ctrl+C` nos dois terminais (server e túnel). Nada fica rodando, nada foi instalado no projeto, nada foi commitado.
