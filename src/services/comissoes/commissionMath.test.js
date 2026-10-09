import { describe, expect, it } from 'vitest'
import { brl, commissionCents, filterOrders, summarizeOrders } from './commissionMath.js'
describe('PRIME Comissões — dinheiro e fechamento', () => {
  it('calcula comissão por pedido e arredonda em centavos', () => { expect(commissionCents(113174,10)).toBe(11317); expect(commissionCents(37547,10)).toBe(3755); expect(brl(11317)).toBe('R$ 113,17') })
  it('não conta pedido cancelado, separa aprovado e pago', () => {
    const base = { rateAtSale: 10 }
    const result = summarizeOrders([{...base,revenueCents:10000,status:'a_conferir'},{...base,revenueCents:20000,status:'aprovada'},{...base,revenueCents:30000,status:'paga'},{...base,revenueCents:40000,status:'cancelada'}])
    expect(result).toMatchObject({count:3,revenueCents:60000,projectedCents:6000,approvedCents:5000,paidCents:3000,payableCents:2000})
  })
  it('mantém percentual histórico mesmo após alterar taxa da parceira', () => { const order={revenueCents:25000,rateAtSale:10,status:'aprovada'}; const newPartnerRate=15; expect(commissionCents(order.revenueCents,order.rateAtSale)).toBe(2500); expect(newPartnerRate).toBe(15) })
  it('filtra mês e parceira por data do pedido', () => {const items=[{date:'2026-09-03',partnerId:'a'},{date:'2026-10-03',partnerId:'a'},{date:'2026-09-04',partnerId:'b'}]; expect(filterOrders(items,'2026-09','a')).toHaveLength(1)})
  it('rejeita valores inválidos', () => {expect(()=>commissionCents(1000,-1)).toThrow();expect(()=>commissionCents(-5,10)).toThrow()})
})
