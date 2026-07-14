// Endpoint combinado pra caber no limite de 12 Serverless Functions do Hobby.
// Utilitários pequenos e sem relação direta entre si, mas todos leves e de
// baixo tráfego — juntos num arquivo só, divididos por ?tool=.
//
// ?tool=vercel-status     → status do último deploy da Vercel (card do Dashboard) — SEM autenticação
// ?tool=sync-lyra         → sincroniza Cobranca da Lyra pro PRIME (Cliente/Venda/Parcela)
//                           (?dryRun=false pra escrever de verdade; default só relatório)
//                           Exige header Authorization: Bearer <CRON_SECRET> em AMBOS os modos
//                           (dryRun=true também, porque expõe nomes/valores/status financeiros)
// ?tool=stuck-check       → healthcheck de conversas do GPT Maker sem resposta há 3-30min
//                           (chamado pelo GitHub Actions .github/workflows/stuck-check.yml)
//                           Exige header Authorization: Bearer <CRON_SECRET>
// ?tool=lyra-webhook      → recebe aviso em tempo real da Lyra (processarEventoMP) quando
//                           um pagamento é confirmado — baixa a Parcela na hora, sem esperar
//                           o cron. Exige header Authorization: Bearer <LYRA_WEBHOOK_SECRET>
//                           (segredo próprio, diferente do CRON_SECRET). O cron de sync-lyra
//                           continua existindo como rede de segurança caso este webhook falhe.
// ?tool=gerar-cobranca-lyra → FASE 2.2, estritamente dry-run: recebe só parcela_id, consulta
//                           Parcela/Venda/Cliente no PRIME + Cliente na Lyra (só leitura) e
//                           devolve um relatório do que a FASE 2.3 faria — não escreve nada,
//                           não chama a Lyra nem o Mercado Pago. Exige header
//                           Authorization: Bearer <GERAR_COBRANCA_SECRET> (segredo próprio,
//                           diferente de CRON_SECRET e LYRA_WEBHOOK_SECRET) + checagem
//                           best-effort de Origin/Referer contra GERAR_COBRANCA_ALLOWED_ORIGINS.

import { createClient } from '@base44/sdk'
import { gerarCobrancaLyraDryRun, gerarCobrancaLyraReal, checarRateLimitBestEffort, checarOrigemBestEffort } from './_gerarCobrancaLyra.js'

const VERCEL_TOKEN = process.env.VERCEL_ACCESS_TOKEN
const PROJECT_ID = 'prj_apJGLxIL6ooCFTCuboQiHwuveOw9'
const TEAM_ID = 'team_O0lVaTLcrP62cKLeTZwclgAq'

const BASE44_API_KEY = process.env.BASE44_API_KEY
const LYRA_APP_ID = '6a518d72335f3c31663dc63d'
const PRIME_APP_ID = '6a50402b2eeb1d1114312861'
const LYRA_WEBHOOK_SECRET = process.env.LYRA_WEBHOOK_SECRET

const GPTMAKER_TOKEN = process.env.VITE_GPTMAKER_TOKEN
const GPTMAKER_WS = process.env.VITE_GPTMAKER_WORKSPACE
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const GPTMAKER_BASE = 'https://api.gptmaker.ai'

const STUCK_THRESHOLD_MS = 3 * 60 * 1000   // sem resposta por mais de 3min = suspeito
const STUCK_MAX_AGE_MS = 30 * 60 * 1000    // ignora chats com última msg há mais de 30min
const STUCK_DEDUPE_WINDOW_MS = 10 * 60 * 1000 // não alerta o mesmo chat de novo por 10min

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

