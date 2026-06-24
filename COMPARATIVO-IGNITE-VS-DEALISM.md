# 📊 Comparativo: IGNITE PRIME vs Dealism Original

**Status**: Aguardando informações sobre Dealism  
**Data**: 2026-06-22  
**Responsável**: Claude Code

---

## 🔵 IGNITE PRIME — Análise Atual

### Stack Técnico
```
Frontend:   React 19 + Vite 5 + TailwindCSS
Runtime:    Node.js (Vercel serverless)
Database:   Supabase (PostgreSQL)
APIs:       GPT Maker (automação), Groq (LLM), Google Vision (foto)
Hospedagem: Vercel (ignite-webhook.vercel.app)
```

### Arquitetura de Serviços

#### 1. **Conhecimento & Busca**
- `knowledgeDB.js` → Busca por proximity scoring (não word-count)
- `knowledgeExtractor.js` → Extrai produtos de URLs, evita duplicatas
- `knowledgeParser.js` → Parse Groq → blocos estruturados
- Storage: Supabase `trainings` + localStorage `codex_cats`

#### 2. **Matching de Produtos**
- `catalog.js` → 570+ produtos local + Bagy API
- `photoMatchingService.js` → Vision API (labels 1.5x, objects 1.2x, text 1.0x)
- `findBestMatch()` → Similarity scoring com Levenshtein
- Filters: Categoria obrigatória (bone/tenis/cueca)

#### 3. **Score & Funil**
- `customerProfileService.js` → Score compra: (Intent×60% + Engagement×20% - Objection×30%)
- `groq.js:detectFunnelStage()` → Scoring por stage (QUENTE=4 → CURIOSIDADE=1)
- Evita early returns, avalia TODOS sinais

#### 4. **Chat & Automação**
- `ChatArea.jsx` → Conversa cliente + detecção automática de fotos
- Prioriza nome extraído sobre contexto histórico
- `gptmaker.js` → Integração com GPT Maker (webhook + chat_id)
- Sticky input bar (position: sticky, bottom: 0, zIndex: 10)

#### 5. **Inteligência**
- `CODEX` (Deal Claude) → Chat purple #7C3AED, salva conhecimento
- `Lab IA` → Stress test, auditoria de conversas
- Groq: llama-3.3-70b (fallback: llama-3.1-8b → llama3-8b)

### Estado de Bugs Recentes (Fixados)

| Bug | Tipo | Causa | Fix |
|-----|------|-------|-----|
| boné → Cueca | CRÍTICO | `.includes()` genérico bypassa categoria | Removido |
| "bone diesel" rejeitado | CRÍTICO | Stopwords (PALAVRAS_GENERICAS) rejeita | Removido |
| Early returns | CRÍTICO | `.some()` retorna no 1º match | Mudado para `.filter()` |
| Sticky input | UI | Faltava `position: sticky` | Adicionado |
| Proximity vs count | MÉDIO | Contava ocorrências (inflacionado) | Scoring (exato=10/5) |
| Fallback TODOS | MÉDIO | Sem novo → retorna 500+ | Retorna erro "atualizado" |
| Logs silenciosos | MÉDIO | Parsing falha sem debug | Adicionados `[Parser]` logs |

### Componentes Principais

```
src/
├── pages/
│   ├── DealOncaPage.jsx (CODEX)
│   ├── AgentLabPage.jsx (Lab IA)
│   ├── KnowledgePage.jsx (Base conhecimento)
│   ├── ContactsPage.jsx (Perfis clientes)
│   └── ChatArea.jsx (Conversa cliente)
├── services/
│   ├── gptmaker.js (Automação GPT Maker)
│   ├── groq.js (LLM + scoring)
│   ├── catalog.js (Produtos)
│   ├── knowledgeDB.js (Busca)
│   ├── knowledgeExtractor.js (Importação)
│   ├── knowledgeParser.js (Parse Groq)
│   ├── photoMatchingService.js (Vision API)
│   ├── customerProfileService.js (Perfis)
│   └── [+7 serviços]
└── components/
    ├── LeftNav.jsx (Menu lateral)
    ├── ChatArea.jsx (Chat cliente)
    └── [+10 componentes UI]
```

