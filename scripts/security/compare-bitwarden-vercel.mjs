// Comparador READ-ONLY: Bitwarden Secrets Manager × Vercel (projeto IGNITE PRIME).
//
// Não escreve, não sincroniza, não cria/edita/apaga nada em nenhum dos dois
// lados. Só compara se o valor de cada secret já migrado bate entre as duas
// fontes — nunca imprime o valor, tamanho, prefixo, hash ou qualquer derivado.
//
// IMPORTANTE: `vercel env run` mistura .env/.env.local do diretório de
// trabalho com o que baixa da nuvem (comportamento real observado, diverge
// da documentação oficial) — por isso toda leitura roda isolada, num
// diretório temporário do sistema (fora do repositório) contendo só uma
// cópia de .vercel/project.json, nunca os .env* reais. Além disso, secrets
// marcados "sensitive" na Vercel nunca são entregues a nenhuma CLI local
// (nem isolada) — o comparador checa o campo `type` antes de tentar ler e
// nunca tenta contornar isso.
//
// Uso: node scripts/security/compare-bitwarden-vercel.mjs

import { spawnSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BITWARDEN_PROJECT_ID = '2e125f4c-bb8c-4b20-955b-b4a200966806'

// Escopo fixo — só os secrets já confirmados presentes nos dois lados na
// auditoria anterior. Não calcular interseção dinamicamente: variáveis
// órfãs/legado/Sensitive/em investigação (VITE_BASE44_API_KEY,
// VITE_GPTMAKER_EMAIL/PASSWORD, VITE_AWS_*, as 7 Sensitive, etc.) ficam
// fora de propósito, mesmo que apareçam nos dois lados no futuro.
const SECRETS_ESCOPO = [
  'BAGY_SYNC_SECRET',
  'BAGY_UI_ACTION_SECRET',
  'BASE44_API_KEY',
  'COBRANCA_FRONTEND_TOKEN',
  'COHERE_API_KEY',
  'CRON_SECRET',
  'GERAR_COBRANCA_SECRET',
  'LYRA_WEBHOOK_SECRET',
  'MCP_LITE_SECRET',
  'PERPLEXITY_API_KEY',
  'QWEN_API_KEY',
  'SUPABASE_SECRET_KEY',
  'VERCEL_ACCESS_TOKEN',
  'VITE_DEEPSEEK_API_KEY',
  'VITE_GOOGLE_DRIVE_API_KEY',
  'VITE_GPTMAKER_TOKEN',
  'VITE_GPTMAKER_USER_TOKEN',
  'VITE_GROQ_API_KEY',
  'VITE_SUPABASE_KEY',
  'VITE_GPTMAKER_WORKSPACE',
]

// Ordem de prioridade pra escolher qual ambiente da Vercel usar na
// comparação, quando o secret existe em mais de um.
const PRIORIDADE_AMBIENTE = ['production', 'preview', 'development']

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (res.error) throw res.error
  return res
}

function carregarTokenBitwarden() {
  const res = run('security', ['find-generic-password', '-a', process.env.USER, '-s', 'BWS_ACCESS_TOKEN', '-w'])
  if (res.status !== 0) {
    throw new Error('Não foi possível ler BWS_ACCESS_TOKEN do macOS Keychain.')
  }
  return res.stdout.trim()
}

