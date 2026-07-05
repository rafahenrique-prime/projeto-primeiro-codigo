// Recebe o token do GPTMaker via bookmarklet e atualiza VITE_GPTMAKER_USER_TOKEN
// em .env.local de TODAS as worktrees ativas (main + worktrees).
// Uso: node token-receiver.js  (fica escutando na porta 5180)

import express from 'express'
import cors from 'cors'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import net from 'net'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = 5180
const VAR_NAME = 'VITE_GPTMAKER_USER_TOKEN'
const SCAN_RANGE = [5170, 5210]

function checkPort(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(300, () => { socket.destroy(); resolve(false) })
  })
}

async function isPortActive(port) {
  const [v4, v6] = await Promise.all([checkPort(port, '127.0.0.1'), checkPort(port, '::1')])
  return v4 || v6
}

async function scanActivePorts() {
  const [from, to] = SCAN_RANGE
  const checks = []
  for (let p = from; p <= to; p++) checks.push(isPortActive(p).then((ok) => (ok ? p : null)))
  const results = await Promise.all(checks)
  return results.filter((p) => p && p !== PORT)
}

function listWorktrees() {
  const out = execSync('git worktree list --porcelain', { cwd: import.meta.dirname }).toString()
  return out
    .split('\n\n')
    .map((block) => block.match(/^worktree (.+)$/m)?.[1])
    .filter(Boolean)
}

function updateEnvLocal(envPath, token) {
  let content = ''
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8')
  }
  const line = `${VAR_NAME}=${token}`
  if (content.match(new RegExp(`^${VAR_NAME}=.*$`, 'm'))) {
    content = content.replace(new RegExp(`^${VAR_NAME}=.*$`, 'm'), line)
  } else {
    content = content.trim() + (content.trim() ? '\n' : '') + line + '\n'
  }
  fs.writeFileSync(envPath, content)
}

app.post('/update-token', (req, res) => {
  const { token } = req.body
  if (!token || typeof token !== 'string' || token.length < 10) {
    return res.status(400).json({ error: 'Token inválido' })
  }

  const worktrees = listWorktrees()
  const updated = []
  const failed = []

  for (const wt of worktrees) {
    const envPath = path.join(wt, '.env.local')
    try {
      updateEnvLocal(envPath, token)
      updated.push(wt)
    } catch (err) {
      failed.push({ wt, error: err.message })
    }
  }

  console.log(`[token-receiver] Atualizado em ${updated.length} pasta(s):`, updated)
  if (failed.length) console.error('[token-receiver] Falhas:', failed)

  res.json({ ok: true, updated, failed })
})

app.get('/active-ports', async (req, res) => {
  const ports = await scanActivePorts()
  res.json({ ports })
})

app.listen(PORT, () => {
  console.log(`[token-receiver] Escutando em http://localhost:${PORT}`)
  console.log('[token-receiver] Aguardando o bookmarklet enviar o token...')
})
