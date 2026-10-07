/**
 * Supplier Drive Scanner V1 — LAB only.
 *
 * V1 homologated scopes only:
 * VIVIAN/MIA x AIR_FORCE_1/NB9060.
 *
 * Discovery uses the public embedded-folder view (no Google secret copied
 * into Render). Every mutation goes through narrow Supabase RPC gates.
 */

import { createHash } from 'node:crypto'

export const SUPPLIER_DRIVE_SCANNER_VERSION = '1.0.0'

export const SCANNER_SCOPES = Object.freeze([
  {
    key: 'VIVIAN_AIR_FORCE_1',
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_AIR_FORCE_1',
    brand: 'Nike',
    model: 'Nike Air Force 1',
    category: 'Tênis',
    folder_id: '1VElIxA4koGFVKgE55acAHyp0WN8Xf0J5',
    drive_path: '/Nike/Nike Air Force',
  },
  {
    key: 'VIVIAN_NB9060',
    supplier: 'VIVIAN',
    canonical_family: 'NEW_BALANCE_9060',
    brand: 'New Balance',
    model: 'New Balance 9060',
    category: 'Tênis',
    folder_id: '1hs07KdoLaV5pbhu6TjRu0tninAFLBb0e',
    drive_path: '/New balance/NB9060',
  },
  {
    key: 'MIA_AIR_FORCE_1',
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_FORCE_1',
    brand: 'Nike',
    model: 'Nike Air Force 1',
    category: 'Tênis',
    folder_id: '1firCTBHbT7eOWepWiFlUboj59JgwiVqO',
    drive_path: '/NIKE/Nike air force',
  },
  {
    key: 'MIA_NB9060',
    supplier: 'MIA',
    canonical_family: 'NEW_BALANCE_9060',
    brand: 'New Balance',
    model: 'New Balance 9060',
    category: 'Tênis',
    folder_id: '1HKvbejvfbonM0JEhiGWsd0R08zhCbpBv',
    drive_path: '/New balance/Nb 9060',
  },
  {
    key: 'VIVIAN_MCQUEEN',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'ALEXANDER_MCQUEEN_OVERSIZED',
    brand: 'Alexander McQueen',
    model: 'Alexander McQueen Oversized',
    category: 'Tênis',
    folder_id: '1mallMj4ThG_paDoRaUi_BL1FQbVfMDih',
    drive_path: '/McQueen 38 ao 43',
  },
  {
    key: 'MIA_MCQUEEN',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'ALEXANDER_MCQUEEN_OVERSIZED',
    brand: 'Alexander McQueen',
    model: 'Alexander McQueen Oversized',
    category: 'Tênis',
    folder_id: '1QPzSVop-kl4tR93pf3Zouh7w3dc2P8z3',
    drive_path: '/Alexander McQueen',
  },
  {
    key: 'VIVIAN_NB1000',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NEW_BALANCE_1000',
    brand: 'New Balance',
    model: 'New Balance 1000',
    category: 'Tênis',
    folder_id: '14ynD95iIaGHvu23LHdLkXLEp7epTnJiM',
    drive_path: '/New balance/NB1000',
  },
  {
    key: 'MIA_NB1000',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NEW_BALANCE_1000',
    brand: 'New Balance',
    model: 'New Balance 1000',
    category: 'Tênis',
    folder_id: '1CYvU5JNx1B8u20jEP3Ht8eaM7-OOf3iV',
    drive_path: '/New balance/Nb 1000',
  },
  {
    key: 'VIVIAN_NB2000',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NEW_BALANCE_2000',
    brand: 'New Balance',
    model: 'New Balance 2000',
    category: 'Tênis',
    folder_id: '18QyKdFW3HjZLUeSLi9C0rPDd0cJHRNfT',
    drive_path: '/New balance/NB2000',
  },
  {
    key: 'MIA_NB2000',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NEW_BALANCE_2000',
    brand: 'New Balance',
    model: 'New Balance 2000',
    category: 'Tênis',
    folder_id: '1n8lb-YwQitriJbvw7t0ed0YUOoV-KfOy',
    drive_path: '/New balance/Nb 2000',
  },
  {
    key: 'VIVIAN_NB530',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NEW_BALANCE_530',
    brand: 'New Balance',
    model: 'New Balance 530',
    category: 'Tênis',
    folder_id: '1JSyRh5EfpoiaU-_7zfOrOmgEXUJbaLRy',
    drive_path: '/New balance/NB530',
  },
  {
    key: 'MIA_NB530',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NEW_BALANCE_530',
    brand: 'New Balance',
    model: 'New Balance 530',
    category: 'Tênis',
    folder_id: '1zZiFpQH8uPAeG9_47CETtSf4XyVNHgle',
    drive_path: '/New balance/NB 530',
  },
  {
    key: 'VIVIAN_NEW_BALANCE_FUELCELL_REBEL_V4',
    cycle_enabled: false,
    supplier: 'VIVIAN',
    canonical_family: 'NEW_BALANCE_FUELCELL_REBEL_V4',
    brand: 'New Balance',
    model: 'New Balance FuelCell Rebel V4',
    category: 'Tênis',
    folder_id: '1bxJDuwgl1LMxaO79FgY-T84OENstX63M',
    drive_path: '/Tênis - New Balance/Fuelcell Rebel V4',
  },
  {
    key: 'VIVIAN_ADIDAS_SAMBA',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'ADIDAS_SAMBA',
    brand: 'Adidas',
    model: 'Adidas Samba',
    category: 'Tênis',
    folder_id: '1L8yAuF9eBxQiiASYAESzkz2wpQ1fpdQD',
    drive_path: '/Adidas/Samba',
  },
  {
    key: 'MIA_ADIDAS_SAMBA',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'ADIDAS_SAMBA',
    brand: 'Adidas',
    model: 'Adidas Samba',
    category: 'Tênis',
    folder_id: '1iFPdBLefpvnSSx3t70cByAQ4N3a7EIh-',
    drive_path: '/ADIDAS/Adidas samba',
  },
  {
    key: 'VIVIAN_ADIDAS_ADI2000',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'ADIDAS_ADI_2000',
    brand: 'Adidas',
    model: 'Adidas Adi 2000',
    category: 'Tênis',
    folder_id: '1d-w9yK7GFn1UjJ-VjGcm7ijYnuhrDmZA',
    drive_path: '/Adidas/Adi 2000',
  },
  {
    key: 'MIA_ADIDAS_ADI2000',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'ADIDAS_ADI_2000',
    brand: 'Adidas',
    model: 'Adidas Adi 2000',
    category: 'Tênis',
    folder_id: '1QnYHdCKOCOht0vbZPiqop_5TC9JFGbQk',
    drive_path: '/ADIDAS/Adidas 2000',
  },
  {
    key: 'VIVIAN_ADIDAS_CAMPUS',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'ADIDAS_CAMPUS',
    brand: 'Adidas',
    model: 'Adidas Campus',
    category: 'Tênis',
    folder_id: '1fJezk1YShvFlJtQXu6zLMfXs_8e6pnZd',
    drive_path: '/Adidas/Campus',
  },
  {
    key: 'MIA_ADIDAS_CAMPUS',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'ADIDAS_CAMPUS',
    brand: 'Adidas',
    model: 'Adidas Campus',
    category: 'Tênis',
    folder_id: '1o_2ycQEQf2ddGXKDXpo4rORiNrrfYbnb',
    drive_path: '/ADIDAS/Adidas campus',
  },
  {
    key: 'VIVIAN_MIZUNO_PROPHECY14',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'MIZUNO_WAVE_PROPHECY_14',
    brand: 'Mizuno',
    model: 'Mizuno Wave Prophecy 14',
    category: 'Tênis',
    folder_id: '11Tex-NcCScjJrZVEQoRRWzTTWoDV53_L',
    drive_path: '/Mizuno pro 14',
  },
  {
    key: 'MIA_MIZUNO_PROPHECY14',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'MIZUNO_WAVE_PROPHECY_14',
    brand: 'Mizuno',
    model: 'Mizuno Wave Prophecy 14',
    category: 'Tênis',
    folder_id: '1az9Is_YZ2wTO4Ws9VLrRlBYaCPxSbjHQ',
    drive_path: '/MIZUNO/Mizuno pro 14',
  },
  {
    key: 'VIVIAN_NIKE_DUNK',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_DUNK',
    brand: 'Nike',
    model: 'Nike Dunk',
    category: 'Tênis',
    folder_id: '1x79nKJUbpuLkz37AlVJUI5O2XitLJ7PP',
    drive_path: '/Nike/Nike Dunk',
  },
  {
    key: 'MIA_NIKE_DUNK_1',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_DUNK',
    brand: 'Nike',
    model: 'Nike Dunk',
    category: 'Tênis',
    folder_id: '1IMNZmL0prqqTVQLVpul2KpEurMIixC1s',
    drive_path: '/NIKE/Nike dunk 1',
  },
  {
    key: 'MIA_NIKE_DUNK_2',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_DUNK',
    brand: 'Nike',
    model: 'Nike Dunk',
    category: 'Tênis',
    folder_id: '1yOvOsJ60h9Ts4A1jnjDNs0OEhYRJkVuW',
    drive_path: '/NIKE/Nike dunk',
  },
  {
    key: 'VIVIAN_NIKE_COURT_BOROUGH',
    cycle_enabled: false,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_COURT_BOROUGH',
    brand: 'Nike',
    model: 'Nike Court Borough',
    category: 'Tênis',
    folder_id: '1sar6MQbNFRV9A72_hVAOqlV8Fv1-axPF',
    drive_path: '/Tênis - Nike/Court Borough',
  },
  {
    key: 'VIVIAN_NIKE_COURT_VISION',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_COURT_VISION',
    brand: 'Nike',
    model: 'Nike Court Vision',
    category: 'Tênis',
    folder_id: '1eciTi8cC2jiVpUSYWqerMmVwlocHSrs3',
    drive_path: '/Nike/Court Vision',
  },
  {
    key: 'MIA_NIKE_COURT_VISION',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_COURT_VISION',
    brand: 'Nike',
    model: 'Nike Court Vision',
    category: 'Tênis',
    folder_id: '1CVOO30487L5Lz4M91URFeQVG_iPy6uaM',
    drive_path: '/NIKE/Nike Court Vision',
  },
  {
    key: 'VIVIAN_NIKE_BAILLELI',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_BAILLELI',
    brand: 'Nike',
    model: 'Nike Bailleli',
    category: 'Tênis',
    folder_id: '16cMQ1r71UzUabAj9P_OvlPetduuHBLLf',
    drive_path: '/Nike/Nike Bailleli',
  },
  {
    key: 'MIA_NIKE_BAILLELI',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_BAILLELI',
    brand: 'Nike',
    model: 'Nike Bailleli',
    category: 'Tênis',
    folder_id: '13hi1d_LysbINJ8L-hTOoQ2N-gGcXJU6b',
    drive_path: '/NIKE/NIKE BAILLELI',
  },
  {
    key: 'VIVIAN_ADIDAS_ADIZERO',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'ADIDAS_ADIZERO',
    brand: 'Adidas',
    model: 'Adidas Adizero',
    category: 'Tênis',
    folder_id: '1QRVksvJUdlXcJyefTxiFbqiifA9vhW88',
    drive_path: '/Adidas/Adizero',
  },
  {
    key: 'MIA_ADIDAS_ADIZERO_1',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'ADIDAS_ADIZERO',
    brand: 'Adidas',
    model: 'Adidas Adizero',
    category: 'Tênis',
    folder_id: '12EnsbWo6tWJ1g60deARNpCupkjgnVhmY',
    drive_path: '/ADIDAS/Adidas adizero',
  },
  {
    key: 'MIA_ADIDAS_ADIZERO_2',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'ADIDAS_ADIZERO',
    brand: 'Adidas',
    model: 'Adidas Adizero',
    category: 'Tênis',
    folder_id: '1OB4QRP73v_zfFsjMP4OvRfWh7_AtA5d8',
    drive_path: '/ADIDAS/Adizero’s',
  },
  {
    key: 'VIVIAN_NIKE_VOMERO_ZOOMX',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_VOMERO',
    brand: 'Nike',
    model: 'Nike Vomero',
    category: 'Tênis',
    folder_id: '1-NnKNKysu8PBWusJ3GgkX3mYarAKzQnB',
    drive_path: '/Nike/Zoom-X Vomero',
  },
  {
    key: 'VIVIAN_NIKE_VOMERO_PREMIUM',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_VOMERO',
    brand: 'Nike',
    model: 'Nike Vomero',
    category: 'Tênis',
    folder_id: '1UvIaSRhIX9HjJcAG2fFJD88MQsuVeX6W',
    drive_path: '/Nike/Vomero Premium',
  },
  {
    key: 'MIA_NIKE_VOMERO',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_VOMERO',
    brand: 'Nike',
    model: 'Nike Vomero',
    category: 'Tênis',
    folder_id: '1ZiVsxdCX95KZcZ-Bk_hKHAchOiqTB9X9',
    drive_path: '/NIKE/Nike vomero',
  },
  {
    key: 'MIA_NIKE_AIR_MAX_DN',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_MAX_DN',
    brand: 'Nike',
    model: 'Nike Air Max DN',
    category: 'Tênis',
    folder_id: '1kVIWDwbqFWi8Kzb6hc_divqM3SaYuEGK',
    drive_path: '/NIKE/Nike DN',
  },
  {
    key: 'MIA_NIKE_AIR_MAX_270',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_MAX_270',
    brand: 'Nike',
    model: 'Nike Air Max 270',
    category: 'Tênis',
    folder_id: '1g5UHL3b3a2Ah-eDrKMY5yx9KV64HXQhO',
    drive_path: '/NIKE/Nike Air Max 270',
  },
  {
    key: 'MIA_NIKE_AIR_MAX_97',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_MAX_97',
    brand: 'Nike',
    model: 'Nike Air Max 97',
    category: 'Tênis',
    folder_id: '1QyCh3Wxrw-3M2mI0KfoFlrO_ZmxuCv6B',
    drive_path: '/NIKE/Nike 97',
  },
  {
    key: 'MIA_NIKE_AIR_MAX_95',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_MAX_95',
    brand: 'Nike',
    model: 'Nike Air Max 95',
    category: 'Tênis',
    folder_id: '1Sl-z2DNzuL5RLyGau6RieYKYYHTgLhZT',
    drive_path: '/NIKE/Nike 95',
  },
  {
    key: 'MIA_NIKE_AIR_MAX_90',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_MAX_90',
    brand: 'Nike',
    model: 'Nike Air Max 90',
    category: 'Tênis',
    folder_id: '1BpoXdM6wjFPPVM1REJqR7BnHcw8xByff',
    drive_path: '/NIKE/Nike Air Max 90',
  },
  {
    key: 'VIVIAN_NIKE_AIR_JORDAN_1_ALTO',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_AIR_JORDAN_1',
    brand: 'Nike',
    model: 'Nike Air Jordan 1',
    category: 'Tênis',
    folder_id: '1RuhbQrS44JQkKVp-OyhH12d6O8MOruhZ',
    drive_path: '/Nike/Jordan Alto',
  },
  {
    key: 'VIVIAN_NIKE_AIR_JORDAN_1_LOW',
    cycle_enabled: true,
    supplier: 'VIVIAN',
    canonical_family: 'NIKE_AIR_JORDAN_1',
    brand: 'Nike',
    model: 'Nike Air Jordan 1',
    category: 'Tênis',
    folder_id: '1weIu77Vgv5KFY6oLE2Ai5Le2Gw12smLJ',
    drive_path: '/Nike/Jordan Low',
  },
  {
    key: 'MIA_NIKE_AIR_JORDAN_1_A',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_JORDAN_1',
    brand: 'Nike',
    model: 'Nike Air Jordan 1',
    category: 'Tênis',
    folder_id: '1FH9ZMCFxuq2dyWgxUIbhpvQ4FwnRxvgl',
    drive_path: '/NIKE/Nike jordan',
  },
  {
    key: 'MIA_NIKE_AIR_JORDAN_1_B',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_JORDAN_1',
    brand: 'Nike',
    model: 'Nike Air Jordan 1',
    category: 'Tênis',
    folder_id: '1MDw8lv0JqbeO8zTm3VXfoy_dmHo1AYit',
    drive_path: '/NIKE/Nike jordan',
  },
  {
    key: 'MIA_NIKE_AIR_JORDAN_3',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_JORDAN_3',
    brand: 'Nike',
    model: 'Nike Air Jordan 3',
    category: 'Tênis',
    folder_id: '1N0V_O47vTIFZfnXUpGebTSChCUwEg9R1',
    drive_path: '/NIKE/Nike jordan 3',
  },
  {
    key: 'MIA_NIKE_AIR_JORDAN_4',
    cycle_enabled: true,
    supplier: 'MIA',
    canonical_family: 'NIKE_AIR_JORDAN_4',
    brand: 'Nike',
    model: 'Nike Air Jordan 4',
    category: 'Tênis',
    folder_id: '1KwZIczcVyhFqM-baVYivENrUgDicjG3F',
    drive_path: '/NIKE/Nike jordan 4',
  },
])

