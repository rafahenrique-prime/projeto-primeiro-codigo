// PRIME Comissões LAB — valores monetários sempre em centavos.
export const ORDER_STATUS = Object.freeze({ PENDING: 'a_conferir', APPROVED: 'aprovada', PAID: 'paga', CANCELLED: 'cancelada' })
export function validRate(rate) {
  if (rate === '' || rate === null || rate === undefined || typeof rate === 'boolean') return false
  const value = Number(rate)
  return Number.isFinite(value) && value >= 0 && value <= 100
}
export function commissionCents(revenueCents, percentage) {
  if (!Number.isSafeInteger(revenueCents) || revenueCents < 0 || !validRate(percentage)) throw new Error('Valor ou percentual inválido')
  return Math.round(revenueCents * Number(percentage) / 100)
}
export function summarizeOrders(orders) {
  const eligible = orders.filter(order => order.status !== ORDER_STATUS.CANCELLED)
  const approved = eligible.filter(order => order.status === ORDER_STATUS.APPROVED || order.status === ORDER_STATUS.PAID)
  const paid = eligible.filter(order => order.status === ORDER_STATUS.PAID)
  const sum = (list, field) => list.reduce((acc, order) => acc + (field === 'commission' ? commissionCents(order.revenueCents, order.rateAtSale) : order.revenueCents), 0)
  return { count: eligible.length, revenueCents: sum(eligible, 'revenue'), projectedCents: sum(eligible, 'commission'), approvedCents: sum(approved, 'commission'), paidCents: sum(paid, 'commission'), payableCents: sum(approved.filter(order => order.status !== ORDER_STATUS.PAID), 'commission') }
}
export function monthOf(dateISO) { return String(dateISO || '').slice(0, 7) }
export function filterOrders(orders, month, partnerId = 'all') { return orders.filter(order => (!month || monthOf(order.date) === month) && (partnerId === 'all' || order.partnerId === partnerId)) }
export function brl(cents) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents / 100) }
