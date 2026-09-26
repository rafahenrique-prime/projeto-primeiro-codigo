// Webhook inteligente — Camada de conhecimento
// Processa perguntas do cliente e retorna dados do Supabase
// Integrado com GPT Maker

import crypto from 'node:crypto'
import { upsertIdentity } from './_profileIdentity.js'
import { getMemoryBlock } from './_profileMemory.js'
import { fetchProductsCatalog, fetchGabrielaKnowledge, formatarProdutoComercial, fetchShadowProductAvailability } from './_gabrielaContextService.js'
import { getStoryContext } from './_storyContext.js'
import { identificarProdutoPorImagem } from './_visaoProduto.js'
import { decideStoryWithJev, getJevStoryMode, isExplicitStoryReference } from './_jevStoryDecision.js'
import { compararStoryComCandidatos, getStoryVisualMatchMode, getStoryVisualMatchMinConfidence } from './_visualMatchProduto.js'

// Remove um único `$` residual no início do valor (artefato de substituição de
// variável do GPT Maker em algumas Ações). Não mexe em `$` no meio da string.
function removerDollarInicial(valor) {
  if (typeof valor !== 'string') return valor
  return valor.startsWith('$') ? valor.slice(1) : valor
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// Stop words do português para remover da busca
const STOP_WORDS = new Set([
  'voce', 'você', 'tem', 'temos', 'tenho', 'quero', 'queria', 'queria',
  'preciso', 'precisa', 'busco', 'busca', 'procuro', 'procura', 'vende',
  'vender', 'vende', 'vendido', 'disponivel', 'disponível', 'ter',
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'se', 'me', 'te', 'ele', 'ela', 'eles', 'elas',
  'que', 'e', 'ou', 'mas', 'pra', 'pro', 'ai', 'ai', 'ja', 'já',
  'nao', 'não', 'sim', 'tipo', 'algum', 'alguma', 'vc', 'vcs', 'esse',
  'essa', 'esses', 'essas', 'isso', 'aqui', 'la', 'lá', 'ate', 'até',
  'mais', 'menos', 'muito', 'muita', 'pouco', 'pouca', 'seu', 'sua',
  'meu', 'minha', 'nos', 'agora', 'hoje', 'quando', 'como', 'qual', 'quais'
])

// Normaliza texto para busca
export function normalizarBusca(texto) {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extrai keywords relevantes removendo stop words
export function extrairKeywords(texto) {
  const normalizado = normalizarBusca(texto)
  const palavras = normalizado.split(' ').filter(p => p.length > 1 && !STOP_WORDS.has(p))
  return palavras.length > 0 ? palavras.join(' ') : normalizado
}

// Calcula score de similaridade
export function calcularSimilaridade(texto1, texto2) {
  const t1 = normalizarBusca(texto1)
  const t2 = normalizarBusca(texto2)

  if (t1 === t2) return 100
  if (t2.includes(t1) || t1.includes(t2)) return 80

  const palavras1 = t1.split(' ')
  const palavras2 = t2.split(' ')
  const comuns = palavras1.filter(p => palavras2.includes(p)).length

  if (comuns > 0) {
    return Math.round((comuns / Math.max(palavras1.length, palavras2.length)) * 70)
  }

  return 0
}

// Warm-up: acorda o Supabase (evita cold start)
async function warmupSupabase() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    await fetch(`${SUPABASE_URL}/rest/v1/shadow_products?select=id&ativo=eq.true&limit=1`, {
      headers: sbHeaders,
      signal: controller.signal
    })

    clearTimeout(timeout)
    console.log('[Webhook] ⚡ Warm-up Supabase: OK')
  } catch (err) {
    console.log('[Webhook] ⚡ Warm-up Supabase: skipped')
  }
}

