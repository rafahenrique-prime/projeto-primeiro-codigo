import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../system-tools.js', import.meta.url),
  'utf8'
)

function paidOcrAllowlistSource() {
  const match = source.match(
    /const OCR_PAID_ALLOWLIST = \[([\s\S]*?)\n\]/
  )
  return match?.[1] || ''
}

describe('system-tools OCR OpenRouter paid allowlist', () => {
  it('keeps Flash Lite and allows explicit Flash precision requests', () => {
    const block = paidOcrAllowlistSource()

    expect(block).toContain("google/gemini-2.5-flash-lite")
    expect(block).toContain("google/gemini-2.5-flash")
  })

  it('still routes OCR through the curated allowlist', () => {
    expect(source).toContain('const curated = curateOcrModels(vision)')
    expect(source).toContain(
      "openrouterChatProxy(req, res, new Set(curated.map(m => m.id)), 'ocr-openrouter')"
    )
  })
})
