import http from "node:http";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { FileLedger, MemoryLedger } from "./ledger.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT_CHARS = 4096;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const NUMBER_RE = /^\d{8,15}$/;
const JID_RE = /^\d{8,15}@s\.whatsapp\.net$/;

export const BRIDGE_PHASE = "D2";

function bool(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function boolDefaultTrue(value) {
  if (value === undefined || value === null || String(value).trim() === "") return true;
  return bool(value);
}

function clean(value, max = 256) {
  return String(value ?? "").trim().slice(0, max);
}

function requireNumber(value) {
  const digits = clean(value, 32).replace(/\D/g, "");
  if (!NUMBER_RE.test(digits)) throw new Error("BRIDGE_INVALID_NUMBER");
  return digits;
}

function parseAllowlist(value) {
  const out = new Set();
  for (const part of String(value ?? "").split(",")) {
    const raw = part.trim();
    if (!raw) continue;
    out.add(requireNumber(raw));
  }
  return out;
}

function normalizeBaseUrl(value) {
  const url = new URL(clean(value || "http://127.0.0.1:3100", 500));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("BRIDGE_INVALID_WAAKG_URL");
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("BRIDGE_D2_LOOPBACK_ONLY");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function loadConfig(env = process.env) {
  const host = clean(env.BRIDGE_HOST || "127.0.0.1", 128);
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("BRIDGE_D2_BIND_LOOPBACK_ONLY");
  }

  const port = Number(env.BRIDGE_PORT || 3110);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("BRIDGE_INVALID_PORT");
  }

  return Object.freeze({
    host,
    port,
    bridgeToken: clean(env.PRIME_WAAKG_BRIDGE_TOKEN, 4096),
    waAkgApiKey: clean(env.WAAKG_API_KEY, 4096),
    sessionId: clean(env.WAAKG_SESSION_ID, 128),
    waAkgBaseUrl: normalizeBaseUrl(env.WAAKG_BASE_URL),
    sendEnabled: bool(env.WAAKG_SEND_ENABLED),
    killSwitch: boolDefaultTrue(env.WAAKG_KILL_SWITCH),
    allowlist: parseAllowlist(env.WAAKG_ALLOWLIST_NUMBERS),
    d7cAdminEnabled: bool(env.WAAKG_D7C_ADMIN_ENABLED),
    ledgerPath: clean(env.WAAKG_LEDGER_PATH || "./data/ledger.json", 1024),
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error("BRIDGE_BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("BRIDGE_INVALID_JSON");
    }
    return parsed;
  } catch (error) {
    if (error?.message === "BRIDGE_INVALID_JSON") throw error;
    throw new Error("BRIDGE_INVALID_JSON");
  }
}

function bearer(req) {
  const raw = clean(req.headers.authorization, 8192);
  if (!raw.startsWith("Bearer ")) return "";
  return raw.slice(7).trim();
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireAuth(req, config) {
  if (!config.bridgeToken) throw new Error("BRIDGE_TOKEN_NOT_CONFIGURED");
  if (!safeEqual(bearer(req), config.bridgeToken)) throw new Error("BRIDGE_UNAUTHORIZED");
}

function requireRequestId(req) {
  const id = clean(req.headers["x-prime-request-id"], 256);
  if (!REQUEST_ID_RE.test(id)) throw new Error("BRIDGE_REQUEST_ID_REQUIRED");
  return id;
}

function requireText(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > MAX_TEXT_CHARS) throw new Error("BRIDGE_INVALID_TEXT");
  return text;
}

function assertLocalConfigReady(config) {
  if (!config.waAkgApiKey) throw new Error("WAAKG_API_KEY_NOT_CONFIGURED");
  if (!config.sessionId) throw new Error("WAAKG_SESSION_ID_NOT_CONFIGURED");
}

function createRuntimeGate() {
  let grant = null;

  function active(now = Date.now()) {
    if (!grant) return null;
    if (grant.expiresAt <= now || grant.consumed === true) {
      grant = null;
      return null;
    }
    return grant;
  }

  return {
    arm({ requestId, number, ttlSeconds }) {
      if (active()) throw new Error("BRIDGE_D7C_GRANT_ALREADY_ACTIVE");
      const ttl = Number(ttlSeconds);
      if (!Number.isInteger(ttl) || ttl < 15 || ttl > 120) {
        throw new Error("BRIDGE_D7C_TTL_INVALID");
      }
      grant = {
        requestId,
        number,
        expiresAt: Date.now() + ttl * 1000,
        consumed: false,
      };
      return { ...grant };
    },

    inspect() {
      const current = active();
      return current ? { ...current } : null;
    },

    consume({ requestId, number }) {
      const current = active();
      if (!current) throw new Error("BRIDGE_D7C_GRANT_MISSING");
      if (current.requestId !== requestId) throw new Error("BRIDGE_D7C_REQUEST_NOT_ALLOWED");
      if (current.number !== number) throw new Error("BRIDGE_DESTINATION_NOT_ALLOWED");
      grant = null;
    },

    relock() {
      grant = null;
    },
  };
}

function effectiveGateState(config, runtimeGate) {
  const grant = runtimeGate?.inspect?.() || null;
  if (grant) {
    return {
      sendEnabled: true,
      killSwitch: false,
      allowlistCount: 1,
      runtimeGrantActive: true,
      runtimeGrantExpiresAt: new Date(grant.expiresAt).toISOString(),
    };
  }
  return {
    sendEnabled: config.sendEnabled,
    killSwitch: config.killSwitch,
    allowlistCount: config.allowlist.size,
    runtimeGrantActive: false,
    runtimeGrantExpiresAt: null,
  };
}

function assertOutboundGates(config, number, requestId, runtimeGate = null) {
  const grant = runtimeGate?.inspect?.() || null;
  if (grant) {
    if (grant.requestId !== requestId) throw new Error("BRIDGE_D7C_REQUEST_NOT_ALLOWED");
    if (grant.number !== number) throw new Error("BRIDGE_DESTINATION_NOT_ALLOWED");
    return "runtime";
  }

  if (!config.sendEnabled) throw new Error("BRIDGE_SEND_DISABLED");
  if (config.killSwitch) throw new Error("BRIDGE_KILL_SWITCH_ACTIVE");
  if (!config.allowlist.size) throw new Error("BRIDGE_ALLOWLIST_EMPTY");
  if (!config.allowlist.has(number)) throw new Error("BRIDGE_DESTINATION_NOT_ALLOWED");
  return "static";
}

function requestFingerprint(config, number, text) {
  return createHash("sha256")
    .update(`${config.sessionId}\n${number}\n${text}`, "utf8")
    .digest("hex");
}

async function upstreamJson(fetchImpl, url, init, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    return { response, body };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("WAAKG_TIMEOUT");
    throw new Error("WAAKG_NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveCanonicalJid({ number, config, fetchImpl = fetch }) {
  assertLocalConfigReady(config);
  const digits = requireNumber(number);
  const headers = {
    "x-api-key": config.waAkgApiKey,
    "accept": "application/json",
  };

  const session = await upstreamJson(
    fetchImpl,
    `${config.waAkgBaseUrl}/api/sessions/${encodeURIComponent(config.sessionId)}`,
    { method: "GET", headers },
  );
  const state = clean(session.body?.data?.status, 32).toUpperCase();
  if (!session.response.ok || state !== "CONNECTED") {
    throw new Error(state ? `WAAKG_SESSION_${state}` : `WAAKG_SESSION_HTTP_${session.response.status}`);
  }

  const checked = await upstreamJson(
    fetchImpl,
    `${config.waAkgBaseUrl}/api/chat/${encodeURIComponent(config.sessionId)}/check`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ numbers: [digits] }),
    },
  );

  if (!checked.response.ok || checked.body?.status !== true) {
    throw new Error(`WAAKG_CHECK_HTTP_${checked.response.status}`);
  }

  const item = checked.body?.data?.results?.[0];
  if (!item?.exists) throw new Error("WAAKG_NUMBER_NOT_ON_WHATSAPP");
  const jid = clean(item?.jid, 128);
  if (!JID_RE.test(jid)) throw new Error("WAAKG_INVALID_CANONICAL_JID");

  return { inputNumber: digits, canonicalJid: jid, sessionStatus: state };
}

