/**
 * CONTRATO CATÁLOGO PRIME — Etapa 1: guarda estática da migration 033.
 * Não executa SQL (não há LAB); garante que a migration (a) PRESERVA os
 * campos de preço tabela/parcelamento que a RPC de produção já suporta
 * (correção cirúrgica de 2026-09-21 — a versão anterior da 033 os removia)
 * e (b) mantém as mudanças do Contrato. Se alguém regenerar a 033 a partir
 * da migration 023 pura, estes testes falham.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  fileURLToPath(new URL('../../supabase/migrations/033_contrato_catalogo_prime.sql', import.meta.url)),
  'utf8'
)

const CAMPOS_PRODUCAO_PRESERVADOS = [
  'preco_tabela',
  'parcelamento_padrao_vezes',
  'parcelamento_padrao_valor_parcela',
  'parcelamento_padrao_com_juros',
  'parcelamento_max_vezes',
  'parcelamento_valor_parcela',
  'parcelamento_com_juros',
]

describe('migration 033 — preserva campos que a RPC de produção já suporta', () => {
  it('todos os 7 campos em v_allowed_keys', () => {
    const allowed = sql.match(/v_allowed_keys text\[\] := ARRAY\[([\s\S]*?)\];/)[1]
    for (const campo of CAMPOS_PRODUCAO_PRESERVADOS) {
      expect(allowed).toContain(`'${campo}'`)
    }
  })

  it('todos os 7 campos no branch INSERT (colunas e VALUES)', () => {
    const insert = sql.match(/INSERT INTO public\.products \(([\s\S]*?)\) VALUES \(([\s\S]*?)\)\s*RETURNING/);
    expect(insert).not.toBeNull()
    const [, colunas, valores] = insert
    for (const campo of CAMPOS_PRODUCAO_PRESERVADOS) {
      expect(colunas).toContain(campo)
      expect(valores).toContain(`p_product_fields->>'${campo}'`)
    }
  })

  it('todos os 7 campos no branch UPDATE com "chave ausente preserva"', () => {
    const update = sql.match(/UPDATE public\.products SET([\s\S]*?)WHERE id = p_product_id;/)[1]
    for (const campo of CAMPOS_PRODUCAO_PRESERVADOS) {
      expect(update).toContain(`p_product_fields ? '${campo}'`)
      expect(update).toContain(`ELSE ${campo} END`)
    }
  })
})

describe('migration 033 — mudanças do Contrato Catálogo PRIME intactas', () => {
  it('status validado (active/inactive), stock_real, active e ausente_listagem presentes', () => {
    expect(sql).toContain(`p_product_fields->>'status'`) 
    expect(sql).toContain(`NOT IN ('active', 'inactive')`)
    expect(sql).toContain('stock_real integer')
    expect(sql).toContain('active boolean')
    expect(sql).toContain(`'ausente_listagem'`)
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS stock_real')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS active')
  })

  it('rollback NÃO aponta a migration 023 como versão atual', () => {
    const cabecalho = sql.slice(0, sql.indexOf('BEGIN;'))
    expect(cabecalho).not.toMatch(/volta pra versão da migration 023(?!\s*\+)/)
    expect(cabecalho).toContain('pg_get_functiondef')
  })

  it('superfície de acesso inalterada: só service_role executa', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) TO service_role')
  })
})
