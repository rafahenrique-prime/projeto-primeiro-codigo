/**
 * Supplier Catalog Cycle V1 — LAB only.
 *
 * Orquestra, com limite global:
 * 1) Drive Scanner (1 mudança por escopo, rotação diária)
 * 2) Vision Worker (até o mesmo limite)
 * 3) ledger persistente no Supabase
 *
 * Nunca chama GPTMaker, nunca envia mensagem e nunca toca GABY OFICIAL.
 */

import {
  SCANNER_SCOPES,
  scanSupplierDrive,
} from './_supplierDriveScanner.js'

import {
  DEFAULT_VISION_MODEL,
  resolveRenderLabVisionProxyUrl,
  runSupplierVisionWorker,
  prepareSupplierGateLedgerReuse,
  runSupplierGateLedgerReuseWorker,
} from './_supplierVisionWorker.js'

export const SUPPLIER_CATALOG_CYCLE_VERSION = '1.0.0'

function clean(value) {
  return String(value ?? '').trim()
}

function clampChanges(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 3
  return Math.max(1, Math.min(Math.trunc(n), 3))
}

function dateFromCycleKey(cycleKey) {
  const match = clean(cycleKey).match(/\d{4}-\d{2}-\d{2}/)
  if (match) return match[0]
  return new Date().toISOString().slice(0, 10)
}

export function rotatedScopeKeys(cycleKey) {
  const enabledScopes = SCANNER_SCOPES.filter(
    (scope) => scope.cycle_enabled !== false
  )
  const date = dateFromCycleKey(cycleKey)
  const day = Math.floor(
    Date.parse(`${date}T00:00:00Z`) / 86400000
  )

  const start = ((day % enabledScopes.length) + enabledScopes.length)
    % enabledScopes.length

  return [
    ...enabledScopes.slice(start),
    ...enabledScopes.slice(0, start),
  ].map((scope) => scope.key)
}

