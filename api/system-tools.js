// Endpoint combinado pra caber no limite de 12 Serverless Functions do Hobby.
// Dois utilitários pequenos e sem relação direta, mas ambos leves e de baixo
// tráfego — junto num arquivo só, dividido por ?tool=.
//
// ?tool=vercel-status     → status do último deploy da Vercel (card do Dashboard) — SEM autenticação
// ?tool=sync-lyra         → sincroniza Cobranca da Lyra pro PRIME (Cliente/Venda/Parcela)
//                           (?dryRun=false pra escrever de verdade; default só relatório)
//                           Exige header Authorization: Bearer <CRON_SECRET> em AMBOS os modos
//                           (dryRun=true também, porque expõe nomes/valores/status financeiros)

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

// Prioridade de identificação da Parcela correspondente a uma Cobranca da Lyra:
// 1. lyra_cobranca_id — chave permanente, existe desde a criação da Cobranca (antes de qualquer MP)
// 2. mp_preference_id — existe assim que o link de pagamento é gerado, antes do pagamento
// 3. mp_payment_id — só existe depois que o pagamento acontece
// 4. fallback legado (nome+valor+vencimento) — só pra Parcelas criadas antes destes 3 campos existirem
function encontrarParcelaCorrespondente(cob, nomeCliente, primeParcelas) {
  let match = primeParcelas.find(p => p.lyra_cobranca_id && p.lyra_cobranca_id === cob.id)
  if (match) return match

  if (cob.mp_preference_id) {
    match = primeParcelas.find(p => p.mp_preference_id && p.mp_preference_id === cob.mp_preference_id)
    if (match) return match
  }

  if (cob.mp_payment_id) {
    match = primeParcelas.find(p => p.mp_payment_id && p.mp_payment_id === cob.mp_payment_id)
    if (match) return match
  }

  // Fallback só se a parcela não tiver nenhum dos 3 campos novos (registro pré-migração)
  return primeParcelas.find(p =>
    !p.lyra_cobranca_id && !p.mp_preference_id && !p.mp_payment_id &&
    normalizeName(p.cliente_nome) === normalizeName(nomeCliente) &&
    Math.abs((p.valor_base || 0) - cob.valor) < 0.01 &&
    (p.data_vencimento || '') === cob.vencimento
  )
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

    const acoes = []
    const erros = []

    for (const cob of lyraCobrancas) {
      try {
        // Nome vem preferencialmente do cadastro de Cliente da Lyra — o campo
        // cliente_nome da própria Cobranca às vezes vem vazio (visto em teste real).
        const lyraCliente = lyraClientePorId.get(cob.cliente_id)
        const nomeCliente = lyraCliente?.name || cob.cliente_nome || 'Sem nome'
        const telefoneLyra = normalizePhone(lyraCliente?.phone || '')

        const parcelaExistente = encontrarParcelaCorrespondente(cob, nomeCliente, primeParcelas)

        // --- Caso 1: já existe e já está paga — nada a fazer, idempotente ---
        if (parcelaExistente && parcelaExistente.status === 'pago') {
          acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false })
          continue
        }

        // --- Caso 2: já existe, ainda não paga, e a Lyra agora diz que está paga — ATUALIZAR ---
        if (parcelaExistente && cob.status === 'pago') {
          if (dryRun) {
            acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, valor: cob.valor, acao: 'ATUALIZAR', executado: false, parcela_id: parcelaExistente.id })
            continue
          }

          // Releitura pontual — reduz a janela de corrida caso outra execução já tenha
          // processado esta mesma parcela entre o list() inicial e agora.
          const parcelaAtual = await prime.entities.Parcela.get(parcelaExistente.id)
          if (parcelaAtual.status === 'pago') {
            acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false, nota: 'detectado na releitura de concorrência' })
            continue
          }

          await prime.entities.Parcela.update(parcelaExistente.id, {
            status: 'pago',
            valor_pago: cob.valor, // atribuição direta, nunca soma — evita duplicar valor em reprocessamento
            lyra_cobranca_id: cob.id,
            mp_preference_id: cob.mp_preference_id || parcelaAtual.mp_preference_id || null,
            mp_payment_id: cob.mp_payment_id || parcelaAtual.mp_payment_id || null,
            // data_pagamento e forma_pagamento propositalmente NÃO alterados —
            // a Lyra não fornece essa informação com confiança suficiente pra presumir.
          })

          await prime.entities.HistoricoAtividade.create({
            cobranca_id: parcelaExistente.id,
            tipo: 'pagamento',
            cliente_nome: nomeCliente,
            valor: cob.valor,
            valor_anterior: '0',
            usuario: null,
            detalhes: `[AUTOMÁTICO] Identificado via sincronização Lyra/Mercado Pago em ${new Date().toISOString()} (mp_payment_id: ${cob.mp_payment_id || 'n/d'}). Esta é a data em que o sync detectou o pagamento, não necessariamente a data real em que ele ocorreu.`,
            descricao: `[AUTOMÁTICO] Pagamento de R$ ${Number(cob.valor).toFixed(2)} identificado via Lyra/Mercado Pago para ${nomeCliente}`,
          })

          acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'ATUALIZAR', executado: true, parcela_id: parcelaExistente.id })
          continue
        }

        // --- Caso 3: já existe, mas nem ela nem a Lyra estão pagas — nada muda ---
        if (parcelaExistente) {
          acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'SEM_MUDANCA', executado: false })
          continue
        }

        // --- Caso 4: não existe ainda — CRIAR Cliente (se preciso) + Venda + Parcela ---
        let clienteExistente = telefoneLyra ? clientePorTelefone.get(telefoneLyra) : null
        const acaoProposta = clienteExistente ? 'CRIAR_VENDA_E_PARCELA' : 'CRIAR_CLIENTE_VENDA_E_PARCELA'

        if (dryRun) {
          acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, valor: cob.valor, vencimento: cob.vencimento, status_lyra: cob.status, acao: acaoProposta, executado: false })
          continue
        }

        // Releitura pontual por lyra_cobranca_id — reduz risco de duas execuções
        // concorrentes criarem Venda/Parcela duplicadas pra mesma Cobranca.
        const jaExisteAgora = await prime.entities.Parcela.filter({ lyra_cobranca_id: cob.id })
        if (jaExisteAgora && jaExisteAgora.length > 0) {
          acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false, nota: 'detectado na releitura de concorrência' })
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
          lyra_cobranca_id: cob.id,
          mp_preference_id: cob.mp_preference_id || null,
          mp_payment_id: cob.mp_payment_id || null,
        })

        acoes.push({ lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: acaoProposta, executado: true, novo_cliente_id: clienteExistente.id, nova_venda_id: venda.id, nova_parcela_id: parcela.id })
      } catch (errItem) {
        console.error('[system-tools:sync-lyra] Erro na cobrança', cob.id, errItem.message)
        erros.push({ lyra_cobranca_id: cob.id, mensagem: errItem.message })
        acoes.push({ lyra_cobranca_id: cob.id, acao: 'ERRO', executado: false, erro: errItem.message })
      }
    }

    const resumo = {
      totalProcessado: lyraCobrancas.length,
      criados: acoes.filter(a => (a.acao === 'CRIAR_VENDA_E_PARCELA' || a.acao === 'CRIAR_CLIENTE_VENDA_E_PARCELA') && a.executado).length,
      atualizados: acoes.filter(a => a.acao === 'ATUALIZAR' && a.executado).length,
      semMudanca: acoes.filter(a => a.acao === 'SEM_MUDANCA').length,
      jaSincronizados: acoes.filter(a => a.acao === 'JA_SINCRONIZADO').length,
      erros: erros.length,
    }

    return res.status(200).json({
      dryRun,
      success: erros.length === 0,
      resumo,
      acoes,
      erros,
      aviso: dryRun ? 'Nenhuma escrita foi feita — isso é só um relatório do que aconteceria.' : 'Escrita real executada para as ações marcadas com executado:true.',
    })
  } catch (e) {
    console.error('[system-tools:sync-lyra] Erro geral:', e.message)
    return res.status(500).json({ error: 'Erro ao sincronizar', detail: e.message, success: false })
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  switch (req.query.tool) {
    case 'vercel-status':
      // Sem autenticação — consumido diretamente pelo Dashboard no navegador.
      return vercelStatus(req, res)

    case 'sync-lyra': {
      // Autenticação obrigatória pra AMBOS dryRun=true e dryRun=false: mesmo em
      // modo relatório, a resposta expõe nomes, valores, vencimentos e status
      // financeiros reais — não é seguro deixar público.
      const cronSecret = process.env.CRON_SECRET
      const authHeader = req.headers.authorization
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return syncLyra(req, res)
    }

    default:
      return res.status(400).json({ error: 'Parâmetro ?tool= inválido ou ausente (use vercel-status ou sync-lyra)' })
  }
}
