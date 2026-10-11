-- PRIME ALERTA V2.4 LITE / LAB ONLY / PROPOSAL - DO NOT APPLY AUTOMATICALLY
-- Do not put in executable migrations or run on production.
-- Requires independent authorization and an isolated active LAB database.
-- Never stores raw chat IDs. Callers must send server-side HMAC-SHA256 hex.
-- Fixed maximum: 10 reserved probes per UTC day; 120s per-chat cooldown.
-- Atomic budgets & reservations within the same Postgres transaction.
BEGIN;
CREATE SCHEMA IF NOT EXISTS prime_v24_lite_lab;
REVOKE ALL ON SCHEMA prime_v24_lite_lab FROM PUBLIC;
GRANT USAGE ON SCHEMA prime_v24_lite_lab TO service_role;

CREATE TABLE IF NOT EXISTS prime_v24_lite_lab.daily_probe_budget (
  day_utc date PRIMARY KEY,
  probes integer NOT NULL DEFAULT 0 CHECK (probes BETWEEN 0 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prime_v24_lite_lab.chat_claim (
  chat_digest text PRIMARY KEY CHECK (chat_digest ~ '^[0-9a-f]{64}$'),
  last_claimed_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL
);
ALTER TABLE prime_v24_lite_lab.daily_probe_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE prime_v24_lite_lab.chat_claim ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA prime_v24_lite_lab FROM PUBLIC, anon, authenticated;

-- Public function name is just an RPC entrypoint, NOT permission for public callers.
CREATE OR REPLACE FUNCTION public.prime_v24_lite_claim_lab(p_chat_digest text)
RETURNS TABLE(accepted boolean, reason text, used_today integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, prime_v24_lite_lab
AS $$
DECLARE
  v_at timestamptz := clock_timestamp();
  v_day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_used integer;
  v_claimed text;
BEGIN
  IF p_chat_digest IS NULL OR p_chat_digest !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT false, 'INVALID_DIGEST'::text, NULL::integer;
    RETURN;
  END IF;
  -- The daily row-level lock serializes all candidate claims for exact cap.
  INSERT INTO prime_v24_lite_lab.daily_probe_budget(day_utc, probes)
    VALUES(v_day, 0) ON CONFLICT(day_utc) DO NOTHING;
  SELECT probes INTO v_used
    FROM prime_v24_lite_lab.daily_probe_budget
    WHERE day_utc = v_day FOR UPDATE;
  IF v_used >= 10 THEN
    RETURN QUERY SELECT false, 'DAILY_CAP'::text, v_used;
    RETURN;
  END IF;

  -- On conflict, the conditional update is the atomic cooldown + lease gate.
  INSERT INTO prime_v24_lite_lab.chat_claim AS c
    (chat_digest, last_claimed_at, lease_expires_at)
    VALUES (p_chat_digest, v_at, v_at + interval '30 seconds')
  ON CONFLICT (chat_digest) DO UPDATE
    SET last_claimed_at = EXCLUDED.last_claimed_at,
        lease_expires_at = EXCLUDED.lease_expires_at
    WHERE c.lease_expires_at <= v_at
      AND c.last_claimed_at <= v_at - interval '120 seconds'
  RETURNING chat_digest INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN QUERY SELECT false, 'DUPLICATE_OR_COOLDOWN'::text, v_used;
    RETURN;
  END IF;

  UPDATE prime_v24_lite_lab.daily_probe_budget
    SET probes = probes + 1, updated_at = v_at
    WHERE day_utc = v_day;
  RETURN QUERY SELECT true, 'RESERVED'::text, v_used + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.prime_v24_lite_claim_lab(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prime_v24_lite_claim_lab(text) TO service_role;
COMMIT;

-- LIMITATION: This gate limits probes, not the whole Base44 billing account.
-- Run concurrency verification on an isolated LAB database before integration.
-- Production requires immutable caps, HMAC-secret rotation plan, dedicated
-- cleanup policy, failure/retry safeguards, budget visibility and cost proof.
