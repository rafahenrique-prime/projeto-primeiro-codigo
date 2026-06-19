#!/usr/bin/env python3
"""Fetch comments for an Instagram post.

Usage:
  python3 $PROJECT_ROOT/scripts/get_comments.py --media-id XXX [--page-size 50] [--cursor XXX]

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
    parser = argparse.ArgumentParser(description="Fetch Instagram comments")
    parser.add_argument("--media-id", required=True, help="Post media ID from get_posts")
    parser.add_argument("--page-size", type=int, default=50, help="Comments per page")
    parser.add_argument("--cursor", default=None, help="Pagination cursor")
    args = parser.parse_args()

    user_id = _get_user_id()
    client = DealismChannelClient()

    try:
        data = await client.get_post_comments(
            user_id, args.media_id,
            page_size=args.page_size,
            cursor=args.cursor,
        )
        # Get seller's own IG profile to tag own replies
        my_ig_id = ""
        my_username = ""
        try:
            profile = await client.get_channel_profile(user_id, CHANNEL)
            my_ig_id = str(profile.get("ig_user_id", "") or "")
            my_username = (profile.get("username", "") or "").lower()
        except DealismApiError:
            pass
    except DealismApiError as e:
        print(f"Error: {e}")
        return

    comments = data.get("comments", [])
    if not comments:
        print(f"No comments found for post {args.media_id}.")
        return

    print(f"**Comments for post `{args.media_id}`** ({len(comments)} returned)\n")
    for i, c in enumerate(comments, 1):
        cid = str(c.get("commenter_ig_id", "") or "")
        cuname = (c.get("username", "") or "").lower()
        is_my_reply = bool(
            (my_ig_id and cid == my_ig_id) or
            (my_username and cuname == my_username)
        )
        already = " [replied]" if c.get("already_replied") else ""
        my_tag = " [my reply]" if is_my_reply else ""
        ts = c.get("timestamp", "")[:10]
        likes = c.get("like_count", 0)
        print(
            f"{i}. @{c.get('username')}{my_tag} [{ts}] likes:{likes}{already}\n"
            f"   {c.get('text', '')}\n"
            f"   comment_id: `{c.get('comment_id')}`\n"
        )

    if data.get("hasMore"):
        print(f"... more available (next cursor: {data.get('nextCursor')})")


if __name__ == "__main__":
    asyncio.run(main())