function clean(value) {
  return String(value ?? '').trim()
}

function boundedInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(Math.trunc(n), max))
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

export function embeddedFolderUrl(folderId) {
  const id = clean(folderId)
  if (!id) return null
  return `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}#grid`
}

export function renditionUrl(fileId) {
  const id = clean(fileId)
  if (!id) return null
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`
}

export function parseEmbeddedFolderFileIds(html) {
  const text = String(html ?? '')
  const ids = new Set()

  const patterns = [
    /id=["']entry-([A-Za-z0-9_-]{10,})["']/g,
    /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/g,
    /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]{10,})/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      ids.add(match[1])
    }
  }

  return [...ids]
}

async function fetchText(url, {
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 PRIME-LAB-SCANNER/1.0',
      },
    })
    clearTimeout(timer)

    if (!res?.ok) {
      return {
        ok: false,
        error_code: 'DRIVE_FOLDER_UNAVAILABLE',
        http_status: Number(res?.status) || null,
        text: '',
      }
    }

    return {
      ok: true,
      error_code: null,
      http_status: Number(res.status) || 200,
      text: await res.text(),
    }
  } catch (error) {
    clearTimeout(timer)
    return {
      ok: false,
      error_code:
        error?.name === 'AbortError'
          ? 'DRIVE_FOLDER_TIMEOUT'
          : 'DRIVE_FOLDER_UNAVAILABLE',
      http_status: null,
      text: '',
    }
  }
}

export async function listPublicDriveFolder(scope, deps = {}) {
  const result = await fetchText(
    embeddedFolderUrl(scope.folder_id),
    deps
  )

  if (!result.ok) {
    return {
      ok: false,
      entries: [],
      error_code: result.error_code,
      http_status: result.http_status,
      complete: false,
    }
  }

  const ids = parseEmbeddedFolderFileIds(result.text)
  if (ids.length === 0) {
    return {
      ok: false,
      entries: [],
      error_code: 'DRIVE_FOLDER_PARSE_EMPTY',
      http_status: result.http_status,
      complete: false,
    }
  }

  return {
    ok: true,
    entries: ids.map((id) => ({
      drive_file_id: id,
      drive_url: `https://drive.google.com/file/d/${id}/view`,
      file_name: 'supplier-image',
      mime_type: 'image/unknown',
    })),
    error_code: null,
    http_status: result.http_status,
    complete: true,
  }
}

