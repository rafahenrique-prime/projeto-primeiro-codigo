#!/usr/bin/env python3
"""
Buyer Agent Tryme Session Resolver

Resolves the tryme session key for a BA config so the SA can send test messages
directly via the sessions_send tool.

Usage (called by AI agent via bash tool):
  # List all buyer agents with their tryme session keys
  python3 $PROJECT_ROOT/scripts/probe_buyer.py --list

  # Resolve tryme session key for a specific config
  python3 $PROJECT_ROOT/scripts/probe_buyer.py --config-id Barba_KVSTX488
  # Output example: seller:29162:buyer:68774:_tryme
"""

import argparse
import asyncio
import json
import logging
import os
import sys

# Resolve project root from PROJECT_ROOT env var (injected by BashTool),
# falling back to traversing up from __file__ for direct invocation.
_project_root = os.environ.get("PROJECT_ROOT")
if not _project_root:
    _candidate = os.path.dirname(os.path.abspath(__file__))
    for _ in range(10):
        if os.path.isdir(os.path.join(_candidate, "src")):
            _project_root = _candidate
            break
        _candidate = os.path.dirname(_candidate)
    else:
        _project_root = os.getcwd()

sys.path.insert(0, os.path.join(_project_root, "src"))

from dotenv import load_dotenv
load_dotenv(os.path.join(_project_root, ".env"))

_data_path = os.getenv("DATA_PATH", "./data")
if not os.path.isabs(_data_path):
    os.environ["DATA_PATH"] = os.path.join(_project_root, _data_path)

from storage.factory import get_object_store

logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Resolve BA tryme session key")
    parser.add_argument("--seller-id", default=None,
                        help="Seller ID (or set SELLER_ID env var)")
    parser.add_argument("--config-id", default=None,
                        help="BA config ID (e.g. Barba_KVSTX488 or KVSTX488)")
    parser.add_argument("--list", action="store_true",
                        help="List all buyer agents with session keys (JSON)")
    parser.add_argument("--verbose", "-v", action="store_true")
    return parser.parse_args()


async def _read_bindings(storage, seller_id: str) -> dict:
    try:
        raw = await storage.read_text(f"users/{seller_id}/buyer_agents/bindings.json")
        if raw:
            return json.loads(raw)
    except Exception as e:
        logger.debug(f"Failed to read bindings: {e}")
    return {}


async def _load_config(storage, seller_id: str, config_id: str) -> dict:
    """
    Load the config JSON for the given config_id.
    Returns a dict with at least 'id' (short) and 'agent_name' if available.
    """
    for path in [
        f"users/{seller_id}/buyer_agent_configs/config_{config_id}.json",
        f"users/{seller_id}/buyer_agent_configs/config_default.json",
    ]:
        try:
            raw = await storage.read_text(path)
            if raw:
                return json.loads(raw)
        except Exception:
            continue
    return {}


def _parse_bindings(bindings: dict, seller_id: str) -> list[dict]:
    """Parse bindings.json into a list of agent dicts."""
    results = []
    for key, config_id in bindings.get("bindings", {}).items():
        if not key.startswith("buyer_"):
            continue
        rest = key[len("buyer_"):]
        if rest.endswith("__tryme"):
            buyer_id = rest[: -len("__tryme")]
            channel = "_tryme"
        else:
            parts = rest.rsplit("_", 1)
            if len(parts) != 2:
                continue
            buyer_id, channel = parts

        session_key = f"seller:{seller_id}:buyer:{buyer_id}:{channel}"
        results.append({
            "buyer_id": buyer_id,
            "channel": channel,
            "config_id": config_id,
            "session_key": session_key,
        })
    return results


async def list_agents(storage, seller_id: str) -> list[dict]:
    bindings = await _read_bindings(storage, seller_id)
    agents = _parse_bindings(bindings, seller_id)

    # Enrich with agent_name and numeric agent_id from config JSON
    seen_configs: dict[str, dict] = {}
    for agent in agents:
        cfg_id = agent["config_id"]
        if cfg_id not in seen_configs:
            try:
                raw = await storage.read_text(
                    f"users/{seller_id}/buyer_agent_configs/config_{cfg_id}.json"
                )
                seen_configs[cfg_id] = json.loads(raw) if raw else {}
            except Exception:
                seen_configs[cfg_id] = {}
        cfg = seen_configs[cfg_id]
        if cfg.get("agent_name"):
            agent["agent_name"] = cfg["agent_name"]
        if cfg.get("agent_id") or cfg.get("blibee_agent_id"):
            agent["agent_id"] = cfg.get("agent_id") or cfg.get("blibee_agent_id")

    return agents


async def resolve_tryme_info(
    storage, seller_id: str, config_id: str
) -> dict | None:
    """
    Return a dict with 'session_key' and 'agent_name' for the given config_id,
    or None if no tryme session is found.
    """
    bindings = await _read_bindings(storage, seller_id)
    cfg = await _load_config(storage, seller_id, config_id)
    short_id = cfg.get("id") or cfg.get("config_id")
    agent_name = cfg.get("agent_name", config_id)

    tryme_entries: list[tuple[str, str]] = []
    for key, cfg_id in bindings.get("bindings", {}).items():
        if key.startswith("buyer_") and key.endswith("__tryme"):
            buyer_id = key[len("buyer_"): -len("__tryme")]
            tryme_entries.append((buyer_id, cfg_id))

    if not tryme_entries:
        return None

    # Match by config_id string or short id
    lookup_ids = {config_id, short_id} - {None}
    for buyer_id, cfg_id in tryme_entries:
        if cfg_id in lookup_ids or any(lid in cfg_id for lid in lookup_ids):
            return {
                "session_key": f"seller:{seller_id}:buyer:{buyer_id}:_tryme",
                "agent_name": agent_name,
            }

    # Only one tryme entry → use it regardless of config match
    if len(tryme_entries) == 1:
        return {
            "session_key": f"seller:{seller_id}:buyer:{tryme_entries[0][0]}:_tryme",
            "agent_name": agent_name,
        }

    return None


async def main():
    args = parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if not args.seller_id:
        args.seller_id = os.getenv("SELLER_ID")
    if not args.seller_id:
        print("Error: --seller-id required (or set SELLER_ID env var)")
        sys.exit(1)

    storage = get_object_store()

    if args.list:
        agents = await list_agents(storage, args.seller_id)
        print(json.dumps(agents, indent=2, ensure_ascii=False))
        return

    if args.config_id:
        info = await resolve_tryme_info(storage, args.seller_id, args.config_id)
        if not info:
            print(
                f"Error: no tryme session found for config_id={args.config_id}, "
                f"seller_id={args.seller_id}.\n"
                f"Make sure fetch_channel_data has been run for this seller so the "
                f"tryme workspace is registered in bindings.json."
            )
            sys.exit(1)
        print(json.dumps(info, ensure_ascii=False))
        return

    print("Usage:")
    print(f"  python3 {sys.argv[0]} --list")
    print(f"  python3 {sys.argv[0]} --config-id <config_id>")


if __name__ == "__main__":
    asyncio.run(main())
