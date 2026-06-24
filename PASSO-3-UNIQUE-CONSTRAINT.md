# PASSO 3: Adicionar UNIQUE Constraint no Supabase

## 🎯 Objetivo
Adicionar proteção no banco de dados para garantir que nenhuma duplicata entre na tabela `products`.

---

## ✅ Como Executar (2 minutos)

### **MÉTODO 1: Via Dashboard Supabase (Recomendado)**

1. **Acesse o Supabase Dashboard:**
   ```
   https://app.supabase.com/project/mbbgqasvssueirynnoyk
   ```

2. **Vá para SQL Editor:**
   - Clique em "SQL Editor" (menu esquerdo)
   - Clique em "+ New Query"

3. **Cole o SQL abaixo:**
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_products_nome_unique 
   ON products(LOWER(TRIM(nome)));
   ```

4. **Clique em "Run" (ou Ctrl+Enter)**
   - Deve aparecer: ✅ "Success"

5. **Pronto! Constraint adicionado**

---

## 🔍 Verificar se Funcionou

Após executar, teste se está funcionando:

### **Via SQL (no Dashboard):**
```sql
-- Teste: tentar inserir produto duplicado
INSERT INTO products (nome, categoria) 
VALUES ('Nike Dunk Preto', 'TÊNIS');

-- Agora tente inserir o MESMO nome:
INSERT INTO products (nome, categoria) 
VALUES ('Nike Dunk Preto', 'TÊNIS');

-- ❌ Deve dar erro: "duplicate key value violates unique constraint"
```

---

## 📊 CAMADAS DE PROTEÇÃO (Após PASSO 3)

```
CAMADA 1: Backend - Função
├─ regenerateKnowledgeUnico()
└─ Remove duplicatas automaticamente

CAMADA 2: Backend - Validação
├─ validarProdutoUnico()
└─ Bloqueia INSERT se já existe

CAMADA 3: Banco de Dados ✅ NOVO!
├─ UNIQUE INDEX (idx_products_nome_unique)
└─ Banco rejeita duplicata mesmo assim

CAMADA 4: Frontend (Próximo)
├─ Validação ao salvar
└─ Aviso amigável ao user
```

---

## ⚠️ Notas Importantes

- **UNIQUE INDEX**: Usa `LOWER(TRIM(nome))` para normalizar
  - "Nike Dunk Preto" = "nike dunk preto" = "NIKE  DUNK  PRETO"
  
- **Se der erro "index already exists"**: constraint já foi criado, tudo OK!

- **Não quebra dados existentes**: Apenas previne NOVAS duplicatas

---

**Após executar, me avisa e passamos para PASSO 4 (Frontend)!** 🚀