export async function fingerprintDriveFile(fileId, {
  fetchImpl = fetch,
  timeoutMs = 6000,
} = {}) {
  const url = renditionUrl(fileId)
  if (!url) {
    return {
      ok: false,
      fingerprint: null,
      error_code: 'DRIVE_FILE_ID_MISSING',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let res = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })

    // Some CDNs reject HEAD. Fall back to GET but do not parse the image.
    if (!res?.ok) {
      res = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      })
    }

    clearTimeout(timer)

    if (!res?.ok) {
      return {
        ok: false,
        fingerprint: null,
        error_code: 'DRIVE_FINGERPRINT_UNAVAILABLE',
        http_status: Number(res?.status) || null,
      }
    }

    const etag = clean(res.headers?.get?.('etag'))
    const modified = clean(res.headers?.get?.('last-modified'))
    const length = clean(res.headers?.get?.('content-length'))
    const type = clean(res.headers?.get?.('content-type'))

    const signature = [fileId, etag, modified, length, type]
      .filter(Boolean)
      .join('|')

    return {
      ok: true,
      fingerprint: sha256(signature || fileId),
      mime_type: type.split(';')[0] || 'image/unknown',
      error_code: null,
    }
  } catch (error) {
    clearTimeout(timer)
    return {
      ok: false,
      fingerprint: null,
      error_code:
        error?.name === 'AbortError'
          ? 'DRIVE_FINGERPRINT_TIMEOUT'
          : 'DRIVE_FINGERPRINT_UNAVAILABLE',
    }
  }
}

