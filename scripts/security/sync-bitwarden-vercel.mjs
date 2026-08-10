// Sincronizador — Bitwarden Secrets Manager → Vercel (projeto IGNITE PRIME).
//
// Escreve na Vercel, sob comando explícito, exatamente 1 secret por
// execução, exatamente 1 ambiente. Nunca sincroniza em massa, nunca
// escolhe ambiente sozinho, nunca imprime valor.
//
// COMPARE (compare-bitwarden-vercel.mjs) continua sendo a única forma
// somente-leitura de auditar o estado — este script é o único capaz de
// escrever, e só faz isso dentro dos limites abaixo.
//
// Uso:
//   node scripts/security/sync-bitwarden-vercel.mjs <SECRET_NAME> development
//   node scripts/security/sync-bitwarden-vercel.mjs <SECRET_NAME> preview
//   node scripts/security/sync-bitwarden-vercel.mjs <SECRET_NAME> production --confirm-production
//
// Categoria B (ver ALLOWLIST_B abaixo) exige também --acknowledge-caution,
// em qualquer ambiente.

import { createInterface } from 'node:readline'
import {
  run,
  carregarTokenBitwarden,
  listarSecretsBitwarden,
  buscarValorBitwarden,
  criarDiretorioIsolado,
  limparDiretorioIsolado,
  listarEnvVercel,
  lerValorVercelIsolado,
  compararValores,
} from './_shared.mjs'

const AMBIENTES_VALIDOS = ['development', 'preview', 'production']

// Uso comum, rotação já é procedimento normal, sem efeito sistêmico se
// algo sair errado — liberado com o fluxo padrão (sem flag extra).
const ALLOWLIST_A = [
  'BAGY_SYNC_SECRET',
  'BAGY_UI_ACTION_SECRET',
  'COBRANCA_FRONTEND_TOKEN',
  'COHERE_API_KEY',
  'GERAR_COBRANCA_SECRET',
  'LYRA_WEBHOOK_SECRET',
  'MCP_LITE_SECRET',
  'PERPLEXITY_API_KEY',
  'QWEN_API_KEY',
  'VITE_DEEPSEEK_API_KEY',
  'VITE_GOOGLE_DRIVE_API_KEY',
  'VITE_GROQ_API_KEY',
  'VITE_GPTMAKER_WORKSPACE',
  'VITE_GPTMAKER_TOKEN',
  'VITE_GPTMAKER_USER_TOKEN',
  'VITE_SUPABASE_KEY',
]

// Blast radius alto se sincronizado errado — exige --acknowledge-caution
// além do fluxo padrão, em qualquer ambiente (não só Production).
const ALLOWLIST_B = [
  'CRON_SECRET',
  'SUPABASE_SECRET_KEY',
  'VERCEL_ACCESS_TOKEN',
  'BASE44_API_KEY',
]

const MAX_TENTATIVAS_ESCRITA = 2
const INTERVALO_RETRY_MS = 2000

function ambienteLabel(ambiente) {
  return { development: 'Development', preview: 'Preview', production: 'Production' }[ambiente] || ambiente
}

function recusar(motivo) {
  console.error(`RECUSADO: ${motivo}`)
  process.exit(1)
}

function parseArgs(argv) {
  const posicionais = argv.filter((a) => !a.startsWith('--'))
  const flags = new Set(argv.filter((a) => a.startsWith('--')))

  const flagsConhecidas = new Set(['--confirm-production', '--acknowledge-caution'])
  for (const f of flags) {
    if (!flagsConhecidas.has(f)) recusar(`flag desconhecida: ${f}`)
  }

  if (posicionais.length !== 2) {
    recusar('uso: node scripts/security/sync-bitwarden-vercel.mjs <SECRET_NAME> <development|preview|production> [--confirm-production] [--acknowledge-caution]')
  }

  const [secretName, ambiente] = posicionais

  if (!AMBIENTES_VALIDOS.includes(ambiente)) {
    recusar(`ambiente inválido: "${ambiente}". Use exatamente um de: ${AMBIENTES_VALIDOS.join(', ')}`)
  }

  const emA = ALLOWLIST_A.includes(secretName)
  const emB = ALLOWLIST_B.includes(secretName)
  if (!emA && !emB) {
    recusar(`"${secretName}" não está na allowlist desta ferramenta (nem categoria A, nem B). Secrets congelados (VITE_BASE44_API_KEY, VITE_GPTMAKER_EMAIL/PASSWORD, VITE_AWS_*) e qualquer secret fora do Bitwarden nunca são liberados aqui.`)
  }

  if (ambiente === 'production' && !flags.has('--confirm-production')) {
    recusar('ambiente production exige a flag --confirm-production.')
  }

  if (emB && !flags.has('--acknowledge-caution')) {
    recusar(`"${secretName}" é categoria B (cuidado especial) — exige a flag --acknowledge-caution em qualquer ambiente.`)
  }

  return { secretName, ambiente, categoria: emB ? 'B' : 'A', confirmProduction: flags.has('--confirm-production') }
}

async function confirmarProductionInterativo(secretName) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    let respondido = false
    rl.question(`Ambiente PRODUCTION — digite exatamente "${secretName}" para confirmar a escrita: `, (resposta) => {
      respondido = true
      rl.close()
      resolve(resposta.trim() === secretName)
    })
    rl.on('close', () => {
      if (!respondido) resolve(false)
    })
  })
}

