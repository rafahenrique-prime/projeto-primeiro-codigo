#!/usr/bin/env python3
"""
💰 Padronizar preços no Supabase
Converte para formato: R$ XX,XX
"""

import re
import requests
import warnings

warnings.filterwarnings('ignore')

SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
SUPABASE_KEY = "SUPABASE_KEY_REMOVED"

headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
patch_headers = {**headers, "Content-Type": "application/json", "Prefer": "return=minimal"}

def format_price(price_str):
    """Converte qualquer formato de preço para R$ XX,XX"""
    if not price_str:
        return ""

    # Remove "R$" e espaços
    clean = price_str.replace("R$", "").replace(" ", "").strip()

    # Se já tem vírgula, assume que está certo
    if "," in clean:
        return f"R$ {clean}"

    # Se tem ponto, converte para vírgula
    if "." in clean:
        clean = clean.replace(".", ",")
        return f"R$ {clean}"

    # Se é só número, trata como inteiro
    try:
        num = float(clean)
        return f"R$ {num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except:
        return f"R$ {clean}"

# Pegar todos os produtos
print("🔄 Buscando produtos...")
r = requests.get(f"{SUPABASE_URL}/rest/v1/products?select=id,nome,preco&limit=1000", headers=headers)
products = r.json()

print(f"📊 Total de produtos: {len(products)}")

# Verificar quais precisam de ajuste
need_fix = []
for p in products:
    preco = (p.get('preco') or "").strip()
    if preco and not re.match(r'^R\$\s*\d+,\d{2}$', preco):
        need_fix.append(p)

print(f"⚠️  Preços fora do padrão: {len(need_fix)}")

if not need_fix:
    print("✅ Todos os preços já estão no padrão!")
    exit(0)

# Atualizar
updated = 0
for p in need_fix:
    preco_old = p.get('preco', '')
    preco_new = format_price(preco_old)

    res = requests.patch(
        f"{SUPABASE_URL}/rest/v1/products?id=eq.{p['id']}",
        headers=patch_headers,
        json={"preco": preco_new}
    )

    if res.status_code in [200, 204]:
        updated += 1
        print(f"✅ {p['nome'][:40]}: '{preco_old}' → '{preco_new}'")
    else:
        print(f"❌ Erro ao atualizar {p['nome']}")

print(f"\n{'='*60}")
print(f"✅ Padronizados: {updated}/{len(need_fix)}")
print(f"{'='*60}")
