#!/usr/bin/env python3
"""Batch reply to Instagram comments.

Usage:
  python3 $PROJECT_ROOT/scripts/batch_reply.py --replies '[{"comment_id":"X","reply_text":"Y"},...]'

SELLER_ID is read from environment (injected by BashTool).
"""

import argparse
import asyncio
import json
import os
import sys

# Resolve project root & setup imports
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

from tools.channel.dealism_channel_client import DealismChannelClient, DealismApiError


def _get_user_id() -> int:
    seller_id = os.environ.get("SELLER_ID")
    if not seller_id:
        print("Error: SELLER_ID not set in environment.")
        sys.exit(1)
    try:
        return int(seller_id)
    except ValueError:
        print(f"Error: SELLER_ID '{seller_id}' is not a valid integer.")
        sys.exit(1)


async def main():
    parser = argparse.ArgumentParser(description="Batch reply to Instagram comments")
    parser.add_argument("--replies", required=True, help="JSON array of {comment_id, reply_text}")
    args = parser.parse_args()

    try:
        replies = json.loads(args.replies)
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON — {e}")
        sys.exit(1)

    if not isinstance(replies, list) or not replies:
        print("Error: replies must be a non-empty JSON array")
        sys.exit(1)
    if len(replies) > 50:
        print("Error: maximum 50 replies per batch — please split into multiple calls")
        sys.exit(1)

    valid_replies = [
        r for r in replies
        if r.get("comment_id") and (r.get("reply_text") or "").strip()
    ]
    invalid_count = len(replies) - len(valid_replies)

    user_id = _get_user_id()
    client = DealismChannelClient()

    try:
        result = await client.batch_reply_comments(user_id, valid_replies)
    except DealismApiError as e:
        print(f"Error: {e}")
        return

    total = result.get("total", len(valid_replies))
    success_count = result.get("successCount", 0)

    print(f"**Batch Reply Complete** ({success_count}/{total} succeeded)\n")

    succeeded_ids = [
        r["commentId"] for r in result.get("results", []) if r.get("success")
    ]
    if succeeded_ids:
        print(f"Succeeded ({len(succeeded_ids)}): {', '.join(succeeded_ids)}")

    failed_items = [r for r in result.get("results", []) if not r.get("success")]
    if failed_items:
        print(f"\nFailed ({len(failed_items)}):")
        for f_item in failed_items:
            error_detail = f_item.get("error") or f_item.get("errorCode") or "unknown"
            print(f"  - comment_id `{f_item['commentId']}`: {error_detail}")

    if invalid_count > 0:
        print(f"\nSkipped {invalid_count} item(s) with missing comment_id or reply_text.")


if __name__ == "__main__":
    asyncio.run(main())
