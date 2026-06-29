# 📚 Índice de Conhecimento - PRIME CRM

Base de conhecimento centralizada para troubleshooting, decisões e padrões do projeto.

**Última atualização:** 2026-06-28

---

## 🔍 Buscar por Sintoma

### Erros de Carregamento

| Sintoma | Possível Causa | Documento |
|---------|---|---|
| "Card travado em Carregando..." | API externa retornando erro | [Vercel: /api/gptmaker-credits 404](troubleshooting/deployment/vercel-gptmaker-404.md) |
| `Failed to load resource: 404` | Endpoint não deployado ou token expirado | [Vercel: /api/gptmaker-credits 404](troubleshooting/deployment/vercel-gptmaker-404.md) |
| `CORS error` | Requisição cross-origin bloqueada | [Backend Proxy Setup](../SETUP_MONITORING.md) |

### Problemas de Integração

| Sintoma | Possível Causa | Documento |
|---------|---|---|
| Token rejeitado (401/403) | Token GPTMaker expirado (~7 dias) | [Vercel: /api/gptmaker-credits 404](troubleshooting/deployment/vercel-gptmaker-404.md) |
| `api.gptmaker.ai` sem resposta | API down ou endpoint incorreto | [Vercel: /api/gptmaker-credits 404](troubleshooting/deployment/vercel-gptmaker-404.md) |

---

## 🏗️ Estrutura da Documentação

```
docs/
├── troubleshooting/          ← Bugs e problemas resolvidos
│   ├── frontend/             ← Componentes React, estado, UI
│   ├── backend/              ← Server.js, Node.js, lógica
│   ├── api/                  ← Integrações, endpoints, HTTP
│   ├── deployment/           ← Vercel, deploy, produção
│   └── integrations/         ← APIs externas, tokens, webhooks
└── INDEX.md                  ← Este arquivo

knowledge/                    ← Fatos puros (O QUÊ)
├── products.md               ← Catálogo, categorias, busca
├── gptmaker.md               ← Credenciais, webhooks, fluxo
├── pricing.md                ← Preços, frete, pagamento
└── policy.md                 ← Trocas, garantia, políticas

strategy/                     ← Comportamento (COMO agir)
├── sales-tactics.md          ← Fluxo de venda, scripts, upsell
├── objection-handling.md     ← Contorno de objeções
└── gptmaker-tactics.md       ← Operação do GPT Maker
```

---

## 📋 Documentos Disponíveis

### Deployment
- ✅ [Vercel: /api/gptmaker-credits retorna 404](troubleshooting/deployment/vercel-gptmaker-404.md)
  - Quando: Card de créditos fica "Carregando..."
  - Solução: Implementar fallback/mock data
  - Diagnóstico: 30 segundos com checklist

### Knowledge (Fatos — O QUÊ)
- ✅ [Produtos](../knowledge/products.md) — Catálogo, categorias, estrutura Supabase
- ✅ [GPT Maker](../knowledge/gptmaker.md) — Credenciais, webhooks, fluxo de integração
- ✅ [Preços](../knowledge/pricing.md) — Tabela de preços, frete, pagamento
- ✅ [Políticas](../knowledge/policy.md) — Trocas, garantia, scripts de atendimento

### Strategy (Comportamento — COMO agir)
- ✅ [Táticas de Venda](../strategy/sales-tactics.md) — Fluxo ideal, scripts, upsell
- ✅ [Contorno de Objeções](../strategy/objection-handling.md) — "Está caro", "vou pensar"...
- ✅ [Operação GPT Maker](../strategy/gptmaker-tactics.md) — Modos, métricas, problemas comuns

---

## 🚀 Como Usar

### Ao investigar um novo problema:

1. **Procure aqui no INDEX** por sintomas semelhantes
2. **Consulte o documento** do troubleshooting
3. **Use o checklist rápido** para diagnosticar em minutos
4. **Se for problema novo**, documente após resolver

### Exemplo:

```
Você vê: "Card travado em Carregando"
         ↓
Procura no INDEX: "travado"
         ↓
Encontra: Vercel 404 doc
         ↓
Segue checklist (30 segundos)
         ↓
Resolvido!
```

---

## 📝 Como Adicionar Novo Documento

1. **Corrige o bug**
2. **Cria arquivo** em `docs/troubleshooting/{categoria}/nome-do-bug.md`
3. **Segue template** (sintomas, causa, solução, checklist)
4. **Atualiza este INDEX.md** com entrada nova
5. **Faz commit** junto com a correção

**Regra:** Só documenta se:
- ✅ Bug levou >15min para diagnosticar
- ✅ Pode voltar a acontecer
- ✅ Envolve API, deploy, integração, arquitetura ou agentes
- ❌ NÃO documenta: erros triviais, typos, ajustes simples

---

## 🎯 Padrão de Documento

Cada bug tem:
1. **Sintomas** - O que você vê
2. **Causa raiz** - Por quê?
3. **Arquivos afetados** - Onde está
4. **Solução** - Código antes/depois
5. **Como reproduzir** - Passo a passo
6. **Como debugar** - Comandos prontos
7. **Como prevenir** - Checklist
8. **Checklist rápido** - Resolve em minutos
9. **Palavras-chave** - Para busca rápida

---

## 📊 Estatísticas

| Métrica | Valor |
|---------|-------|
| Documentos | 8 |
| Categorias | troubleshooting (5) + knowledge (4) + strategy (3) |
| Problemas resolvidos | 1 |
| Tempo médio de diagnóstico | 30 segundos |

---

## 🔗 Links Rápidos

- 📖 [Guia de Setup Completo](../SETUP_MONITORING.md)
- 💾 [Memory do Projeto](../.claude/projects/.../memory/)
- 🚀 [Repo Principal](https://github.com/rafahenrique-prime/projeto-primeiro-codigo)

---

## 📅 Próximas Áreas (quando houver conteúdo)

- `docs/architecture/` - Decisões arquiteturais
- `docs/patterns/` - Padrões recorrentes
- `docs/ai-agents/` - Agentes e integrações IA

Criadas **somente quando houver conteúdo suficiente** para justificar.

---

**Última atualização:** 2026-06-28 por Claude  
**Próxima revisão:** Quando documentar novo bug
