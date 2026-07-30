// POC isolada — testa a Conversation API do GPTMaker (Gabi teste).
// Não depende de nenhum arquivo do projeto principal.
// Uso: AGENT_ID=xxx TOKEN=yyy node gptmaker-conversation-test.mjs

const AGENT_ID = process.env.AGENT_ID
const TOKEN = process.env.TOKEN
const PROMPT = 'teste prime'
const CONTEXT_ID = 'poc-teste-fixo-001'

if (!AGENT_ID || !TOKEN) {
  console.error('❌ Faltam variáveis de ambiente.')
  console.error('Uso: AGENT_ID=xxx TOKEN=yyy node gptmaker-conversation-test.mjs')
  process.exit(1)
}

const url = `https://api.gptmaker.ai/v2/agent/${AGENT_ID}/conversation`

const body = {
  contextId: CONTEXT_ID,
  prompt: PROMPT,
}

console.log('▶️  Chamando Conversation API...')
console.log('URL:', url)
console.log('Body:', JSON.stringify(body, null, 2))
console.log('')

const start = performance.now()

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const elapsedMs = Math.round(performance.now() - start)

  console.log('📊 HTTP Status:', res.status, res.statusText)
  console.log('⏱️  Tempo de resposta:', `${elapsedMs}ms`)
  console.log('')

  console.log('📋 Headers relevantes:')
  for (const key of ['content-type', 'x-request-id', 'x-ratelimit-remaining', 'retry-after']) {
    const value = res.headers.get(key)
    if (value) console.log(`  ${key}: ${value}`)
  }
  console.log('')

  const rawText = await res.text()
  let json = null
  try {
    json = JSON.parse(rawText)
  } catch {
    // resposta não é JSON válido — mostra texto cru abaixo
  }

  console.log('📦 Resposta completa:')
  console.log(json ? JSON.stringify(json, null, 2) : rawText)

  if (!res.ok) {
    console.error('')
    console.error(`❌ A API retornou erro (status ${res.status}).`)
    process.exit(1)
  }

  console.log('')
  console.log('✅ POC concluída — Conversation API respondeu com sucesso.')
} catch (err) {
  const elapsedMs = Math.round(performance.now() - start)
  console.error('')
  console.error(`❌ Falha na chamada (após ${elapsedMs}ms):`)
  console.error('  Tipo:', err.name)
  console.error('  Mensagem:', err.message)
  if (err.cause) console.error('  Causa:', err.cause)
  process.exit(1)
}