// Confirma se a Parcela encontrada tem um identificador que bate EXATAMENTE com a Cobranca
// atual — não basta o campo existir, precisa corresponder. Distingue 3 situações:
// confirmado (bate certinho), divergente (tem ID mas não bate com esta Cobranca) e "nenhum
// dos dois" (parcela sem nenhum dos 3 campos, achada só pelo fallback legado).
function obterVinculoDeterministico(parcela, cob) {
  const porLyraId = Boolean(parcela.lyra_cobranca_id) && parcela.lyra_cobranca_id === cob.id
  const porPreferenceId = Boolean(parcela.mp_preference_id) && Boolean(cob.mp_preference_id) && parcela.mp_preference_id === cob.mp_preference_id
  const porPaymentId = Boolean(parcela.mp_payment_id) && Boolean(cob.mp_payment_id) && parcela.mp_payment_id === cob.mp_payment_id

  return {
    confirmado: porLyraId || porPreferenceId || porPaymentId,
    porLyraId,
    porPreferenceId,
    porPaymentId,
    temAlgumIdPreenchido: Boolean(parcela.lyra_cobranca_id || parcela.mp_preference_id || parcela.mp_payment_id),
  }
}

// Garante exatamente 1 registro de HistoricoAtividade automático por Parcela — idempotente
// mesmo sob falha parcial anterior (Parcela paga sem histórico) ou reprocessamento repetido
// (webhook + cron). Existência é checada por cobranca_id + tipo:'pagamento' + marcador
// '[AUTOMÁTICO]' na descrição (não usamos texto completo nem data/hora, que variam).
async function garantirHistoricoBaixaAutomatica(prime, { parcelaId, clienteNome, valor, mpPaymentId, dryRun }) {
  const ehAutomatico = h => h.tipo === 'pagamento' && (h.descricao || '').includes('[AUTOMÁTICO]')

  const existentes = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  if (existentes.some(ehAutomatico)) {
    return { criado: false, faltava: false }
  }

  if (dryRun) {
    return { criado: false, faltava: true }
  }

  // Proteção best-effort de concorrência: releitura imediatamente antes de escrever.
  const releitura = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  if (releitura.some(ehAutomatico)) {
    return { criado: false, faltava: false, nota: 'detectado na releitura de concorrência' }
  }

  await prime.entities.HistoricoAtividade.create({
    cobranca_id: parcelaId,
    tipo: 'pagamento',
    cliente_nome: clienteNome,
    valor,
    valor_anterior: '0',
    usuario: null,
    detalhes: `[AUTOMÁTICO] Identificado via sincronização Lyra/Mercado Pago em ${new Date().toISOString()} (mp_payment_id: ${mpPaymentId || 'n/d'}). Esta é a data em que o sync detectou o pagamento, não necessariamente a data real em que ele ocorreu.`,
    descricao: `[AUTOMÁTICO] Pagamento de R$ ${Number(valor).toFixed(2)} identificado via Lyra/Mercado Pago para ${clienteNome}`,
  })

  // Confirmação pós-escrita: reporta (em vez de mascarar) se duas execuções concorrentes
  // ainda assim conseguiram criar mais de um registro automático.
  const confirmacao = await prime.entities.HistoricoAtividade.filter({ cobranca_id: parcelaId })
  const totalAutomaticos = confirmacao.filter(ehAutomatico).length

  return { criado: true, faltava: true, duplicidadeDetectada: totalAutomaticos > 1, totalAutomaticos }
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

async function enviarTelegramStuck(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[system-tools:stuck-check] Telegram não configurado')
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensagem, parse_mode: 'HTML' }),
    })
    if (!res.ok) console.error('[system-tools:stuck-check] Telegram respondeu:', res.status, await res.text())
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro ao enviar Telegram:', err.message)
  }
}

async function jaAlertadoRecenteStuck(chatId) {
  try {
    const desde = new Date(Date.now() - STUCK_DEDUPE_WINDOW_MS).toISOString()
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/codex_alerts?type=eq.chat_travado&conversation_id=eq.${encodeURIComponent(chatId)}&created_at=gte.${desde}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (!res.ok) return false
    const data = await res.json()
    return data.length > 0
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro ao checar dedupe:', err.message)
    return false
  }
}