function replayResult(record) {
  if (record.state === "accepted") {
    return {
      httpStatus: 200,
      body: {
        ok: true,
        replay: true,
        state: "accepted",
        providerMessageId: record.providerMessageId,
      },
    };
  }
  if (record.state === "failed_final") {
    return {
      httpStatus: 409,
      body: {
        ok: false,
        replay: true,
        state: "failed_final",
        error: record.errorCode || "BRIDGE_FINAL_FAILURE",
      },
    };
  }
  return {
    httpStatus: 409,
    body: {
      ok: false,
      replay: true,
      state: record.state,
      error: "BRIDGE_IDEMPOTENCY_UNCERTAIN",
    },
  };
}

export async function sendTextControlled({
  requestId,
  number,
  text,
  config,
  ledger,
  runtimeGate = null,
  fetchImpl = fetch,
}) {
  assertLocalConfigReady(config);
  const digits = requireNumber(number);
  const bodyText = requireText(text);
  const gateMode = assertOutboundGates(config, digits, requestId, runtimeGate);

  // Runtime D7C grant is single-use and is consumed before any ledger/upstream work.
  // After this point health immediately reports the bridge as relocked.
  if (gateMode === "runtime") {
    runtimeGate.consume({ requestId, number: digits });
  }

  const fingerprint = requestFingerprint(config, digits, bodyText);
  const begin = ledger.begin({
    requestId,
    fingerprint,
    numberTail: digits.slice(-4),
    textChars: bodyText.length,
  });

  if (begin.kind === "conflict") {
    const error = new Error("BRIDGE_IDEMPOTENCY_CONFLICT");
    error.httpStatus = 409;
    throw error;
  }
  if (begin.kind === "existing") return replayResult(begin.record);

  let canonicalJid = null;
  let providerCallStarted = false;
  try {
    const resolved = await resolveCanonicalJid({ number: digits, config, fetchImpl });
    canonicalJid = resolved.canonicalJid;

    providerCallStarted = true;
    const sent = await upstreamJson(
      fetchImpl,
      `${config.waAkgBaseUrl}/api/messages/${encodeURIComponent(config.sessionId)}/${encodeURIComponent(canonicalJid)}/send`,
      {
        method: "POST",
        headers: {
          "x-api-key": config.waAkgApiKey,
          "accept": "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: { text: bodyText } }),
      },
      12_000,
    );

    if (!sent.response.ok || sent.body?.status !== true) {
      const code = `WAAKG_SEND_HTTP_${sent.response.status}`;
      if (sent.response.status >= 500 || sent.response.status === 408 || sent.response.status === 409) {
        ledger.markUncertain(requestId, "BRIDGE_OUTBOUND_UNCERTAIN", { canonicalJid });
        const error = new Error("BRIDGE_OUTBOUND_UNCERTAIN");
        error.httpStatus = 502;
        throw error;
      }
      ledger.markFailedFinal(requestId, code);
      const error = new Error(code);
      error.httpStatus = 502;
      throw error;
    }

    const providerMessageId = clean(sent.body?.data?.key?.id, 512);
    if (!providerMessageId) {
      ledger.markUncertain(requestId, "BRIDGE_PROVIDER_MESSAGE_ID_MISSING", { canonicalJid });
      const error = new Error("BRIDGE_OUTBOUND_UNCERTAIN");
      error.httpStatus = 502;
      throw error;
    }

    ledger.markAccepted(requestId, { canonicalJid, providerMessageId });
    return {
      httpStatus: 200,
      body: {
        ok: true,
        replay: false,
        state: "accepted",
        providerMessageId,
        canonicalJid,
      },
    };
  } catch (error) {
    if (error?.message === "BRIDGE_OUTBOUND_UNCERTAIN") throw error;

    if (providerCallStarted && ["WAAKG_TIMEOUT", "WAAKG_NETWORK_ERROR"].includes(error?.message)) {
      ledger.markUncertain(requestId, "BRIDGE_OUTBOUND_UNCERTAIN", { canonicalJid });
      const uncertain = new Error("BRIDGE_OUTBOUND_UNCERTAIN");
      uncertain.httpStatus = 502;
      throw uncertain;
    }

    const current = ledger.get(requestId);
    if (current?.state === "reserved") {
      ledger.markFailedFinal(requestId, error?.message || "BRIDGE_FINAL_FAILURE");
    }
    throw error;
  }
}

function publicLedgerRecord(record) {
  if (!record) return null;
  return {
    requestId: record.requestId,
    state: record.state,
    numberTail: record.numberTail,
    canonicalJidTail: record.canonicalJidTail,
    textChars: record.textChars,
    providerMessageId: record.providerMessageId,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function errorStatus(code, explicitStatus = null) {
  if (explicitStatus) return explicitStatus;
  if (code === "BRIDGE_UNAUTHORIZED" || code === "BRIDGE_TOKEN_NOT_CONFIGURED") return 401;
  if (code === "BRIDGE_SEND_DISABLED" || code === "BRIDGE_KILL_SWITCH_ACTIVE") return 423;
  if (
    code === "BRIDGE_DESTINATION_NOT_ALLOWED" ||
    code === "BRIDGE_ALLOWLIST_EMPTY" ||
    code === "BRIDGE_D7C_ADMIN_DISABLED" ||
    code === "BRIDGE_D7C_STATIC_GATE_NOT_LOCKED"
  ) return 403;
  if (
    code === "BRIDGE_D7C_GRANT_ALREADY_ACTIVE" ||
    code === "BRIDGE_D7C_GRANT_MISSING" ||
    code === "BRIDGE_D7C_REQUEST_NOT_ALLOWED"
  ) return 409;
  if (code === "BRIDGE_IDEMPOTENCY_CONFLICT" || code === "BRIDGE_IDEMPOTENCY_UNCERTAIN") return 409;
  if (
    code === "BRIDGE_REQUEST_ID_REQUIRED" ||
    code === "BRIDGE_INVALID_NUMBER" ||
    code === "BRIDGE_INVALID_TEXT" ||
    code === "BRIDGE_INVALID_JSON" ||
    code === "BRIDGE_BODY_TOO_LARGE" ||
    code === "BRIDGE_D7C_TTL_INVALID" ||
    code === "BRIDGE_D7C_CONFIRMATION_REQUIRED"
  ) return 400;
  if (code.startsWith("WAAKG_SESSION_")) return 503;
  if (code === "WAAKG_TIMEOUT" || code === "WAAKG_NETWORK_ERROR" || code === "BRIDGE_OUTBOUND_UNCERTAIN") return 502;
  if (code === "WAAKG_NUMBER_NOT_ON_WHATSAPP" || code === "WAAKG_INVALID_CANONICAL_JID") return 422;
  if (code.startsWith("WAAKG_CHECK_HTTP_") || code.startsWith("WAAKG_SEND_HTTP_")) return 502;
  if (code.endsWith("_NOT_CONFIGURED") || code === "BRIDGE_LEDGER_CORRUPT") return 503;
  return 500;
}

function auditLog(event) {
  const safe = {
    at: new Date().toISOString(),
    requestId: event.requestId || null,
    action: event.action || null,
    ok: event.ok === true,
    code: event.code || null,
    numberTail: event.number ? String(event.number).slice(-4) : null,
    canonicalJidTail: event.canonicalJid ? String(event.canonicalJid).split("@")[0].slice(-4) : null,
    textChars: Number.isInteger(event.textChars) ? event.textChars : null,
    providerMessageIdPresent: Boolean(event.providerMessageId),
    replay: event.replay === true,
  };
  process.stdout.write(JSON.stringify(safe) + "\n");
}

export function createBridge({
  config = loadConfig(),
  fetchImpl = fetch,
  ledger = new MemoryLedger(),
} = {}) {
  const runtimeGate = createRuntimeGate();

  return http.createServer(async (req, res) => {
    let requestId = null;
    try {
      requireAuth(req, config);

      if (req.method === "GET" && req.url === "/health") {
        const gates = effectiveGateState(config, runtimeGate);
        return json(res, 200, {
          ok: true,
          service: "prime-wa-akg-bridge",
          phase: BRIDGE_PHASE,
          bind: "loopback-only",
          sendEnabled: gates.sendEnabled,
          killSwitch: gates.killSwitch,
          allowlistCount: gates.allowlistCount,
          d7cRuntimeGrantActive: gates.runtimeGrantActive,
          d7cRuntimeGrantExpiresAt: gates.runtimeGrantExpiresAt,
          waAkgConfigured: Boolean(config.waAkgApiKey && config.sessionId),
          ledgerEnabled: Boolean(ledger),
        });
      }

      if (req.method === "POST" && req.url === "/v1/admin/d7c-arm") {
        if (!config.d7cAdminEnabled) throw new Error("BRIDGE_D7C_ADMIN_DISABLED");
        if (config.sendEnabled || !config.killSwitch || config.allowlist.size !== 0) {
          throw new Error("BRIDGE_D7C_STATIC_GATE_NOT_LOCKED");
        }

        requestId = requireRequestId(req);
        const body = await readJson(req);
        if (body?.confirmation !== "ARM_D7C_ONE_SHOT") {
          throw new Error("BRIDGE_D7C_CONFIRMATION_REQUIRED");
        }
        const number = requireNumber(body?.number);
        const armed = runtimeGate.arm({
          requestId,
          number,
          ttlSeconds: body?.ttlSeconds,
        });
        auditLog({
          requestId,
          action: "d7c-arm",
          ok: true,
          number,
          code: "BRIDGE_D7C_RUNTIME_GRANT_ARMED",
        });
        return json(res, 200, {
          ok: true,
          requestId,
          numberTail: number.slice(-4),
          expiresAt: new Date(armed.expiresAt).toISOString(),
          sendEnabled: true,
          killSwitch: false,
          allowlistCount: 1,
        });
      }

      if (req.method === "POST" && req.url === "/v1/admin/d7c-relock") {
        if (!config.d7cAdminEnabled) throw new Error("BRIDGE_D7C_ADMIN_DISABLED");
        requestId = requireRequestId(req);
        const body = await readJson(req);
        if (body?.confirmation !== "RELOCK_D7C_ONE_SHOT") {
          throw new Error("BRIDGE_D7C_CONFIRMATION_REQUIRED");
        }
        runtimeGate.relock();
        auditLog({
          requestId,
          action: "d7c-relock",
          ok: true,
          code: "BRIDGE_D7C_RUNTIME_GRANT_RELOCKED",
        });
        return json(res, 200, {
          ok: true,
          sendEnabled: false,
          killSwitch: true,
          allowlistCount: 0,
        });
      }

      if (req.method === "POST" && req.url === "/v1/resolve-number") {
        requestId = requireRequestId(req);
        const body = await readJson(req);
        const number = requireNumber(body.number);
        const resolved = await resolveCanonicalJid({ number, config, fetchImpl });
        auditLog({ requestId, action: "resolve-number", ok: true, number, canonicalJid: resolved.canonicalJid });
        return json(res, 200, { ok: true, ...resolved });
      }

      if (req.method === "POST" && req.url === "/v1/send-text") {
        requestId = requireRequestId(req);
        const body = await readJson(req);
        const number = requireNumber(body.number);
        const text = requireText(body.text);

        const result = await sendTextControlled({
          requestId,
          number,
          text,
          config,
          ledger,
          runtimeGate,
          fetchImpl,
        });

        auditLog({
          requestId,
          action: "send-text",
          ok: result.body?.ok === true,
          code: result.body?.error || null,
          number,
          canonicalJid: result.body?.canonicalJid || null,
          textChars: text.length,
          providerMessageId: result.body?.providerMessageId || null,
          replay: result.body?.replay === true,
        });
        return json(res, result.httpStatus, result.body);
      }

      const requestMatch = req.method === "GET" && req.url?.match(/^\/v1\/requests\/([A-Za-z0-9._:-]{8,128})$/);
      if (requestMatch) {
        const record = ledger.get(requestMatch[1]);
        if (!record) return json(res, 404, { ok: false, error: "BRIDGE_REQUEST_NOT_FOUND" });
        return json(res, 200, { ok: true, request: publicLedgerRecord(record) });
      }

      return json(res, 404, { ok: false, error: "BRIDGE_ROUTE_NOT_FOUND" });
    } catch (error) {
      const code = clean(error?.message || "BRIDGE_INTERNAL_ERROR", 120) || "BRIDGE_INTERNAL_ERROR";
      if (requestId) auditLog({ requestId, action: "request", ok: false, code });
      return json(res, errorStatus(code, error?.httpStatus), { ok: false, error: code });
    }
  });
}

export async function startBridge({ env = process.env, fetchImpl = fetch } = {}) {
  const config = loadConfig(env);
  const ledger = new FileLedger(config.ledgerPath);
  const server = createBridge({ config, fetchImpl, ledger });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  process.stdout.write(JSON.stringify({
    event: "bridge_started",
    phase: BRIDGE_PHASE,
    host: config.host,
    port: config.port,
    sendEnabled: config.sendEnabled,
    killSwitch: config.killSwitch,
    allowlistCount: config.allowlist.size,
    d7cAdminEnabled: config.d7cAdminEnabled,
  }) + "\n");
  return { server, config, ledger };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startBridge().catch((error) => {
    process.stderr.write(`PRIME WA-AKG BRIDGE failed: ${clean(error?.message || error, 200)}\n`);
    process.exitCode = 1;
  });
}