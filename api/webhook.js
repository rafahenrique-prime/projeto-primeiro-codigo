// Webhook inteligente — Camada de conhecimento
// Processa perguntas do cliente e retorna dados do Supabase
// Integrado com GPT Maker

import { upsertIdentity } from './_profileIdentity.js'
import { getMemoryBlock } from './_profileMemory.js'
import { fetchProductsCatalog, fetchGabrielaKnowledge, formatarProdutoComercial } from './_gabrielaContextService.js'
import { getStoryContext } from './_storyContext.js'
import { identificarProdutoPorImagem } from './_visaoProduto.js'

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

    await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
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

    // Story do Instagram (best-effort, nunca bloqueia nem quebra o fluxo normal):
    // se a mensagem mais recente do cliente foi resposta a um Story, identifica
    // o produto pela foto e usa SÓ essa descrição como chave de busca — a
    // `pergunta` original ("Tem 44?") nunca é substituída, continua sendo
    // devolvida em dados.pergunta pra Gaby interpretar a intenção real.
    let buscaTexto = pergunta
    if (chat_id) {
      try {
        const contextoStory = await getStoryContext(chat_id)
        if (contextoStory?.storyMediaUrl) {
          const descricaoVisual = await identificarProdutoPorImagem(contextoStory.storyMediaUrl)
          if (descricaoVisual) {
            console.log('[Webhook] 🖼️  Story identificado, buscando pelo produto da imagem')
            buscaTexto = descricaoVisual
          }
        }
      } catch (err) {
        console.warn('[Webhook] Story indisponível, seguindo com a pergunta original:', err.message)
      }
    }

    console.log(`[Webhook] 🔍 Buscando: "${buscaTexto}"`)

    // Busca de produtos/conhecimento e busca de memória (Fase 2B) rodam em paralelo —
    // getMemoryBlock() já encapsula seu próprio timeout/fallback (nunca atrasa nem
    // trava esta resposta; pior caso, contribui só com '').
    let [resultado, memoriaBlock] = await Promise.all([
      searchKnowledge(buscaTexto, pergunta),
      getMemoryBlock(cliente_id),
    ])

    // Se a busca pela descrição visual do Story não achou produto nenhum,
    // tenta de novo com a pergunta original antes de desistir — evita que uma
    // identificação de imagem imprecisa deixe o cliente sem resposta.
    if (resultado.ok && buscaTexto !== pergunta && (resultado.dados?.produtos?.length || 0) === 0) {
      console.log('[Webhook] 🔁 Story não encontrou produto, tentando com a pergunta original')
      resultado = await searchKnowledge(pergunta)
    }

    if (!resultado.ok) {
      return res.status(400).json({
        sucesso: false,
        erro: resultado.erro
      })
    }

    // Formatar para GPT Maker
    const respostaGPT = formatarRespostaGPT(resultado, memoriaBlock)

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
