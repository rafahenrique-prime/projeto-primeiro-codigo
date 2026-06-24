# PASSO 4: Frontend - Botão + Validação

## 🎯 Objetivo
Adicionar botão "🔄 Sincronizar Knowledge" no painel para regenerar knowledge em tempo real.

---

## 📝 Arquivo a Editar
`src/pages/CatalogPage.jsx`

---

## ✅ 4 Adições Necessárias

### **1️⃣ ADICIONAR IMPORT (topo do arquivo, após imports atuais)**

Procure por:
```javascript
import { extractProductData, normalizeExtractedData } from '../services/scraperService'
```

Adicione após:
```javascript
import { regenerateKnowledgeUnico } from '../services/knowledgeGenerator'
```

---

### **2️⃣ ADICIONAR STATES (após os otros useState)**

Procure por:
```javascript
const [urlImagePreview, setUrlImagePreview] = useState(null)
const [showUrlTestModal, setShowUrlTestModal] = useState(false)
```

Adicione após:
```javascript
const [loadingSync, setLoadingSync] = useState(false)
const [syncMessage, setSyncMessage] = useState('')
```

---

### **3️⃣ ADICIONAR FUNÇÃO (após as outras funções handle*)**

Procure por:
```javascript
const handleDelete = async (id) => {
```

Adicione ANTES dessa função:
```javascript
const handleSyncKnowledge = async () => {
  setLoadingSync(true)
  setSyncMessage('🔄 Sincronizando Knowledge Base...')
  
  try {
    const result = await regenerateKnowledgeUnico()
    
    if (result.ok) {
      setSyncMessage(`✅ Knowledge sincronizado: ${result.totalProdutos} produtos (${result.duplicatasRemovidas} duplicatas removidas)`)
      setTimeout(() => setSyncMessage(''), 5000)
    } else {
      setSyncMessage(`❌ Erro: ${result.erro}`)
    }
  } catch (err) {
    setSyncMessage(`❌ Erro ao sincronizar: ${err.message}`)
  } finally {
    setLoadingSync(false)
  }
}
```

---

### **4️⃣ ADICIONAR BOTÃO NO JSX**

Procure por:
```jsx
<div style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
  <button onClick={() => setShowModal(true)} ...>
```

Adicione após esse grupo de botões:
```jsx
<button
  onClick={handleSyncKnowledge}
  disabled={loadingSync}
  style={{
    padding: '10px 16px',
    background: loadingSync ? '#ccc' : t.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: loadingSync ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }}
>
  {loadingSync ? '⏳ Sincronizando...' : '🔄 Sincronizar Knowledge'}
</button>

{syncMessage && (
  <div style={{
    marginTop: '12px',
    padding: '10px 14px',
    background: syncMessage.includes('✅') ? '#e8f5e9' : '#ffebee',
    color: syncMessage.includes('✅') ? '#2e7d32' : '#c62828',
    borderRadius: '6px',
    fontSize: '13px'
  }}>
    {syncMessage}
  </div>
)}
```

---

## 🧪 Como Testar

1. Adicionar as 4 adições acima
2. Ir para painel de Catálogo
3. Clicar em "🔄 Sincronizar Knowledge"
4. Deve aparecer:
   - Botão muda para "⏳ Sincronizando..."
   - Após 2-3 segundos: mensagem ✅ verde
   - Mensagem desaparece após 5 segundos

---

## 📊 STATUS FINAL (Após PASSO 4)

```
CAMADA 1: Backend - Função ✅
├─ regenerateKnowledgeUnico()
└─ Remove duplicatas automaticamente

CAMADA 2: Backend - Validação ✅
├─ validarProdutoUnico()
└─ Bloqueia INSERT se já existe

CAMADA 3: Banco de Dados ✅
├─ UNIQUE INDEX (idx_products_nome_unique)
└─ Banco rejeita duplicata

CAMADA 4: Frontend ✅
├─ Botão "🔄 Sincronizar Knowledge"
├─ Feedback visual (loading + mensagem)
└─ Chamada direta a regenerateKnowledgeUnico()
```

---

**OPÇÃO 3 COMPLETA! Todas as 4 camadas implementadas!** 🚀
