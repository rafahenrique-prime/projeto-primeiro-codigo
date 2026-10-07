import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

describe('Render LAB API server — startup smoke', () => {
  it('abre a porta antes de qualquer boot opcional', async () => {
    const port = '19123'
    const child = spawn(
      process.execPath,
      ['render-lab-api-server.js'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PORT: port,
          LAB_BOOT_SMOKE_TEST: 'false',
          SUPPLIER_VISION_BOOT_SMOKE: 'false',
          SUPPLIER_DRIVE_SCANNER_BOOT_SMOKE: 'false',
          SUPPLIER_CATALOG_CYCLE_BOOT_SMOKE: 'false',
          SUPPLIER_HOMOLOGATION_HARNESS_BOOT_ENABLED: 'false',
          SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_ENABLED: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(
        `SERVER_START_TIMEOUT stdout=${stdout} stderr=${stderr}`
      )), 8000)
    })

    try {
      await Promise.race([
        new Promise(resolve => {
          const check = chunk => {
            stdout += String(chunk)
            if (stdout.includes(`PRIME LAB API listening on port ${port}`)) {
              child.stdout.off('data', check)
              resolve()
            }
          }
          child.stdout.on('data', check)
        }),
        timeout,
      ])

      expect(stdout).toContain(`PRIME LAB API listening on port ${port}`)
    } finally {
      if (!child.killed) child.kill('SIGTERM')
      await Promise.race([
        once(child, 'exit').catch(() => null),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ])
    }
  }, 10000)
})
