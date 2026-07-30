// Status real do repositório GitHub pro Operations Center — repositório é
// público (confirmado: api.github.com/repos/... responde 200 sem token), então
// consulta direta à API pública, sem servidor, sem segredo, sem nova Serverless
// Function. Cache client-side best-effort (mesmo padrão do vercelStatusService).

const GITHUB_REPO = 'rafahenrique-prime/projeto-primeiro-codigo'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`

let cached = null
let lastFetchTime = 0
const CACHE_DURATION = 10 * 60 * 1000

export async function getGithubStatus(force = false) {
  const now = Date.now()
  if (!force && cached && (now - lastFetchTime) < CACHE_DURATION) return cached

  try {
    const repoRes = await fetch(GITHUB_API)
    if (!repoRes.ok) {
      const result = { available: false, errorCode: `GITHUB_HTTP_${repoRes.status}`, lastChecked: new Date().toISOString() }
      cached = result
      lastFetchTime = now
      return result
    }
    const repo = await repoRes.json()
    const branch = repo.default_branch

    const commitRes = await fetch(`${GITHUB_API}/commits/${branch}`)
    let lastCommit = null
    if (commitRes.ok) {
      const commit = await commitRes.json()
      lastCommit = {
        sha: commit.sha?.slice(0, 7) || null,
        date: commit.commit?.author?.date || null,
        message: commit.commit?.message?.split('\n')[0] || null,
      }
    }

    const result = {
      available: true,
      branch,
      lastCommit,
      lastChecked: new Date().toISOString(),
    }
    cached = result
    lastFetchTime = now
    return result
  } catch (e) {
    console.error('[GithubStatus] Erro:', e.message)
    const result = { available: false, errorCode: 'GITHUB_CLIENT_ERROR', lastChecked: new Date().toISOString() }
    cached = result
    lastFetchTime = now
    return result
  }
}
