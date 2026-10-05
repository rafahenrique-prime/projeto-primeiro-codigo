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
    cycle_enabled: false,
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
    cycle_enabled: false,
    supplier: 'MIA',
    canonical_family: 'NEW_BALANCE_2000',
    brand: 'New Balance',
    model: 'New Balance 2000',
    category: 'Tênis',
    folder_id: '1n8lb-YwQitriJbvw7t0ed0YUOoV-KfOy',
    drive_path: '/New balance/Nb 2000',
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
    `${supabaseUrl}/rest/v1/rpc/lab_supplier_drive_state`,
    {
      p_token: scannerToken,
      p_supplier_key: scope.supplier,
      p_canonical_family: scope.canonical_family,
    },
    deps,
  )

  return {
    ok: out.ok && Array.isArray(out.json),
    rows: Array.isArray(out.json) ? out.json : [],
    error_code: out.ok ? null : 'SCANNER_STATE_UNAVAILABLE',
  }
}

export function classifyDiscoveredEntries(entries, stateRows, fingerprints) {
  const state = new Map(
    (stateRows || []).map((row) => [String(row.drive_file_id), row])
  )

  return (entries || []).map((entry) => {
    const current = state.get(String(entry.drive_file_id)) || null
    const fp = fingerprints.get(String(entry.drive_file_id)) || null

    let change_type = 'new'
    if (current) {
      if (!current.content_hash) {
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
      fingerprint: fp,
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
    `${deps.supabaseUrl}/rest/v1/rpc/lab_supplier_drive_finalize`,
    {
      p_token: deps.scannerToken,
      p_supplier_key: scope.supplier,
      p_canonical_family: scope.canonical_family,
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

    results.push({
      ...summary,
      supplier: scope.supplier,
      family: scope.canonical_family,
    })
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