async function postRpc(name, body, deps) {
  const {
    supabaseUrl,
    publicKey,
    fetchImpl = fetch,
    rpcTimeoutMs = 5000,
  } = deps

  if (!supabaseUrl || !publicKey) {
    return {
      ok: false,
      status: null,
      json: null,
      error_code: 'CYCLE_RPC_CONFIG_MISSING',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), rpcTimeoutMs)

  try {
    const res = await fetchImpl(
      `${supabaseUrl}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        headers: {
          apikey: publicKey,
          Authorization: `Bearer ${publicKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    )

    clearTimeout(timer)
    const json = await res.json().catch(() => null)

    return {
      ok: Boolean(res?.ok),
      status: Number(res?.status) || null,
      json,
      error_code: res?.ok ? null : 'CYCLE_RPC_UNAVAILABLE',
    }
  } catch (error) {
    clearTimeout(timer)
    return {
      ok: false,
      status: null,
      json: null,
      error_code:
        error?.name === 'AbortError'
          ? 'CYCLE_RPC_TIMEOUT'
          : 'CYCLE_RPC_UNAVAILABLE',
    }
  }
}

export async function startCatalogCycle(input, deps) {
  const out = await postRpc(
    'lab_supplier_cycle_start',
    {
      p_token: deps.cycleToken,
      p_cycle_key: input.cycle_key,
      p_trigger: input.trigger,
      p_max_changes: input.max_changes,
      p_scope_order: input.scope_order,
    },
    deps,
  )

  const row = Array.isArray(out.json) ? out.json[0] || null : null
  if (!out.ok || !row) {
    return {
      ok: false,
      error_code: out.error_code || 'CYCLE_START_FAILED',
    }
  }

  return {
    ok: true,
    run_id: row.run_id,
    accepted: row.accepted === true,
    status: row.status,
    error_code: null,
  }
}

export async function finishCatalogCycle(runId, summary, deps) {
  const out = await postRpc(
    'lab_supplier_cycle_finish',
    {
      p_token: deps.cycleToken,
      p_run_id: runId,
      p_status: summary.status,
      p_scanner_summary: summary.scanner,
      p_vision_summary: summary.vision,
      p_vision_ready_count: summary.vision_ready_count,
      p_vision_review_count: summary.vision_review_count,
      p_vision_error_count: summary.vision_error_count,
      p_vision_cost_usd: summary.vision_cost_usd,
      p_error_code: summary.error_code,
    },
    deps,
  )

  const value = Array.isArray(out.json) ? out.json[0] : out.json
  return {
    ok: out.ok && value === true,
    error_code: out.ok && value === true
      ? null
      : 'CYCLE_FINISH_FAILED',
  }
}

export async function runSupplierCatalogCycle(input = {}, deps = {}) {
  const maxChanges = clampChanges(input.max_changes)
  const cycleKey =
    clean(input.cycle_key) ||
    `supplier-cycle-v1:${new Date().toISOString().slice(0, 10)}`
  const trigger = clean(input.trigger) || 'manual'
  const requestedScopes = Array.isArray(input.scope_keys)
    ? input.scope_keys.map(String)
    : null
  const driveFileIdsProvided = input.drive_file_ids != null
  const requestedDriveFileIds = Array.isArray(input.drive_file_ids)
    ? input.drive_file_ids.map(clean)
    : null
  const driveFileIdsInvalid = driveFileIdsProvided && (
    !Array.isArray(input.drive_file_ids) ||
    requestedDriveFileIds.length === 0 ||
    requestedDriveFileIds.length > maxChanges ||
    requestedDriveFileIds.length > 3 ||
    new Set(requestedDriveFileIds).size !== requestedDriveFileIds.length ||
    requestedDriveFileIds.some(id => !/^[A-Za-z0-9_-]{10,}$/.test(id))
  )

  const allowedScopeKeys = new Set(SCANNER_SCOPES.map((scope) => scope.key))
  if (
    requestedScopes &&
    requestedScopes.some((key) => !allowedScopeKeys.has(key))
  ) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      error_code: 'CYCLE_SCOPE_INVALID',
    }
  }

  const scopeOrder =
    requestedScopes && requestedScopes.length > 0
      ? requestedScopes
      : rotatedScopeKeys(cycleKey)

  const manualSingleScope =
    trigger === 'manual_homologation' &&
    requestedScopes?.length === 1
  const reuseGateLedger = input.reuse_gate_ledger === true
  const reuseOptionInvalid =
    input.reuse_gate_ledger !== undefined &&
    typeof input.reuse_gate_ledger !== 'boolean'
  const reuseMaxChangesInvalid =
    reuseGateLedger &&
    input.max_changes != null &&
    (
      !Number.isInteger(Number(input.max_changes)) ||
      Number(input.max_changes) < 1 ||
      Number(input.max_changes) > 3
    )

  if (reuseMaxChangesInvalid) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      error_code: 'CYCLE_GATE_LEDGER_REUSE_MAX_CHANGES_INVALID',
    }
  }

  if (reuseOptionInvalid) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      error_code: 'CYCLE_GATE_LEDGER_REUSE_OPTION_INVALID',
    }
  }

  if (
    reuseGateLedger &&
    (
      !manualSingleScope ||
      requestedDriveFileIds === null ||
      driveFileIdsInvalid
    )
  ) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      error_code: 'CYCLE_GATE_LEDGER_REUSE_REQUIRES_MANUAL_SCOPE_AND_EXPLICIT_IDS',
    }
  }

  const gateReuseScope = reuseGateLedger
    ? SCANNER_SCOPES.find(scope => scope.key === requestedScopes[0]) || null
    : null
  if (reuseGateLedger && !gateReuseScope) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      error_code: 'CYCLE_GATE_LEDGER_REUSE_SCOPE_INVALID',
    }
  }

  if (
    driveFileIdsProvided &&
    (!manualSingleScope || driveFileIdsInvalid)
  ) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      error_code: 'CYCLE_DRIVE_FILE_IDS_INVALID',
    }
  }

  const manualScopedBatch =
    manualSingleScope &&
    (maxChanges > 1 || requestedDriveFileIds !== null)

  if (
    !deps.supabaseUrl ||
    !deps.publicKey ||
    !deps.scannerToken ||
    !deps.workerToken ||
    !deps.cycleToken
  ) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      error_code: 'CYCLE_CONFIG_MISSING',
    }
  }

  const startFn = deps.startFn || startCatalogCycle
  const finishFn = deps.finishFn || finishCatalogCycle
  const scannerFn = deps.scannerFn || scanSupplierDrive
  const visionFn = deps.visionFn || runSupplierVisionWorker

  const started = await startFn({
    cycle_key: cycleKey,
    trigger,
    max_changes: maxChanges,
    scope_order: scopeOrder,
  }, deps)

  if (!started.ok) {
    return {
      ok: false,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      error_code: started.error_code || 'CYCLE_START_FAILED',
    }
  }

  if (!started.accepted) {
    return {
      ok: true,
      duplicate: true,
      cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
      cycle_key: cycleKey,
      run_id: started.run_id,
      status: started.status,
      max_changes: maxChanges,
      scope_order: scopeOrder,
      side_effects: {
        scanner_run: false,
        vision_run: false,
        gptmaker_call: false,
        customer_message: false,
        gaby_official: false,
      },
    }
  }

  let gateReusePreflight = { prepared: [], processed: [] }
  let gateReuseDriveFileIds = []
  if (reuseGateLedger) {
    const scopeContext = {
      supplier: gateReuseScope.supplier,
      brand: gateReuseScope.brand,
      canonical_family: gateReuseScope.canonical_family,
      model: gateReuseScope.model,
      category: gateReuseScope.category,
    }
    gateReusePreflight = await (
      deps.gateLedgerPreflightFn || prepareSupplierGateLedgerReuse
    )({
      drive_file_ids: requestedDriveFileIds,
      scope_key: gateReuseScope.key,
      scope_context: scopeContext,
    }, {
      supabaseUrl: deps.supabaseUrl,
      publicKey: deps.publicKey,
      cycleToken: deps.cycleToken,
      fetchImpl: deps.fetchImpl,
      rpcTimeoutMs: deps.rpcTimeoutMs,
      visionTimeoutMs: deps.visionTimeoutMs,
      visionProxyUrl: resolveRenderLabVisionProxyUrl(),
      visionModel: DEFAULT_VISION_MODEL,
    })
    gateReuseDriveFileIds = Array.isArray(gateReusePreflight?.prepared)
      ? gateReusePreflight.prepared
          .map(item => clean(item?.drive_file_id))
          .filter(Boolean)
      : []
    const requestedIdSet = new Set(requestedDriveFileIds)
    const hasInvalidPreparedSelection =
      new Set(gateReuseDriveFileIds).size !== gateReuseDriveFileIds.length ||
      gateReuseDriveFileIds.some(id => !requestedIdSet.has(id))
    if (hasInvalidPreparedSelection) {
      gateReuseDriveFileIds = []
      gateReusePreflight = {
        prepared: [],
        processed: requestedDriveFileIds.map(id => ({
          drive_file_id: id,
          status: 'error',
          persisted: false,
          error_code: 'GATE_LEDGER_REUSE_PREFLIGHT_ID_MISMATCH',
          source: 'gate_ledger',
          reused: false,
          current_vision_cost_usd: 0,
          usage: { cost_usd: 0 },
          audit: {
            drive_file_id: id,
            validation_status: 'ERROR',
            validation_error_code: 'GATE_LEDGER_REUSE_PREFLIGHT_ID_MISMATCH',
            cost_usd: 0,
            source: 'gate_ledger',
            reused: false,
            current_vision_cost_usd: 0,
          },
        })),
        error_code: 'GATE_LEDGER_REUSE_PREFLIGHT_ID_MISMATCH',
      }
    }
  }
  const scannerDriveFileIds = reuseGateLedger
    ? gateReuseDriveFileIds
    : requestedDriveFileIds

  const scannerRuns = []
  const selectedDriveFileIds = []
  let selectedTotal = 0
  let scannerFailed = false

  for (const scopeKey of scopeOrder) {
    if (selectedTotal >= maxChanges) break
    if (reuseGateLedger && scannerDriveFileIds.length === 0) break

    const scan = await scannerFn({
      dry_run: false,
      max_changes: manualScopedBatch
        ? Math.max(1, maxChanges - selectedTotal)
        : 1,
      scope_keys: [scopeKey],
      preserve_ready_same_id: manualSingleScope,
      ...(scannerDriveFileIds !== null
        ? { drive_file_ids: scannerDriveFileIds }
        : {}),
    }, {
      supabaseUrl: deps.supabaseUrl,
      publicKey: deps.publicKey,
      scannerToken: deps.scannerToken,
      fetchImpl: deps.fetchImpl,
      driveTimeoutMs: deps.driveTimeoutMs,
      fingerprintTimeoutMs: deps.fingerprintTimeoutMs,
      timeoutMs: deps.rpcTimeoutMs,
    })

    const scope = scan?.scopes?.[0] || null
    const selected = Number(scope?.selected_for_pending) || 0
    const selectedIds = Array.isArray(scope?._selected_drive_file_ids)
      ? scope._selected_drive_file_ids.map(clean).filter(Boolean)
      : []
    selectedTotal += selected
    if (manualScopedBatch) {
      selectedDriveFileIds.push(...selectedIds)
    }

    scannerRuns.push({
      key: scopeKey,
      ...(scannerDriveFileIds !== null
        ? {
            requested_drive_file_ids: scannerDriveFileIds,
            selected_drive_file_ids: selectedIds,
          }
        : {}),
      ok: scan?.ok === true,
      status: scope?.status || null,
      scanned: Number(scope?.scanned) || 0,
      new_count: Number(scope?.new_count) || 0,
      changed_count: Number(scope?.changed_count) || 0,
      baseline_count: Number(scope?.baseline_count) || 0,
      unchanged_count: Number(scope?.unchanged_count) || 0,
      reactivated_count: Number(scope?.reactivated_count) || 0,
      selected_for_pending: selected,
      deferred_changes: Number(scope?.deferred_changes) || 0,
      deactivated: Number(scope?.deactivated) || 0,
      write_failures: Number(scope?.write_failures) || 0,
      error_code: scope?.error_code || scan?.error_code || null,
    })

    if (scan?.ok !== true) {
      scannerFailed = true
    }
  }

  const selectedOutsideRequestedIds =
    scannerDriveFileIds !== null &&
    selectedDriveFileIds.some(id => !scannerDriveFileIds.includes(id))
  const scopedSelectionMismatch =
    manualScopedBatch &&
    selectedTotal > 0 &&
    (
      selectedDriveFileIds.length !== selectedTotal ||
      selectedOutsideRequestedIds
    )
  const selectedDriveFileIdSet = new Set(selectedDriveFileIds)
  const gateReuseSelectionMismatch =
    reuseGateLedger &&
    gateReuseDriveFileIds.length > 0 &&
    (
      scannerFailed ||
      selectedTotal !== gateReuseDriveFileIds.length ||
      selectedDriveFileIds.length !== gateReuseDriveFileIds.length ||
      selectedDriveFileIdSet.size !== gateReuseDriveFileIds.length ||
      gateReuseDriveFileIds.some(id => !selectedDriveFileIdSet.has(id))
    )

  let vision = null
  if (gateReuseSelectionMismatch) {
    const errorCode = scannerFailed
      ? 'GATE_LEDGER_REUSE_SCANNER_FAILED'
      : 'GATE_LEDGER_REUSE_SELECTION_MISMATCH'
    vision = {
      ok: false,
      queued: 0,
      processed: gateReuseDriveFileIds.map(id => ({
        drive_file_id: id,
        status: 'error',
        persisted: false,
        error_code: errorCode,
        source: 'gate_ledger',
        reused: false,
        image_sha256: null,
        execution_identity_sha256: null,
        validation_status: 'ERROR',
        confidence: null,
        original_gate_cost_usd: null,
        current_vision_cost_usd: 0,
        usage: { cost_usd: 0 },
        audit: {
          drive_file_id: id,
          validation_status: 'ERROR',
          validation_error_code: errorCode,
          cost_usd: 0,
          source: 'gate_ledger',
          reused: false,
          current_vision_cost_usd: 0,
        },
      })),
      error_code: errorCode,
    }
  } else if (reuseGateLedger && gateReuseDriveFileIds.length === 0) {
    vision = {
      ok: false,
      queued: 0,
      processed: Array.isArray(gateReusePreflight?.processed)
        ? gateReusePreflight.processed
        : requestedDriveFileIds.map(id => ({
            drive_file_id: id,
            status: 'error',
            persisted: false,
            error_code: 'GATE_LEDGER_REUSE_PREFLIGHT_FAILED',
            source: 'gate_ledger',
            reused: false,
            current_vision_cost_usd: 0,
            usage: { cost_usd: 0 },
            audit: {
              drive_file_id: id,
              validation_status: 'ERROR',
              validation_error_code: 'GATE_LEDGER_REUSE_PREFLIGHT_FAILED',
              cost_usd: 0,
              source: 'gate_ledger',
              reused: false,
              current_vision_cost_usd: 0,
            },
          })),
      error_code: gateReusePreflight?.error_code || 'GATE_LEDGER_REUSE_INCOMPLETE',
    }
  } else if (!reuseGateLedger && manualScopedBatch && selectedTotal === 0) {
    vision = {
      ok: true,
      queued: 0,
      processed: [],
    }
  } else if (scopedSelectionMismatch) {
    vision = {
      ok: false,
      queued: 0,
      processed: [],
      error_code: 'CYCLE_SCOPED_SELECTION_MISMATCH',
    }
  } else if (reuseGateLedger) {
    vision = await (deps.gateLedgerReuseFn || runSupplierGateLedgerReuseWorker)({
      limit: selectedTotal,
      dry_run: false,
      drive_file_ids: selectedDriveFileIds,
      prepared_entries: gateReusePreflight.prepared,
      scope_key: gateReuseScope.key,
      scope_context: {
        supplier: gateReuseScope.supplier,
        brand: gateReuseScope.brand,
        canonical_family: gateReuseScope.canonical_family,
        model: gateReuseScope.model,
        category: gateReuseScope.category,
      },
    }, {
      supabaseUrl: deps.supabaseUrl,
      publicKey: deps.publicKey,
      workerToken: deps.workerToken,
      cycleToken: deps.cycleToken,
      fetchImpl: deps.fetchImpl,
      rpcTimeoutMs: deps.rpcTimeoutMs,
      visionTimeoutMs: deps.visionTimeoutMs,
      visionProxyUrl: resolveRenderLabVisionProxyUrl(),
      visionModel: DEFAULT_VISION_MODEL,
    })
  } else {
    vision = await visionFn({
      limit: manualScopedBatch ? selectedTotal : maxChanges,
      dry_run: false,
      ...(manualScopedBatch
        ? { drive_file_ids: selectedDriveFileIds }
        : {}),
    }, {
      supabaseUrl: deps.supabaseUrl,
      publicKey: deps.publicKey,
      workerToken: deps.workerToken,
      fetchImpl: deps.fetchImpl,
      rpcTimeoutMs: deps.rpcTimeoutMs,
      visionTimeoutMs: deps.visionTimeoutMs,
      visionProxyUrl: resolveRenderLabVisionProxyUrl(),
      visionModel: DEFAULT_VISION_MODEL,
      visionProxySecret: deps.visionProxySecret,
    })
  }

  if (reuseGateLedger && gateReuseDriveFileIds.length > 0) {
    const processedById = new Map()
    for (const item of [
      ...(Array.isArray(gateReusePreflight?.processed)
        ? gateReusePreflight.processed
        : []),
      ...(Array.isArray(vision?.processed) ? vision.processed : []),
    ]) {
      const id = clean(item?.drive_file_id || item?.audit?.drive_file_id)
      if (id) processedById.set(id, item)
    }
    const processedForAuthorizedIds = requestedDriveFileIds.map(id =>
      processedById.get(id) || {
        drive_file_id: id,
        status: 'error',
        persisted: false,
        error_code: 'GATE_LEDGER_REUSE_RESULT_MISSING',
        source: 'gate_ledger',
        reused: false,
        current_vision_cost_usd: 0,
        usage: { cost_usd: 0 },
        audit: {
          drive_file_id: id,
          validation_status: 'ERROR',
          validation_error_code: 'GATE_LEDGER_REUSE_RESULT_MISSING',
          cost_usd: 0,
          source: 'gate_ledger',
          reused: false,
          current_vision_cost_usd: 0,
        },
      }
    )
    const allReuseItemsSucceeded = processedForAuthorizedIds.every(item =>
      item.status === 'ready' && item.persisted === true
    )
    vision = {
      ...vision,
      ok: vision?.ok === true &&
        (gateReusePreflight?.processed || []).length === 0 &&
        allReuseItemsSucceeded,
      processed: processedForAuthorizedIds,
    }
  }

  const processed = Array.isArray(vision?.processed)
    ? vision.processed
    : []

  const readyCount = processed.filter(
    (item) => item.status === 'ready' && item.persisted === true
  ).length

  const reviewCount = processed.filter(
    (item) => item.status === 'review' && item.persisted === true
  ).length

  const errorCount = processed.filter(
    (item) => item.status === 'error' || item.persisted === false
  ).length

  const costUsd = processed.reduce(
    (sum, item) => sum + (
      typeof item?.usage?.cost_usd === 'number' &&
      Number.isFinite(item.usage.cost_usd)
        ? item.usage.cost_usd
        : typeof item?.audit?.cost_usd === 'number' &&
            Number.isFinite(item.audit.cost_usd)
          ? item.audit.cost_usd
          : 0
    ),
    0,
  )

  const status =
    scannerFailed || vision?.ok !== true || errorCount > 0
      ? 'partial'
      : 'completed'

  const summary = {
    status,
    scanner: {
      selected_total: selectedTotal,
      runs: scannerRuns,
    },
    vision: {
      ok: vision?.ok === true,
      queued: Number(vision?.queued) || 0,
      processed: processed.map((item) => ({
        drive_file_id:
          item.drive_file_id || item.audit?.drive_file_id || null,
        supplier: item.supplier || null,
        family: item.family || null,
        color: item.color || null,
        confidence: item.confidence ?? null,
        status: item.status || null,
        persisted: item.persisted === true,
        error_code: item.error_code || null,
        cost_usd:
          typeof item?.usage?.cost_usd === 'number' &&
          Number.isFinite(item.usage.cost_usd)
            ? item.usage.cost_usd
            : typeof item?.audit?.cost_usd === 'number' &&
                Number.isFinite(item.audit.cost_usd)
              ? item.audit.cost_usd
              : null,
        audit: item.audit || null,
        ...(reuseGateLedger
          ? {
              source: item.source || 'gate_ledger',
              reused: item.reused === true,
              gate_ledger_id:
                item.gate_ledger_id || item.audit?.gate_ledger_id || null,
              image_sha256:
                item.image_sha256 || item.audit?.image_sha256 || null,
              execution_identity_sha256:
                item.execution_identity_sha256 ||
                item.audit?.execution_identity?.sha256 ||
                null,
              validation_status:
                item.validation_status || item.audit?.validation_status || null,
              original_gate_cost_usd:
                item.original_gate_cost_usd ??
                item.audit?.original_gate_cost_usd ??
                null,
              current_vision_cost_usd:
                item.current_vision_cost_usd ??
                item.audit?.current_vision_cost_usd ??
                0,
            }
          : {}),
      })),
    },
    vision_ready_count: readyCount,
    vision_review_count: reviewCount,
    vision_error_count: errorCount,
    vision_cost_usd: costUsd,
    error_code:
      status === 'partial'
        ? 'CYCLE_PARTIAL'
        : null,
  }

  const finished = await finishFn(started.run_id, summary, deps)

  return {
    ok: status === 'completed' && finished.ok,
    duplicate: false,
    cycle_version: SUPPLIER_CATALOG_CYCLE_VERSION,
    cycle_key: cycleKey,
    run_id: started.run_id,
    status: finished.ok ? status : 'partial',
    max_changes: maxChanges,
    scope_order: scopeOrder,
    scanner: summary.scanner,
    vision: summary.vision,
    totals: {
      selected_for_pending: selectedTotal,
      ready: readyCount,
      review: reviewCount,
      error: errorCount,
      cost_usd: costUsd,
    },
    error_code:
      finished.ok
        ? summary.error_code
        : 'CYCLE_FINISH_FAILED',
    side_effects: {
      supplier_shadow_write: reuseGateLedger
        ? processed.some(item => item.persisted === true)
        : true,
      vision_call: !reuseGateLedger,
      cycle_ledger_write: true,
      ...(reuseGateLedger ? { gate_ledger_reuse: true } : {}),
      gptmaker_call: false,
      customer_message: false,
      gaby_official: false,
    },
  }
}
