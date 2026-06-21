# 🚀 Atualização Automática do Catálogo Prime Store

Script que sincroniza o catálogo do Bagy com o Supabase automaticamente.

## O que faz

✅ **Lê o CSV do Bagy**
- Extrai apenas produtos únicos
- Ignora duplicatas e variações

✅ **Converte automaticamente**
- Imagens: `media://products/img.jpg` → `https://cdn.dooca.store/161486/products/img.jpg`
- Links: `/produto-name` → `https://www.primestoremen.com.br/produto-name`

✅ **Popula categorias**
- Do campo `category_1` do CSV

✅ **Sincroniza com Supabase**
- **Produtos existentes**: atualiza link, foto, categoria e preço
- **Novos produtos**: adiciona com status `active` e source `bagy`

## Uso

### 1. Exportar CSV do Bagy
- Vá em: Bagy Admin → Exportar Produtos
- Salve como `161486-products.csv` (ou outro nome)

### 2. Rodar o script

```bash
python3 update-catalog-full.py /caminho/do/arquivo.csv
```

**Exemplo:**
```bash
python3 update-catalog-full.py ~/Downloads/161486-products.csv
```

### 3. Pronto!
O script mostra o resultado:
- ✅ Quantos foram atualizados
- ✨ Quantos novos foram adicionados
- 💰 Quantos tiveram mudança de preço

## Exemplo de saída

```
📖 Lendo CSV: /path/to/161486-products.csv
📊 Produtos no CSV: 520
🔄 Sincronizando com Supabase...

======================================================================
📊 RESULTADO FINAL
======================================================================
✅ Atualizados: 450
  ↳ Com mudança de preço: 23
✨ Adicionados: 70
📈 Total no Supabase: 519
======================================================================
🎉 Catálogo atualizado com sucesso!
```

## O que você precisa fazer

1. **Exportar CSV do Bagy** com os produtos corretos
2. **Rodar o script** com o caminho do CSV
3. **Pronto!** Tudo sincronizado

Não é necessário:
- ❌ Converter imagens manualmente
- ❌ Converter links manualmente
- ❌ Preencher categorias manualmente
- ❌ Atualizar um por um no Supabase

## Troubleshooting

**Erro: "Arquivo não encontrado"**
- Verifique se o caminho do CSV está correto
- Use caminho absoluto: `/Users/username/Downloads/arquivo.csv`

**Erro: "Erro ao conectar Supabase"**
- Verifique se a chave do Supabase está correta no script
- Verifique sua conexão com a internet

## Dúvidas?

O script é idempotente = seguro rodar múltiplas vezes. Se rodar 2x com o mesmo CSV, só atualiza o que mudou de preço.
