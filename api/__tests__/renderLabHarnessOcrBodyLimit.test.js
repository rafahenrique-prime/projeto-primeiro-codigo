import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../../render-lab-api-server.js', import.meta.url),
  'utf8'
)

describe('Render LAB — body limit do proxy OCR do Harness', () => {
  it('mantém limite ampliado apenas na rota OCR protegida', () => {
    expect(source).toContain("express.json({ limit: '12mb' })")
    expect(source).toContain("express.json({ limit: '256kb' })")

    const proxyIndex = source.indexOf("'/api/supplier-harness-ocr-proxy'")
    const largeParserIndex = source.indexOf("express.json({ limit: '12mb' })")
    const globalParserIndex = source.indexOf("app.use(express.json({ limit: '256kb' }))")

    expect(proxyIndex).toBeGreaterThanOrEqual(0)
    expect(largeParserIndex).toBeGreaterThanOrEqual(0)
    expect(globalParserIndex).toBeGreaterThanOrEqual(0)
    expect(largeParserIndex).toBeLessThan(globalParserIndex)
    expect(proxyIndex).toBeLessThan(globalParserIndex)
  })
})