async function rpc(url, body, {
  publicKey,
  fetchImpl = fetch,
  timeoutMs = 5000,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const json = await res.json().catch(() => null)
    return {
      ok: Boolean(res?.ok),
      status: Number(res?.status) || null,
      json,
    }
  } catch (error) {
    clearTimeout(timer)
    return {
      ok: false,
      status: null,
      json: null,
      error_code:
        error?.name === 'AbortError' ? 'RPC_TIMEOUT' : 'RPC_UNAVAILABLE',
    }
  }
}

export async function fetchScannerState(scope, deps = {}) {
  const { supabaseUrl, publicKey, scannerToken } = deps
  if (!supabaseUrl || !publicKey || !scannerToken) {
    return { ok: false, rows: [], error_code: 'SCANNER_RPC_CONFIG_MISSING' }
  }

  const out = await rpc(
    `${supabaseUrl}/rest/v1/rpc/lab_supplier_drive_state_v2`,
    {
      p_token: scannerToken,
      p_supplier_key: scope.supplier,
      p_canonical_family: scope.canonical_family,
      p_drive_parent_id: scope.folder_id,
    },
    deps,
  )

  return {
    ok: out.ok && Array.isArray(out.json),
    rows: Array.isArray(out.json) ? out.json : [],
    error_code: out.ok ? null : 'SCANNER_STATE_UNAVAILABLE',
  }
}

