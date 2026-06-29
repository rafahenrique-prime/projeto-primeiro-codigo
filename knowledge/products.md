# knowledge/products.md — Catálogo de Produtos PRIME STORE

**Fonte de verdade:** Supabase (`products` table)  
**Total:** 538 produtos  
**Última revisão:** 2026-06-28

---

## 🗂️ Categorias Disponíveis

| Categoria | Exemplos de Produtos |
|-----------|---------------------|
| **Tênis** | Nike, Adidas, New Balance, Puma, Vans |
| **Camisetas** | Básicas, estampadas, polo, dry-fit |
| **Bermudas** | Jeans, moletom, tactel, nylon |
| **Calças** | Jeans, jogger, cargo, moletom |
| **Bonés** | Snapback, trucker, plano, aba curva |
| **Cuecas/Meias** | Básicas, estampadas, kit |
| **Bolsas/Mochilas** | Backpack, shoulder bag, pochete |

---

## 🔍 Como Buscar Produtos

### Na conversa com cliente:
```
"tênis" → busca category = 'Tênis' OU name ILIKE '%tênis%'
"tenis" → normalizado para "tênis" (acentos automáticos)
"nike" → busca name ILIKE '%nike%'
"bermuda preta" → busca name ILIKE '%bermuda%' + filtro cor
```

### Normalização de acentos (CRÍTICO):
- `tenis` = `tênis`
- `calcas` = `calças`
- `bones` = `bonés`
- `camisas` = sem alteração

---

## 📦 Estrutura de Produto (Supabase)

```javascript
{
  id: 'uuid',
  name: 'Nome do Produto',
  price: 149.90,
  category: 'Tênis',
  description: 'Descrição curta',
  image_url: 'https://supabase.../storage/v1/object/public/produtos/...',
  product_url: 'https://primestore.com.br/produto/...',
  created_at: '2026-06-28T...'
}
```

---

## 💰 Faixas de Preço

| Faixa | Produtos |
|-------|---------|
| R$ 20 - R$ 50 | Meias, cuecas, acessórios |
| R$ 50 - R$ 120 | Camisetas, bonés |
| R$ 120 - R$ 250 | Bermudas, calças |
| R$ 250 - R$ 600 | Tênis (entrada) |
| R$ 600+ | Tênis premium, kit completo |

---

## ⚠️ Regras de Busca (Evitar Erros)

1. **NUNCA** retornar `imageUrl` no webhook `/api/knowledge` — só texto
2. **SEMPRE** normalizar acentos antes de buscar
3. **Filtrar categoria** ao buscar: "boné diesel" ≠ "cueca diesel"
4. Se não achar produto exato → oferecer alternativas próximas
5. Preço é sempre em reais (R$), exibir com 2 casas decimais

---

## 🔗 Links de Referência

- **Admin Catálogo:** http://localhost:5173/catalogo
- **Tabela Supabase:** `products` (538 registros)
- **Storage Imagens:** `produtos` bucket (PUBLIC)
- **Webhook busca:** `/api/knowledge` (via GPT Maker Step 2)
- **Webhook foto:** `/api/auto-photo` (quando cliente pede imagem)
