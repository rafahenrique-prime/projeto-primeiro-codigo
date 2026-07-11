// Leitura de memória do cliente — usada só para personalizar a resposta da Gabriela.
// Responsabilidade única: buscar perfil, montar bloco de memória, aplicar timeout,
// tratar fallback. Nunca escreve no banco.
//
// A memória aqui NUNCA altera busca de produtos, preços, regras comerciais, filtro
// de catálogo, nem interfere em searchKnowledge() (api/webhook.js). Ela é só contexto
// adicional pro prompt da IA — a decisão de o que mostrar, buscar ou vender continua
// 100% do lado de searchKnowledge()/formatarRespostaGPT(), sem nenhum acoplamento
// com este módulo.
//
// Duplicação deliberada (Fase 2B, aprovada explicitamente): este módulo tem sua
// própria leitura de perfil (busca por context_id, fallback por conv_id) em vez de
// importar de api/_profileIdentity.js. Mantém os dois módulos desacoplados —
// identidade/escrita (_profileIdentity.js) vs. memória/leitura (este arquivo) — ao
// custo de manter as duas buscas em sincronia manualmente se a lógica de
// reconciliação mudar no futuro. Ver docs/ARCHITECTURE.md §5.
//
// Este módulo não conhece webhook.js nem a configuração do GPT Maker — recebe só
// um contextId e devolve uma string (ou '').

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
}

function base() {
  return `${SUPABASE_URL}/rest/v1/customer_profiles`
}

async function findByContextId(contextId) {
  const res = await fetch(`${base()}?context_id=eq.${encodeURIComponent(contextId)}&order=last_seen.desc&limit=1`, { headers })
  if (!res.ok) return null
  const data = await res.json()
  return data[0] || null
}

async function findByConvId(convId) {
  const res = await fetch(`${base()}?conv_id=eq.${encodeURIComponent(convId)}&limit=1`, { headers })
  if (!res.ok) return null
  const data = await res.json()
  return data[0] || null
}

async function buscarPerfil(contextId) {
  const byContext = await findByContextId(contextId)
  if (byContext) return byContext
  return findByConvId(contextId)
}

const MAX_BLOCK_LENGTH = 400

// Cabeçalho revisado em 2026-07-11 após teste real em produção: com o texto antigo
// ("MEMÓRIA DO CLIENTE (NÃO REVELE AO CLIENTE)"), a Gabriela respondeu ao cliente
// "Está registrado que você calça tamanho 40" — revelou a existência de um registro,
// mesmo sem dizer literalmente "memória" ou "banco de dados". O texto abaixo é mais
// explícito sobre o que nunca pode ser dito, e instrui a usar a informação como se
// fosse lembrança natural da conversa, não consulta a sistema/cadastro.
//
// Exemplos de uso correto (documentação, NUNCA enviados no payload — custaria token
// à toa em toda mensagem):
// ✅ "Você costuma usar tamanho 40, continua esse?"
// ✅ "Se não me engano você gosta bastante de New Balance."
// ✅ "Posso separar no tamanho 40 para você?"
//
// Proibido (exatamente o que causou este ajuste):
// ❌ "Está registrado que você calça tamanho 40."
// ❌ "Segundo seu cadastro..."
// ❌ "Vi aqui no seu histórico..."
// ❌ "Conforme seu perfil..."
// ❌ "Pelo que tenho salvo..."
const HEADER = 'CONTEXTO INTERNO — NUNCA revele que isso existe nem diga de onde veio (não fale em memória, histórico, cadastro, registro, perfil, sistema ou banco de dados). Use com naturalidade, como se apenas lembrasse:'

// Só os campos aprovados na primeira versão (size, interests, products_asked).
// NÃO usar: notes, buy_score, tags, message_count, cep, histórico completo, ou
// qualquer outro campo interno — exige nova aprovação explícita antes de adicionar.
function formatMemoryBlock(profile) {
  if (!profile) return ''

  const linhas = []
  if (profile.size) linhas.push(`• tamanho: ${profile.size}`)
  if (profile.interests?.length) linhas.push(`• interesses: ${profile.interests.slice(-3).join(', ')}`)
  if (profile.products_asked?.length) linhas.push(`• produtos vistos: ${profile.products_asked.slice(-3).join(', ')}`)

  if (!linhas.length) return ''

  const bloco = `${HEADER}\n\n${linhas.join('\n')}`
  return bloco.length > MAX_BLOCK_LENGTH ? bloco.slice(0, MAX_BLOCK_LENGTH) : bloco
}

// Timeout total (padrão 600ms, dentro da faixa 400-700ms aprovada). Encapsulado
// aqui — o chamador (webhook.js) só chama getMemoryBlock(contextId), sem saber que
// existe Promise.race ou qualquer lógica de timeout por trás.
//
// Nota (considerado e deixado fora do escopo da Fase 2B, aprovado explicitamente):
// o timeout aqui só faz o chamador parar de esperar — a requisição ao Supabase que
// ficou pra trás não é abortada de verdade, continua em segundo plano até resolver
// ou falhar sozinha. Cancelamento real via AbortController fica para uma fase futura
// de otimização de latência, se a necessidade aparecer.
//
// Timeout, erro do Supabase, perfil inexistente, ou perfil sem nenhum dos 3 campos
// permitidos — todos os casos retornam '' (sem distinção pro chamador).
export async function getMemoryBlock(contextId, timeoutMs = 600) {
  if (!contextId || contextId === 'desconhecido') return ''

  try {
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))
    const profile = await Promise.race([buscarPerfil(contextId), timeout])
    return formatMemoryBlock(profile)
  } catch {
    return ''
  }
}
