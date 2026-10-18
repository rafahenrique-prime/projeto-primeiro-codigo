import { useMemo, useState } from 'react'
import { useTheme } from '../theme.jsx'
import { brl, commissionCents, filterOrders, summarizeOrders, validRate } from '../services/comissoes/commissionMath.js'

// Dados 100% FICTÍCIOS para validação visual no LAB. Não são registros da Bagy.
const DEMO_PARTNERS = [{ id: 'lab-1', name: 'Parceira de demonstração', coupon: 'TESTEPRIME', rate: 10, since: '2026-08-01' }]
const DEMO_ORDERS = [
  { id: 'DEMO-001', partnerId: 'lab-1', date: '2026-09-05', revenueCents: 22590, rateAtSale: 10, status: 'paga' },
  { id: 'DEMO-002', partnerId: 'lab-1', date: '2026-09-18', revenueCents: 36990, rateAtSale: 10, status: 'aprovada' },
  { id: 'DEMO-003', partnerId: 'lab-1', date: '2026-09-28', revenueCents: 54900, rateAtSale: 10, status: 'a_conferir' },
  { id: 'DEMO-004', partnerId: 'lab-1', date: '2026-10-06', revenueCents: 17990, rateAtSale: 10, status: 'a_conferir' },
]
const STATUS = { a_conferir: 'A conferir', aprovada: 'Aprovada', paga: 'Paga', cancelada: 'Cancelada' }
const MONTHS = ['2026-08', '2026-09', '2026-10']
const money = value => brl(value)
const cleanCSV = value => '"' + String(value ?? '').replace(/^\s*[=+\-@]/, "'$&").replace(/"/g, '""') + '"'
const rateLabel = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'
const fmtDate = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'
const monthLabel = iso => new Date(iso + '-02T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
function Badge({ children, color = '#64748b' }) { return <span style={{ padding: '4px 9px', border: '1px solid '+color+'55', background: color+'14', color, borderRadius: 99, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>{children}</span> }
function Summary({ caption, value, hint, t, featured }) { return <div style={{ border: '1px solid '+t.border, background: t.bg, borderRadius: 12, padding: '16px 18px', minWidth: 0 }}><div style={{ color: t.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700 }}>{caption}</div><div style={{ color: featured ? '#E8192C' : t.text, fontSize: 25, fontWeight: 800, marginTop: 7, whiteSpace: 'nowrap' }}>{value}</div><div style={{ color: t.textMuted, fontSize: 11, marginTop: 3 }}>{hint}</div></div> }
function Field({ label, children }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#737b89' }}>{label}</span>{children}</label> }
function Empty({ children, t }) { return <div style={{ padding: '28px 16px', color: t.textMuted, fontSize: 13, textAlign: 'center' }}>{children}</div> }

export default function ComissoesPage() {
  const { theme: t } = useTheme()
  const [tab, setTab] = useState('painel')
  const [month, setMonth] = useState('2026-09')
  const [partnerId, setPartnerId] = useState('all')
  const [partners, setPartners] = useState(() => DEMO_PARTNERS.map(p => ({...p})))
  const [orders, setOrders] = useState(() => DEMO_ORDERS.map(o => ({...o})))
  const [name, setName] = useState('')
  const [coupon, setCoupon] = useState('')
  const [rate, setRate] = useState('10')
  const [newOrderPartner, setNewOrderPartner] = useState('lab-1')
  const [newOrderAmount, setNewOrderAmount] = useState('')
  const [notice, setNotice] = useState('')
  const inputStyle = { background: t.bg, color: t.text, border: '1px solid '+t.borderMid, borderRadius: 8, padding: '9px 10px', fontSize: 12, minWidth: 0, width: '100%' }
  const btnStyle = { border: '1px solid '+t.borderMid, background: t.bg, color: t.textSecondary, borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 650, cursor: 'pointer' }
  const redBtn = { ...btnStyle, color: '#fff', background: '#E8192C', border: '1px solid #E8192C' }
  const partnerById = useMemo(() => Object.fromEntries(partners.map(p => [p.id, p])), [partners])
  const filtered = useMemo(() => filterOrders(orders, month, partnerId), [orders, month, partnerId])
  const summary = useMemo(() => summarizeOrders(filtered), [filtered])
  const totalsByMonth = useMemo(() => [...new Set([...MONTHS, ...orders.map(o => o.date.slice(0, 7))])].sort().reverse().map(m => ({ month: m, ...summarizeOrders(filterOrders(orders, m, partnerId)) })), [orders, partnerId])
  const statusColors = { a_conferir: '#d97706', aprovada: '#0284c7', paga: '#16a34a', cancelada: '#ef4444' }

  function addPartner(e) {
    e.preventDefault()
    const normalized = coupon.trim().toUpperCase()
    if (!name.trim() || !/^[A-Z0-9_-]{3,50}$/.test(normalized) || !validRate(rate)) { setNotice('Preencha nome, cupom (3 a 50 letras/números) e percentual entre 0 e 100.'); return }
    if (partners.some(p => p.coupon === normalized)) { setNotice('Este cupom já está cadastrado.'); return }
    const id = 'lab-' + Date.now()
    setPartners(prev => [...prev, { id, name: name.trim(), coupon: normalized, rate: Number(rate), since: new Date().toISOString().slice(0,10) }])
    setName(''); setCoupon(''); setRate('10'); setNewOrderPartner(id); setNotice('Parceira adicionada somente à sessão de testes.'); setTab('parceiras')
  }
  function changeRate(id, next) {
    if (!validRate(next)) { setNotice('Informe percentual de 0 a 100.'); return }
    setPartners(prev => prev.map(p => p.id === id ? {...p, rate: Number(next)} : p))
    setNotice('Taxa de teste atualizada. Os pedidos anteriores mantêm o percentual registrado na venda.')
  }
  function addTestOrder(e) {
    e.preventDefault()
    const p = partnerById[newOrderPartner]
    const amount = Number(String(newOrderAmount).replace(',', '.'))
    if (!p || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) { setNotice('Selecione uma parceira e informe um valor válido.'); return }
    const cents = Math.round(amount * 100)
    const id = 'DEMO-' + Date.now()
    setOrders(prev => [...prev, { id, partnerId: p.id, date: month + '-15', revenueCents: cents, rateAtSale: p.rate, status: 'a_conferir' }])
    setNewOrderAmount(''); setNotice('Pedido de teste criado. Nenhum dado enviado à Bagy.')
    setTab('painel')
  }
  function exportCSV() {
    const rows = [['Parceira','Cupom','ID do pedido','Data','Receita (R$)','Taxa da venda (%)','Comissão (R$)','Situação'],...filtered.map(o => [partnerById[o.partnerId]?.name || '',partnerById[o.partnerId]?.coupon || '',o.id,fmtDate(o.date),(o.revenueCents/100).toFixed(2).replace('.',','),String(o.rateAtSale).replace('.',','),(commissionCents(o.revenueCents,o.rateAtSale)/100).toFixed(2).replace('.',','),STATUS[o.status]])]
    const csv = '\uFEFF' + rows.map(row => row.map(cleanCSV).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
    const a=document.createElement('a');a.href=url;a.download='PRIME-Comissoes-LAB-'+month+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }

  return <div className="prime-commissions" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.appBg, color: t.text }}>
    <style>{`
      .prime-commissions .pc-body { overflow-y:auto; padding:20px 24px 36px; }
      .prime-commissions .pc-card { border-radius:12px; }
      .prime-commissions .pc-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .prime-commissions .pc-table-wrap { overflow-x:auto; }
      .prime-commissions table { border-collapse:collapse; width:100%; min-width:700px; font-size:12px; }
      .prime-commissions th { text-align:left; font-weight:700; font-size:10px; padding:12px; text-transform:uppercase; letter-spacing:.25px; }
      .prime-commissions td { padding:12px; border-top:1px solid var(--pc-border); }
      .prime-commissions .pc-row { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
      .prime-commissions .pc-grow { flex:1; }
      .prime-commissions .pc-tabs { display:flex; gap:8px; }
      .prime-commissions .pc-tabs button { background:transparent; border:none; padding:10px 14px; font-size:12px; font-weight:700; }
      @media(max-width:1100px){.prime-commissions .pc-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media(max-width:650px){.prime-commissions .pc-body{padding:14px}.prime-commissions .pc-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.prime-commissions .pc-tabs button{padding:9px;}}
      @media screen { #prime-commission-report { display:none; } }
      @media print {
        @page { size:A4; margin:14mm; }
        body * { visibility:hidden !important; }
        #prime-commission-report, #prime-commission-report * {visibility:visible !important;}
        #prime-commission-report {display:block !important;position:absolute;left:0;top:0;width:100%;padding:0;color:#111;background:#fff;font-family:Arial,sans-serif;}
        #prime-commission-report table {width:100%;min-width:0;border-collapse:collapse;font-size:10px;}
        #prime-commission-report th,#prime-commission-report td {padding:8px 5px;border-bottom:1px solid #ddd;text-align:left;}
      }
    `}</style>
    <div style={{ background:t.bg, borderBottom:'1px solid '+t.border, padding:'16px 24px 0', flexShrink:0 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, justifyContent:'space-between', alignItems:'center' }}>
        <div><div style={{ fontSize:24, fontWeight:800, letterSpacing:'-.5px' }}><span style={{color:'#E8192C'}}>///</span> COMISSÕES <Badge color="#E8192C">LAB · DEMONSTRAÇÃO</Badge></div><div style={{fontSize:12,color:t.textMuted,marginTop:2}}>Parcerias, vendas por cupom e fechamentos mensais</div></div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button type="button" style={btnStyle} onClick={exportCSV}>↓ Exportar planilha CSV</button>
          <button type="button" style={redBtn} onClick={()=>window.print()}>↓ Salvar PDF</button>
        </div>
      </div>
      <div className="pc-tabs" style={{marginTop:12}}>
        {[['painel','Painel'],['parceiras','Parceiras'],['fechamentos','Fechamentos']].map(([id,label])=><button key={id} type="button" onClick={()=>setTab(id)} style={{color:tab===id?'#E8192C':t.textMuted,borderBottom:tab===id?'2px solid #E8192C':'2px solid transparent'}}>{label}</button>)}
      </div>
    </div>
    <div className="pc-body" style={{'--pc-border':t.border}}>
      <div style={{background:t.primaryBg,border:'1px solid '+t.border,borderRadius:10,padding:'11px 14px',fontSize:12,color:t.textSecondary,marginBottom:14}}>
        <strong style={{color:'#E8192C'}}>DADOS DE TESTE</strong> — Números fictícios, salvos somente nesta sessão. A Bagy, o INSTINCT, o banco real e o portal externo ainda não estão conectados. Nenhum pagamento será efetuado aqui.
      </div>
      {notice && <div role="status" style={{padding:12,marginBottom:12,border:'1px solid '+t.border,borderRadius:8,fontSize:12,color:t.text}}>{notice} <button onClick={()=>setNotice('')} style={{...btnStyle,padding:'2px 7px',marginLeft:8}}>Fechar</button></div>}
      <div className="pc-row" style={{ marginBottom:16 }}>
        <Field label="MÊS"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={inputStyle}/></Field>
        <Field label="PARCEIRA"><select value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={inputStyle}><option value="all">Todas as parceiras</option>{partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <div style={{flex:1, fontSize:11,color:t.textMuted,paddingBottom:8}}>Fonte: demonstração local · Sincronizações reais: 0</div>
      </div>
      {tab==='painel' && <>
        <div className="pc-grid" style={{marginBottom:16}}>
          <Summary t={t} caption="Vendas válidas" value={summary.count} hint="Exclui pedidos cancelados" />
          <Summary t={t} caption="Receita por cupom" value={money(summary.revenueCents)} hint="Aguardando validação da fonte" />
          <Summary t={t} caption="Comissão prevista" value={money(summary.projectedCents)} hint="Pode mudar após conferência" featured />
          <Summary t={t} caption="Pago (teste)" value={money(summary.paidCents)} hint="Simulação, não comprovante" />
        </div>
        <div style={{background:t.bg,border:'1px solid '+t.border,borderRadius:12,overflow:'hidden',marginBottom:14}}>
          <div style={{padding:'15px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><strong style={{fontSize:14}}>Pedidos e comissão individual</strong><Badge>{filtered.length} registro(s) · {monthLabel(month)}</Badge></div>
          <div className="pc-table-wrap"><table><thead style={{background:t.bgSecondary,color:t.textMuted}}><tr>{['Pedido','Data','Parceira / cupom','Valor vendido','Taxa original','Comissão','Status de teste'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
            {filtered.map(o=><tr key={o.id}><td style={{fontWeight:750}}>{o.id}</td><td>{fmtDate(o.date)}</td><td>{partnerById[o.partnerId]?.name || 'Parceira não encontrada'}<div style={{fontSize:10,color:t.textMuted}}>{partnerById[o.partnerId]?.coupon || '—'}</div></td><td>{money(o.revenueCents)}</td><td>{rateLabel(o.rateAtSale)}</td><td style={{fontWeight:800}}>{money(commissionCents(o.revenueCents,o.rateAtSale))}</td><td><select value={o.status} aria-label={'Status do pedido '+o.id} style={{...inputStyle,color:statusColors[o.status],padding:'6px 8px'}} onChange={e=>setOrders(prev=>prev.map(item=>item.id===o.id?{...item,status:e.target.value}:item))}>{Object.entries(STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td></tr>)}
            {filtered.length===0&&<tr><td colSpan={7}><Empty t={t}>Nenhum pedido para este mês e parceira.</Empty></td></tr>}
          </tbody></table></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12}}>
          <div style={{background:t.bg,border:'1px solid '+t.border,padding:16,borderRadius:12}}><strong style={{fontSize:13}}>Comissões por situação</strong><div style={{fontSize:12,color:t.textMid,marginTop:14,lineHeight:2.3}}>Aprovadas, ainda não pagas <b style={{float:'right',color:t.text}}>{money(summary.payableCents)}</b><br/>Já pagas (teste) <b style={{float:'right',color:t.text}}>{money(summary.paidCents)}</b></div></div>
          <div style={{background:t.bg,border:'1px solid '+t.border,padding:16,borderRadius:12}}><strong style={{fontSize:13}}>INSTINCT · histórico de consultas</strong><Empty t={t}>Nenhum log registrado. A conexão diária com a Bagy será implantada e validada na próxima fase.</Empty></div>
        </div>
      </>}
      {tab==='parceiras' && <>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}}>
          <div style={{background:t.bg,border:'1px solid '+t.border,borderRadius:12,padding:18}}>
            <h3 style={{fontSize:15,marginBottom:12}}>Adicionar parceira · teste</h3>
            <form onSubmit={addPartner} style={{display:'flex',flexDirection:'column',gap:12}}>
              <Field label="NOME"><input style={inputStyle} value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="Nome da influenciadora" required/></Field>
              <Field label="CUPOM"><input style={inputStyle} value={coupon} maxLength={50} onChange={e=>setCoupon(e.target.value)} placeholder="CUPOM" required/></Field>
              <Field label="COMISSÃO (%)"><input type="number" min="0" max="100" step=".01" style={inputStyle} value={rate} onChange={e=>setRate(e.target.value)} required/></Field>
              <button type="submit" style={redBtn}>+ Criar parceira de teste</button>
            </form>
          </div>
          <div style={{background:t.bg,border:'1px solid '+t.border,borderRadius:12,padding:18}}>
            <h3 style={{fontSize:15,marginBottom:12}}>Parceiras cadastradas nesta sessão</h3>
            {partners.map(p=><div key={p.id} style={{padding:'12px 0',borderBottom:'1px solid '+t.border,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:140}}><strong style={{fontSize:13}}>{p.name}</strong><div style={{fontSize:11,color:t.textMuted,marginTop:4}}>{p.coupon}</div></div>
              <div style={{width:94}}><Field label="TAXA FUTURA (%)"><input aria-label={'Taxa de '+p.name} type="number" step=".01" min="0" max="100" defaultValue={p.rate} key={p.id} style={inputStyle} onBlur={e=>{if(String(e.target.value)!==String(p.rate))changeRate(p.id,e.target.value)}}/></Field></div>
            </div>)}
            <div style={{marginTop:14,fontSize:11,color:t.textMuted}}>Ao alterar a taxa, os pedidos anteriores preservam a taxa original. O link privado da parceira só será liberado após autenticação e segurança serem testadas.</div>
          </div>
        </div>
        <div style={{marginTop:14,background:t.bg,border:'1px solid '+t.border,borderRadius:12,padding:18}}>
          <h3 style={{fontSize:15,marginBottom:12}}>Simular novo pedido</h3>
          <form onSubmit={addTestOrder} className="pc-row">
            <Field label="PARCEIRA"><select value={newOrderPartner} onChange={e=>setNewOrderPartner(e.target.value)} style={inputStyle}>{partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="RECEITA DO PEDIDO (R$)"><input value={newOrderAmount} onChange={e=>setNewOrderAmount(e.target.value)} inputMode="decimal" placeholder="150,00" style={inputStyle}/></Field>
            <button type="submit" style={btnStyle}>+ Pedido de teste</button>
          </form>
          <div style={{fontSize:11,color:t.textMuted,marginTop:8}}>Novo pedido usa a taxa atual e o dia 15 do mês selecionado. Não envia nada ao comércio eletrônico.</div>
        </div>
      </>}
      {tab==='fechamentos' && <div style={{background:t.bg,border:'1px solid '+t.border,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'15px 16px'}}><strong>Histórico mensal</strong><div style={{fontSize:12,color:t.textMuted,marginTop:4}}>Meses sem vendas continuam visíveis. Fechamento contábil e comprovantes reais ainda não foram habilitados.</div></div>
        <div className="pc-table-wrap"><table><thead style={{background:t.bgSecondary,color:t.textMuted}}><tr>{['Período','Vendas','Receita','Prevista','Aprovada','Paga (teste)','Situação'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{totalsByMonth.map(m=><tr key={m.month}><td><button style={{...btnStyle,padding:'6px 9px'}} onClick={()=>{setMonth(m.month);setTab('painel')}}>{monthLabel(m.month)}</button></td><td>{m.count}</td><td>{money(m.revenueCents)}</td><td>{money(m.projectedCents)}</td><td>{money(m.approvedCents)}</td><td>{money(m.paidCents)}</td><td><Badge color={m.count>0?'#d97706':'#64748b'}>{m.count>0?'Em conferência':'Sem vendas'}</Badge></td></tr>)}</tbody></table></div>
      </div>}
    </div>
    <div id="prime-commission-report">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22,borderBottom:'3px solid #E8192C',paddingBottom:16}}>
        <img src="/logo-prime.png" alt="PRIME STORE" style={{width:175,maxHeight:60,objectFit:'contain'}}/><div style={{textAlign:'right'}}><strong style={{fontSize:18}}>Relatório de comissões</strong><div style={{fontSize:10,color:'#555'}}>AMBIENTE LAB · DADOS FICTÍCIOS</div></div>
      </div>
      <div style={{marginBottom:15,fontSize:12}}>Período: <b>{monthLabel(month)}</b> · Parceira: <b>{partnerId==='all'?'Todas':partnerById[partnerId]?.name}</b></div>
      <div style={{display:'flex',gap:30,fontSize:12,marginBottom:24}}><span>Receita: <b>{money(summary.revenueCents)}</b></span><span>Comissão prevista: <b>{money(summary.projectedCents)}</b></span><span>Vendas: <b>{summary.count}</b></span></div>
      <table><thead><tr><th>Pedido</th><th>Data</th><th>Parceira</th><th>Venda</th><th>Taxa</th><th>Comissão</th><th>Status</th></tr></thead><tbody>{filtered.map(o=><tr key={o.id}><td>{o.id}</td><td>{fmtDate(o.date)}</td><td>{partnerById[o.partnerId]?.name}</td><td>{money(o.revenueCents)}</td><td>{rateLabel(o.rateAtSale)}</td><td>{money(commissionCents(o.revenueCents,o.rateAtSale))}</td><td>{STATUS[o.status]}</td></tr>)}</tbody></table>
      <div style={{fontSize:10,color:'#666',marginTop:20}}>Prévia técnica sem dados reais. Não serve como comprovante de pagamento. Confirme status e valores da Bagy antes de qualquer fechamento.</div>
    </div>
  </div>
}
