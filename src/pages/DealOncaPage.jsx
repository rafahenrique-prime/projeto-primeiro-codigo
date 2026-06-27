import { useState, useRef, useEffect } from 'react'
import { askCODEX, detectSaveIntent, runProactiveDiagnosis, runFunnelLossReport, askCODEXOnboarding, detectFunnelStage } from '../services/groq'
import { recordStage, cleanupOldEntries } from '../services/stageHistory'
import { createAgent, updateAgent } from '../services/gptmaker'
import { runFollowUpCheck, getFollowUpSummary, getFollowUpLog } from '../services/followUpService'
import { listChannels, getChatMessages, listAgents, listTrainings, createTraining } from '../services/gptmaker'
import { searchProduct } from '../services/catalog'
import { identifyProductFromPhoto } from '../services/ocrService'
import { saveDiagnostic, getLastDiagnostic, hasRunToday, getRecentDiagnostics } from '../services/diagnosticService'
import { loadProductsWithoutImages, countProductsWithoutImages, uploadProductImage, updateProductDescription } from '../services/imageReviewService'

const CATEGORIES = {
  PRODUTO:    { label: 'Produto',    color: '#3B82F6' },
  PRECO:      { label: 'Preço',      color: '#0EC331' },
  FAQ:        { label: 'FAQ',        color: '#8B5CF6' },
  ESTRATEGIA: { label: 'Estratégia', color: '#F59E0B' },
  POLITICA:   { label: 'Política',   color: '#EF4444' },
  GUIA:       { label: 'Guia',       color: '#14B8A6' },
  GERAL:      { label: 'Geral',      color: '#6B7280' },
}

const SUGGESTIONS = [
  'Quem está mais perto de comprar agora?',
  'Quais clientes estão sem resposta há mais tempo?',
  'Quais são as principais objeções hoje?',
  'Resumo rápido do funil de vendas',
]

const QUICK_ACTIONS = [
  { icon: '🔥', label: 'Leads quentes',    cmd: 'Quem está mais perto de comprar agora?' },
  { icon: '📭', label: 'Sem resposta',      cmd: 'Quais clientes estão aguardando resposta há mais tempo?' },
  { icon: '💸', label: 'Pediram desconto',  cmd: 'Quem pediu desconto ou contestou o preço?' },
  { icon: '🚚', label: 'Pediram frete',     cmd: 'Quem perguntou sobre frete e não finalizou?' },
  { icon: '📊', label: 'Funil de vendas',   cmd: 'Qual o estado atual do funil de vendas?' },
  { icon: '📅', label: 'Follow-up urgente', cmd: 'Quem precisa de follow-up urgente agora?' },
  { icon: '🧠', label: 'Objeções do dia',   cmd: 'Quais são as principais objeções de hoje?' },
  { icon: '📸', label: 'Instagram hoje',    cmd: 'Quantas pessoas chamaram hoje no Instagram?' },
  { icon: '💬', label: 'WhatsApp hoje',     cmd: 'Quantas pessoas chamaram hoje no WhatsApp?' },
  { icon: '📉', label: 'Relatório perdas',  cmd: '__FUNNEL_LOSS__' },
  { icon: '📬', label: 'Follow-up',         cmd: '__FOLLOWUP_PANEL__' },
  { icon: '🔁', label: 'Reengajar clientes', cmd: '__REENGAGE__' },
  { icon: '🖼️', label: 'Revisor de fotos',   cmd: '__IMAGE_REVIEW__' },
]

