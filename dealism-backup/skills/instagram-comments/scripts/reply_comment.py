#!/usr/bin/env python3
"""Reply to a single Instagram comment.

Usage:
  python3 $PROJECT_ROOT/scripts/reply_comment.py --comment-id XXX --text "reply content"

SELLER_ID is read from environment (injected by BashTool).
"""

import argparse
import asyncio
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
    parser = argparse.ArgumentParser(description="Reply to Instagram comment")
    parser.add_argument("--comment-id", required=True, help="Target comment ID")
    parser.add_argument("--text", required=True, help="Reply content")
    args = parser.parse_args()

    reply_text = args.text.strip()
    if not reply_text:
        print("Error: reply text cannot be empty")
        return

    user_id = _get_user_id()
    client = DealismChannelClient()

    try:
        result = await client.reply_to_comment(user_id, args.comment_id, reply_text)
    except DealismApiError as e:
        print(f"Error: {e}")
        return

    if result.get("success"):
        print(f"Reply sent successfully (reply_id: {result.get('reply_id')})")
    else:
        print(f"Reply failed: {result.get('error', 'Unknown error')}")


if __name__ == "__main__":
    asyncio.run(main())