// Busca produtos no Supabase com retry automático (até 5 tentativas)
// Retorna { produtos: top5, total: quantidade REAL de matches } — o total é usado
// pra Gabriela informar "temos X cores, aqui estão 5, mais Y disponíveis" em vez de
// só ver 5 e não saber que existem mais (achado em 2026-07-04 debugando lista de cores).
export async function buscarProdutos(pergunta, tentativa = 1) {
  try {
    const catalogResult = await fetchProductsCatalog({
      supabaseConfig: { baseUrl: SUPABASE_URL, headers: sbHeaders },
    })

    if (!catalogResult.ok) return { produtos: [], total: 0 }

    const produtos = catalogResult.products

    // Extrai keywords da pergunta para melhorar a busca
    const keywords = extrairKeywords(pergunta)
    console.log(`[Webhook] 🔑 Keywords extraídas: "${keywords}" (de: "${pergunta}")`)

    const todosComScore = produtos
      .map(p => ({
        ...p,
        score: calcularSimilaridade(keywords, p.nome)
      }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)

    const produtosComScore = todosComScore.slice(0, 5)

    // Total de variações precisa ser do MESMO MODELO, não só da mesma marca.
    // calcularSimilaridade() pontua com só 1 palavra em comum ("new balance 530"
    // e "new balance 9060" compartilham "new"+"balance"), o que inflava o total
    // somando cores de modelos diferentes (achado em 2026-07-04, conversa real:
    // "164 variações" quando o real do 9060 é 38). Duas tentativas descartadas:
    // exigir TODAS as keywords quebra com palavras soltas fora da STOP_WORDS
    // (ex: "ver" batendo à toa em produtos com "Verde" no nome); usar o score
    // relativo penaliza nomes de produto mais longos e undercounta. A solução:
    // ancorar no(s) token(s) NUMÉRICO(S) da pergunta (9060, 530, 997...), que
    // são os identificadores reais de modelo — exige-se só esses no nome do
    // produto. Sem número na pergunta (ex: "tem tênis vans?"), não dá pra
    // isolar modelo, então mantém o total antigo (soma todos os matches).
    const keywordsArr = normalizarBusca(keywords).split(' ').filter(Boolean)
    const numericos = keywordsArr.filter(k => /\d/.test(k))
    const total = numericos.length > 0
      ? produtos.filter(p => {
          const nome = normalizarBusca(p.nome)
          return numericos.every(k => nome.includes(k))
        }).length
      : todosComScore.length

    // Retry automático: até 5 tentativas com delay de 2s cada (total 10s)
    if (produtosComScore.length === 0 && tentativa < 5) {
      console.log(`[Webhook] ⏳ Tentativa ${tentativa}/5: 0 produtos. Aguardando 2s...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
      return buscarProdutos(pergunta, tentativa + 1)
    }

    if (tentativa > 1 && produtosComScore.length > 0) {
      console.log(`[Webhook] 🔄 Tentativa ${tentativa}/5 - SUCESSO! Encontrados ${produtosComScore.length} produtos`)
    }

    return { produtos: produtosComScore, total }
  } catch (err) {
    console.error('[Webhook] Erro ao buscar produtos:', err.message)
    return { produtos: [], total: 0 }
  }
}

// Busca knowledge no Supabase
export async function buscarKnowledge(pergunta) {
  const resultado = await fetchGabrielaKnowledge({
    supabaseConfig: { baseUrl: SUPABASE_URL, headers: sbHeaders },
  })
  return resultado.knowledge
}

// Correção #1 (Story Vision → Catalog Matching, 2026-09-06): a descrição da
// Vision (api/_visaoProduto.js) é um Markdown longo (Nome, Tipo, Marca, Cor,
// Características, Ocasião/Uso, Descrição para venda) pensado pra virar texto
// de conhecimento, não pra ser usado como query de busca. Usar o Markdown
// inteiro como texto1 de calcularSimilaridade() (mais abaixo) infla o
// denominador da fórmula de score com dezenas de palavras de descrição,
// gerando candidatos com score residual (~6%, ruído) em vez de refletir um
// match real — comprovado em runtime (correlation_id 62a96f86-b46f-457b-
// bfb2-e90aab31c90c, 2026-09-06 07:09 BRT: Vision identificou corretamente
// "Calça Skinny com Elastano / Calça Jeans / Diesel", mas os top scores
// vieram [6,6,6] e o cliente recebeu resposta sobre um produto totalmente
// diferente).
//
// Esta função extrai SOMENTE os 3 campos estruturados que a Vision já
// garante no início do texto (## Nome, **Tipo:**, **Marca:**) — nunca Cor,
// Características, Ocasião/Uso ou Descrição para venda, que são só ruído
// pra fins de busca. Campo ausente é omitido, nunca inventado. Não altera o
// texto/retorno original da Vision — só o que é usado como chave de busca.
//
// Medido contra o algoritmo real (calcularSimilaridade) e o catálogo real de
// Production: Nome+Tipo+Marca leva o caso acima de 6% pra 47% de score nos
// candidatos corretos (Calça Jeans Diesel), sem piorar quando comparado a
// incluir também a Cor (que na prática dilui o score, porque cores como
// "Cinza Escuro" raramente aparecem literalmente no nome do produto).
export function extrairQueryCompactaDaVision(descricaoVisual) {
  if (typeof descricaoVisual !== 'string' || !descricaoVisual.trim()) return ''

  const nomeMatch = descricaoVisual.match(/^##\s*(.+)$/m)
  const tipoMatch = descricaoVisual.match(/\*\*Tipo:\*\*\s*(.+)/i)
  const marcaMatch = descricaoVisual.match(/\*\*Marca:\*\*\s*(.+)/i)

  const partes = [nomeMatch?.[1], tipoMatch?.[1], marcaMatch?.[1]]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)

  return partes.join(' ')
}

export function extrairEvidenciasDaVision(descricaoVisual) {
  if (typeof descricaoVisual !== 'string' || !descricaoVisual.trim()) return null

  const read = (regex) => {
    const value = descricaoVisual.match(regex)?.[1]
    return typeof value === 'string' ? value.trim().slice(0, 160) : ''
  }

  const evidence = {
    nome: read(/^##\s*(.+)$/m),
    tipo: read(/\*\*Tipo:\*\*\s*(.+)/i),
    marca: read(/\*\*Marca:\*\*\s*(.+)/i),
    cor: read(/\*\*Cor:\*\*\s*(.+)/i),
  }

  return Object.values(evidence).some(Boolean) ? evidence : null
}

export function isStoryStockOrSizeQuestion(text) {
  const value = normalizarBusca(text)
  if (!value) return false

  if (/\b(estoque|disponivel|disponibilidade|tamanho|tamanhos|numeracao|numero)\b/.test(value)) {
    return true
  }

  return /\btem\s+(?:o\s+|a\s+)?(?:\d{2}|pp|p|m|g|gg|xg|xxg)\b/.test(value)
}

export function extractRequestedSize(text) {
  const value = normalizarBusca(text)
  if (!value) return null

  const explicit = value.match(
    /\b(?:tamanho|tam|numero|numeracao|tem)\s+(?:o\s+|a\s+)?(pp|p|m|g|gg|xg|xxg|\d{2})\b/
  )
  if (!explicit) return null
  return String(explicit[1]).toUpperCase()
}

// Correção #1 — score mínimo pra um candidato de busca DERIVADA DE STORY ser
// considerado confiável. Não altera calcularSimilaridade() nem os scores em
// si — só decide, depois da busca já feita, se o que veio de volta é forte o
// bastante pra dispensar o fallback pra pergunta original. NÃO se aplica à
// busca direta (sem Story), que continua aceitando qualquer score > 0, exatamente
// como antes desta correção.
//
// Valor ajustado após auditoria do gate final (2026-09-06) com dados reais
// medidos: ruído de query longa (Markdown inteiro) fica <=23%; um Story de
// "Cueca Lupo" simulado (Nome+Tipo+Marca) contra o catálogo real, que tem
// "Cueca Lup" sem o "o" final, pontua 28% — um match genuíno que NÃO pode
// ser rejeitado. O caso real corrigido (Calça Diesel) fica em 47%; matches
// fortes (substring) ficam em 80-100%. 25 é o menor valor que ainda separa
// ruído (<=23) de match genuíno (>=28), sem reabrir espaço pro ruído do caso
// original ([6,6,6]). Não cobre por si só a divergência "Lup"/"Lupo" — isso
// fica documentado como risco conhecido, não corrigido nesta etapa.
export const STORY_MATCH_CONFIDENCE_THRESHOLD = 25

// Função de busca integrada
// perguntaOriginal (Story): quando a busca é feita pela descrição visual de um
// Story, buscaTexto é o texto da visão (só serve pra achar o produto certo) e
// perguntaOriginal é a intenção literal do cliente ("Tem 44?") — nunca
// substituída, sempre devolvida em dados.pergunta pra Gaby continuar
// interpretando a pergunta real. Default = buscaTexto preserva 100% do
// comportamento atual quando não há Story.
export async function searchKnowledge(buscaTexto, perguntaOriginal = buscaTexto) {
  try {
    if (!buscaTexto || buscaTexto.trim().length < 3) {
      return {
        ok: false,
        erro: 'Pergunta muito curta',
        dados: null
      }
    }

    console.log(`[Webhook] 🔍 Buscando: "${buscaTexto}"`)

    const [produtosResult, knowledgeBase] = await Promise.all([
      buscarProdutos(buscaTexto),
      buscarKnowledge(buscaTexto)
    ])
    const { produtos, total: totalReal } = produtosResult

    console.log(`[Webhook] ✅ Encontrados ${produtos.length} produtos (total real de variações: ${totalReal})`)

    const resposta = {
      ok: true,
      pergunta: perguntaOriginal,
      timestamp: new Date().toISOString(),
      dados: {
        // FASE 2A: spread completo (não allowlist manual) — preserva todos os
        // campos existentes e deixa os campos comerciais novos (preco_tabela,
        // preco_pix, parcelamento_*) passarem intactos até formatarRespostaGPT,
        // que é quem de fato decide o shape final entregue à Gaby.
        produtos: produtos.map(p => ({ ...p })),
        knowledge: knowledgeBase ? {
          titulo: knowledgeBase.title,
          categoria: knowledgeBase.category,
          conteudo: knowledgeBase.content
        } : null,
        totalResultados: produtos.length,
        totalVariacoes: totalReal,
        variacoesRestantes: Math.max(0, totalReal - produtos.length)
      }
    }

    return resposta
  } catch (err) {
    console.error('[Webhook] 🔴 ERRO em searchKnowledge:', err.message)
    return {
      ok: false,
      erro: err.message,
      dados: null
    }
  }
}

// Validar request
function validarRequest(body) {
  if (!body) return { valido: false, erro: 'Body vazio' }
  if (!body.pergunta) return { valido: false, erro: 'Campo "pergunta" obrigatório' }

  return { valido: true }
}

// Formatar resposta para GPT Maker
// memoriaBlock (Fase 2B): string opcional vinda de getMemoryBlock() — contexto de
// personalização apenas. Nunca influencia produtos/preços/regras comerciais aqui,
// só é inserida como texto dentro de informacao_adicional (ver comentário abaixo).
export function formatarRespostaGPT(dadosBusca, memoriaBlock = '') {
  const { produtos, knowledge, totalVariacoes, variacoesRestantes } = dadosBusca.dados || {}

  let resposta = {
    sucesso: true,
    timestamp: new Date().toISOString(),
    contexto: {
      pergunta: dadosBusca.pergunta,
      produtos_encontrados: produtos?.length || 0,
      tem_produtos: (produtos?.length || 0) > 0,
      tem_base_conhecimento: !!knowledge,
      // Total real de variações encontradas (antes de cortar em 5) e quantas ficaram
      // de fora — pra Gabriela informar "temos X cores, mais Y disponíveis" com
      // números reais, em vez de ver só 5 e não saber quantas existem no total.
      total_variacoes: totalVariacoes || 0,
      variacoes_restantes: variacoesRestantes || 0
    },
    dados: {
      produtos: [],
      informacao_adicional: '',
      totalVariacoes: totalVariacoes || 0,
      variacoesRestantes: variacoesRestantes || 0
    }
  }

  // Adicionar produtos encontrados
  // FASE 2A: campos comerciais (precoTabela/precoPix/parcelamento*) vêm de
  // formatarProdutoComercial (api/_gabrielaContextService.js) — mesma função
  // usada por api/_toolConsultarProduto.js, pra nunca divergir entre os dois
  // caminhos. Campo comercial sem evidência real no catálogo simplesmente não
  // aparece na chave (nunca null/inventado/calculado) — ver a função pra regra
  // completa. `preco` continua exatamente como já era, sem alteração.
  if (produtos && produtos.length > 0) {
    resposta.dados.produtos = produtos.map(p => ({
      nome: p.nome,
      categoria: p.categoria,
      preco: p.preco,
      imagem: p.imagem,
      link: p.link,
      disponibilidade: 'SIM',
      relevancia: `${p.score}%`,
      ...formatarProdutoComercial(p),
    }))
  }

  // Embute o total real de variações direto no campo que o treinamento
  // "${webhook_response.dados.informacao_adicional}" já lê de verdade — os campos
  // totalVariacoes/variacoesRestantes soltos não chegavam até a Gabriela porque o
  // template dela só referencia .produtos e .informacao_adicional (achado em 2026-07-04
  // testando no WhatsApp real: ela disse "várias cores"/"mais cores" sem número).
  // Fica no TOPO do campo (não no fim) pra não ficar enterrado atrás do dump genérico
  // da base de conhecimento, que é sempre o mesmo texto de produtos independente da pergunta.
  if ((produtos?.length || 0) > 0 && variacoesRestantes > 0) {
    resposta.dados.informacao_adicional += `Total de variações deste produto: ${totalVariacoes} (mostrando ${produtos.length}, restam ${variacoesRestantes} cores não listadas aqui).\n\n`
  }

  // Memória do cliente (Fase 2B) — inserida entre o total de variações e a base de
  // conhecimento. Serve só para personalizar tom/abordagem da Gabriela; nunca altera
  // busca de produtos, preços, regras comerciais, filtro de catálogo, nem interfere
  // em searchKnowledge(). Reaproveita este mesmo campo (informacao_adicional) porque
  // já é um contrato estável, lido de verdade pelo treinamento da Gabriela
  // (${webhook_response.dados.informacao_adicional}) — evita qualquer mudança de
  // configuração na Ação do GPT Maker (mesma lição da Fase 2A: mexer em Ação/template
  // lá é frágil e imprevisível).
  if (memoriaBlock) {
    resposta.dados.informacao_adicional += `${memoriaBlock}\n\n`
  }

  // Adicionar informação da knowledge base
  if (knowledge && knowledge.conteudo) {
    resposta.dados.informacao_adicional += `
Informação da Base de Conhecimento:
${knowledge.conteudo.substring(0, 500)}...
    `.trim()
  }
  resposta.dados.informacao_adicional = resposta.dados.informacao_adicional.trim()

  return resposta
}

// Handler principal
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // LAB temporário — somente Preview, sem envio ao cliente.
  // Usa o último Story real do chat + hint comercial apenas para EXPANDIR
  // candidatos. A decisão final continua sendo visual.
  if (req.method === 'GET' && process.env.VERCEL_ENV === 'preview' && req.query?.visual_match_lab) {
    const chatId = String(req.query.visual_match_lab || '').slice(0, 160)
    const hint = String(req.query.hint || '').slice(0, 160)
    const contexto = await getStoryContext(chatId)
    if (contexto.status !== 'FOUND' || !contexto.storyMediaUrl) {
      return res.status(200).json({ ok: false, stage: 'story_context', status: contexto.status })
    }

    const descricao = await identificarProdutoPorImagem(contexto.storyMediaUrl)
    const visionQuery = extrairQueryCompactaDaVision(descricao || '')
    const primary = visionQuery ? await buscarProdutos(visionQuery) : { produtos: [] }
    const supplemental = hint ? await buscarProdutos(hint) : { produtos: [] }

    const merged = []
    const seen = new Set()
    // Categoria-base vem dos candidatos da Vision. O hint textual só pode
    // expandir dentro da MESMA categoria; impede perfume/roupa entrar numa
    // comparação visual de óculos só porque compartilha a marca.
    const baseCategory = normalizarBusca(primary.produtos?.[0]?.categoria || '')
    const supplementalSameCategory = (supplemental.produtos || []).filter((p) => {
      if (!baseCategory) return true
      return normalizarBusca(p?.categoria || '') === baseCategory
    })

    // Reserva espaço pros dois sinais: Vision (visual-semântico) e hint textual.
    // O hint só EXPANDE candidatos; quem confirma ou rejeita é o Visual Match.
    const interleaved = [
      ...(primary.produtos || []).slice(0, 3),
      ...supplementalSameCategory.slice(0, 3),
      ...(primary.produtos || []).slice(3),
      ...supplementalSameCategory.slice(3),
    ]
    for (const p of interleaved) {
      const key = String(p.bagy_product_id || p.id || p.nome)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(p)
      if (merged.length >= 5) break
    }

    const visual = await compararStoryComCandidatos(contexto.storyMediaUrl, merged)
    const selected = visual?.selectedOriginalIndex != null
      ? merged[visual.selectedOriginalIndex]
      : null

    const stock = selected
      ? await fetchShadowProductAvailability(
          { shadowProductId: selected.id },
          { supabaseConfig: { baseUrl: SUPABASE_URL, headers: sbHeaders } }
        )
      : { status: 'NOT_CHECKED', reason: 'NO_VISUAL_SELECTION' }

    return res.status(200).json({
      ok: true,
      visionQuery,
      candidates: merged.map((p, index) => ({
        id: `C${index + 1}`,
        nome: p.nome,
        marca: p.marca || null,
        categoria: p.categoria || null,
        score: p.score ?? null,
        bagyProductId: p.bagy_product_id ?? null,
      })),
      visual,
      stock,
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  try {
    // Nunca logar req.body bruto: campos nomeados e truncados só.
    const perguntaBruta = req.body?.prompt || req.body?.pergunta || req.body?.message ||
      req.body?.text || req.body?.input || req.body?.msg || req.body?.content || req.body?.query || req.body?.body || ''
    console.log('[Webhook] 📨 Requisição recebida:', {
      pergunta: String(perguntaBruta).slice(0, 120),
      cliente_id: req.body?.cliente_id || req.body?.contextId || null,
    })

    // Warm-up: acorda o Supabase em background (não bloqueia a resposta)
    warmupSupabase().catch(() => {})

    // Extrair pergunta - GPT Maker envia em "prompt" (campo obrigatório)
    let pergunta = req.body?.prompt ||
                   req.body?.pergunta ||
                   req.body?.message ||
                   req.body?.text ||
                   req.body?.input ||
                   req.body?.msg ||
                   req.body?.content ||
                   req.body?.query ||
                   req.body?.body ||
                   null

    // Se ainda não tem, tenta pegar do contexto
    if (!pergunta && req.body?.conversas) {
      const ultima = req.body.conversas[req.body.conversas.length - 1]
      pergunta = ultima?.texto || ultima?.message || null
    }

    // Se ainda não tem, tenta pegar de qualquer chave que parece ser texto longo
    if (!pergunta) {
      for (const [chave, valor] of Object.entries(req.body || {})) {
        if (typeof valor === 'string' && valor.length > 3 && valor.length < 500) {
          pergunta = valor
          break
        }
      }
    }

    // Mesmo tratamento já aplicado a cliente_id/telefone/chat_id — remove o `$`
    // residual do artefato de substituição de variável do GPT Maker.
    pergunta = removerDollarInicial(pergunta)

    // Validar que temos uma pergunta
    if (!pergunta || pergunta.trim().length < 3) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Não consegui encontrar a pergunta no payload',
        debug: {
          body_recebido: req.body,
          chaves_disponiveis: Object.keys(req.body || {})
        }
      })
    }

    console.log(`[Webhook] 🔍 Pergunta extraída: "${pergunta}"`)

    const cliente_id = removerDollarInicial(req.body?.cliente_id) || 'desconhecido'
    const telefone = removerDollarInicial(req.body?.telefone) || null
    const canal = req.body?.canal || null
    const tipo_busca = req.body?.tipo_busca || 'auto'
    const chat_id = removerDollarInicial(req.body?.chat_id) || null

    // Captura de identidade (Fase 2A) — fire-and-forget, nunca deve atrasar
    // ou travar a resposta da Gabriela. Não implementa memória/prompt ainda.
    upsertIdentity({ contextId: cliente_id, telefone, canal }).catch(() => {})

    // Etapa 0B (Story Vision Trace) — 1 correlation_id por request, só pra
    // amarrar telemetria técnica (vision_usage_events) e o log estruturado
    // abaixo à mesma execução. Nunca deriva de/substitui chat_id/cliente_id,
    // nunca é usado em decisão de negócio.
    const correlationId = crypto.randomUUID()
    let storyContextStatus = null // null = getStoryContext nem foi chamado (sem chat_id)
    let visionStatus = 'not_attempted'
    let searchContextUsed = 'pergunta_direta'
    let fallbackUsed = false
    let storyIdParaTrace = null
    // Correção #2 (2026-09-06): true assim que um Story ATUAL com mídia é
    // confirmado (linha abaixo), independente de Vision/parser/matching/fallback
    // terem sucesso depois — nunca revertido. Deliberadamente diferente de
    // isStorySearch (mais abaixo, só da Correção #1): aquele só fica true se a
    // query compacta foi extraída com sucesso, então tem uma brecha para o
    // cenário mais perigoso pra memória (Story presente, mas Vision/parser
    // falham — aí sobra só a memória antiga pra Gaby usar, sem supressão).
    let hasCurrentStory = false
    let visionDecisionEvidence = null
    let storyMediaUrlForDecision = null
    const visualMatchMode = getStoryVisualMatchMode()
    let visualMatchDecision = {
      status: 'not_attempted',
      choice: 'NONE',
      confidence: null,
      reason: 'NOT_ELIGIBLE',
    }
    let stockVerification = {
      status: 'NOT_CHECKED',
      reason: 'NOT_REQUIRED',
      requestedSize: null,
    }

    // JEV Story Guard V1: desligado por padrão. Em shadow, só observa; em
    // guard, aplica política fail-closed exclusivamente em referências de Story.
    const jevStoryMode = getJevStoryMode()
    const explicitStoryReference = isExplicitStoryReference(pergunta)
    let jevStoryDecision = {
      status: 'not_attempted',
      action: 'BYPASS',
      selectedCandidateId: null,
      confidence: null,
      selectedProbability: null,
      reason: 'NOT_ELIGIBLE',
      intent: 'UNKNOWN',
      intentConfidence: null,
    }

    // Story do Instagram (best-effort, nunca bloqueia nem quebra o fluxo normal):
    // se a mensagem mais recente do cliente foi resposta a um Story, identifica
    // o produto pela foto e usa SÓ essa descrição como chave de busca — a
    // `pergunta` original ("Tem 44?") nunca é substituída, continua sendo
    // devolvida em dados.pergunta pra Gaby interpretar a intenção real.
    //
    // Seleção da mensagem/Story dentro de getStoryContext NÃO muda nesta etapa
    // (Etapa 0B é só instrumentação) — só passamos a ler o `status` que a
    // function já devolve, pra saber diferenciar "sem Story nesta mensagem"
    // de "Story achado, mas a Vision falhou" de "erro de fetch no GPTMaker".
    let buscaTexto = pergunta
    if (chat_id) {
      try {
        const contextoStory = await getStoryContext(chat_id)
        storyContextStatus = contextoStory.status
        if (contextoStory.status === 'FOUND' && contextoStory.storyMediaUrl) {
          // Correção #2: Story atual comprovado AQUI, antes de qualquer
          // chamada à Vision — este é o sinal certo pra suprimir memória de
          // produto histórico, não o resultado da Vision/parser mais abaixo.
          hasCurrentStory = true
          storyIdParaTrace = contextoStory.storyId
          storyMediaUrlForDecision = contextoStory.storyMediaUrl
          const descricaoVisual = await identificarProdutoPorImagem(contextoStory.storyMediaUrl, {
            correlationId,
            storyId: contextoStory.storyId,
          })
          if (descricaoVisual) {
            // O catálogo continua usando Nome+Tipo+Marca, mas o JEV recebe
            // também Cor como evidência semântica para distinguir variantes.
            visionDecisionEvidence = extrairEvidenciasDaVision(descricaoVisual)

            // Correção #1 (gate final, 2026-09-06): a query de busca é
            // SEMPRE a versão compacta (Nome+Tipo+Marca) — o Markdown
            // inteiro da Vision NUNCA é usado como query do catálogo, nem
            // como fallback silencioso. Se o parser não reconhecer nenhum
            // dos 3 campos, buscaTexto permanece = pergunta (mesmo caminho
            // seguro já usado quando a Vision falha ou não há Story).
            const queryCompacta = extrairQueryCompactaDaVision(descricaoVisual)
            if (queryCompacta) {
              console.log('[Webhook] 🖼️  Story identificado, buscando pelo produto da imagem')
              buscaTexto = queryCompacta
              searchContextUsed = 'story'
              visionStatus = 'success'
              storyContextStatus = 'STORY_FOUND_VISION_OK'
            } else {
              console.warn('[Webhook] Vision retornou texto sem campos reconhecíveis (Nome/Tipo/Marca) — seguindo com a pergunta original')
              visionStatus = 'success_empty_query'
              storyContextStatus = 'STORY_FOUND_VISION_OK_EMPTY_QUERY'
            }
          } else {
            visionStatus = 'failed'
            storyContextStatus = 'STORY_FOUND_VISION_FAILED'
          }
        }
      } catch (err) {
        console.warn('[Webhook] Story indisponível, seguindo com a pergunta original:', err.message)
        storyContextStatus = storyContextStatus || 'GPTMAKER_FETCH_ERROR'
      }
    }

    console.log(`[Webhook] 🔍 Buscando: "${buscaTexto}"`)

    // Busca de produtos/conhecimento e busca de memória (Fase 2B) rodam em paralelo —
    // getMemoryBlock() já encapsula seu próprio timeout/fallback (nunca atrasa nem
    // trava esta resposta; pior caso, contribui só com '').
    let [resultado, memoriaBlock] = await Promise.all([
      searchKnowledge(buscaTexto, pergunta),
      getMemoryBlock(cliente_id, { suppressProductFields: hasCurrentStory }),
    ])

    const isStorySearch = buscaTexto !== pergunta

    // Story Visual Match V2 — Preview-only durante homologação.
    // A pista textual NUNCA vira verdade: ela apenas expande candidatos da
    // mesma categoria. A confirmação vem da comparação Story x foto do Mirror.
    if (
      resultado?.ok &&
      isStorySearch &&
      visualMatchMode !== 'off' &&
      storyMediaUrlForDecision
    ) {
      const primaryProducts = Array.isArray(resultado?.dados?.produtos)
        ? resultado.dados.produtos
        : []
      const supplementalResult = await buscarProdutos(pergunta)
      const baseCategory = normalizarBusca(primaryProducts?.[0]?.categoria || '')
      const supplementalSameCategory = (supplementalResult.produtos || []).filter((p) => {
        if (!baseCategory) return true
        return normalizarBusca(p?.categoria || '') === baseCategory
      })

      const merged = []
      const seen = new Set()
      const interleaved = [
        ...primaryProducts.slice(0, 3),
        ...supplementalSameCategory.slice(0, 3),
        ...primaryProducts.slice(3),
        ...supplementalSameCategory.slice(3),
      ]

      for (const p of interleaved) {
        const key = String(p?.bagy_product_id || p?.id || p?.nome || '')
        if (!key || seen.has(key)) continue
        seen.add(key)
        merged.push(p)
        if (merged.length >= 5) break
      }

      visualMatchDecision = await compararStoryComCandidatos(
        storyMediaUrlForDecision,
        merged
      )

      const visualThreshold = getStoryVisualMatchMinConfidence()
      const visualStrong =
        visualMatchDecision?.status === 'ok' &&
        visualMatchDecision?.choice !== 'NONE' &&
        Number(visualMatchDecision?.confidence) >= visualThreshold &&
        visualMatchDecision?.selectedOriginalIndex != null

      if (visualStrong && visualMatchMode === 'guard') {
        const selectedIndex = Number(visualMatchDecision.selectedOriginalIndex)
        const selected = merged[selectedIndex]

        if (selected) {
          const selectedAnnotated = {
            ...selected,
            visual_match_confidence: Number(visualMatchDecision.confidence),
          }
          const ranked = [
            selectedAnnotated,
            ...merged.filter((_, index) => index !== selectedIndex),
          ]

          resultado = {
            ...resultado,
            dados: {
              ...resultado.dados,
              produtos: ranked,
              totalResultados: ranked.length,
              totalVariacoes: ranked.length,
              variacoesRestantes: 0,
            },
          }
          searchContextUsed = 'story_visual_match'
        }
      }
    }

    // Correção #1: fallback pra pergunta original agora dispara quando a
    // busca derivada de Story não tem NENHUM candidato confiável
    // (score >= STORY_MATCH_CONFIDENCE_THRESHOLD) — não só quando dá zero
    // candidatos. Isso cobre exatamente o caso comprovado em runtime onde
    // existiam candidatos (5), mas todos com score de ruído (6%). Mesmo
    // fallback de sempre (searchKnowledge(pergunta)); só o gatilho mudou.
    // Busca direta (sem Story) nunca passa por aqui — buscaTexto === pergunta
    // sempre nesse caso, comportamento 100% preservado.
    const confidentCandidatesCount = isStorySearch
      ? (resultado?.dados?.produtos || []).filter((p) => (p?.score ?? 0) >= STORY_MATCH_CONFIDENCE_THRESHOLD).length
      : null

    if (resultado.ok && isStorySearch && confidentCandidatesCount === 0) {
      console.log('[Webhook] 🔁 Story não encontrou produto confiável, tentando com a pergunta original')
      resultado = await searchKnowledge(pergunta)
      searchContextUsed = 'story_fallback_pergunta'
      fallbackUsed = true
    } else if (resultado.ok && isStorySearch && confidentCandidatesCount > 0) {
      // Correção #1 (gate final): mesmo havendo pelo menos 1 candidato
      // confiável, produtos abaixo do threshold NÃO podem seguir misturados
      // no payload — evita ruído de baixo score chegar a formatarRespostaGPT/
      // Gaby junto do(s) resultado(s) bom(ns). Só se aplica ao caminho Story
      // (isStorySearch); busca direta nunca é filtrada por score.
      const produtosOriginais = resultado.dados.produtos
      const produtosConfiaveis = produtosOriginais.filter((p) => (p?.score ?? 0) >= STORY_MATCH_CONFIDENCE_THRESHOLD)
      resultado = {
        ...resultado,
        dados: {
          ...resultado.dados,
          produtos: produtosConfiaveis,
          // Coerente com o payload final: depois do filtro, o total "real"
          // relevante pro cliente é só a contagem de confiáveis — não faz
          // sentido informar variações restantes de candidatos que a própria
          // Gaby nunca vai ver.
          totalResultados: produtosConfiaveis.length,
          totalVariacoes: produtosConfiaveis.length,
          variacoesRestantes: 0,
        },
      }
    }

    // JEV Story Ranker — entra somente quando existe Story atual OU quando
    // o próprio cliente faz referência explícita a Story/foto mas o contexto
    // não pôde ser recuperado. Em guard, o catálogo preserva as opções e o JEV
    // apenas prioriza candidato + define o grau de cautela da resposta.
    const storyDecisionEligible = Boolean(chat_id) && (hasCurrentStory || explicitStoryReference)
    if (jevStoryMode !== 'off' && storyDecisionEligible) {
      if (!hasCurrentStory) {
        jevStoryDecision = {
          status: 'local_guard',
          action: 'BLOCK_ASSERTION',
          selectedCandidateId: null,
          confidence: null,
          selectedProbability: null,
          reason: 'EXPLICIT_STORY_REFERENCE_WITHOUT_CONTEXT',
          intent: 'UNKNOWN',
          intentConfidence: null,
        }
      } else if (visionStatus !== 'success' || !isStorySearch) {
        jevStoryDecision = {
          status: 'local_guard',
          action: 'BLOCK_ASSERTION',
          selectedCandidateId: null,
          confidence: null,
          selectedProbability: null,
          reason: 'STORY_CONTEXT_WITHOUT_USABLE_VISION',
          intent: 'UNKNOWN',
          intentConfidence: null,
        }
      } else {
        jevStoryDecision = await decideStoryWithJev({
          question: pergunta,
          visionQuery: buscaTexto,
          visionEvidence: visionDecisionEvidence,
          candidates: resultado?.dados?.produtos || [],
          storyContextStatus,
          visionStatus,
          visualMatch: visualMatchDecision,
        })
      }

      if (jevStoryMode === 'guard') {
        // JEV é o ranker final. Estoque/tamanho só pode virar fato depois de
        // consultar shadow_product_variations do produto selecionado.
        const currentProducts = Array.isArray(resultado?.dados?.produtos)
          ? resultado.dados.produtos
          : []

        const selectedId = String(jevStoryDecision.selectedCandidateId || '')
        const selectedIndex = /^C[1-5]$/.test(selectedId) ? Number(selectedId.slice(1)) - 1 : -1
        let selectedProduct = selectedIndex >= 0 ? currentProducts[selectedIndex] : null

        const requiresStockVerification =
          jevStoryDecision.action === 'ALLOW_AUTO' &&
          (jevStoryDecision.intent === 'SIZE_STOCK' || isStoryStockOrSizeQuestion(pergunta))

        if (requiresStockVerification && selectedProduct) {
          const requestedSize = extractRequestedSize(pergunta)
          stockVerification = await fetchShadowProductAvailability(
            {
              shadowProductId: selectedProduct.id,
              requestedSize,
            },
            {
              supabaseConfig: { baseUrl: SUPABASE_URL, headers: sbHeaders },
            }
          )

          if (
            stockVerification.status === 'AVAILABLE' ||
            stockVerification.status === 'OUT_OF_STOCK'
          ) {
            selectedProduct = {
              ...selectedProduct,
              stock_verification_status: stockVerification.status,
              stock_requested_size: stockVerification.requestedSize || null,
            }
            jevStoryDecision = {
              ...jevStoryDecision,
              reason: stockVerification.status === 'AVAILABLE'
                ? 'STOCK_VERIFIED_AVAILABLE'
                : 'STOCK_VERIFIED_OUT_OF_STOCK',
            }
          } else {
            jevStoryDecision = {
              ...jevStoryDecision,
              action: 'VERIFY_STOCK',
              reason: 'STOCK_NOT_VERIFIED',
            }
          }
        }

        if (jevStoryDecision.action === 'ALLOW_AUTO' || jevStoryDecision.action === 'VERIFY_STOCK') {
          if (selectedProduct) {
            // Mantém as opções, mas move a escolhida para o topo. O objeto do
            // selecionado pode carregar somente o status factual de estoque.
            const rankedProducts = [
              selectedProduct,
              ...currentProducts.filter((_, index) => index !== selectedIndex),
            ]
            resultado = {
              ...resultado,
              dados: {
                ...resultado.dados,
                produtos: rankedProducts,
                knowledge: null,
                totalResultados: rankedProducts.length,
              },
            }
          } else {
            jevStoryDecision = {
              ...jevStoryDecision,
              action: 'ASK_CLARIFY',
              selectedCandidateId: null,
              reason: 'JEV_SELECTED_CANDIDATE_INVALID',
            }
            resultado = {
              ...resultado,
              dados: {
                ...resultado.dados,
                knowledge: null,
              },
            }
            memoriaBlock = ''
          }
        } else {
          resultado = {
            ...resultado,
            dados: {
              ...resultado.dados,
              knowledge: null,
            },
          }
          memoriaBlock = ''
        }
      }
    }

    // Etapa 0B (Story Vision Trace) — log estruturado sanitizado, 1 por
    // request. Só números/enums fechados/scores — nunca nome, telefone,
    // pergunta completa, storyMediaUrl, prompt ou payload bruto. Top 3 scores
    // já vêm calculados e ordenados desc por buscarProdutos(); aqui só
    // truncamos pra no máximo 3 valores numéricos, sem nome/id de produto.
    // Correção #1: confident_candidates_count/story_match_threshold são só
    // metadado técnico (números) — nunca a query construída, que poderia
    // carregar texto sensível do produto/Story.
    const candidatos = resultado?.dados?.produtos || []
    const topCandidateScores = candidatos
      .slice(0, 3)
      .map((p) => (typeof p?.score === 'number' ? p.score : null))
      .filter((s) => s !== null)
    console.log('[Webhook][trace]', JSON.stringify({
      correlation_id: correlationId,
      story_id: storyIdParaTrace,
      story_context_status: storyContextStatus,
      vision_status: visionStatus,
      search_context_used: searchContextUsed,
      fallback_used: fallbackUsed,
      candidates_count: candidatos.length,
      top_candidate_scores: topCandidateScores,
      confident_candidates_count: isStorySearch ? confidentCandidatesCount : null,
      story_match_threshold: isStorySearch ? STORY_MATCH_CONFIDENCE_THRESHOLD : null,
      jev_story_mode: jevStoryMode,
      jev_status: jevStoryDecision.status,
      jev_action: jevStoryDecision.action,
      jev_confidence: jevStoryDecision.confidence,
      jev_selected_probability: jevStoryDecision.selectedProbability,
      jev_reason: jevStoryDecision.reason,
      jev_intent: jevStoryDecision.intent,
      jev_intent_confidence: jevStoryDecision.intentConfidence,
    }))

    if (!resultado.ok) {
      return res.status(400).json({
        sucesso: false,
        erro: resultado.erro
      })
    }

    // Formatar para GPT Maker
    const respostaGPT = formatarRespostaGPT(resultado, memoriaBlock)

    // Em guard, a política chega à Gaby sem probabilidades/PII. Dúvida ou
    // contexto ausente nunca vira afirmação de produto/preço/tamanho.
    if (jevStoryMode === 'guard' && jevStoryDecision.action !== 'BYPASS') {
      respostaGPT.contexto.decision_layer = {
        scope: 'story',
        action: jevStoryDecision.action,
        reason: jevStoryDecision.reason,
      }

      // Em Story Guard, existência do produto nunca é convertida em estoque.
      if (Array.isArray(respostaGPT.dados.produtos)) {
        respostaGPT.dados.produtos = respostaGPT.dados.produtos.map((p) => ({
          ...p,
          disponibilidade: 'NÃO CONFIRMADA',
        }))
      }

      if (jevStoryDecision.action === 'ALLOW_AUTO') {
        const instruction = 'PRIME DECISION LAYER: o primeiro produto foi priorizado pelo JEV com alta confiança, mas NÃO trate a lista como correspondência única. Apresente o primeiro como o mais provável e, quando útil, mostre também as alternativas retornadas pelo catálogo. NÃO afirme estoque/tamanho sem verificação específica.'
        respostaGPT.dados.informacao_adicional = `${instruction}\n\n${respostaGPT.dados.informacao_adicional || ''}`.trim()
      } else if (jevStoryDecision.action === 'VERIFY_STOCK') {
        const instruction = 'PRIME DECISION LAYER: o primeiro produto é o mais provável, porém tamanho/estoque NÃO foi verificado. Preserve as alternativas do catálogo. NÃO responda sim/não sobre disponibilidade; informe de forma curta que precisa confirmar.'
        respostaGPT.dados.informacao_adicional = `${instruction}\n\n${respostaGPT.dados.informacao_adicional || ''}`.trim()
      } else if (jevStoryDecision.action === 'ASK_CLARIFY') {
        const instruction = 'PRIME DECISION LAYER: confiança média/baixa. NÃO escolha um único produto como certeza. Mostre de 2 a 5 opções mais relacionadas que vieram do catálogo e faça UMA pergunta curta para o cliente confirmar cor/modelo/produto.'
        respostaGPT.dados.informacao_adicional = `${instruction}\n\n${respostaGPT.dados.informacao_adicional || ''}`.trim()
      } else if (jevStoryDecision.action === 'BLOCK_ASSERTION') {
        const instruction = 'PRIME DECISION LAYER: contexto insuficiente para afirmar qual é o produto exato. Se o catálogo retornou opções, apresente-as apenas como possibilidades relacionadas e peça ao cliente para confirmar qual delas é; não invente produto, preço, tamanho ou disponibilidade.'
        respostaGPT.dados.informacao_adicional = `${instruction}\n\n${respostaGPT.dados.informacao_adicional || ''}`.trim()
      }
    }

    console.log(`[Webhook] ✅ Encontrados ${respostaGPT.contexto.produtos_encontrados} produtos`)

    return res.status(200).json(respostaGPT)

  } catch (err) {
    console.error('[Webhook] 🔴 ERRO:', err.message)
    return res.status(500).json({
      sucesso: false,
      erro: err.message
    })
  }
}