export function classifyDiscoveredEntries(
  entries,
  stateRows,
  fingerprints,
  { preserveReadySameId = false } = {},
) {
  const state = new Map(
    (stateRows || []).map((row) => [String(row.drive_file_id), row])
  )

  return (entries || []).map((entry) => {
    const current = state.get(String(entry.drive_file_id)) || null
    const fp = fingerprints.get(String(entry.drive_file_id)) || null

    let change_type = 'new'
    let effectiveFingerprint = fp

    if (current) {
      const preserveReady =
        preserveReadySameId &&
        current.analysis_status === 'ready'

      if (preserveReady) {
        effectiveFingerprint = current.content_hash || fp
        change_type =
          current.active === false
            ? 'reactivated'
            : current.content_hash
              ? 'unchanged'
              : 'baseline'
      } else if (!current.content_hash) {
        change_type =
          current.analysis_status === 'ready' &&
          current.visual_color
            ? 'baseline'
            : 'changed'
      } else if (fp && current.content_hash !== fp) {
        change_type = 'changed'
      } else {
        change_type = current.active === false ? 'reactivated' : 'unchanged'
      }
    }

    return {
      ...entry,
      fingerprint: effectiveFingerprint,
      current,
      change_type,
    }
  })
}

async function upsertScannerEntry(scope, item, runId, deps) {
  const out = await rpc(
    `${deps.supabaseUrl}/rest/v1/rpc/lab_supplier_drive_upsert`,
    {
      p_token: deps.scannerToken,
      p_supplier_key: scope.supplier,
      p_drive_file_id: item.drive_file_id,
      p_drive_parent_id: scope.folder_id,
      p_drive_path: scope.drive_path,
      p_drive_url: item.drive_url,
      p_file_name: item.file_name,
      p_mime_type: item.mime_type || 'image/unknown',
      p_content_hash: item.fingerprint,
      p_brand: scope.brand,
      p_canonical_family: scope.canonical_family,
      p_detected_model: scope.model,
      p_category: scope.category,
      p_run_id: runId,
    },
    deps,
  )

  return {
    ok: out.ok && Array.isArray(out.json) && out.json.length > 0,
    row: Array.isArray(out.json) ? out.json[0] || null : null,
  }
}

