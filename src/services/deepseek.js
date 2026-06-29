import { logTokenUsage } from './tokenLoggingService'

const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

const DEBUG = {
  apiKeySet: !!DEEPSEEK_API_KEY,
  apiKeyLength: DEEPSEEK_API_KEY?.length || 0,
}

if (!DEEPSEEK_API_KEY) {
  console.warn('[DeepSeek] ⚠️ VITE_DEEPSEEK_API_KEY não configurada. Usar fallbacks automáticos.')
}

export async function deepseekRequest(body) {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.trim() === '') {
    console.warn('[DeepSeek] API key não configurada, usando fallback automático')
    return {
      choices: [{ message: { content: body.fallbackText || 'Oi! Ainda posso te ajudar? 😊' } }],
      model: 'fallback',
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        model: body.model || 'deepseek-lite',
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (res.ok) {
      const data = await res.json()
      if (!data.choices?.length) throw new Error('Resposta vazia da API DeepSeek')

      const tokensUsed = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0)
      if (tokensUsed > 0) {
        logTokenUsage('deepseek', tokensUsed, body.model || 'deepseek-lite', 0)
      }

      return data
    }

    const err = await res.json()
    const msg = err.error?.message || ''
    const status = res.status

    const isRateLimit = status === 429 || msg.includes('Rate limit')
    const isUnauth = status === 401 || status === 403 || msg.includes('Invalid API')

    console.warn(`[DeepSeek] Erro: ${status} - ${msg}`)

    if (isUnauth) {
      console.error('[DeepSeek] ❌ API key inválida ou expirada')
      return {
        choices: [{ message: { content: body.fallbackText || 'Oi! Ainda posso te ajudar? 😊' } }],
        model: 'fallback-auth-error',
      }
    }

    if (isRateLimit) {
      console.warn('[DeepSeek] Rate limit atingido, tente novamente em alguns segundos')
      return {
        choices: [{ message: { content: 'Rate limit atingido. Tente novamente em alguns segundos.' } }],
        model: 'fallback-rate-limit',
      }
    }

    throw new Error(msg || 'Erro na API DeepSeek')
  } catch (e) {
    clearTimeout(timeout)

    if (e.name === 'AbortError') {
      console.error('[DeepSeek] Timeout 30s')
      return {
        choices: [{ message: { content: 'Timeout na requisição. Tente novamente.' } }],
        model: 'fallback-timeout',
      }
    }

    console.error('[DeepSeek] Erro:', e.message)
    return {
      choices: [{ message: { content: body.fallbackText || 'Oi! Ainda posso te ajudar? 😊' } }],
      model: 'fallback-error',
      error: e.message,
    }
  }
}

export async function askDeepSeek(systemPrompt, messages, maxTokens = 800, model = 'deepseek-reasoner') {
  const data = await deepseekRequest({
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.4,
    max_tokens: maxTokens,
    model,
  })

  if (!data.choices?.[0]?.message?.content) {
    const errMsg = data.error || JSON.stringify(data)
    throw new Error(`DeepSeek: ${errMsg}`)
  }

  return data.choices[0].message.content
}
