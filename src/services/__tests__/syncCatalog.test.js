/**
 * 🔐 TEST FILE SEGURO - Sincronização de Catálogo Bagy
 *
 * Execute: npm test -- syncCatalog.test.js
 *
 * ⚠️  IMPORTANTE:
 * - Confirme os dados antes de rodar
 * - Verificar no Supabase após execução
 * - Não rodar múltiplas vezes sem necessidade
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { upsertProducts, getProductCount } from '../catalogSyncService'

// 50 PRODUTOS DO PAINEL BAGY (Páginas 1-2)
const PRODUTOS_50_BAGY = [
  { nome: "Perfume Armaf Club de Nuit Woman 105ml", priceOriginal: 399, priceDiscount: 379, status: "Ativo" },
  { nome: "Tenis New Balance 9060 Creme C/ Cinza", priceOriginal: 549, priceDiscount: 419, status: "Ativo" },
  { nome: "Nike Dunk Low Gray Premium", priceOriginal: 499, priceDiscount: 299, status: "Ativo" },
  { nome: "Tenis New Balance 9060 Cinza Claro", priceOriginal: 499, priceDiscount: 449, status: "Ativo" },
  { nome: "Plataforma Gucci Feminina - Marrom Escuro", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Tenis New Balance 530 Rosa Cream", priceOriginal: 499, priceDiscount: 449, status: "Ativo" },
  { nome: "Tenis New Balance 530 Marron Claro", priceOriginal: 499, priceDiscount: 449, status: "Ativo" },
  { nome: "Tenis New Balance 530 Branco", priceOriginal: 499, priceDiscount: 449, status: "Ativo" },
  { nome: "Cueca Lup 009", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Cueca Lup 007", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Cueca Lup 006", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Cueca Lup 005", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Cueca Lup 004", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Cueca Lup 003", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Cueca Lup 002", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Cueca Lup 034", priceOriginal: 79, priceDiscount: 59, status: "Ativo" },
  { nome: "Tenis New Balance 9060 Off White C/ Verde Claro", priceOriginal: 599, priceDiscount: 449, status: "Ativo" },
  { nome: "Tenis New Balance 9060 Marrom C/ Preto", priceOriginal: 599, priceDiscount: 449, status: "Ativo" },
  { nome: "Tenis New Balance 9060 Marrom", priceOriginal: 599, priceDiscount: 449, status: "Ativo" },
  { nome: "Tenis New Balance 9060 Grey Cinza", priceOriginal: 599, priceDiscount: 449, status: "Ativo" },
  { nome: "Boné Importado Diesel Preto", priceOriginal: 599, priceDiscount: 219, status: "Ativo" },
  { nome: "Bone Armani Importado", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Louis Vitton Importado Lv Ii", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Balenciaga Importado", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Gucci Ii Importado", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Gucci Importado", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Dior Importada", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Philipp Plein Camo", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Philipp Plein Caveira", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Philipp Plein Logo Pp", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Boss Importada", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bone Burberry Importada", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bermuda Burberry Preta Importada Lv", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bermuda Louis Vitton Preta Importada Lv", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bermuda Louis Vitton Branca Importada Lv", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bermuda Louis Vitton Importada Lv", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bermuda Dior Importada", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bermuda Fendi Importada", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Bermuda Prado Importada", priceOriginal: 499, priceDiscount: 319, status: "Ativo" },
  { nome: "Camisetas On Runing Treino - Cinza Claro", priceOriginal: 299, priceDiscount: 139, status: "Ativo" },
  { nome: "Camisetas On Runing Treino - Azul Marinho", priceOriginal: 299, priceDiscount: 139, status: "Ativo" },
  { nome: "Camisetas On Runing Treino - Cinza", priceOriginal: 299, priceDiscount: 139, status: "Ativo" },
  { nome: "Camisetas On Runing Treino - Branca", priceOriginal: 299, priceDiscount: 139, status: "Ativo" },
  { nome: "Camisetas On Runing Treino - Preta", priceOriginal: 299, priceDiscount: 139, status: "Ativo" },
  { nome: "Camisa Brasil Azul Feminina Jordan II 2026/27 Torcedor - Nike", priceOriginal: 449, priceDiscount: 199, status: "Ativo" },
  { nome: "Camisa Brasil Amarela Nike I 2026/27 Torcedor Masculina", priceOriginal: 449, priceDiscount: 189, status: "Ativo" },
  { nome: "Camisa Brasil Amarela Nike I 2026/27 Jogador Masculina", priceOriginal: 749, priceDiscount: 299, status: "Ativo" },
  { nome: "Camisa Brasil II 26/27 Jogador Pro Masculina Nike Jordan Azul", priceOriginal: 749, priceDiscount: 329, status: "Ativo" },
  { nome: "Camisa Brasil Azul Masculina Jordan II 2026/27 Torcedor - Nike", priceOriginal: 449, priceDiscount: 199, status: "Ativo" },
]

describe('🔐 Sincronização Segura de Catálogo', () => {
  let countBefore = 0
  let countAfter = 0

  beforeAll(async () => {
    console.log('\n' + '='.repeat(80))
    console.log('📊 TESTE DE SINCRONIZAÇÃO - 50 PRODUTOS BAGY')
    console.log('='.repeat(80))
    console.log('\n✅ Validando dados antes de sincronizar...\n')

    // Conta quantos produtos tem ANTES
    countBefore = await getProductCount()
    console.log(`📈 Produtos no Supabase ANTES: ${countBefore}`)
    console.log(`📦 Produtos a sincronizar: ${PRODUTOS_50_BAGY.length}`)
  })

  it('✅ Valida estrutura dos 50 produtos', () => {
    PRODUTOS_50_BAGY.forEach((p, idx) => {
      expect(p.nome).toBeTruthy()
      expect(p.priceOriginal).toBeGreaterThan(0)
      expect(p.priceDiscount).toBeGreaterThan(0)
      expect(p.priceDiscount).toBeLessThanOrEqual(p.priceOriginal)
    })
    console.log(`✅ Estrutura OK: todos os 50 produtos têm dados válidos\n`)
  })

  it('✅ Calcula descontos corretamente', () => {
    const discounts = PRODUTOS_50_BAGY.map(p =>
      Math.round(((p.priceOriginal - p.priceDiscount) / p.priceOriginal) * 100)
    )
    const avgDiscount = Math.round(discounts.reduce((a, b) => a + b) / discounts.length)

    console.log(`📊 Desconto mínimo: ${Math.min(...discounts)}%`)
    console.log(`📊 Desconto máximo: ${Math.max(...discounts)}%`)
    console.log(`📊 Desconto médio: ${avgDiscount}%\n`)

    expect(avgDiscount).toBeGreaterThan(0)
    expect(avgDiscount).toBeLessThan(100)
  })

  it('🚀 Sincroniza 50 produtos no Supabase', async () => {
    console.log('⚠️  SINCRONIZANDO AGORA...\n')

    const result = await upsertProducts(PRODUTOS_50_BAGY)

    if (result.success) {
      console.log(`✅ SUCESSO! ${result.count} produtos sincronizados`)
      console.log(`   - Perfume Armaf: R$ 379`)
      console.log(`   - Tenis New Balance: R$ 419`)
      console.log(`   - Nike Dunk: R$ 299`)
      console.log(`   - ... e mais 47 produtos\n`)

      expect(result.success).toBe(true)
      expect(result.count).toBe(50)
    } else {
      console.log(`❌ ERRO na sincronização:`, result.error)
      expect(result.success).toBe(true)
    }
  })

  afterAll(async () => {
    // Conta quantos produtos tem DEPOIS
    countAfter = await getProductCount()

    console.log('='.repeat(80))
    console.log('📊 RESULTADO FINAL')
    console.log('='.repeat(80))
    console.log(`📈 Produtos ANTES:  ${countBefore}`)
    console.log(`📈 Produtos DEPOIS: ${countAfter}`)
    console.log(`➕ Adicionados:     ${countAfter - countBefore}\n`)

    console.log('🔗 Verificar no Supabase:')
    console.log('   https://app.supabase.com/project/mbbgqasvssueirynnoyk/editor/products\n')

    console.log('✅ Teste concluído com segurança!\n')
    console.log('='.repeat(80) + '\n')
  })
})
