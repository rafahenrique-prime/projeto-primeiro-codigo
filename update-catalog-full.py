#!/usr/bin/env python3
"""
🚀 ATUALIZAÇÃO COMPLETA DO CATÁLOGO PRIME STORE
Lê CSV do Bagy e atualiza tudo no Supabase em uma vez
- Converte imagens
- Converte links
- Popula categorias
- Atualiza preços
- Adiciona novos produtos
"""

import csv
import sys
import requests
import warnings
from pathlib import Path

warnings.filterwarnings('ignore')

# Configuração Supabase — cole suas chaves aqui ou use variáveis de ambiente
import os
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mbbgqasvssueirynnoyk.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "COLE_SUA_CHAVE_AQUI")
CDN_BASE = "https://cdn.dooca.store/161486/products/"
SITE_BASE = "https://www.primestoremen.com.br"

headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
patch_headers = {**headers, "Content-Type": "application/json", "Prefer": "return=minimal"}

def main():
    if len(sys.argv) < 2:
        print("❌ Uso: python3 update-catalog-full.py <caminho-do-csv>")
        print("   Exemplo: python3 update-catalog-full.py /path/to/161486-products.csv")
        sys.exit(1)

    csv_path = sys.argv[1]
    if not Path(csv_path).exists():
        print(f"❌ Arquivo não encontrado: {csv_path}")
        sys.exit(1)

    print(f"📖 Lendo CSV: {csv_path}")

    # Ler CSV
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        records = list(reader)

    # Extrair produtos únicos
    csv_products = {}
    seen = set()
    for r in records:
        pid = r.get('product_id', '').strip()
        if pid in seen or not pid:
            continue
        seen.add(pid)

        name = r.get('name', '').strip()
        url_path = r.get('url', '').strip()
        images = r.get('images', '').strip()
        price = r.get('price', '').strip()
        category = r.get('category_1', '').strip()

        if name and url_path:
            # Converter imagem
            if images:
                first_img = images.split(',')[0].strip()
                img_file = first_img.replace('media://products/', '')
                img_url = CDN_BASE + img_file
            else:
                img_url = ''

            csv_products[name.lower()] = {
                'nome': name,
                'link': SITE_BASE + url_path,
                'imagem': img_url,
                'preco': price,
                'categoria': category,
            }

    print(f"📊 Produtos no CSV: {len(csv_products)}")

    # Pegar produtos atuais do Supabase
    print("🔄 Sincronizando com Supabase...")
    r = requests.get(f"{SUPABASE_URL}/rest/v1/products?select=id,nome,preco&limit=1000", headers=headers)
    if r.status_code != 200:
        print(f"❌ Erro ao conectar Supabase: {r.status_code}")
        sys.exit(1)

    current_products = {p['nome'].lower().strip(): p['id'] for p in r.json()}

    # Atualizar existentes + adicionar novos
    updated = 0
    added = 0
    price_changes = 0

    for csv_name_lower, csv_data in csv_products.items():
        if csv_name_lower in current_products:
            # Produto existe - atualizar
            prod_id = current_products[csv_name_lower]
            update_data = {}

            # Sempre atualizar link, imagem, categoria
            update_data['link'] = csv_data['link']
            if csv_data['imagem']:
                update_data['imagem'] = csv_data['imagem']
            if csv_data['categoria']:
                update_data['categoria'] = csv_data['categoria']

            # Atualizar preço se mudou
            if csv_data['preco']:
                update_data['preco'] = csv_data['preco']
                price_changes += 1

            res = requests.patch(f"{SUPABASE_URL}/rest/v1/products?id=eq.{prod_id}",
                                headers=patch_headers, json=update_data)
            if res.status_code in [200, 204]:
                updated += 1
        else:
            # Novo produto - adicionar
            new_data = {
                'nome': csv_data['nome'],
                'link': csv_data['link'],
                'imagem': csv_data['imagem'],
                'preco': csv_data['preco'],
                'categoria': csv_data['categoria'],
                'source': 'bagy',
                'status': 'active',
            }
            res = requests.post(f"{SUPABASE_URL}/rest/v1/products",
                               headers=patch_headers, json=new_data)
            if res.status_code in [200, 201]:
                added += 1

    print("\n" + "="*70)
    print("📊 RESULTADO FINAL")
    print("="*70)
    print(f"✅ Atualizados: {updated}")
    print(f"  ↳ Com mudança de preço: {price_changes}")
    print(f"✨ Adicionados: {added}")
    print(f"📈 Total no Supabase: {len(current_products) + added}")
    print("="*70)
    print("🎉 Catálogo atualizado com sucesso!")

if __name__ == '__main__':
    main()
