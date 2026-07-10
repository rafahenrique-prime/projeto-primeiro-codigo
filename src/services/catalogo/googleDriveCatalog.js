// Catálogo Rascunho — lê fotos direto de uma pasta do Google Drive (marca > modelo > imagens)
// Não toca no catálogo oficial (Supabase) — é só uma visão rápida pra testar procura no WhatsApp.

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files'
const CACHE_KEY = 'draft_catalog_cache_v1'
export const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutos — só indicativo, o refresh é sempre manual

function getApiKey() {
  return import.meta.env.VITE_GOOGLE_DRIVE_API_KEY
}

function getFolderId() {
  return import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
}

export function isDriveConfigured() {
  return Boolean(getApiKey() && getFolderId())
}

export function imgUrl(fileId) {
  return `https://lh3.googleusercontent.com/d/${fileId}=w400`
}

export function imgUrlFull(fileId) {
  return `https://lh3.googleusercontent.com/d/${fileId}=w1600`
}

export function clearCachedCatalog() {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

async function listFolderChildren(folderId, apiKey) {
  const files = []
  let pageToken = ''
  while (true) {
    const q = `'${folderId}' in parents and trashed=false`
    const url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,mimeType),nextPageToken')}&pageSize=1000&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `Drive API respondeu ${res.status}`)
    }
    const data = await res.json()
    files.push(...(data.files || []))
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return files
}

function cleanName(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim()
}

// Monta a árvore: pasta raiz -> subpastas de marca -> subpastas de modelo (ou imagens direto na marca)
// onProgress(feitas, total) — chamado a cada pasta de marca processada, pra mostrar % no painel.
export async function buildProductTree(onProgress) {
  const apiKey = getApiKey()
  const folderId = getFolderId()
  if (!apiKey || !folderId) throw new Error('Google Drive não configurado — veja .env.local')

  const brandFolders = (await listFolderChildren(folderId, apiKey))
    .filter(f => f.mimeType === 'application/vnd.google-apps.folder')

  const products = []
  let done = 0

  for (const brand of brandFolders) {
    const items = await listFolderChildren(brand.id, apiKey)
    const subfolders = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
    const directImages = items.filter(f => f.mimeType.startsWith('image/'))

    if (directImages.length > 0) {
      products.push({
        id: brand.id,
        brand: brand.name,
        model: brand.name,
        images: directImages.map(f => ({ id: f.id, name: f.name })),
      })
    }

    for (const modelFolder of subfolders) {
      const images = (await listFolderChildren(modelFolder.id, apiKey))
        .filter(f => f.mimeType.startsWith('image/'))
      if (images.length === 0) continue
      products.push({
        id: modelFolder.id,
        brand: brand.name,
        model: cleanName(modelFolder.name),
        images: images.map(f => ({ id: f.id, name: f.name })),
      })
    }

    done++
    onProgress?.(done, brandFolders.length)
  }

  return products
}

export function getCachedCatalog() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setCachedCatalog(products) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), products }))
  } catch {}
}
