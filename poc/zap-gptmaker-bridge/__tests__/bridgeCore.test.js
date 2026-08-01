// PRIME Bridge — testes de bridgeCore.js (POC 2A, extração estrutural)
//
// Objetivo destes testes: provar que bridgeCore.js pode ser importado com
// segurança em qualquer ambiente (incluindo uma futura Vercel Function),
// sem nenhum dos efeitos colaterais que existiam em server.mjs. Não
// duplica os 25 testes de handleIncoming já cobertos por
// server.integration.test.js — esses continuam sendo a fonte de verdade
// do comportamento funcional (inalterados por esta extração).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('bridgeCore.js — import seguro, sem efeitos colaterais', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Limpa todas as variáveis relevantes da Bridge antes de cada teste,
    // sem tocar em outras variáveis do ambiente de teste (ex. as do Vitest).
    for (const key of [
      'AGENT_ID', 'GPT_TOKEN', 'ZAPI_INSTANCE_ID', 'ZAPI_TOKEN', 'ZAPI_BASE_URL',
      'GPTMAKER_BASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SECRET_KEY',
      'LIVE_MODE', 'EXTERNAL_TIMEOUT_MS', 'SUPABASE_TIMEOUT_MS',
      'IGNITE_PRIME_URL', 'NEXT_PUBLIC_VERCEL_URL', 'BRIDGE_TOOLS_SECRET', 'IGNITE_TOOLS_TIMEOUT_MS',
      'WEBHOOK_PATH_SECRET',
    ]) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('importa sem lançar e sem chamar process.exit, mesmo com zero variáveis de ambiente configuradas', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit NÃO deveria ser chamado pelo import de bridgeCore.js')
    })

    await expect(import('../bridgeCore.js')).resolves.toBeDefined()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('não faz nenhuma chamada de rede (fetch) só por ser importado', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await import('../bridgeCore.js')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('não cria nenhum servidor HTTP (não exporta nem instancia http.createServer)', async () => {
    const mod = await import('../bridgeCore.js')
    expect(mod.server).toBeUndefined()
    expect(mod.default).toBeUndefined()
  })

  it('getBridgeConfig() com ambiente vazio não lança e devolve valores seguros (undefined/default), nunca falha', async () => {
    const { getBridgeConfig } = await import('../bridgeCore.js')
    const config = getBridgeConfig({})

    expect(config.AGENT_ID).toBeUndefined()
    expect(config.GPT_TOKEN).toBeUndefined()
    expect(config.LIVE_MODE).toBe(false)
    expect(config.ZAPI_BASE_URL).toBe('https://api.zap-api.tech/v1')
    expect(config.GPTMAKER_BASE_URL).toBe('https://api.gptmaker.ai')
    expect(config.EXTERNAL_TIMEOUT_MS).toBe(10000)
    expect(config.SUPABASE_TIMEOUT_MS).toBe(3000)
    expect(config.IGNITE_TOOLS_TIMEOUT_MS).toBe(8000)
  })

  it('validateRequiredEnv() nunca lança e nunca chama process.exit — só reporta o que falta', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit NÃO deveria ser chamado por validateRequiredEnv')
    })
    const { getBridgeConfig, validateRequiredEnv } = await import('../bridgeCore.js')

    const config = getBridgeConfig({})
    const result = validateRequiredEnv(config)

    expect(exitSpy).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.missing.map((m) => m.key)).toEqual(
      expect.arrayContaining(['AGENT_ID', 'GPT_TOKEN', 'ZAPI_INSTANCE_ID', 'ZAPI_TOKEN'])
    )
    // LIVE_MODE=false (default sem env) — Supabase não deveria ser exigido
    expect(result.missing.map((m) => m.key)).not.toContain('SUPABASE_URL')
    expect(result.missing.map((m) => m.key)).not.toContain('SUPABASE_SECRET_KEY')
  })

  it('validateRequiredEnv() exige Supabase somente quando LIVE_MODE=true', async () => {
    const { getBridgeConfig, validateRequiredEnv } = await import('../bridgeCore.js')

    const config = getBridgeConfig({
      AGENT_ID: 'a', GPT_TOKEN: 'b', ZAPI_INSTANCE_ID: 'c', ZAPI_TOKEN: 'd',
      LIVE_MODE: 'true',
    })
    const result = validateRequiredEnv(config)

    expect(result.ok).toBe(false)
    expect(result.missing.map((m) => m.key)).toEqual(
      expect.arrayContaining(['SUPABASE_URL', 'SUPABASE_SECRET_KEY'])
    )
  })

  it('validateRequiredEnv() ok=true quando tudo obrigatório está presente', async () => {
    const { getBridgeConfig, validateRequiredEnv } = await import('../bridgeCore.js')

    const config = getBridgeConfig({
      AGENT_ID: 'a', GPT_TOKEN: 'b', ZAPI_INSTANCE_ID: 'c', ZAPI_TOKEN: 'd',
      LIVE_MODE: 'true', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'k',
    })
    const result = validateRequiredEnv(config)

    expect(result).toEqual({ ok: true, missing: [] })
  })
})

describe('bridgeCore.js — handleIncoming com config injetada (sem process.env real)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('LIVE_MODE=false via deps.config: não chama GPTMaker nem ZAP-API, nunca toca rede', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { handleIncoming, getBridgeConfig } = await import('../bridgeCore.js')

    const config = getBridgeConfig({
      AGENT_ID: 'a', GPT_TOKEN: 'b', ZAPI_INSTANCE_ID: 'c', ZAPI_TOKEN: 'd',
      LIVE_MODE: 'false',
    })

    await handleIncoming(
      {
        event: 'message.received',
        data: { messageId: 'bridgecore-test-1', phone: '5534999999999', type: 'text', body: 'oi' },
      },
      { config }
    )

    expect(fetchSpy).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