export default function DealOncaPage({ conversations = [], setPage }) {
  const [channels, setChannels] = useState([])
  const [richConversations, setRichConversations] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyProgress, setHistoryProgress] = useState(0)
  const [trainings, setTrainings] = useState([])
  const [firstAgent, setFirstAgent] = useState(null)

  const WELCOME = {
    id: 0, from: 'codex',
    text: 'Olá, Rafael! Sou o **CODEX**, seu Diretor Comercial IA.\n\nEstou conectado às conversas da PRIME STORE e respondo com base nos dados reais — **sem inventar números**.\n\n✅ Analiso: leads quentes, funil, objeções, follow-up, quem sumiu\n✅ Salvo conhecimento: diga "Adiciona que..." e registro na base\n❌ Não tenho: vendas realizadas, valores financeiros, pagamentos\n\nPergunte ou me peça para salvar algo!',
    suggestions: SUGGESTIONS,
  }

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('codex_history')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [WELCOME]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachFile, setAttachFile] = useState(null)
  const [attachPreview, setAttachPreview] = useState(null)
  const attachInputRef = useRef(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogResults, setCatalogResults] = useState([])
  const [hotAlert, setHotAlert] = useState(null)
  const bottomRef = useRef(null)
  // Persistir confirmação no sessionStorage para sobreviver recargas na mesma aba
  const diagConfirmedRef = useRef(!!sessionStorage.getItem('codex_diag_confirmed'))
  const diagTimerRef = useRef(null)
  const pendingDiagRef = useRef(null)
  const diagShownThisSessionRef = useRef(!!sessionStorage.getItem('codex_diag_shown'))

  const AI_MODELS = [
    { id: 'groq::llama-3.3-70b-versatile',                          label: 'Llama 3.3 70B',        provider: 'groq',       badge: 'Groq',       desc: '⭐ Melhor geral — padrão recomendado' },
    { id: 'groq::llama-3.1-8b-instant',                             label: 'Llama 3.1 8B Fast',    provider: 'groq',       badge: 'Groq',       desc: 'Ultra rápido, respostas simples' },
    { id: 'groq::meta-llama/llama-4-scout-17b-16e-instruct',        label: 'Llama 4 Scout 17B',    provider: 'groq',       badge: 'Groq',       desc: 'Llama 4 — multimodal e preciso' },
    { id: 'groq::qwen/qwen3-32b',                                   label: 'Qwen 3 32B',           provider: 'groq',       badge: 'Groq',       desc: 'Excelente raciocínio e instruções' },
    { id: 'openrouter::meta-llama/llama-3.3-70b-instruct:free',      label: 'Llama 3.3 70B (OR)',   provider: 'openrouter', badge: 'OpenRouter', desc: 'Via OpenRouter — fallback gratuito' },
    { id: 'openrouter::mistralai/mistral-7b-instruct:free',         label: 'Mistral 7B',           provider: 'openrouter', badge: 'OpenRouter', desc: 'Rápido e gratuito' },
    { id: 'openrouter::nousresearch/hermes-3-llama-3.1-8b:free',   label: 'Hermes 3 8B',          provider: 'openrouter', badge: 'OpenRouter', desc: 'Bom em conversação e instruções' },
    { id: 'openrouter::deepseek/deepseek-chat:free',                label: 'DeepSeek Chat',        provider: 'openrouter', badge: 'OpenRouter', desc: 'Alternativa gratuita — raciocínio forte' },
    { id: 'openrouter::deepseek/deepseek-r1:free',                  label: 'DeepSeek V4 R1',       provider: 'openrouter', badge: 'OpenRouter', desc: '🔥 DeepSeek V4 — reasoning muito forte' },
    { id: 'openrouter::qwen/qwen-plus',                             label: 'Qwen 3.5 Plus',        provider: 'openrouter', badge: 'OpenRouter', desc: 'Alibaba — português excelente' },
    { id: 'openrouter::google/gemma-3-27b-it:free',                 label: 'Gemma 3 27B',          provider: 'openrouter', badge: 'OpenRouter', desc: 'Google Gemma — grátis e rápido' },
  ]
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('codex_model') || 'groq::llama-3.3-70b-versatile')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const activeModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0]

  // ─── Onboarding 5 etapas ───────────────────────────────────────────────────
  const [onboarding, setOnboarding] = useState(() => {
    try { return JSON.parse(localStorage.getItem('codex_onboarding') || 'null') } catch { return null }
  })
  // onboarding: null (inativo) | { stage: 0-4, context: {}, agentId: null }

  const saveOnboarding = (state) => {
    setOnboarding(state)
    if (state) localStorage.setItem('codex_onboarding', JSON.stringify(state))
    else localStorage.removeItem('codex_onboarding')
  }

  // ─── Follow-up ─────────────────────────────────────────────────────────────
  const [showFollowUpPanel, setShowFollowUpPanel] = useState(false)
  const [followUpRunning, setFollowUpRunning] = useState(false)
  const [followUpResult, setFollowUpResult] = useState(null)

  // ─── Image Review ───────────────────────────────────────────────────────────
  const [showImageReview, setShowImageReview] = useState(false)
  const [productsWithoutImages, setProductsWithoutImages] = useState([])
  const [imageReviewLoading, setImageReviewLoading] = useState(false)
  const [reviewingProduct, setReviewingProduct] = useState(null)

  const runFollowUp = async (dryRun = false) => {
    const ctx = richConversations.length > 0 ? richConversations : conversations
    if (!ctx.length) return
    setFollowUpRunning(true)
    setFollowUpResult(null)
    try {
      const result = await runFollowUpCheck(ctx, { dryRun })
      setFollowUpResult(result)
      const label = dryRun ? '🧪 SIMULAÇÃO' : '📤 ENVIOS'
      const sentLines = result.sent.length
        ? result.sent.map(s => `• **${s.conv}** [${s.stage}]: "${s.text}"`).join('\n')
        : 'Nenhum follow-up pendente no momento.'
      const errLines = result.errors?.length
        ? '\n\n⚠️ Erros:\n' + result.errors.map(e => `• ${e.conv}: ${e.error}`).join('\n')
        : ''
      const debugLines = result.debug?.length
        ? '\n\n🔍 **DEBUG** (remover depois):\n' + result.debug.slice(0,5).map(d =>
            `• ${d.name} | rawTime: ${d.rawTime} | inativo: ${d.inactiveMin}min | modo: ${d.mode}`
          ).join('\n')
        : ''
      setMessages(prev => [...prev, {
        id: Date.now(), from: 'codex',
        text: `📬 **FOLLOW-UP ${label}**\nConversas verificadas: ${result.checked}\nMensagens ${dryRun ? 'simuladas' : 'enviadas'}: ${result.sent.length}\n\n${sentLines}${errLines}${debugLines}`,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), from: 'codex', text: `⚠️ Erro no follow-up: ${err.message}` }])
    } finally {
      setFollowUpRunning(false)
    }
  }

  const followUpSummary = getFollowUpSummary(richConversations.length > 0 ? richConversations : conversations)
  const followUpLog = getFollowUpLog().slice(0, 5)

  const startOnboarding = () => {
    const state = { stage: 0, context: {}, agentId: null }
    saveOnboarding(state)
    setMessages(prev => [...prev, {
      id: Date.now(), from: 'codex',
      text: '🚀 **CONFIGURAÇÃO DE NOVO AGENTE**\n\nVamos criar seu agente de vendas em menos de 3 minutos.\n\nO que você vende? Me dá o produto e a faixa de preço — cuido do resto. 💪',
      onboarding: true, stage: 0,
    }])
  }

  const handleOnboardingReply = async (userText) => {
    if (!onboarding) return false
    const { stage, context } = onboarding
    setLoading(true)
    try {
      const history = messages.filter(m => m.from === 'user' || m.from === 'codex').slice(-6)
      const result = await askCODEXOnboarding(stage, userText, history, context)
      const reply = result.reply || '...'

      if (stage === 0) {
        if (result.ready && result.extracted) {
          const newCtx = { ...context, ...result.extracted }
          saveOnboarding({ stage: 1, context: newCtx, agentId: null })
          // Avança direto para Stage 1 — gera config do agente
          const r1 = await askCODEXOnboarding(1, 'gerar agente', history, newCtx)
          const cfg = r1.agent_config || {}
          setMessages(prev => [...prev,
            { id: Date.now(), from: 'codex', text: reply, onboarding: true, stage: 0 },
            { id: Date.now() + 1, from: 'codex', text: `⚙️ **AGENTE CONFIGURADO**\n\n${r1.reply || ''}`, onboarding: true, stage: 1, agentConfig: cfg },
          ])
          saveOnboarding({ stage: 1, context: { ...newCtx, pending_config: cfg }, agentId: null })
        } else {
          setMessages(prev => [...prev, { id: Date.now(), from: 'codex', text: reply, onboarding: true, stage: 0 }])
        }

      } else if (stage === 1) {
        // Criar agente no GPT Maker
        const cfg = context.pending_config || {}
        try {
          const instructions = `Você é ${cfg.name || 'Assistente'}, consultora de vendas da ${cfg.company || 'PRIME STORE'}.

SOBRE VOCÊ:
- Nome: ${cfg.name || 'Assistente'}
- Empresa: ${cfg.company || 'PRIME STORE'}
- Tom de comunicação: ${cfg.tone || 'Amigável e profissional'}

O QUE VOCÊ VENDE:
${cfg.products || 'Produtos da loja'}

SEU OBJETIVO:
${cfg.goal || 'Ajudar o cliente a encontrar o produto ideal e fechar a venda'}

PROCESSO DE VENDAS:
${cfg.playbook || '1. Entender o que o cliente precisa\n2. Apresentar as melhores opções\n3. Conduzir para o fechamento'}

REGRAS IMPORTANTES:
${cfg.rules || '- Nunca inventar preços ou informações\n- Sempre ser educada e prestativa\n- Em caso de dúvida, pedir para aguardar'}

Responda sempre em português brasileiro, de forma natural e humanizada. Nunca revele que é uma IA a menos que perguntado diretamente.

REGRAS ANTI-ALUCINAÇÃO — OBRIGATÓRIAS:
- Se não souber o preço, prazo ou disponibilidade com certeza: NÃO INVENTE. Diga: "Deixa eu verificar isso com a equipe e te respondo em instantes 😊"
- Nunca confirme estoque, prazo de entrega ou valor sem ter a informação real
- Nunca invente promoções, cupons ou condições que não foram informadas
- Se o cliente perguntar algo fora do seu conhecimento: "Boa pergunta! Vou confirmar com nossa equipe agora 🙏"
- Prefira dizer menos com certeza do que mais com dúvida`

          const created = await createAgent({
            name: cfg.name || 'Assistente',
            instructions,
          })
          const agentId = created?.id || created?.data?.id
          saveOnboarding({ stage: 2, context: { ...context, agent_name: cfg.name }, agentId })
          setMessages(prev => [...prev, {
            id: Date.now(), from: 'codex',
            text: `✅ **Agente ${cfg.name || ''} criado com sucesso!**\n\n${reply}\n\nQuer ajustar algo antes de testar? (tom, regras, processo de vendas)`,
            onboarding: true, stage: 2,
          }])
        } catch {
          setMessages(prev => [...prev, {
            id: Date.now(), from: 'codex',
            text: `✅ **Configuração pronta!**\n\n${reply}\n\nQuer ajustar algo? (tom, regras, processo de vendas)`,
            onboarding: true, stage: 2,
          }])
          saveOnboarding({ stage: 2, context: { ...context, agent_name: cfg.name }, agentId: null })
        }

      } else if (stage === 2) {
        if (result.has_changes && result.changes && onboarding.agentId) {
          try {
            const cfg = context.pending_config || {}
            await updateAgent(onboarding.agentId, {
              instructions: `Tom: ${result.changes.tone || cfg.tone}. Processo: ${result.changes.playbook || cfg.playbook}. Regras: ${result.changes.rules || cfg.rules}`,
            })
          } catch {}
        }
        if (result.advance) {
          saveOnboarding({ ...onboarding, stage: 3 })
          setMessages(prev => [...prev, {
            id: Date.now(), from: 'codex',
            text: `🧪 **HORA DO TESTE**\n\n${reply}`,
            onboarding: true, stage: 3,
          }])
        } else {
          setMessages(prev => [...prev, { id: Date.now(), from: 'codex', text: reply, onboarding: true, stage: 2 }])
        }

      } else if (stage === 3) {
        setMessages(prev => [...prev, { id: Date.now(), from: 'codex', text: reply, onboarding: true, stage: 3 }])
        if (result.advance) {
          saveOnboarding({ ...onboarding, stage: 4 })
          setTimeout(async () => {
            const r4 = await askCODEXOnboarding(4, 'ativar', [], context)
            setMessages(prev => [...prev, {
              id: Date.now(), from: 'codex',
              text: `🚀 **ATIVAÇÃO**\n\n${r4.reply || ''}`,
              onboarding: true, stage: 4,
            }])
            saveOnboarding(null) // onboarding completo
            localStorage.setItem('codex_onboarding_done', '1')
          }, 800)
        }

      } else if (stage === 4) {
        setMessages(prev => [...prev, { id: Date.now(), from: 'codex', text: reply }])
        saveOnboarding(null)
        localStorage.setItem('codex_onboarding_done', '1')
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), from: 'codex', text: `⚠️ ${err.message}` }])
    } finally {
      setLoading(false)
    }
    return true
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { listChannels().then(setChannels).catch(() => {}) }, [])
  useEffect(() => () => { if (diagTimerRef.current) clearTimeout(diagTimerRef.current) }, [])
  useEffect(() => {
    try { localStorage.setItem('codex_history', JSON.stringify(messages.slice(-200))) } catch {}
  }, [messages])

  useEffect(() => {
    listAgents().then(agents => {
      if (agents.length > 0) {
        setFirstAgent(agents[0])
        listTrainings(agents[0].id).then(setTrainings).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (conversations.length === 0) return
    setLoadingHistory(true)
    setHistoryProgress(0)
    async function loadAll() {
      const results = []
      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i]
        try {
          const msgs = await getChatMessages(conv.id)
          // Validar que msgs é array com conteúdo real
          const validMsgs = Array.isArray(msgs) && msgs.length > 0
            ? msgs.filter(m => (m.text || m.content || '').trim().length > 0)
            : []
          results.push({ ...conv, fullMessages: validMsgs, _loadedOk: validMsgs.length > 0 })
        } catch (e) {
          console.warn(`[Load] Erro ao carregar conversa ${conv.id}:`, e.message)
          results.push({ ...conv, fullMessages: [], _loadedOk: false, _loadError: e.message })
        }
        setHistoryProgress(Math.round(((i + 1) / conversations.length) * 100))
      }
      setRichConversations(results)
      setLoadingHistory(false)

      // Grava transições de estágio para rastreamento de tempo
      cleanupOldEntries()
      results.forEach(c => {
        if (c._loadedOk) {
          const stage = detectFunnelStage(c.fullMessages || [], c.lastMsg || '')
          recordStage(c.id, stage)
        }
      })

      // Alerta de leads quentes sem resposta
      const leadsQuentes = results.filter(c => (c.nao_lidas || 0) > 0 && c.mode !== 'copilot')
      if (leadsQuentes.length > 0) {
        setHotAlert(`🚨 ${leadsQuentes.length} lead${leadsQuentes.length > 1 ? 's quentes' : ' quente'} sem resposta!`)
        setTimeout(() => setHotAlert(null), 10000)
      }

      // Diagnóstico proativo — mostra 1x por sessão (aba do navegador)
      if (diagShownThisSessionRef.current) return
      diagShownThisSessionRef.current = true
      sessionStorage.setItem('codex_diag_shown', '1')

      const alreadyRan = await hasRunToday().catch(() => false)
      const diagKey = 'codex_diag_' + new Date().toDateString()

      const sendDiagWithConfirmation = (diagText) => {
        if (diagConfirmedRef.current || pendingDiagRef.current) return
        if (diagTimerRef.current) clearTimeout(diagTimerRef.current)

        setMessages(prev => [...prev, {
          id: Date.now() + 2,
          from: 'codex',
          text: '🔍 **DIAGNÓSTICO AUTOMÁTICO**\n\n' + diagText,
          isDiag: true,
        }, {
          id: Date.now() + 3,
          from: 'codex',
          text: '👆 Você viu este diagnóstico? Responda **"vi"** para confirmar.',
          isDiagConfirm: true,
        }])

        pendingDiagRef.current = diagText

        // Lembrete único após 3 minutos — sem repetição
        diagTimerRef.current = setTimeout(() => {
          if (!diagConfirmedRef.current && pendingDiagRef.current === diagText) {
            pendingDiagRef.current = null
            setMessages(prev => [...prev, {
              id: Date.now() + 4,
              from: 'codex',
              text: '⏰ Diagnóstico disponível acima. Digite **"vi"** quando quiser confirmar.',
              isDiagReminder: true,
            }])
          }
        }, 3 * 60 * 1000)
      }

      if (!alreadyRan && !sessionStorage.getItem(diagKey)) {
        sessionStorage.setItem(diagKey, '1')
        try {
          const diag = await runProactiveDiagnosis(results, trainings)
          if (diag) {
            const hotLeads = results.filter(c => c.mode !== 'copilot' && c.nao_lidas > 0).length
            const noReply = results.filter(c => (c.nao_lidas || 0) > 0).length
            await saveDiagnostic(diag, { hot_leads: hotLeads, no_reply: noReply }).catch(() => {})
            pendingDiagRef.current = diag
            sendDiagWithConfirmation(diag)
          }
        } catch {}
      } else if (alreadyRan) {
        try {
          const last = await getLastDiagnostic()
          if (last) {
            const hora = new Date(last.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            setMessages(prev => [...prev, {
              id: Date.now() + 2,
              from: 'codex',
              text: `🔍 **DIAGNÓSTICO DO DIA** _(gerado às ${hora})_\n\n${last.report}`,
            }])
          }
        } catch {}
      }
    }
    loadAll()
  }, [conversations])

  const handleCatalogSearch = (q) => {
    setCatalogSearch(q)
    setCatalogResults(q.trim().length >= 2 ? searchProduct(q) : [])
  }

  const clearHistory = () => {
    localStorage.removeItem('codex_history')
    localStorage.removeItem('codex_onboarding')
    localStorage.removeItem('codex_diag_' + new Date().toDateString())
    sessionStorage.removeItem('codex_diag_shown')
    sessionStorage.removeItem('codex_diag_confirmed')
    diagConfirmedRef.current = false
    diagShownThisSessionRef.current = false
    pendingDiagRef.current = null
    setMessages([WELCOME])
    setOnboarding(null)
  }

  const reloadTrainings = () => {
    if (firstAgent) listTrainings(firstAgent.id).then(setTrainings).catch(() => {})
  }

  const handleAttachChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = ev => setAttachPreview(ev.target.result)
      reader.readAsDataURL(file)
    } else {
      setAttachPreview(null)
    }
    e.target.value = ''
  }

  const send = async (text) => {
    const t = (text || input).trim()
    if ((!t && !attachFile) || loading) return
    setInput('')

    // Envio com arquivo/imagem
    if (attachFile) {
      const file = attachFile
      const preview = attachPreview
      setAttachFile(null)
      setAttachPreview(null)
      const userMsg = { id: Date.now(), from: 'user', text: t || `📎 ${file.name}`, image: preview }
      setMessages(prev => [...prev, userMsg])
      setLoading(true)
      try {
        let reply = ''
        if (file.type.startsWith('image/')) {
          const result = await identifyProductFromPhoto(file, () => {})
          const prompt = t ? `O usuário enviou uma imagem com a mensagem: "${t}"\n\nAnálise da imagem:\n${result.text}\n\nResponda considerando o contexto do CODEX e das conversas da PRIME STORE.` : result.text
          const history = messages.filter(m => m.from === 'user' || m.from === 'codex')
          // Usar apenas conversas com dados válidos carregados (richConversations já validadas)
          const validCtx = richConversations.length > 0
            ? richConversations.filter(c => c._loadedOk === true && c.fullMessages?.length > 0)
            : []
          const [provider, modelId] = selectedModel.split('::')
          reply = await askCODEX(prompt, history, validCtx, trainings, { provider, modelId })
        } else {
          reply = `📎 Arquivo recebido: **${file.name}** (${(file.size/1024).toFixed(0)}KB). No momento só consigo analisar imagens — envie uma foto e descreverei o produto.`
        }
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: reply }])
      } catch (err) {
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: `⚠️ Erro ao processar arquivo: ${err.message}` }])
      } finally {
        setLoading(false)
      }
      return
    }

    // Navega para Dashboard Follow-up
    if (t === '__FOLLOWUP_PANEL__') {
      if (setPage) setPage('followup')
      return
    }

    // Reengajamento manual via CODEX
    if (t === '__REENGAGE__') {
      setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: '🔁 Reengajar clientes inativos' }])
      setLoading(true)
      try {
        const ctx = richConversations.length > 0 ? richConversations : conversations
        const summary = getFollowUpSummary(ctx)

        if (summary.pending.length === 0) {
          setMessages(prev => [...prev, {
            id: Date.now() + 1, from: 'codex',
            text: '✅ Nenhum cliente pendente de follow-up agora. Todos estão ativos ou já foram contatados.',
          }])
          setLoading(false)
          return
        }

        const lista = summary.pending
          .map((p, i) => `${i + 1}. **${p.name}** — inativo há ${p.inactiveMin}min (estágio: ${p.stage})`)
          .join('\n')

        setMessages(prev => [...prev, {
          id: Date.now() + 1, from: 'codex',
          text: `🔁 **${summary.pending.length} clientes precisam de follow-up:**\n\n${lista}\n\nDeseja que eu envie as mensagens agora?\nDigite **"sim, enviar"** para confirmar ou **"simular"** para ver as mensagens antes.`,
          reengageContext: { pending: summary.pending, ctx },
        }])
      } catch (err) {
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: `⚠️ Erro: ${err.message}` }])
      } finally {
        setLoading(false)
      }
      return
    }

    // Confirmação de reengajamento
    const lastCodex = [...messages].reverse().find(m => m.from === 'codex' && m.reengageContext)
    if (lastCodex && /^sim[,.]?\s*(enviar|manda|vai|ok|pode)/i.test(t.trim())) {
      setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: t }])
      setLoading(true)
      try {
        const { ctx } = lastCodex.reengageContext
        const result = await runFollowUpCheck(ctx, { dryRun: false })
        const enviados = result.sent?.length || 0
        const erros = result.errors?.length || 0
        setMessages(prev => [...prev, {
          id: Date.now() + 1, from: 'codex',
          text: `✅ **Follow-up executado!**\n\n📤 Enviadas: ${enviados} mensagens${erros > 0 ? `\n❌ Erros: ${erros}` : ''}\n\nVerifique o Dashboard Follow-Up para o histórico completo.`,
        }])
      } catch (err) {
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: `⚠️ Erro ao enviar: ${err.message}` }])
      } finally {
        setLoading(false)
      }
      return
    }

    if (lastCodex && /^simul/i.test(t.trim())) {
      setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: t }])
      setLoading(true)
      try {
        const { ctx } = lastCodex.reengageContext
        const result = await runFollowUpCheck(ctx, { dryRun: true })
        if (!result.sent?.length) {
          setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: 'Nenhuma mensagem gerada na simulação.' }])
        } else {
          const preview = result.sent.map(s => `**${s.conv}** (${s.stage}):\n_"${s.text}"_`).join('\n\n')
          setMessages(prev => [...prev, {
            id: Date.now() + 1, from: 'codex',
            text: `🧪 **Prévia das mensagens:**\n\n${preview}\n\nDigite **"sim, enviar"** para confirmar o envio.`,
            reengageContext: lastCodex.reengageContext,
          }])
        }
      } catch (err) {
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: `⚠️ Erro: ${err.message}` }])
      } finally {
        setLoading(false)
      }
      return
    }

    // Onboarding ativo — roteia para o handler de etapas
    if (onboarding) {
      const userMsg = { id: Date.now(), from: 'user', text: t }
      setMessages(prev => [...prev, userMsg])
      await handleOnboardingReply(t)
      return
    }

    // Relatório de perdas por funil
    if (t === '__FUNNEL_LOSS__') {
      setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: '📉 Relatório de perdas por etapa do funil' }])
      setLoading(true)
      try {
        const ctx = richConversations.length > 0 ? richConversations : conversations
        const report = await runFunnelLossReport(ctx)
        setMessages(prev => [...prev, {
          id: Date.now() + 1, from: 'codex',
          text: '📉 **RELATÓRIO DE PERDAS — FUNIL DE VENDAS**\n\n' + (report || 'Sem dados suficientes para gerar o relatório.'),
        }])
      } catch (err) {
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: `⚠️ Erro ao gerar relatório: ${err.message}` }])
      } finally {
        setLoading(false)
      }
      return
    }

    // Revisor de fotos
    if (t === '__IMAGE_REVIEW__') {
      setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: '🖼️ Abrir revisor de fotos' }])
      setImageReviewLoading(true)
      try {
        const products = await loadProductsWithoutImages()
        setProductsWithoutImages(products)
        setShowImageReview(true)
        setMessages(prev => [...prev, {
          id: Date.now() + 1, from: 'codex',
          text: `🖼️ **REVISOR DE FOTOS**\n\n${products.length} produtos sem foto encontrados. Você pode fazer upload de fotos ou pular para revisão manual depois.`,
        }])
      } catch (err) {
        setMessages(prev => [...prev, { id: Date.now() + 1, from: 'codex', text: `⚠️ Erro ao carregar produtos: ${err.message}` }])
      } finally {
        setImageReviewLoading(false)
      }
      return
    }

    // Confirmação do diagnóstico: "vi", "sim", "ok", "visto"
    const confirmWords = ['vi', 'sim', 'ok', 'visto', 'entendi', 'certo', 'confirmado']
    if (confirmWords.includes(t.toLowerCase().trim()) && pendingDiagRef.current) {
      diagConfirmedRef.current = true
      sessionStorage.setItem('codex_diag_confirmed', '1')
      if (diagTimerRef.current) clearTimeout(diagTimerRef.current)
      pendingDiagRef.current = null
      setMessages(prev => [...prev,
        { id: Date.now(), from: 'user', text: t },
        { id: Date.now() + 1, from: 'codex', text: '✅ Confirmado! Alertas de diagnóstico pausados. Qualquer dúvida é só perguntar.' },
      ])
      return
    }

    const saveIntent = detectSaveIntent(t)
    const userMsg = { id: Date.now(), from: 'user', text: t }
    setMessages(prev => [...prev, userMsg])

    // Comando de salvar — executa direto sem LLM
    if (saveIntent.detected && firstAgent?.id) {
      setLoading(true)
      try {
        const cat = CATEGORIES[saveIntent.category]
        const text = `[${cat?.label || saveIntent.category}]\n${saveIntent.content}`
        const created = await createTraining(firstAgent.id, { type: 'TEXT', text })
        try {
          const map = JSON.parse(localStorage.getItem('codex_cats') || '{}')
          if (created?.id) map[created.id] = saveIntent.category
          localStorage.setItem('codex_cats', JSON.stringify(map))
        } catch {}
        reloadTrainings()
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          from: 'codex',
          text: `✅ **Ok, entendido!** Salvei na base de conhecimento.\n\n📂 **Categoria:** ${cat?.label || saveIntent.category}\n📝 **Conteúdo:** ${saveIntent.content}`,
        }])
      } catch (e) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, from: 'codex',
          text: `⚠️ Não consegui salvar: ${e.message}`,
        }])
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)

    try {
      const history = messages.filter(m => m.from === 'user' || m.from === 'codex')
      // Usar apenas conversas com dados válidos carregados (richConversations já validadas)
      const validCtx = richConversations.length > 0
        ? richConversations.filter(c => c._loadedOk === true && c.fullMessages?.length > 0)
        : []
      const [provider, modelId] = selectedModel.split('::')
      const reply = await askCODEX(t, history, validCtx, trainings, { provider, modelId })
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        from: 'codex',
        text: reply,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, from: 'codex',
        text: `⚠️ Erro ao conectar com a IA: ${err.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 8, display: 'flex', overflow: 'hidden' }}>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E5E5E5' }}>

        {/* Banner humano urgente */}
        {(() => {
          const humanConvs = conversations.filter(c => c.mode === 'copilot' && c.unread > 0)
          if (!humanConvs.length) return null
          return (
            <div
              onClick={() => setPage('inbox')}
              style={{ background: '#FEF2F2', borderBottom: '2px solid #DC2626', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}
            >
              <span style={{ fontSize: 18 }}>🚨</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                  {humanConvs.length} conversa{humanConvs.length > 1 ? 's' : ''} aguardando atendimento humano
                </div>
                <div style={{ fontSize: 11, color: '#991B1B' }}>
                  {humanConvs.slice(0, 3).map(c => c.name).join(', ')}{humanConvs.length > 3 ? ` +${humanConvs.length - 3}` : ''} · Clique para ir ao Inbox
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', borderRadius: 6, padding: '4px 10px' }}>Ver agora →</span>
            </div>
          )
        })()}

        {/* Banner leads quentes */}
        {hotAlert && (
          <div style={{ background: '#FFF7ED', borderBottom: '2px solid #F59E0B', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>🔥</span>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#92400E' }}>{hotAlert}</div>
            <button onClick={() => setHotAlert(null)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#92400E' }}>✕</button>
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'relative' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F0EBFF', border: '2px solid #7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CodexIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', letterSpacing: '0.5px' }}>CODEX</div>
            <div style={{ fontSize: 12, color: '#82829B', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, background: '#7C3AED', borderRadius: '50%', display: 'inline-block' }} />
              Diretor Comercial IA · PRIME STORE ·
              <button
                onClick={() => setShowModelMenu(v => !v)}
                style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: '#7C3AED', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: activeModel.provider === 'groq' ? '#F0EBFF' : '#E6F1FB', color: activeModel.provider === 'groq' ? '#7C3AED' : '#185FA5' }}>{activeModel.badge}</span>
                {activeModel.label} ▾
              </button>
            </div>
          </div>

          {/* Dropdown seletor de modelo */}
          {showModelMenu && (
            <div
              style={{ position: 'absolute', top: 70, left: 20, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 2000, minWidth: 280, overflow: 'hidden' }}
              onMouseLeave={() => setShowModelMenu(false)}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: '8px 12px 6px', fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: 1, borderBottom: '1px solid #F3F4F6' }}>MODELO DE IA DO CODEX</div>
              {AI_MODELS.map(m => (
                <div
                  key={m.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedModel(m.id); localStorage.setItem('codex_model', m.id); setShowModelMenu(false) }}
                  style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, background: selectedModel === m.id ? 'rgba(124,58,237,0.06)' : 'transparent', borderLeft: selectedModel === m.id ? '3px solid #7C3AED' : '3px solid transparent' }}
                  onMouseEnter={e => { if (selectedModel !== m.id) e.currentTarget.style.background = '#F9FAFB' }}
                  onMouseLeave={e => { if (selectedModel !== m.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: m.provider === 'groq' ? '#7C3AED' : '#0EA5E9', color: '#fff' }}>{m.badge}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{m.label}</span>
                    {selectedModel === m.id && <span style={{ fontSize: 10, color: '#7C3AED', marginLeft: 'auto' }}>✓ ativo</span>}
                  </div>
                  <span style={{ fontSize: 10, color: '#6B7280' }}>{m.desc}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {trainings.length > 0 && (
              <span style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 5 }}>
                🧠 {trainings.length} na base
              </span>
            )}
            {loadingHistory ? (
              <span style={{ background: '#FFF8E1', border: '1px solid #FCD34D', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
                Carregando... {historyProgress}%
              </span>
            ) : (
              <span style={{ background: '#EFFDF4', border: '1px solid #B9F8CF', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#0EC331', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', display: 'inline-block' }} />
                {richConversations.length} conversas
              </span>
            )}
            <span style={{ background: '#FFF8E1', border: '1px solid #FFC300', borderRadius: 9999, padding: '4px 12px', fontSize: 12, color: '#856404' }}>
              🔔 {conversations.filter(c => c.unread > 0).length} não lidas
            </span>
            <button
              onClick={startOnboarding}
              style={{ background: onboarding ? '#7C3AED' : 'none', border: '1px solid ' + (onboarding ? '#7C3AED' : '#7C3AED'), borderRadius: 8, padding: '4px 12px', fontSize: 11, color: onboarding ? '#fff' : '#7C3AED', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
            >
              🚀 {onboarding ? `Etapa ${(onboarding.stage || 0) + 1}/5` : 'Novo Agente'}
            </button>
            <button onClick={clearHistory} style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#82829B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Limpar
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map(msg => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              onSuggestion={send}
              agentId={firstAgent?.id}
              onSaveConfirmed={reloadTrainings}
            />
          ))}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E5E5', flexShrink: 0 }}>
          {attachFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '8px 12px' }}>
              {attachPreview
                ? <img src={attachPreview} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                : <span style={{ fontSize: 20 }}>📎</span>}
              <span style={{ fontSize: 12, color: '#7C3AED', flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachFile.name}</span>
              <button onClick={() => { setAttachFile(null); setAttachPreview(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9CA3AF', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
          )}
          <div style={{ background: '#fff', border: '1px solid #7C3AED', borderRadius: 16, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <input ref={attachInputRef} type="file" accept="image/*,.pdf,.txt,.csv" style={{ display: 'none' }} onChange={handleAttachChange} />
            <button onClick={() => attachInputRef.current?.click()} title="Anexar imagem ou arquivo"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', color: '#9CA3AF', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#7C3AED'}
              onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !showModelMenu) { e.preventDefault(); send() } }}
              rows={1}
              placeholder='Pergunte sobre clientes ou diga "Adiciona que..." para salvar na base...'
              style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: '#0A0A0A', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={() => send()} disabled={loading}
              style={{ width: 34, height: 34, background: loading ? '#DDD6FE' : '#7C3AED', border: 'none', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#82829B', textAlign: 'center', marginTop: 6 }}>
            CODEX · Analisa conversas e gerencia base de conhecimento em tempo real
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 240, padding: '20px 16px', overflowY: 'auto', background: '#F7F7F7', flexShrink: 0 }}>

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Análise Rápida</div>
        {QUICK_ACTIONS.map(item => (
          <button key={item.label} onClick={() => send(item.cmd)} disabled={loading}
            style={{ width: '100%', background: '#fff', border: '1px solid #E5E5E5', borderRadius: 10, padding: '9px 12px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8, cursor: loading ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: loading ? 0.5 : 1 }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#F5F3FF' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            <span style={{ fontSize: 12, color: '#141413' }}>{item.label}</span>
          </button>
        ))}

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 6px', paddingTop: 12, borderTop: '1px solid #E5E5E5' }}>Salvar Conhecimento</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Atalhos para o chat</div>
        {[
          { icon: '📦', label: 'Produto novo',   prefix: 'Adiciona que produto ' },
          { icon: '💰', label: 'Preço / promo',  prefix: 'Adiciona que o preço ' },
          { icon: '❓', label: 'Pergunta freq.', prefix: 'Adiciona que quando cliente perguntar ' },
          { icon: '⚡', label: 'Estratégia',     prefix: 'Adiciona que a estratégia ' },
          { icon: '📋', label: 'Política',       prefix: 'Adiciona que a política ' },
        ].map(item => (
          <button key={item.label} onClick={() => setInput(item.prefix)}
            style={{ width: '100%', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '8px 12px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EDE9FE' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F5F3FF' }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 10px', paddingTop: 12, borderTop: '1px solid #E5E5E5' }}>Canais</div>
        {channels.length === 0
          ? <div style={{ fontSize: 12, color: '#9CA3AF' }}>Carregando...</div>
          : channels.map(ch => (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12, color: '#141413' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EC331', flexShrink: 0 }} />
              {ch.name || ch.label || ch.type}
            </div>
          ))
        }

        <div style={{ fontSize: 12, fontWeight: 600, color: '#82829B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 10px', paddingTop: 12, borderTop: '1px solid #E5E5E5' }}>📦 Buscar Produtos</div>
        <input type="text" placeholder="Nike, New Balance..." value={catalogSearch}
          onChange={e => handleCatalogSearch(e.target.value)}
          style={{ width: '100%', borderRadius: 8, border: '1px solid #E5E5E5', padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }} />
        {catalogResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {catalogResults.map(prod => (
              <div key={prod.id} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 6, padding: 8, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0A0A0A' }}>{prod.nome}</div>
                <div style={{ fontSize: 11, color: '#82829B' }}>{prod.preco}</div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
function ChatMessage({ msg, onSuggestion, agentId, onSaveConfirmed }) {
  if (msg.from === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        {msg.image && (
          <img src={msg.image} alt="anexo" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 12, objectFit: 'cover', border: '2px solid #7C3AED' }} />
        )}
        {msg.text && (
          <div style={{ background: '#7C3AED', color: '#fff', borderRadius: '16px 16px 2px 16px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5 }}>
            {msg.text}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0EBFF', border: '1.5px solid #7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <CodexIcon size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px 16px 16px 2px', padding: '12px 16px', fontSize: 14, color: '#0A0A0A', lineHeight: 1.7 }}>
          <Markdown text={msg.text} />
        </div>
        {msg.saveSuggestion && (
          <SaveCard suggestion={msg.saveSuggestion} agentId={agentId} onSaved={onSaveConfirmed} />
        )}
        {msg.suggestions && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {msg.suggestions.map(s => (
              <button key={s} onClick={() => onSuggestion(s)}
                style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9999, padding: '5px 12px', fontSize: 12, color: '#7C3AED', fontWeight: 500, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Save Card ─────────────────────────────────────────────────────────────────
function SaveCard({ suggestion, agentId, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [category, setCategory] = useState(suggestion.category || 'GERAL')

  if (dismissed) return null

  if (saved) {
    return (
      <div style={{ marginTop: 8, background: '#F0FDF4', border: '1px solid #B9F8CF', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#0B5E20', display: 'flex', gap: 8, alignItems: 'center' }}>
        ✅ Salvo na base de conhecimento!
      </div>
    )
  }

  const handleSave = async () => {
    if (!agentId) return
    setSaving(true)
    try {
      const cat = CATEGORIES[category]
      const text = `[${cat?.label || category}]\n${suggestion.content}`
      const created = await createTraining(agentId, { type: 'TEXT', text })
      try {
        const map = JSON.parse(localStorage.getItem('codex_cats') || '{}')
        if (created?.id) map[created.id] = category
        localStorage.setItem('codex_cats', JSON.stringify(map))
      } catch {}
      setSaved(true)
      onSaved()
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 8, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 6 }}>💾 Salvar na base de conhecimento?</div>
      <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 10, fontStyle: 'italic' }}>
        "{suggestion.content.slice(0, 140)}{suggestion.content.length > 140 ? '...' : ''}"
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ border: '1px solid #DDD6FE', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#7C3AED', background: '#fff', outline: 'none', cursor: 'pointer' }}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={handleSave} disabled={saving || !agentId}
          style={{ background: '#7C3AED', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 11, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Salvando...' : '✓ Confirmar'}
        </button>
        <button onClick={() => setDismissed(true)}
          style={{ background: 'none', border: '1px solid #DDD6FE', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#82829B', cursor: 'pointer' }}>
          Cancelar
        </button>
        {!agentId && <span style={{ fontSize: 11, color: '#EF4444' }}>Nenhum agente</span>}
      </div>
    </div>
  )
}

// ─── Markdown simples ─────────────────────────────────────────────────────────
function Markdown({ text }) {
  const lines = (text || '').split('\n')
  return (
    <div>
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return <div key={i} style={{ paddingLeft: 12, marginBottom: 2 }}>• <InlineFormat text={line.slice(2)} /></div>
        }
        return <div key={i} style={{ marginBottom: 2 }}><InlineFormat text={line} /></div>
      })}
    </div>
  )
}

function InlineFormat({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} style={{ color: '#0A0A0A' }}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0EBFF', border: '1.5px solid #7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CodexIcon size={18} />
      </div>
      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '16px 16px 16px 2px', padding: '14px 18px', display: 'flex', gap: 5, alignItems: 'center' }}>
        {[0, 0.18, 0.36].map((d, i) => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#7C3AED', animation: `blink 1s ${d}s infinite` }} />
        ))}
        <span style={{ fontSize: 12, color: '#82829B', marginLeft: 8 }}>Analisando...</span>
      </div>
      <style>{`@keyframes blink{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

// ─── CODEX Icon ───────────────────────────────────────────────────────────────
function CodexIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
      <path d="M12 2v20"/>
      <path d="M2 8.5l10 7 10-7"/>
    </svg>
  )
}

