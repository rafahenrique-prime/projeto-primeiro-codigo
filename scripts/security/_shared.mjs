// Funções compartilhadas entre compare-bitwarden-vercel.mjs e
// sync-bitwarden-vercel.mjs. Sem lógica de decisão — só plumbing de baixo
// nível pra falar com o Bitwarden (somente leitura) e com a Vercel
// (leitura isolada + escrita explícita, usada só pelo sync).
//
// Nunca imprime valor de secret. Nunca escreve no Bitwarden.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const BITWARDEN_PROJECT_ID = '2e125f4c-bb8c-4b20-955b-b4a200966806'

export function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (res.error) throw res.error
  return res
}

export function carregarTokenBitwarden() {
  const res = run('security', ['find-generic-password', '-a', process.env.USER, '-s', 'BWS_ACCESS_TOKEN', '-w'])
  if (res.status !== 0) {
    throw new Error('Não foi possível ler BWS_ACCESS_TOKEN do macOS Keychain.')
  }
  return res.stdout.trim()
}

export function listarSecretsBitwarden(token) {
  const res = run('bws', ['secret', 'list', BITWARDEN_PROJECT_ID, '--output', 'json'], {
    env: { ...process.env, BWS_ACCESS_TOKEN: token },
  })
  if (res.status !== 0) {
    throw new Error(`Falha ao listar secrets no Bitwarden: ${res.stderr}`)
  }
  const lista = JSON.parse(res.stdout)
  const porNome = new Map()
  for (const s of lista) porNome.set(s.key, s.id)
  return porNome
}

export function buscarValorBitwarden(token, secretId) {
  const res = run('bws', ['secret', 'get', secretId, '--output', 'json'], {
    env: { ...process.env, BWS_ACCESS_TOKEN: token },
  })
  if (res.status !== 0) return null
  const obj = JSON.parse(res.stdout)
  return typeof obj.value === 'string' ? obj.value : null
}

// Diretório temporário do sistema (fora do repositório), contendo só uma
// CÓPIA de .vercel/project.json — o suficiente pra CLI da Vercel
// identificar o projeto, sem nenhum .env/.env.local por perto pra
// contaminar `vercel env run` (comportamento real observado — ver
// comentário no topo de compare-bitwarden-vercel.mjs).
export function criarDiretorioIsolado() {
  const dir = mkdtempSync(join(tmpdir(), 'bw-vercel-'))
  mkdirSync(join(dir, '.vercel'))
  copyFileSync(join(process.cwd(), '.vercel', 'project.json'), join(dir, '.vercel', 'project.json'))
  return dir
}

export function limparDiretorioIsolado(dir) {
  rmSync(dir, { recursive: true, force: true })
}

// nome -> { targets: Set<string>, tipoPorTarget: Map<string,string> }
export function listarEnvVercel(cwdIsolado) {
  const res = run('vercel', ['env', 'ls', '-F', 'json'], { cwd: cwdIsolado })
  if (res.status !== 0) {
    throw new Error(`Falha ao listar env vars da Vercel: ${res.stderr}`)
  }
  const start = res.stdout.indexOf('{')
  const data = JSON.parse(res.stdout.slice(start))
  const envs = data.envs || data.data || []
  const porNome = new Map()
  for (const e of envs) {
    if (!porNome.has(e.key)) porNome.set(e.key, { targets: new Set(), tipoPorTarget: new Map() })
    const entry = porNome.get(e.key)
    for (const t of e.target || []) {
      entry.targets.add(t)
      entry.tipoPorTarget.set(t, e.type)
    }
  }
  return porNome
}

// Lê o valor REAL de uma env var na Vercel, isolado (sem .env/.env.local).
// Retorna a string (só em memória, nunca impressa pelo chamador) ou `null`
// se a variável não existir/vier vazia nesse ambiente. NUNCA chamar para
// uma entrada type=sensitive — o valor jamais é entregue à CLI local,
// mesmo isolada (por desenho da própria Vercel), então a chamada só
// desperdiçaria tempo; quem decide isso é o chamador, checando `tipo` antes.
export function lerValorVercelIsolado(nomeVar, ambiente, cwdIsolado) {
  const scriptInline = `process.stdout.write('<<<VALUE>>>' + (process.env.${nomeVar} || '') + '<<<END>>>')`
  const res = run('vercel', ['env', 'run', '-e', ambiente, '--', 'node', '-e', scriptInline], { cwd: cwdIsolado })
  if (res.status !== 0) return null
  const match = /<<<VALUE>>>([\s\S]*?)<<<END>>>/.exec(res.stdout)
  if (!match) return null
  const valor = match[1]
  return valor === '' ? null : valor
}

// Comparação booleana simples — nunca loga nenhum dos dois valores.
export function compararValores(a, b) {
  return a === b ? 'IGUAL' : 'DIFERENTE'
}