async function registrarAlertaStuck(chatId, mensagem) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/codex_alerts`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: 'chat_travado', severity: 'critico', conversation_id: chatId, message: mensagem, data: null }),
    })
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro ao registrar alerta:', err.message)
  }
}

async function stuckCheck(req, res) {
  try {
    const now = Date.now()
    const listRes = await fetch(`${GPTMAKER_BASE}/v2/workspace/${GPTMAKER_WS}/chats?page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${GPTMAKER_TOKEN}` },
    })
    if (!listRes.ok) {
      console.error('[system-tools:stuck-check] Falha ao listar chats:', listRes.status)
      return res.status(200).json({ ok: true, skipped: 'failed to list chats' })
    }
    const data = await listRes.json()
    const chats = Array.isArray(data) ? data : (data.data || [])

    let travados = 0

    for (const chat of chats) {
      const chatTime = chat.time || 0
      const idadeMs = now - chatTime
      if (idadeMs > STUCK_MAX_AGE_MS || idadeMs < STUCK_THRESHOLD_MS) continue
      // O campo "role" no resumo do chat já reflete quem mandou a última mensagem —
      // se não for cliente, alguém (ou o sistema) já respondeu, não está travado.
      if (chat.role !== 'user' && chat.role !== 'client') continue

      const jaAlertou = await jaAlertadoRecenteStuck(chat.id)
      if (jaAlertou) continue

      const minutos = Math.round(idadeMs / 60000)
      const nome = chat.name || chat.whatsappPhone || 'Cliente'
      const textoCliente = (chat.conversation || '').slice(0, 150)
      const mensagem = `⚠️ <b>CLIENTE SEM RESPOSTA</b>\n\n👤 ${nome}\n💬 "${textoCliente}"\n⏱️ Há ${minutos}min sem resposta\n\nVerifique o WhatsApp/painel GPT Maker.`

      await enviarTelegramStuck(mensagem)
      await registrarAlertaStuck(chat.id, `Cliente "${nome}" sem resposta: "${textoCliente}"`)
      travados++
    }

    console.log(`[system-tools:stuck-check] Verificados ${chats.length} chats, ${travados} alertados`)
    return res.status(200).json({ ok: true, checked: chats.length, alertados: travados })
  } catch (err) {
    console.error('[system-tools:stuck-check] Erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// Processa 1 Cobranca da Lyra contra o estado do PRIME: acha a Parcela correspondente
// (ou decide criar) e aplica a ação necessária. Usado tanto pelo sync em lote (syncLyra)
// quanto pelo webhook em tempo real (lyraWebhook) — mesma lógica, uma só implementação.
// `ctx.clientePorTelefone` é mutado (novo Cliente criado entra no Map) de propósito, pra
// runs sucessivos dentro do mesmo lote reaproveitarem o Cliente recém-criado.
async function processarCobranca(cob, ctx) {
  const { prime, lyraClientePorId, clientePorTelefone, primeParcelas, dryRun } = ctx

  // Nome vem preferencialmente do cadastro de Cliente da Lyra — o campo
  // cliente_nome da própria Cobranca às vezes vem vazio (visto em teste real).
  const lyraCliente = lyraClientePorId.get(cob.cliente_id)
  const nomeCliente = lyraCliente?.name || cob.cliente_nome || 'Sem nome'
  const telefoneLyra = normalizePhone(lyraCliente?.phone || '')

  const parcelaExistente = encontrarParcelaCorrespondente(cob, nomeCliente, primeParcelas)

  // --- Caso 1: já existe e já está paga — classifica o vínculo antes de decidir ---
  if (parcelaExistente && parcelaExistente.status === 'pago') {
    const vinculo = obterVinculoDeterministico(parcelaExistente, cob)
    const dadosParaAuditoria = {
      lyra_cobranca_id: cob.id,
      cliente_nome: nomeCliente,
      parcela_id: parcelaExistente.id,
      valor: parcelaExistente.valor_base,
      vencimento: parcelaExistente.data_vencimento,
      parcela_lyra_cobranca_id: parcelaExistente.lyra_cobranca_id || null,
      cobranca_lyra_id: cob.id,
      parcela_mp_preference_id: parcelaExistente.mp_preference_id || null,
      cobranca_mp_preference_id: cob.mp_preference_id || null,
      parcela_mp_payment_id: parcelaExistente.mp_payment_id || null,
      cobranca_mp_payment_id: cob.mp_payment_id || null,
    }

    if (!vinculo.confirmado) {
      if (vinculo.temAlgumIdPreenchido) {
        return {
          ...dadosParaAuditoria,
          acao: 'VINCULO_DIVERGENTE',
          executado: false,
          motivo: 'Parcela possui identificador(es) preenchido(s), mas nenhum corresponde exatamente à Cobranca atual — requer auditoria manual',
        }
      }
      return {
        ...dadosParaAuditoria,
        acao: 'VINCULO_LEGADO_NAO_CONFIRMADO',
        executado: false,
        motivo: 'Parcela encontrada só pelo fallback nome+valor+vencimento — sem nenhum identificador determinístico preenchido, não é seguro atribuir histórico automático',
      }
    }

    // Vínculo confirmado — repara histórico automático ausente (idempotente)
    const resultadoHistorico = await garantirHistoricoBaixaAutomatica(prime, {
      parcelaId: parcelaExistente.id,
      clienteNome: nomeCliente,
      valor: parcelaExistente.valor_pago || cob.valor,
      mpPaymentId: cob.mp_payment_id,
      dryRun,
    })

    if (!resultadoHistorico.faltava) {
      return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, parcela_id: parcelaExistente.id, acao: 'JA_SINCRONIZADO', executado: false }
    }

    return {
      lyra_cobranca_id: cob.id,
      cliente_nome: nomeCliente,
      parcela_id: parcelaExistente.id,
      acao: 'REPARAR_HISTORICO',
      executado: resultadoHistorico.criado,
      ...(resultadoHistorico.duplicidadeDetectada ? { duplicidadeDetectada: true, totalAutomaticos: resultadoHistorico.totalAutomaticos } : {}),
    }
  }

  // --- Caso 2: já existe, ainda não paga, e a Lyra agora diz que está paga — ATUALIZAR ---
  if (parcelaExistente && cob.status === 'pago') {
    if (dryRun) {
      return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, valor: cob.valor, acao: 'ATUALIZAR', executado: false, parcela_id: parcelaExistente.id }
    }

    // Releitura pontual — reduz a janela de corrida caso outra execução já tenha
    // processado esta mesma parcela entre a leitura inicial e agora.
    const parcelaAtual = await prime.entities.Parcela.get(parcelaExistente.id)
    if (parcelaAtual.status === 'pago') {
      return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false, nota: 'detectado na releitura de concorrência' }
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

    await garantirHistoricoBaixaAutomatica(prime, {
      parcelaId: parcelaExistente.id,
      clienteNome: nomeCliente,
      valor: cob.valor,
      mpPaymentId: cob.mp_payment_id,
      dryRun: false, // já passou pelo `if (dryRun)` acima, aqui é sempre escrita real
    })

    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'ATUALIZAR', executado: true, parcela_id: parcelaExistente.id }
  }

  // --- Caso 3: já existe, mas nem ela nem a Lyra estão pagas — nada muda ---
  if (parcelaExistente) {
    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'SEM_MUDANCA', executado: false }
  }

  // --- Caso 4: não existe ainda — CRIAR Cliente (se preciso) + Venda + Parcela ---
  let clienteExistente = telefoneLyra ? clientePorTelefone.get(telefoneLyra) : null
  const acaoProposta = clienteExistente ? 'CRIAR_VENDA_E_PARCELA' : 'CRIAR_CLIENTE_VENDA_E_PARCELA'

  if (dryRun) {
    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, valor: cob.valor, vencimento: cob.vencimento, status_lyra: cob.status, acao: acaoProposta, executado: false }
  }

  // Releitura pontual por lyra_cobranca_id — reduz risco de duas execuções
  // concorrentes (ex.: webhook e cron ao mesmo tempo) criarem Venda/Parcela duplicadas.
  const jaExisteAgora = await prime.entities.Parcela.filter({ lyra_cobranca_id: cob.id })
  if (jaExisteAgora && jaExisteAgora.length > 0) {
    return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: 'JA_SINCRONIZADO', executado: false, nota: 'detectado na releitura de concorrência' }
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
    // data_pagamento e forma_pagamento NÃO presumidos — a Lyra não fornece a data real
    // do pagamento nem a forma com confiança suficiente; ficam vazios até haver evidência.
    data_pagamento: null,
    status: cob.status === 'pago' ? 'pago' : 'pendente',
    forma_pagamento: null,
    cobranca_enviada: true,
    lyra_cobranca_id: cob.id,
    mp_preference_id: cob.mp_preference_id || null,
    mp_payment_id: cob.mp_payment_id || null,
  })

  if (cob.status === 'pago') {
    await garantirHistoricoBaixaAutomatica(prime, {
      parcelaId: parcela.id,
      clienteNome: nomeCliente,
      valor: cob.valor,
      mpPaymentId: cob.mp_payment_id,
      dryRun: false, // já passou pelo `if (dryRun)` acima, aqui é sempre escrita real
    })
  }

  return { lyra_cobranca_id: cob.id, cliente_nome: nomeCliente, acao: acaoProposta, executado: true, novo_cliente_id: clienteExistente.id, nova_venda_id: venda.id, nova_parcela_id: parcela.id }
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
    const ctx = { prime, lyraClientePorId, clientePorTelefone, primeParcelas, dryRun }

    for (const cob of lyraCobrancas) {
      try {
        acoes.push(await processarCobranca(cob, ctx))
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
      historicosReparados: acoes.filter(a => a.acao === 'REPARAR_HISTORICO' && a.executado).length,
      vinculosLegadosNaoConfirmados: acoes.filter(a => a.acao === 'VINCULO_LEGADO_NAO_CONFIRMADO').length,
      vinculosDivergentes: acoes.filter(a => a.acao === 'VINCULO_DIVERGENTE').length,
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

// Webhook em tempo real: a Lyra chama isso logo depois que processarEventoMP confirma
// um pagamento. Só o `id` do body é confiável — o resto (valor/status/mp_payment_id/etc)
// é sempre relido direto da Lyra via API antes de qualquer escrita, nunca confiamos no
// que veio no POST (mesmo padrão de cautela do sync em lote).
async function lyraWebhook(req, res) {
  if (!BASE44_API_KEY) {
    return res.status(500).json({ error: 'BASE44_API_KEY não configurado' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const cobrancaId = req.body?.id
  if (!cobrancaId) {
    return res.status(400).json({ error: 'Campo "id" (id da Cobranca na Lyra) é obrigatório no body' })
  }

  try {
    const lyra = createClient({ appId: LYRA_APP_ID, headers: { api_key: BASE44_API_KEY } })
    const prime = createClient({ appId: PRIME_APP_ID, headers: { api_key: BASE44_API_KEY } })

    const cob = await lyra.entities.Cobranca.get(cobrancaId)

    if (cob.status !== 'pago') {
      // Webhook disparou mas a Lyra ainda não marcou como pago (corrida improvável, mas
      // possível) — não faz nada agora; o cron pega isso depois com segurança.
      return res.status(200).json({ ok: true, skipped: 'cobranca ainda não está pago na Lyra', lyra_cobranca_id: cobrancaId })
    }

    let lyraCliente = null
    if (cob.cliente_id) {
      try {
        lyraCliente = await lyra.entities.Cliente.get(cob.cliente_id)
      } catch (err) {
        console.error('[system-tools:lyra-webhook] Cliente da Lyra não encontrado:', cob.cliente_id, err.message)
      }
    }

    const [primeClientes, primeParcelas] = await Promise.all([
      prime.entities.Cliente.list(),
      prime.entities.Parcela.list(),
    ])

    const ctx = {
      prime,
      lyraClientePorId: new Map(lyraCliente ? [[cob.cliente_id, lyraCliente]] : []),
      clientePorTelefone: new Map(primeClientes.filter(c => c.telefone).map(c => [normalizePhone(c.telefone), c])),
      primeParcelas,
      dryRun: false, // webhook só é chamado depois que o pagamento já foi confirmado de verdade
    }

    const acao = await processarCobranca(cob, ctx)
    console.log('[system-tools:lyra-webhook] Processado:', JSON.stringify(acao))
    return res.status(200).json({ ok: true, acao })
  } catch (e) {
    console.error('[system-tools:lyra-webhook] Erro:', cobrancaId, e.message)
    return res.status(500).json({ error: 'Erro ao processar webhook', detail: e.message })
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

    case 'stuck-check': {
      // Autenticação obrigatória — chamado pelo GitHub Actions via CRON_SECRET.
      const cronSecret = process.env.CRON_SECRET
      const authHeader = req.headers.authorization
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return stuckCheck(req, res)
    }

    case 'lyra-webhook': {
      // Segredo próprio (LYRA_WEBHOOK_SECRET), diferente do CRON_SECRET — configurado
      // manualmente dentro da Lyra, não é injetado automaticamente por nada da Vercel.
      const webhookSecret = LYRA_WEBHOOK_SECRET
      const authHeader = req.headers.authorization
      if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
        return res.status(401).json({ error: 'Não autorizado' })
      }
      return lyraWebhook(req, res)
    }

    case 'gerar-cobranca-lyra': {
      // Segredo próprio (GERAR_COBRANCA_SECRET) — não reutiliza CRON_SECRET nem
      // LYRA_WEBHOOK_SECRET, pra não ampliar o alcance de um vazamento eventual.
      const gerarCobrancaSecret = process.env.GERAR_COBRANCA_SECRET
      const authHeader = req.headers.authorization
      if (!gerarCobrancaSecret || authHeader !== `Bearer ${gerarCobrancaSecret}`) {
        console.error('[system-tools:gerar-cobranca-lyra] Tentativa não autorizada', { ip: req.headers['x-forwarded-for'] || null })
        return res.status(401).json({ error: 'Não autorizado' })
      }

      const origemCheck = checarOrigemBestEffort(req)
      if (!origemCheck.ok) {
        console.error('[system-tools:gerar-cobranca-lyra] Origin/Referer bloqueado', { motivo: origemCheck.motivo })
        return res.status(403).json({ error: 'Origem não permitida' })
      }

      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
      if (!checarRateLimitBestEffort(ip)) {
        console.error('[system-tools:gerar-cobranca-lyra] Rate limit best-effort excedido', { ip })
        return res.status(429).json({ error: 'Muitas tentativas — aguarde e tente novamente' })
      }

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' })
      }

      const parcelaId = req.body?.parcela_id
      // Default seguro: qualquer coisa diferente do booleano `false` literal mantém dryRun=true.
      const dryRun = req.body?.dryRun !== false

      if (!dryRun) {
        // Modo real exige Origin efetivamente checada (allowlist configurada), não só
        // "pulada por falta de configuração" — dry-run tolera a checagem best-effort,
        // escrita real não.
        if (!origemCheck.checado) {
          console.error('[system-tools:gerar-cobranca-lyra] dryRun=false recusado — GERAR_COBRANCA_ALLOWED_ORIGINS não configurada')
          return res.status(403).json({ error: 'dryRun=false exige GERAR_COBRANCA_ALLOWED_ORIGINS configurada e Origin/Referer validado' })
        }
        console.log('[system-tools:gerar-cobranca-lyra] Requisição REAL (dryRun=false)', { parcela_id: parcelaId, ip })
        const resultado = await gerarCobrancaLyraReal({ parcelaId })
        return res.status(resultado.httpStatus).json(resultado.body)
      }

      console.log('[system-tools:gerar-cobranca-lyra] Requisição dry-run', { parcela_id: parcelaId, ip, origemChecada: origemCheck.checado })
      const resultado = await gerarCobrancaLyraDryRun({ parcelaId, ip, req })
      return res.status(resultado.httpStatus).json(resultado.body)
    }

    default:
      return res.status(400).json({ error: 'Parâmetro ?tool= inválido ou ausente (use vercel-status, sync-lyra, stuck-check, lyra-webhook ou gerar-cobranca-lyra)' })
  }
}
