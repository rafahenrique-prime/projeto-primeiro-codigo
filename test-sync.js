// Script simples pra testar sincronização
import { upsertProducts } from './src/services/catalogSyncService.js'

const produtos = [
  { nome: "Perfume Armaf Club de Nuit Woman 105ml", priceOriginal: 399, priceDiscount: 379, status: "Ativo" },
  { nome: "Tenis New Balance 9060 Creme C/ Cinza", priceOriginal: 549, priceDiscount: 419, status: "Ativo" },
  { nome: "Nike Dunk Low Gray Premium", priceOriginal: 499, priceDiscount: 299, status: "Ativo" },
]

console.log("\n🚀 TESTANDO SINCRONIZAÇÃO COM 3 PRODUTOS...\n")

try {
  const result = await upsertProducts(produtos)
  console.log("\n✅ RESULTADO:")
  console.log(JSON.stringify(result, null, 2))
} catch (e) {
  console.error("\n❌ ERRO:")
  console.error(e.message)
}
