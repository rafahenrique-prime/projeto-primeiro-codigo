# 📸 GUIA DE FOTO RECOGNITION

## ARQUITETURA IMPLEMENTADA

```
┌─────────────────────────────────────────┐
│         FOTO DO CLIENTE                 │
│  (WhatsApp, Instagram, Upload)          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│     PHOTO CACHE SERVICE                 │
│  Verifica: já processei essa foto?      │
│  ✅ Sim → Reutiliza (economiza $)       │
│  ❌ Não → Continua                      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   PHOTO RECOGNITION SERVICE             │
│  PROVEEDORES (escolher um):             │
│  1. Google Vision API (ATUAL)           │
│  2. OpenAI Vision (qualidade)           │
│  3. AWS Rekognition (robusto)           │
│  4. Local Model (futuro)                │
└──────────────┬──────────────────────────┘
               │
         ┌─────┴────────────────┐
         │  ANÁLISE RETORNA:    │
         │  • Labels (tênis)    │
         │  • Objects           │
         │  • Text (OCR)        │
         │  • Colors            │
         └─────┬────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   PHOTO MATCHING SERVICE                │
│  Busca produtos no catálogo (61 prods)  │
│  • Compara labels com nomes             │
│  • Calcula similaridade (Levenshtein)   │
│  • Retorna TOP 5 matches                │
└──────────────┬──────────────────────────┘
               │
         ┌─────┴──────────────────────┐
         │  RESULTADO CONTÉM:         │
         │  • ID + Nome do Produto    │
         │  • Preço                   │
         │  • Imagem                  │
         │  • Confiança (%)           │
         └─────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   GPT MAKER INTEGRATION (OPCIONAL)      │
│  Envia resultado pro agente responder   │
│  Cliente ← Gabriela responde            │
└─────────────────────────────────────────┘
```

---

## INSTALAÇÃO E CONFIGURAÇÃO

### 1. Variables de Ambiente (.env)

```bash
# Google Cloud Vision (recomendado para começar)
VITE_GOOGLE_VISION_KEY=seu-api-key-aqui

# OpenAI Vision (melhor qualidade, mais caro)
VITE_OPENAI_API_KEY=seu-api-key-aqui

# AWS Rekognition (futuro)
VITE_AWS_ACCESS_KEY=seu-access-key-aqui
VITE_AWS_SECRET_KEY=seu-secret-key-aqui
```

### 2. Obter as Chaves

**Google Cloud Vision:**
- Ir para https://console.cloud.google.com
- Ativar "Cloud Vision API"
- Criar "Service Account"
- Download JSON com a chave
- Copiar a chave

**OpenAI Vision:**
- Ir para https://platform.openai.com/api-keys
- Criar nova chave
- Copiar e colar

---

## COMO USAR

### Via Interface Web

1. Clique em **📸 Fotos** no menu
2. Cole a URL da imagem OU clique em **📁 Upload**
3. Clique em **🔍 Analisar**
4. Veja os produtos encontrados

### Via Código (Aplicações)

```javascript
import { processPhotoFlow } from '@/services/photoFlowService'

// Opção 1: Com integração GPT Maker
const result = await processPhotoFlow(imageUrl, chatId)

// Opção 2: Modo independente (sem GPT Maker)
const result = await processPhotoFlowIndependent(imageUrl)
```

---

## PERFORMANCE E MÉTRICAS

Acesse a aba **📊 Performance** para ver:

- **Total Processado**: Quantas fotos foram analisadas
- **Cache Hits**: Quantas reutilizaram cache (economia!)
- **Taxa de Cache**: % de acertos
- **Tempo Médio**: ms por análise
- **Economia Estimada**: $ poupados com cache

### Exemplo de Performance:

```
Sem Cache:
  • 100 fotos × $0.0015 (Google) = $0.15
  
Com Cache (80% hit rate):
  • 80 do cache = $0.00
  • 20 novas = $0.03
  • Economia: $0.12 (80% menos!)
```

---

## ESTRATÉGIA PARA O FUTURO (SEM GPT MAKER)

### Fase 1 (AGORA): GPT Maker + Google Vision
```
├─ Usar GPT Maker (já pagou)
├─ Usar Google Vision (barato)
└─ Coletar dados de performance
```

### Fase 2 (Próximo): Alternativas Testadas
```
├─ Testar OpenAI Vision (melhor qualidade)
├─ Testar AWS Rekognition (mais robusto)
└─ Comparar performance vs custo
```

### Fase 3 (Longo Prazo): Sistema Independente
```
├─ Implementar Local Model (TensorFlow.js)
├─ Rodar no Docker/Node.js
├─ ZERO dependência de APIs externas
└─ Custo: $0 (apenas hosting)
```