function listarSecretsBitwarden(token) {
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

function buscarValorBitwarden(token, secretId) {
  const res = run('bws', ['secret', 'get', secretId, '--output', 'json'], {
    env: { ...process.env, BWS_ACCESS_TOKEN: token },
  })
  if (res.status !== 0) return null
  const obj = JSON.parse(res.stdout)
  return typeof obj.value === 'string' ? obj.value : null
}

// Cria um diretório temporário do sistema (fora do repositório), contendo
// só uma CÓPIA de .vercel/project.json — o suficiente pra CLI da Vercel
// identificar o projeto, sem nenhum .env/.env.local por perto pra
// contaminar `vercel env run`.
function criarDiretorioIsolado() {
  const dir = mkdtempSync(join(tmpdir(), 'bw-vercel-compare-'))
  mkdirSync(join(dir, '.vercel'))
  copyFileSync(join(process.cwd(), '.vercel', 'project.json'), join(dir, '.vercel', 'project.json'))
  return dir
}

function listarEnvVercel(cwdIsolado) {
  const res = run('vercel', ['env', 'ls', '-F', 'json'], { cwd: cwdIsolado })
  if (res.status !== 0) {
    throw new Error(`Falha ao listar env vars da Vercel: ${res.stderr}`)
  }
  const start = res.stdout.indexOf('{')
  const data = JSON.parse(res.stdout.slice(start))
  const envs = data.envs || data.data || []
  // nome -> { targets: Set<string>, tipoPorTarget: Map<string,string> }
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

// Compara o valor do Bitwarden contra o valor real injetado pela Vercel
// naquele ambiente, sem nunca imprimir nenhum dos dois. Roda isolado (cwd
// sem .env/.env.local) e nunca tenta ler um ambiente marcado "sensitive" —
// esse tipo nunca é entregue a nenhuma CLI local, isolada ou não, por
// desenho da própria Vercel.
function compararComVercel(valorBitwarden, nomeVar, ambiente, tipo, cwdIsolado) {
  if (tipo === 'sensitive') {
    return 'NÃO COMPARÁVEL — VERCEL SENSITIVE/WRITE-ONLY'
  }

  const scriptInline = `
    const a = process.env.__BW_COMPARE_VALUE__
    const b = process.env.${nomeVar}
    if (b === undefined || b === '') process.exit(3)
    else if (a === b) process.exit(0)
    else process.exit(1)
  `
  const res = run('vercel', ['env', 'run', '-e', ambiente, '--', 'node', '-e', scriptInline], {
    cwd: cwdIsolado,
    env: { ...process.env, __BW_COMPARE_VALUE__: valorBitwarden },
  })
  switch (res.status) {
    case 0: return 'IGUAL'
    case 1: return 'DIFERENTE'
    case 3: return 'NÃO COMPARÁVEL — VERCEL SENSITIVE/WRITE-ONLY'
    default: return 'NÃO COMPARÁVEL'
  }
}

function main() {
  console.log('Comparador READ-ONLY — Bitwarden × Vercel (IGNITE PRIME)\n')
  console.log('Nenhum valor será exibido. Nenhuma escrita será feita em nenhum dos dois lados.')
  console.log('Leituras da Vercel rodam isoladas (sem .env/.env.local) e nunca tentam ler valores "sensitive".\n')

  const token = carregarTokenBitwarden()
  const bitwardenPorNome = listarSecretsBitwarden(token)

  const cwdIsolado = criarDiretorioIsolado()
  let vercelPorNome
  try {
    vercelPorNome = listarEnvVercel(cwdIsolado)

    const linhas = []
    const contagem = { IGUAL: 0, DIFERENTE: 0, AUSENTE: 0, 'NÃO COMPARÁVEL': 0 }

    for (const nome of SECRETS_ESCOPO) {
      const bwId = bitwardenPorNome.get(nome)
      const bitwardenExiste = Boolean(bwId)
      const vercelInfo = vercelPorNome.get(nome)
      const vercelExiste = Boolean(vercelInfo)

      let ambienteEscolhido = null
      let tipoEscolhido = null
      let ambientesTexto = '-'
      let comparacao = 'AUSENTE'

      if (vercelExiste) {
        const ambientesDisponiveis = [...vercelInfo.targets]
        ambientesTexto = ambientesDisponiveis.join(', ')
        ambienteEscolhido = PRIORIDADE_AMBIENTE.find((a) => vercelInfo.targets.has(a)) || ambientesDisponiveis[0]
        tipoEscolhido = vercelInfo.tipoPorTarget.get(ambienteEscolhido)
      }

      if (!bitwardenExiste || !vercelExiste) {
        comparacao = 'AUSENTE'
      } else {
        const valorBw = buscarValorBitwarden(token, bwId)
        if (valorBw === null) {
          comparacao = 'NÃO COMPARÁVEL'
        } else {
          comparacao = compararComVercel(valorBw, nome, ambienteEscolhido, tipoEscolhido, cwdIsolado)
        }
      }

      if (comparacao.startsWith('NÃO COMPARÁVEL')) contagem['NÃO COMPARÁVEL']++
      else contagem[comparacao] = (contagem[comparacao] || 0) + 1

      linhas.push({
        nome,
        bitwarden: bitwardenExiste ? 'EXISTE' : 'AUSENTE',
        vercel: vercelExiste ? 'EXISTE' : 'AUSENTE',
        ambiente: ambientesTexto,
        ambienteComparado: ambienteEscolhido || '-',
        tipo: tipoEscolhido || '-',
        comparacao,
      })
    }

    for (const l of linhas) {
      console.log(l.nome)
      console.log(`  Bitwarden: ${l.bitwarden}`)
      console.log(`  Vercel: ${l.vercel}`)
      console.log(`  Ambiente Vercel: ${l.ambiente}`)
      console.log(`  Ambiente comparado: ${l.ambienteComparado} (type: ${l.tipo})`)
      console.log(`  Comparação: ${l.comparacao}`)
      console.log('')
    }

    console.log('--- Resumo ---')
    console.log(`IGUAIS: ${contagem.IGUAL || 0}`)
    console.log(`DIFERENTES: ${contagem.DIFERENTE || 0}`)
    console.log(`AUSENTES: ${contagem.AUSENTE || 0}`)
    console.log(`NÃO COMPARÁVEIS: ${contagem['NÃO COMPARÁVEL'] || 0}`)

    if (contagem.DIFERENTE > 0) {
      console.log('\n⚠️  Foram encontradas divergências. Nenhuma correção foi feita — revisar manualmente.')
    }
  } finally {
    rmSync(cwdIsolado, { recursive: true, force: true })
  }
}

main()