async function finalizeScannerScope(scope, seenIds, runId, deps) {
  const out = await rpc(
    `${deps.supabaseUrl}/rest/v1/rpc/lab_supplier_drive_finalize_v2`,
    {
      p_token: deps.scannerToken,
      p_supplier_key: scope.supplier,
      p_canonical_family: scope.canonical_family,
      p_drive_parent_id: scope.folder_id,
      p_seen_file_ids: seenIds,
      p_run_id: runId,
    },
    deps,
  )

  const value = Array.isArray(out.json)
    ? out.json[0]
    : out.json

  return {
    ok: out.ok,
    deactivated: Number(value) || 0,
  }
}

async function logScannerRun(scope, summary, runId, deps) {
  return rpc(
    `${deps.supabaseUrl}/rest/v1/rpc/lab_supplier_drive_log_run`,
    {
      p_token: deps.scannerToken,
      p_run_id: runId,
      p_supplier_key: scope.supplier,
      p_status: summary.status,
      p_scanned: summary.scanned,
      p_new: summary.new_count,
      p_changed: summary.changed_count,
      p_unchanged:
        summary.unchanged_count +
        summary.baseline_count +
        summary.reactivated_count,
      p_deactivated: summary.deactivated,
      p_summary: summary,
    },
    deps,
  )
}