### Código Para Trocar Provedor (Fácil!):

No arquivo `photoRecognitionService.js`:

```javascript
// Trocar provedor é UMA LINHA:
const DEFAULT_PROVIDER = PROVIDERS.GOOGLE_VISION  // ← mude aqui!

// Exemplos:
// const DEFAULT_PROVIDER = PROVIDERS.OPENAI_VISION
// const DEFAULT_PROVIDER = PROVIDERS.AWS_REKOGNITION
// const DEFAULT_PROVIDER = PROVIDERS.LOCAL_MODEL
```

---

## CACHE INTELIGENTE

### Como Funciona

1. **Hash SHA-256** da URL da foto
2. **Armazena resultado** em localStorage
3. **TTL de 30 dias** (configurável)
4. **Auto-limpeza** de entradas expiradas

### Economia

```
Google Vision: $1.50 / 1000 requisições
Cache com 80% hit rate = 80% economia
```

### Ver Cache Stats

Acesse a aba **💾 Cache** para:
- Total de entradas
- Economia estimada
- Data de entrada mais antiga/recente
- Provedores usados

---

## INTEGRAÇÃO COM GPT MAKER

### Fluxo Automático

```javascript
processPhotoFlow(imageUrl, chatId)
│
├─ Reconhece foto (Vision API)
├─ Encontra produtos (Catálogo)
├─ Salva no cache
└─ Envia ao GPT Maker com contexto

// GPT Maker então responde:
"Encontrei 5 produtos similares! 
🔝 Melhor match: Nike Air Max..."
```

### Dados Passados ao GPT Maker

```json
{
  "imageUrl": "https://...",
  "matches": [
    {
      "nome": "Nike Air Max 90",
      "preco": "R$ 899,00",
      "confidence": 95,
      "imagem": "https://..."
    }
  ]
}
```

---

## TROUBLESHOOTING

### Erro: "Google Vision API key não configurada"

```bash
# Adicione ao .env:
VITE_GOOGLE_VISION_KEY=seu-api-key
```

### Performance Lenta (> 3s)

```javascript
// Verificar:
1. Cache está funcionando? 
   → Ver aba "💾 Cache"
   
2. API Vision está lenta?
   → Testar com OpenAI (mais rápido)
   
3. Rede ruim?
   → Usar compressão de imagem
```

### Matches Incorretos

```javascript
// Aumentar threshold:
// Em photoMatchingService.js linha 70:
const labelMatches = findProductsByLabels(photoAnalysis.labels, 0.6)
//                                                               ↑
//                                                 Aumentar este valor
//                                                 (0.6 → 0.8)
```

---

## ROADMAP TÉCNICO

```
📅 SEMANA 1: ✅ Implementado
  ✅ Google Vision Integration
  ✅ Photo Matching
  ✅ Cache System
  ✅ Performance Metrics
  
📅 SEMANA 2-3: TODO
  ⏳ Integração WhatsApp automática
  ⏳ Suporte para múltiplas fotos
  ⏳ Feedback loop (usuario corrige match)
  
📅 SEMANA 4+: FUTURO
  ⏳ OpenAI Vision como fallback
  ⏳ Local TensorFlow.js model
  ⏳ Sistema independente (Docker)
  ⏳ API própria para aplicativos
```

---

## ANÁLISE DE CUSTO-BENEFÍCIO

### Google Vision (RECOMENDADO)

```
Custo:     $1.50 / 1000 req
Por imagem: $0.0015
Volume:    500 req/dia = ~$22/mês
Com cache: $22 × 0.2 (20% hit rate) = $4.40/mês

MELHOR CUSTO-BENEFÍCIO ✅
```

### OpenAI Vision

```
Custo:     $0.01 / imagem
Volume:    500 req/dia = ~$150/mês
Qualidade: ⭐⭐⭐⭐⭐ (melhor)

Para casos premium
```

### AWS Rekognition

```
Custo:     $0.001 / imagem
Volume:    500 req/dia = ~$15/mês
Qualidade: ⭐⭐⭐⭐

Mais robusto, barato, recomendado para produção
```

### Local Model (FUTURO)

```
Custo:     $0 (apenas hosting)
Qualidade: ⭐⭐⭐ (depende do modelo)
Setup:     Mais complexo

Ideal quando volume for > 10k req/mês
```

---

## PRÓXIMOS PASSOS

1. **Obter Google Vision API key** (2 min)
2. **Adicionar ao .env** (1 min)
3. **Testar na interface** 📸 (5 min)
4. **Analisar performance** (contínuo)
5. **Preparar transição para independente** (futuro)

---

**Criado em:** 2026-06-19  
**Status:** ✅ Pronto para Produção  
**Próxima Review:** Após 500 análises
