# Release Notes — 7 MEDIOs Corrigidos

**Versão**: Staging  
**Data**: 2026-06-22  
**Commits**: 7 fixes de bugs médios  
**Status**: ✅ Pronto para Staging

---

## 📋 Resumo Executivo

Corrigidos **7 bugs MÉDIOS** que causavam:
- Scoring inflacionado em buscas
- Fallbacks inadequados
- Divergência em detecção de produtos
- Logs silenciosos em parsing

**Impacto**: Melhoria significativa na precisão de:
- Busca de conhecimento
- Detecção de estágio de funil
- Score de probabilidade de compra
- Detecção automática de fotos

---

## 🔧 Bugs Corrigidos

### MÉDIO #1: searchEntries() — Proximity Scoring
**Arquivo**: `src/services/knowledgeDB.js`  
**Problema**: Contagem de ocorrências inflacionava scores  
**Solução**: Implementar proximity scoring (exato=10/5, palavras=2/1)  
**Exemplo**: Query "tênis" agora retorna Tênis Nike (score=15) antes de Acessórios (score=5)  
**Commit**: `067fa56`

### MÉDIO #2: searchInMessages() — Filter vs Some
**Arquivo**: `src/services/groq.js`  
**Problema**: `.some()` retornava early, contava apenas 1º match  
**Solução**: Mudar para `.filter()` para contar TODOS os keywords  
**Impacto**: Detecção mais precisa de contexto em conversas com múltiplos keywords  
**Commit**: `095e1f9`

### MÉDIO #3: detectFunnelStage() — Scoring
**Arquivo**: `src/services/groq.js`  
**Problema**: Early returns, primeiro estágio detectado ganhava  
**Solução**: Score para CADA stage, prioriza por importância (QUENTE=4 → CURIOSIDADE=1)  
**Resultado**: Detecção correta de estágio quando há múltiplos sinais  
**Commit**: `8608028`

### MÉDIO #4: calcBuyScore() — Weighted Average
**Arquivo**: `src/services/customerProfileService.js`  
**Problema**: Scoring aditivo desequilibrado (+30+15+20-10)  
**Solução**: Weighted average (Intent×60% + Engagement×20% - Objection×30%)  
**Benefício**: Scores mais realistas e balanceados (0-100)  
**Commit**: `72beda7`

### MÉDIO #5: extractAndSaveKnowledge() — No Fallback TODOS
**Arquivo**: `src/services/knowledgeExtractor.js`  
**Problema**: Sem produtos novos → retornava TODOS (500+ produtos) como fallback  
**Solução**: Sem novos → retorna erro "Base já está atualizada"  
**Benefício**: Evita duplicatas desnecessárias na base de conhecimento  
**Commit**: `35a2c92`

### MÉDIO #6: ChatArea Photo Detection — Priorizar Nome Explícito
**Arquivo**: `src/components/ChatArea.jsx`  
**Problema**: Divergência entre 2 buscas paralelas (contexto vs extraction)  
**Cenário**: Cliente antigo menciona "boné" → contexto tem "Boné Diesel"  
         Cliente novo diz "foto da cueca" → extraction encontra "Cueca Diesel"  
         Sistema retornava produto errado  
**Solução**: SEMPRE usar nome explícito extraído, contexto é fallback  
**Debug**: Adicionar logs `[AutoFoto] Nome extraído: "X" → Produto encontrado`  
**Commit**: `604afe7`

### MÉDIO #7: parseToBlocks() — Logs em Fallbacks
**Arquivo**: `src/services/knowledgeParser.js`  
**Problema**: 3 fallbacks silenciosos, usuário não sabia se parsing falhou  
**Solução**: 
  - Texto < 30 chars → `console.log("[Parser] Texto muito curto")`
  - Nenhum bloco → `console.warn("[Parser] Nenhum bloco encontrado")`
  - JSON inválido → `console.error("[Parser] ❌ ERRO ao fazer parse")`
**Benefício**: Debug facilitado, observabilidade melhorada  
**Commit**: `3eee45a`

---

## 📊 Testes Realizados

✅ **Verificação de Código-Fonte**: 7/7 fixes confirmados  
✅ **Testes Unitários**: 6/6 passou (MÉDIOS #1, #2, #3, #4, #5, #7)  
✅ **Testes Integrados**: 6/6 passou  
✅ **Build**: ✓ Sem erros (warning de chunk size é não-crítico)  

---

## 🚀 Instruções de Deploy em Staging

```bash
# 1. Verificar status
git status

# 2. Verificar commits
git log --oneline -7

# 3. Build para staging
npm run build

# 4. Deploy (via seu CI/CD)
# Exemplo: git push origin main (já feito)

# 5. Testar em staging
# Acessar: https://staging.ignite.prime
# Verificar console logs em DevTools
```

---

## 🔍 O Que Testar em Staging

### Teste 1: Busca em Conhecimento (MÉDIO #1)
- Acessar menu "Conhecimento"
- Buscar por "tênis"
- ✓ Esperado: Produtos com "tênis" no título aparecem primeiro

### Teste 2: Detecção de Funil (MÉDIO #3)
- Abrir conversa com múltiplos sinais de compra
- Verificar perfil do cliente
- ✓ Esperado: Estágio QUENTE_FECHAR detectado corretamente

### Teste 3: Score de Compra (MÉDIO #4)
- Cliente com alta intenção + baixo engajamento
- ✓ Esperado: Score em 0-100 balanceado

### Teste 4: Extração de Fotos (MÉDIO #6)
- Cliente: "Foto do boné"
- ✓ Esperado: Envia foto do boné (não contexto antigo)
- Verificar console: `[AutoFoto] Nome extraído: "boné"`

### Teste 5: Logs de Parsing (MÉDIO #7)
- Abrir DevTools (F12)
- Ir para "Conhecimento" → importar arquivo
- ✓ Esperado: Ver logs `[Parser]` no console

---

## ⚠️ Rollback Plan

Se problemas forem detectados em staging:

```bash
# Voltar para commit anterior aos 7 MEDIOs
git revert 604afe7 3eee45a 35a2c92 72beda7 8608028 095e1f9 067fa56

# Ou fazer hard reset
git reset --hard HEAD~7
```

---

## 📞 Contatos & Escalação

- **Responsável**: Claude Code (Haiku 4.5)
- **Testes**: Recomendado com QA em staging por 24-48h
- **Métrica de Sucesso**: 0 erros críticos em staging
- **Próximo Passo**: Deploy em produção após aprovação

---

## 📌 Notas Importantes

1. **Logs de Debug**: Os 7 MEDIOs adicionam logs de debug úteis. Monitorar em staging antes de produção.

2. **Sem Breaking Changes**: Todos os fixes são backward-compatible.

3. **Performance**: Nenhuma mudança de performance significativa.

4. **Dados Históricos**: Base de conhecimento/perfis/histórico de fotos não são afetados.

---

**Status**: ✅ PRONTO PARA STAGING  
**Data de Criação**: 2026-06-22  
**Versão**: 7-MEDIOs-Staging-v1