export async function scanSupplierDrive(input = {}, deps = {}) {
  const dryRun = input.dry_run !== false
  const maxChanges = boundedInt(input.max_changes, 3, 1, 3)
  const preserveReadySameId = input.preserve_ready_same_id === true
  const requestedKeys = Array.isArray(input.scope_keys)
    ? new Set(input.scope_keys.map(String))
    : null

  const scopes = SCANNER_SCOPES.filter(
    (scope) => !requestedKeys || requestedKeys.has(scope.key)
  )

  if (scopes.length === 0) {
    return {
      ok: false,
      error_code: 'SCANNER_SCOPE_EMPTY',
      dry_run: dryRun,
      scopes: [],
    }
  }

  let remainingChanges = maxChanges
  const results = []

  for (const scope of scopes) {
    const runId =
      `drive-scan-v1-${Date.now()}-${scope.key.toLowerCase()}`

    const listing = await listPublicDriveFolder(scope, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.driveTimeoutMs,
    })

    if (!listing.ok) {
      results.push({
        key: scope.key,
        supplier: scope.supplier,
        family: scope.canonical_family,
        status: 'failed',
        error_code: listing.error_code,
        scanned: 0,
      })
      continue
    }

    const state = await fetchScannerState(scope, deps)
    if (!state.ok) {
      results.push({
        key: scope.key,
        supplier: scope.supplier,
        family: scope.canonical_family,
        status: 'failed',
        error_code: state.error_code,
        scanned: listing.entries.length,
      })
      continue
    }

    const fingerprints = new Map()
    for (const entry of listing.entries) {
      const fp = await fingerprintDriveFile(entry.drive_file_id, {
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.fingerprintTimeoutMs,
      })
      if (fp.ok) {
        fingerprints.set(entry.drive_file_id, fp.fingerprint)
        entry.mime_type = fp.mime_type || entry.mime_type
      }
    }

    const classified = classifyDiscoveredEntries(
      listing.entries,
      state.rows,
      fingerprints,
      { preserveReadySameId },
    )

    const summary = {
      key: scope.key,
      status: 'completed',
      dry_run: dryRun,
      scanned: classified.length,
      new_count: classified.filter(x => x.change_type === 'new').length,
      changed_count: classified.filter(x => x.change_type === 'changed').length,
      baseline_count: classified.filter(x => x.change_type === 'baseline').length,
      reactivated_count: classified.filter(x => x.change_type === 'reactivated').length,
      unchanged_count: classified.filter(x => x.change_type === 'unchanged').length,
      selected_for_pending: 0,
      deferred_changes: 0,
      write_failures: 0,
      deactivated: 0,
      parse_complete: listing.complete,
    }
    let selectedDriveFileIds = []

    if (!dryRun) {
      const started = await logScannerRun(
        scope,
        {
          ...summary,
          status: 'running',
        },
        runId,
        deps,
      )

      if (!started.ok) {
        summary.status = 'failed'
        summary.write_failures = 1
        results.push({
          ...summary,
          supplier: scope.supplier,
          family: scope.canonical_family,
          error_code: 'SCANNER_RUN_START_FAILED',
        })
        continue
      }
      const priority = classified.filter(
        x => x.change_type === 'new' || x.change_type === 'changed'
      )
      const selected = new Set(
        priority
          .slice(0, remainingChanges)
          .map(x => x.drive_file_id)
      )

      summary.selected_for_pending = selected.size
      summary.deferred_changes = Math.max(0, priority.length - selected.size)
      selectedDriveFileIds = [...selected]
      remainingChanges -= selected.size

      // Always baseline/refresh existing rows. Only new/changed rows selected
      // by the global safety budget are allowed to enter pending.
      for (const item of classified) {
        const safeExisting =
          item.change_type === 'baseline' ||
          item.change_type === 'unchanged' ||
          item.change_type === 'reactivated'

        if (!safeExisting && !selected.has(item.drive_file_id)) {
          continue
        }

        const upserted = await upsertScannerEntry(scope, item, runId, deps)
        if (!upserted.ok) {
          summary.write_failures += 1
          summary.status = 'partial'
        }
      }

      if (listing.complete && summary.write_failures === 0) {
        const finalized = await finalizeScannerScope(
          scope,
          classified.map(x => x.drive_file_id),
          runId,
          deps,
        )
        if (finalized.ok) {
          summary.deactivated = finalized.deactivated
        } else {
          summary.status = 'partial'
        }
      }

      const finished = await logScannerRun(scope, summary, runId, deps)
      if (!finished.ok) {
        summary.status = 'partial'
        summary.write_failures += 1
      }
    }

    const resultRow = {
      ...summary,
      supplier: scope.supplier,
      family: scope.canonical_family,
    }
    Object.defineProperty(resultRow, '_selected_drive_file_ids', {
      value: selectedDriveFileIds,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    results.push(resultRow)
  }

  return {
    ok: results.every(x => x.status !== 'failed' && x.write_failures === 0),
    scanner_version: SUPPLIER_DRIVE_SCANNER_VERSION,
    dry_run: dryRun,
    max_changes: maxChanges,
    remaining_change_budget: remainingChanges,
    scopes: results,
    side_effects: {
      supplier_shadow_write: !dryRun,
      vision_call: false,
      gptmaker_call: false,
      customer_message: false,
      gaby_official: false,
    },
  }
}
