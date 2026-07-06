// Script único (roda no seu terminal, nunca no navegador) — corrige o compartilhamento
// de todos os arquivos/subpastas dentro da pasta do Catálogo Rascunho, deixando
// "Qualquer pessoa com o link" (Leitor) em cada um, recursivamente.
//
// Uso: node scripts/fix-drive-permissions.mjs
// Vai abrir uma URL de login do Google — você precisa logar e clicar "Permitir" uma vez.

import 'dotenv/config'
import http from 'node:http'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// dotenv já carrega .env por padrão; carregamos .env.local também (mesmo padrão do resto do projeto)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envLocalPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET
const ROOT_FOLDER_ID = process.env.VITE_GOOGLE_DRIVE_FOLDER_ID
const PORT = 8765
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`

if (!CLIENT_ID || !CLIENT_SECRET || !ROOT_FOLDER_ID) {
  console.error('Faltam GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / VITE_GOOGLE_DRIVE_FOLDER_ID no .env.local')
  process.exit(1)
}

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  exec(`${cmd} "${url}"`)
}

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      if (url.pathname !== '/oauth2callback') { res.end(); return }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      if (error) {
        res.end(`<h2>Autorização negada (${error}). Pode fechar essa aba.</h2>`)
        server.close()
        reject(new Error(error))
        return
      }
      res.end('<h2>✅ Autorizado! Pode fechar essa aba e voltar pro terminal.</h2>')
      server.close()
      resolve(code)
    })
    server.listen(PORT, () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive',
        access_type: 'offline',
        prompt: 'consent',
      })
      console.log('\nAbrindo o navegador para você autorizar o acesso ao Google Drive...')
      console.log('Se não abrir sozinho, copie e cole esta URL no navegador:\n')
      console.log(authUrl.toString())
      console.log('')
      openInBrowser(authUrl.toString())
    })
  })
}

async function exchangeCodeForToken(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Falha ao trocar código por token')
  return data.access_token
}

async function driveFetch(url, accessToken, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Drive API respondeu ${res.status}`)
  }
  return res.json()
}

async function listChildren(folderId, accessToken) {
  const files = []
  let pageToken = ''
  while (true) {
    const q = `'${folderId}' in parents and trashed=false`
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,mimeType),nextPageToken')}&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`
    const data = await driveFetch(url, accessToken)
    files.push(...(data.files || []))
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return files
}

async function makePublic(fileId, accessToken) {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
}

async function walkAndFix(folderId, accessToken, stats) {
  await makePublic(folderId, accessToken)
  stats.folders++
  const children = await listChildren(folderId, accessToken)
  for (const child of children) {
    if (child.mimeType === 'application/vnd.google-apps.folder') {
      await walkAndFix(child.id, accessToken, stats)
    } else {
      try {
        await makePublic(child.id, accessToken)
        stats.files++
        process.stdout.write(`\r✅ ${stats.files} arquivos + ${stats.folders} pastas corrigidos...`)
      } catch (e) {
        stats.errors.push(`${child.name}: ${e.message}`)
      }
    }
  }
}

async function main() {
  const code = await waitForAuthCode()
  console.log('Código recebido, trocando por token de acesso...')
  const accessToken = await exchangeCodeForToken(code)
  console.log('Autenticado! Corrigindo permissões recursivamente (isso pode levar alguns minutos)...\n')

  const stats = { folders: 0, files: 0, errors: [] }
  await walkAndFix(ROOT_FOLDER_ID, accessToken, stats)

  console.log(`\n\n🎉 Concluído: ${stats.files} arquivos e ${stats.folders} pastas agora estão "Qualquer pessoa com o link".`)
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  ${stats.errors.length} erro(s):`)
    stats.errors.forEach(e => console.log(`  - ${e}`))
  }
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message)
  process.exit(1)
})
