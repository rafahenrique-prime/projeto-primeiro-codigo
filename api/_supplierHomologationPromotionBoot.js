function clean(value) {
  return String(value ?? '').trim()
}

export function isSupplierHomologationPromotionBootEnabled(env = process.env) {
  return clean(env.SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_ENABLED)
    .toLowerCase() === 'true'
}

export function parseSupplierHomologationPromotionBootInput(env = process.env) {
  const raw = clean(env.SUPPLIER_HOMOLOGATION_PROMOTION_BOOT_INPUT)
  if (!raw) {
    return { ok: false, error: 'PROMOTION_BOOT_INPUT_MISSING', input: null }
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'PROMOTION_BOOT_INPUT_INVALID', input: null }
    }

    const runKey = clean(parsed.run_key)
    const scopeKey = clean(parsed.scope_key)
    const requestedMaxChanges = Number(parsed.max_changes ?? 1)

    if (!runKey) {
      return { ok: false, error: 'PROMOTION_BOOT_RUN_KEY_REQUIRED', input: null }
    }
    if (runKey.length > 120) {
      return { ok: false, error: 'PROMOTION_BOOT_RUN_KEY_TOO_LONG', input: null }
    }
    if (!scopeKey) {
      return { ok: false, error: 'PROMOTION_BOOT_SCOPE_KEY_REQUIRED', input: null }
    }
    if (scopeKey.length > 160) {
      return { ok: false, error: 'PROMOTION_BOOT_SCOPE_KEY_TOO_LONG', input: null }
    }
    if (
      !Number.isInteger(requestedMaxChanges) ||
      requestedMaxChanges < 1 ||
      requestedMaxChanges > 3
    ) {
      return { ok: false, error: 'PROMOTION_BOOT_MAX_CHANGES_INVALID', input: null }
    }

    return {
      ok: true,
      error: null,
      input: {
        run_key: runKey,
        scope_key: scopeKey,
        max_changes: requestedMaxChanges,
        cycle_key: `supplier-cycle-homologation:${runKey}`,
      },
    }
  } catch {
    return {
      ok: false,
      error: 'PROMOTION_BOOT_INPUT_INVALID_JSON',
      input: null,
    }
  }
}

export async function runSupplierHomologationPromotionBoot({
  env = process.env,
  fetchImpl = fetch,
  baseUrl,
  logger = console,
} = {}) {
  if (!isSupplierHomologationPromotionBootEnabled(env)) {
    return {
      ok: true,
      skipped: true,
      reason: 'PROMOTION_BOOT_DISABLED',
    }
  }

  const parsed = parseSupplierHomologationPromotionBootInput(env)
  if (!parsed.ok) {
    logger.log(JSON.stringify({
      event: 'SUPPLIER_HOMOLOGATION_PROMOTION_BOOT',
      run_key: null,
      scope_key: null,
      ok: false,
      error: parsed.error,
    }))
    return {
      ok: false,
      skipped: false,
      error: parsed.error,
    }
  }

  const token = clean(env.SUPPLIER_CATALOG_CYCLE_TOKEN)
  if (!token) {
    logger.log(JSON.stringify({
      event: 'SUPPLIER_HOMOLOGATION_PROMOTION_BOOT',
      run_key: parsed.input.run_key,
      scope_key: parsed.input.scope_key,
      ok: false,
      error: 'PROMOTION_CYCLE_TOKEN_MISSING',
    }))
    return {
      ok: false,
      skipped: false,
      error: 'PROMOTION_CYCLE_TOKEN_MISSING',
    }
  }

  const target = clean(baseUrl)
  if (!target) {
    return {
      ok: false,
      skipped: false,
      error: 'PROMOTION_BASE_URL_MISSING',
    }
  }

  const startedAt = Date.now()
  let payload = null
  let httpStatus = null
  let transportError = null

  try {
    const res = await fetchImpl(
      `${target}/api/supplier-catalog-cycle-v1`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-prime-cycle-token': token,
        },
        body: JSON.stringify({
          confirm: 'SUPPLIER_CATALOG_CYCLE_LAB',
          cycle_key: parsed.input.cycle_key,
          trigger: 'manual_homologation',
          max_changes: parsed.input.max_changes,
          scope_keys: [parsed.input.scope_key],
        }),
      }
    )

    httpStatus = Number(res?.status) || null
    payload = await res.json().catch(() => null)

    if (!res?.ok) {
      transportError =
        payload?.error_code ||
        payload?.error ||
        'PROMOTION_HTTP_FAILED'
    }
  } catch (error) {
    transportError =
      clean(error?.message) ||
      'PROMOTION_REQUEST_FAILED'
  }

  const event = {
    event: 'SUPPLIER_HOMOLOGATION_PROMOTION_BOOT',
    run_key: parsed.input.run_key,
    scope_key: parsed.input.scope_key,
    max_changes: parsed.input.max_changes,
    ok:
      !transportError &&
      payload?.ok === true &&
      (
        (
          Number(payload?.totals?.selected_for_pending || 0) > 0 &&
          Number(payload?.totals?.ready || 0) ===
            Number(payload?.totals?.selected_for_pending || 0) &&
          Number(payload?.totals?.review || 0) === 0 &&
          Number(payload?.totals?.error || 0) === 0
        ) ||
        payload?.duplicate === true
      ),
    http_status: httpStatus,
    cycle_key: payload?.cycle_key || parsed.input.cycle_key,
    status: payload?.status || null,
    selected_for_pending:
      payload?.totals?.selected_for_pending ?? null,
    ready: payload?.totals?.ready ?? null,
    review: payload?.totals?.review ?? null,
    error_count: payload?.totals?.error ?? null,
    cost_usd: payload?.totals?.cost_usd ?? null,
    duplicate: payload?.duplicate ?? null,
    error:
      transportError ||
      payload?.error_code ||
      payload?.error ||
      null,
    duration_ms: Date.now() - startedAt,
  }

  logger.log(JSON.stringify(event))

  return {
    ok: event.ok,
    skipped: false,
    run_key: parsed.input.run_key,
    scope_key: parsed.input.scope_key,
    max_changes: parsed.input.max_changes,
    event,
    payload,
  }
}
