import {
  runSupplierHomologationHarness,
} from './supplier-homologation-harness-v1.js'

function clean(value) {
  return String(value ?? '').trim()
}

export function isSupplierHomologationHarnessBootEnabled(env = process.env) {
  return clean(env.SUPPLIER_HOMOLOGATION_HARNESS_BOOT_ENABLED)
    .toLowerCase() === 'true'
}

export function parseSupplierHomologationHarnessBootInput(env = process.env) {
  const raw = clean(env.SUPPLIER_HOMOLOGATION_HARNESS_BOOT_INPUT)
  if (!raw) {
    return {
      ok: false,
      error: 'HARNESS_BOOT_INPUT_MISSING',
      input: null,
      run_key: null,
    }
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: 'HARNESS_BOOT_INPUT_INVALID',
        input: null,
        run_key: null,
      }
    }

    const runKey = clean(parsed.run_key)
    if (!runKey) {
      return {
        ok: false,
        error: 'HARNESS_BOOT_RUN_KEY_REQUIRED',
        input: null,
        run_key: null,
      }
    }

    if (runKey.length > 120) {
      return {
        ok: false,
        error: 'HARNESS_BOOT_RUN_KEY_TOO_LONG',
        input: null,
        run_key: null,
      }
    }

    return {
      ok: true,
      error: null,
      input: parsed,
      run_key: runKey,
    }
  } catch {
    return {
      ok: false,
      error: 'HARNESS_BOOT_INPUT_INVALID_JSON',
      input: null,
      run_key: null,
    }
  }
}

export async function runSupplierHomologationHarnessBoot({
  env = process.env,
  runHarnessFn = runSupplierHomologationHarness,
  logger = console,
  harnessDeps = {},
} = {}) {
  if (!isSupplierHomologationHarnessBootEnabled(env)) {
    return {
      ok: true,
      skipped: true,
      reason: 'HARNESS_BOOT_DISABLED',
    }
  }

  const parsed = parseSupplierHomologationHarnessBootInput(env)
  if (!parsed.ok) {
    const result = {
      ok: false,
      skipped: false,
      error: parsed.error,
    }

    logger.log(JSON.stringify({
      event: 'SUPPLIER_HOMOLOGATION_HARNESS_BOOT',
      run_key: parsed.run_key,
      ok: false,
      verdict: null,
      error: parsed.error,
    }))

    return result
  }

  const startedAt = Date.now()
  let result

  try {
    result = await runHarnessFn(parsed.input, {
      ...harnessDeps,
      env,
    })
  } catch (error) {
    result = {
      ok: false,
      verdict: null,
      error:
        clean(error?.message) ||
        'HARNESS_BOOT_EXCEPTION',
    }
  }

  const event = {
    event: 'SUPPLIER_HOMOLOGATION_HARNESS_BOOT',
    run_key: parsed.run_key,
    ok: result?.ok === true,
    verdict: result?.verdict || null,
    mode: result?.mode || parsed.input?.mode || null,
    vision_total: result?.vision?.total ?? null,
    vision_ready: result?.vision?.ready ?? null,
    vision_review: result?.vision?.review ?? null,
    vision_errors: result?.vision?.errors ?? null,
    vision_cost_usd: result?.vision?.cost_usd ?? null,
    product_universe_pass:
      result?.product_universe?.pass ?? null,
    canonical_family:
      result?.product_universe?.decision?.canonical_family ?? null,
    best_source:
      result?.product_universe?.decision?.best_source ?? null,
    supplier_count:
      result?.product_universe?.decision?.supplier_count ?? null,
    price_state:
      result?.product_universe?.decision?.price_state ?? null,
    size_state:
      result?.product_universe?.decision?.size_state ?? null,
    action:
      result?.product_universe?.decision?.action ?? null,
    error: result?.error || null,
    duration_ms: Date.now() - startedAt,
  }

  logger.log(JSON.stringify(event))

  return {
    ok: result?.ok === true,
    skipped: false,
    run_key: parsed.run_key,
    event,
    result,
  }
}
