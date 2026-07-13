// Endpoint combinado pra caber no limite de 12 Serverless Functions do Hobby.
// Dois utilitários pequenos e sem relação direta, mas ambos leves e de baixo
// tráfego — junto num arquivo só, dividido por ?tool=.
//
// ?tool=vercel-status     → status do último deploy da Vercel (card do Dashboard)
// ?tool=sync-lyra         → sincroniza Cobranca da Lyra pro PRIME (Cliente/Venda/Parcela)
//                           (?dryRun=false pra escrever de verdade; default só relatório)

import { createClient } from '@base44/sdk'

const VERCEL_TOKEN = process.env.VERCEL_ACCESS_TOKEN
const PROJECT_ID = 'prj_apJGLxIL6ooCFTCuboQiHwuveOw9'
const TEAM_ID = 'team_O0lVaTLcrP62cKLeTZwclgAq'

const BASE44_API_KEY = process.env.BASE44_API_KEY
const LYRA_APP_ID = '6a518d72335f3c31663dc63d'
const PRIME_APP_ID = '6a50402b2eeb1d1114312861'

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

function normalizeName(name) {
  return (name || '').trim().toLowerCase()
}

async function vercelStatus(req, res) {
  if (!VERCEL_TOKEN) {
    return res.status(500).json({ error: 'VERCEL_ACCESS_TOKEN não configurado' })
  }
  try {
    const headers = { Authorization: `Bearer ${VERCEL_TOKEN}` }
    const deploysRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=1`,
      { headers }
    )
    if (!deploysRes.ok) {
      return res.status(deploysRes.status).json({ error: 'Falha ao consultar deployments' })
    }
    const { deployments } = await deploysRes.json()
    const latest = deployments?.[0]
    if (!latest) return res.status(200).json({ available: false })

    return res.status(200).json({
      available: true,
      state: latest.readyState,
      createdAt: latest.created,
      branch: latest.meta?.githubCommitRef || null,
      url: latest.url,
      target: latest.target || 'production',
      usageNote: 'Uso detalhado disponível no painel da Vercel',
    })
  } catch (e) {
    console.error('[system-tools:vercel-status] Erro:', e.message)
    return res.status(500).json({ error: 'Erro interno ao consultar status da Vercel' })
  }
}

async function syncLyra(req, res) {
  if (!BASE44_API_KEY) {
    return res.status(500).json({ error: 'BASE44_API_KEY não configurado' })
  }
  const dryRun = req.query.dryRun !== 'false'

  try {
    const lyra = createClient({ appId: LYRA_APP_ID, headers: { api_key: BASE44_API_KEY } })
    const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })

    const [lyraCobrancas, lyraClientes, primeClientes, primeParcelas] = await Promise.all([
      lyra.entities.Cobranca.list(),
      lyra.entities.Cliente.list(),
      prime.entities.Cliente.list(),
      prime.entities.Parcela.list(),
    ])

    const lyraClientePorId = new Map(lyraClientes.map(c => [c.id, c]))
    const clientePorTelefone = new Map(primeClientes.filter(c => c.telefone).map(c => [normalizePhone(c.telefone), c]))
    const parcelaJaExiste = (cliente, valor, vencimento) => primeParcelas.some(p =>
      normalizeName(p.cliente_nome) === normalizeName(cliente) &&
      Math.abs((p.valor_base || 0) - valor) < 0.01 &&
      (p.data_vencimento || '') === vencimento
    )

    const acoes = []

    for (const cob of lyraCobrancas) {
      const lyraCliente = lyraClientePorId.get(cob.cliente_id)
      // Nome vem preferencialmente do cadastro de Cliente da Lyra — o campo
      // cliente_nome da própria Cobranca às vezes vem vazio (visto em teste real).
      const nomeCliente = lyraCliente?.name || cob.cliente_nome || 'Sem nome'
      const telefoneLyra = normalizePhone(lyraCliente?.phone || '')
      let clienteExistente = telefoneLyra ? clientePorTelefone.get(telefoneLyra) : null
      const jaTemParcela = parcelaJaExiste(nomeCliente, cob.valor, cob.vencimento)

      if (jaTemParcela) {
        acoes.push({ lyra_cobranca_id: cob.id, mp_payment_id: cob.mp_payment_id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false })
        continue
      }

      const acaoProposta = clienteExistente ? 'CRIAR_VENDA_E_PARCELA' : 'CRIAR_CLIENTE_VENDA_E_PARCELA'

      if (dryRun) {
        acoes.push({ lyra_cobranca_id: cob.id, mp_payment_id: cob.mp_payment_id, cliente_nome: nomeCliente, valor: cob.valor, vencimento: cob.vencimento, status_lyra: cob.status, acao: acaoProposta, executado: false })
        continue
      }

      if (!clienteExistente) {
        clienteExistente = await prime.entities.Cliente.create({
          nome: nomeCliente,
          telefone: telefoneLyra || '',
          status: 'ativo',
        })
        clientePorTelefone.set(telefoneLyra, clienteExistente)
      }

      const venda = await prime.entities.Venda.create({
        cliente_nome: nomeCliente,
        cliente_id: clienteExistente.id,
        valor_total: cob.valor,
        numero_parcelas: 1,
        data_venda: cob.vencimento,
        descricao_itens: cob.descricao || 'Importado da Lyra',
        valor_parcela: cob.valor,
        valor_entrada: 0,
        taxa_juros: 0,
        status: cob.status === 'pago' ? 'quitada' : 'aberta',
      })

      const parcela = await prime.entities.Parcela.create({
        venda_id: venda.id,
        cliente_id: clienteExistente.id,
        cliente_nome: nomeCliente,
        numero: 1,
        valor_base: cob.valor,
        valor_atualizado: cob.valor,
        valor_pago: cob.status === 'pago' ? cob.valor : 0,
        data_vencimento: cob.vencimento,
        data_pagamento: cob.status === 'pago' ? cob.vencimento : null,
        status: cob.status === 'pago' ? 'pago' : 'pendente',
        forma_pagamento: cob.status === 'pago' ? 'pix' : null,
        cobranca_enviada: true,
      })

      acoes.push({ lyra_cobranca_id: cob.id, mp_payment_id: cob.mp_payment_id, cliente_nome: nomeCliente, acao: acaoProposta, executado: true, novo_cliente_id: clienteExistente.id, nova_venda_id: venda.id, nova_parcela_id: parcela.id })
    }

    return res.status(200).json({
      dryRun,
      totalLyra: lyraCobrancas.length,
      totalPrimeParcelas: primeParcelas.length,
      acoes,
      aviso: dryRun ? 'Nenhuma escrita foi feita — isso é só um relatório do que aconteceria.' : 'Escrita real executada para as ações marcadas com executado:true.',
    })
  } catch (e) {
    console.error('[system-tools:sync-lyra] Erro:', e.message)
    return res.status(500).json({ error: 'Erro ao sincronizar', detail: e.message })
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  switch (req.query.tool) {
    case 'vercel-status':
      return vercelStatus(req, res)
    case 'sync-lyra':
      return syncLyra(req, res)
    default:
      return res.status(400).json({ error: 'Parâmetro ?tool= inválido ou ausente (use vercel-status ou sync-lyra)' })
  }
}