### Integrations & APIs
- **GPT Maker** → Chat automático, webhook /api/knowledge
- **Groq** → LLM fallback chain (llama-3.3 → 3.1 → 3.0)
- **Google Vision** → Análise de fotos (labels, objects, text)
- **Supabase** → Users, profiles, trainings, messages
- **Bagy** → Catálogo de produtos (webhook)
- **Vercel** → Serverless backend + edge functions

### Métricas Atuais
- Código: 50 arquivos fonte (~784KB src/)
- Git: 50+ commits (últimos 3 meses com 7+8+3 bugs)
- Performance: 0 early returns, scoring weighted, queries otimizadas
- Cobertura: 6 testes MÉDIOS validados + 1 UI fix

---

## 🔴 DEALISM Original — Informações Necessárias

**⚠️ Preciso que você responda:**

### Info Essencial
- [ ] Repo/código disponível? (GitHub, local, arquivado?)
- [ ] Stack: Python/Django? Node? PHP? Ruby?
- [ ] Frontend: era React? jQuery? Vue?
- [ ] Database: MySQL? MongoDB? Firebase?
- [ ] O que era: CRM? E-commerce? Chat bot?
- [ ] Quando foi criado? Quando migrou para IGNITE?
- [ ] Qual era o domínio/negócio?

### O que Você Quer Comparar?
- [ ] Arquitetura geral (como dados fluem)
- [ ] Matching de produtos (como era feito)
- [ ] Scoring/algoritmos (que lógica usava)
- [ ] Qualidade de código (patterns, bugs conhecidos)
- [ ] Bugs que tínhamos/evitamos
- [ ] Performance vs robustez
- [ ] Deployment/DevOps

---

## 📋 Roadmap de Análise

Assim que você me der info sobre Dealism:

### Fase 1: MAPEAMENTO (5 min)
- [ ] Ler repo Dealism
- [ ] Mapear arquitetura original
- [ ] Listar componentes-chave

### Fase 2: COMPARATIVO ARQUITETURAL (10 min)
- [ ] Dados: como fluem
- [ ] Serviços: estrutura vs IGNITE
- [ ] APIs: quais integrações

### Fase 3: ANÁLISE DE ALGORITMOS (15 min)
- [ ] Matching: Dealism vs IGNITE (scoring, weighting)
- [ ] Busca: queries, performance
- [ ] Decisões: como classifica cliente/produto

### Fase 4: QUALIDADE & BUGS (10 min)
- [ ] Bugs conhecidos (Dealism vs evitamos)
- [ ] Code smell patterns
- [ ] Que bugs IGNITE introduziu

### Fase 5: RELATÓRIO EXECUTIVO (5 min)
- [ ] 1-page summary: o que melhorou/piorou
- [ ] Recomendações para futuro
- [ ] Lições aprendidas

---

## 🎯 Próximos Passos

**Sua decisão:**

1. **Opção A** — Vous fournir accès repo Dealism
   ```bash
   git clone <repo-dealism>
   # Faço análise completa em 30min
   ```

2. **Opção B** — Descrever Dealism em 2-3 linhas
   - "Dealism era CRM Django + MySQL, matching por keyword simples"
   - Faço mapeamento e recomendações baseado nisso

3. **Opção C** — Decidir DEPOIS
   - Continuo com análise de IGNITE isolada
   - Prioriza outras tarefas agora

**Qual prefere?** Mande mensagem com resposta + qualquer doc/screenshot de Dealism se tiver 🎯

---

**Criado**: 2026-06-22  
**Versão**: AWAITING-DEALISM-INFO-v1