function escreverNaVercelComRetry(secretName, ambiente, valor) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_ESCRITA; tentativa++) {
    const res = run('vercel', ['env', 'add', secretName, ambiente, '--force', '--yes'], {
      input: valor,
    })
    if (res.status === 0) return true
    if (tentativa < MAX_TENTATIVAS_ESCRITA) {
      const esperarAte = Date.now() + INTERVALO_RETRY_MS
      while (Date.now() < esperarAte) { /* espera síncrona curta e deliberada, sem I/O */ }
    }
  }
  return false
}

function imprimirResumo({ secret, ambiente, antes, escrita, depois, rollback }) {
  console.log('')
  console.log(`SECRET: ${secret}`)
  console.log(`AMBIENTE: ${ambienteLabel(ambiente)}`)
  console.log(`ANTES: ${antes}`)
  console.log(`ESCRITA: ${escrita}`)
  console.log(`DEPOIS: ${depois}`)
  console.log(`ROLLBACK: ${rollback}`)
}

async function main() {
  const { secretName, ambiente, categoria, confirmProduction } = parseArgs(process.argv.slice(2))

  if (ambiente === 'production') {
    const confirmado = await confirmarProductionInterativo(secretName)
    if (!confirmado) {
      recusar('confirmação interativa de Production não bateu com o nome do secret (ou stdin fechado sem resposta) — nenhuma escrita foi tentada.')
    }
  }

  const token = carregarTokenBitwarden()
  const bitwardenPorNome = listarSecretsBitwarden(token)
  const bwId = bitwardenPorNome.get(secretName)
  if (!bwId) {
    recusar(`"${secretName}" não existe no Bitwarden (projeto IGNITE PRIME) — nada a sincronizar.`)
  }

  const cwdIsolado = criarDiretorioIsolado()
  try {
    const vercelPorNome = listarEnvVercel(cwdIsolado)
    const vercelInfo = vercelPorNome.get(secretName)

    if (!vercelInfo || !vercelInfo.targets.has(ambiente)) {
      recusar(`"${secretName}" ainda não existe em ${ambienteLabel(ambiente)} na Vercel. Esta ferramenta sincroniza variáveis já existentes — não cria variáveis novas.`)
    }

    const tipo = vercelInfo.tipoPorTarget.get(ambiente)
    if (tipo === 'sensitive') {
      imprimirResumo({
        secret: secretName, ambiente,
        antes: 'NÃO COMPARÁVEL — VERCEL SENSITIVE/WRITE-ONLY',
        escrita: 'FALHA',
        depois: 'NÃO COMPARÁVEL — VERCEL SENSITIVE/WRITE-ONLY',
        rollback: 'NÃO NECESSÁRIO',
      })
      console.error('\nBLOQUEADO: valor não pode ser lido para captura de rollback seguro (Sensitive/write-only). Operação recusada — nenhuma escrita foi feita.')
      process.exit(1)
    }

    const valorBitwarden = buscarValorBitwarden(token, bwId)
    if (valorBitwarden === null) {
      recusar(`não foi possível ler "${secretName}" do Bitwarden.`)
    }

    const valorAntes = lerValorVercelIsolado(secretName, ambiente, cwdIsolado)
    const antes = valorAntes === null ? 'NÃO COMPARÁVEL' : compararValores(valorBitwarden, valorAntes)

    if (antes === 'IGUAL') {
      imprimirResumo({ secret: secretName, ambiente, antes, escrita: 'NÃO NECESSÁRIA', depois: antes, rollback: 'NÃO NECESSÁRIO' })
      return
    }

    if (antes === 'NÃO COMPARÁVEL') {
      imprimirResumo({ secret: secretName, ambiente, antes, escrita: 'FALHA', depois: antes, rollback: 'NÃO NECESSÁRIO' })
      console.error('\nBLOQUEADO: não foi possível capturar o valor atual em Vercel para permitir rollback seguro — operação recusada.')
      process.exit(1)
    }

    // antes === 'DIFERENTE' — segue pra escrita.
    const escritaOk = escreverNaVercelComRetry(secretName, ambiente, valorBitwarden)
    if (!escritaOk) {
      imprimirResumo({ secret: secretName, ambiente, antes, escrita: 'FALHA', depois: antes, rollback: 'NÃO NECESSÁRIO' })
      process.exit(1)
    }

    const valorDepois = lerValorVercelIsolado(secretName, ambiente, cwdIsolado)
    const depois = valorDepois === null ? 'NÃO COMPARÁVEL' : compararValores(valorBitwarden, valorDepois)

    if (depois === 'IGUAL') {
      imprimirResumo({ secret: secretName, ambiente, antes, escrita: 'SUCESSO', depois, rollback: 'NÃO NECESSÁRIO' })
      return
    }

    // depois !== IGUAL — escreveu mas não bateu. Rollback pro valor anterior.
    const rollbackOk = escreverNaVercelComRetry(secretName, ambiente, valorAntes)
    let rollbackStatus = 'FALHOU'
    if (rollbackOk) {
      const valorPosRollback = lerValorVercelIsolado(secretName, ambiente, cwdIsolado)
      rollbackStatus = valorPosRollback !== null && compararValores(valorAntes, valorPosRollback) === 'IGUAL' ? 'EXECUTADO' : 'FALHOU'
    }

    imprimirResumo({ secret: secretName, ambiente, antes, escrita: 'SUCESSO', depois, rollback: rollbackStatus })
    if (rollbackStatus === 'FALHOU') {
      console.error('\nATENÇÃO: rollback falhou — estado da Vercel pode estar inconsistente. Revisar manualmente antes de qualquer nova tentativa.')
      process.exit(1)
    }
  } finally {
    limparDiretorioIsolado(cwdIsolado)
  }
}

main()
