#!/usr/bin/env python3
"""Fetch recent Instagram posts.

Usage:
  python3 $PROJECT_ROOT/scripts/get_posts.py [--limit 50] [--cursor XXX]

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

CHANNEL = "instagram"


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
    parser = argparse.ArgumentParser(description="Fetch Instagram posts")
    parser.add_argument("--limit", type=int, default=50, help="Number of posts (max 100)")
    parser.add_argument("--cursor", default=None, help="Pagination cursor")
    args = parser.parse_args()

    user_id = _get_user_id()
    limit = min(args.limit, 100)

    client = DealismChannelClient()
    try:
        data = await client.get_channel_posts(user_id, CHANNEL, page_size=limit, cursor=args.cursor)
    except DealismApiError as e:
        print(f"Error: {e}")
        return

    posts = data.get("posts", [])
    if not posts:
        print("No Instagram posts found.")
        return

    print(f"**Instagram Posts** ({len(posts)} returned)\n")
    for i, post in enumerate(posts, 1):
        media_id = post.get("media_id", "N/A")
        raw_caption = post.get("caption") or ""
        caption_preview = raw_caption[:200] + ("..." if len(raw_caption) > 200 else "")
        ts = post.get("timestamp", "")[:10]
        comments = post.get("comment_count", 0)
        likes = post.get("like_count", 0)
        media_type = post.get("media_type", "")
        media_product_type = post.get("media_product_type", "")
        permalink = post.get("permalink", "")
        media_url = post.get("media_url", "")
        thumbnail_url = post.get("thumbnail_url", "")
        display_url = media_url or thumbnail_url or ""
        is_comment_enabled = post.get("is_comment_enabled")

        type_label = f"{media_type}/{media_product_type}" if media_product_type else media_type
        comment_status = "" if is_comment_enabled is None else (" 🔒comments off" if not is_comment_enabled else "")

        print(
            f"{i}. [{type_label}] {caption_preview}\n"
            f"   media_id: `{media_id}` | {ts} | comments:{comments}{comment_status} likes:{likes}"
        )
        if permalink:
            print(f"   🔗 {permalink}")
        if display_url:
            print(f"   🖼️ {display_url}")
        print()

    if data.get("hasMore"):
        print(f"... more available (next cursor: {data.get('nextCursor')})")


if __name__ == "__main__":
    asyncio.run(main())
