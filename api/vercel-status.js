// Status real de deploy do projeto na Vercel, pro card "Vercel" do Dashboard.
// VERCEL_ACCESS_TOKEN fica só aqui no backend — nunca prefixado com VITE_.
// Uso (Functions/transferência) não é exposto pela API da Vercel no plano Hobby
// (confirmado por teste real: "plan_upgrade_required" — só Pro/Enterprise),
// por isso este endpoint não tenta devolver esses números.

const VERCEL_TOKEN = process.env.VERCEL_ACCESS_TOKEN
const PROJECT_ID = 'prj_apJGLxIL6ooCFTCuboQiHwuveOw9'
const TEAM_ID = 'team_O0lVaTLcrP62cKLeTZwclgAq'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (!VERCEL_TOKEN) {
    return res.status(500).json({ error: 'VERCEL_ACCESS_TOKEN não configurado' })
  }

  try {
    const headers = { Authorization: `Bearer ${VERCEL_TOKEN}` }

    const deploysRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=1`,
      { headers }
    )
    if (!deploysRes.ok) {
      return res.status(deploysRes.status).json({ error: 'Falha ao consultar deployments' })
    }
    const { deployments } = await deploysRes.json()
    const latest = deployments?.[0]

    if (!latest) {
      return res.status(200).json({ available: false })
    }

    return res.status(200).json({
      available: true,
      state: latest.readyState,
      createdAt: latest.created,
      branch: latest.meta?.githubCommitRef || null,
      url: latest.url,
      target: latest.target || 'production',
      usageNote: 'Uso detalhado disponível no painel da Vercel',
    })
  } catch (e) {
    console.error('[vercel-status] Erro:', e.message)
    return res.status(500).json({ error: 'Erro interno ao consultar status da Vercel' })
  }
}
