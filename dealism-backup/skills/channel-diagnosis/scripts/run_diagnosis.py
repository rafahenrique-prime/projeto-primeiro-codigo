#!/usr/bin/env python3
"""
Channel Diagnosis Script

Analyze channel conversation data: quality metrics, revenue loss, profile analysis.
Reads from fetch_channel_data temp cache.

Usage:
  python3 $PROJECT_ROOT/scripts/run_diagnosis.py \
    --channel instagram --mode full

SELLER_ID is read from environment (injected by BashTool).
Override with --seller-id if needed.
"""

import argparse
import json
import os
import sys

# Resolve project root
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


def load_cached_data(seller_id: str, channel: str) -> dict | None:
    """Load cached channel data from temp file."""
    import asyncio
    from storage.factory import get_object_store

    async def _load():
        storage = get_object_store()
        key = f"users/{seller_id}/workspace/temp/channel/{channel}_data.json"
        try:
            raw = await storage.read_text(key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
        return None

    return asyncio.run(_load())


def run_analyze(cached: dict, channel: str) -> str:
    """Run conversation analysis."""
    from tools.channel.analytics.models import Platform
    from tools.channel.analytics.conversation_analyzer import ConversationAnalyzer
    from tools.channel.channel_adapter import conversations_from_api

    platform = Platform.INSTAGRAM if channel == "instagram" else Platform.WHATSAPP
    raw_convos = cached.get("conversations", [])
    if not raw_convos:
        return f"No {channel} conversations found for analysis."

    conversations = conversations_from_api(raw_convos, platform)
    analyzer = ConversationAnalyzer()
    analytics = analyzer.analyze(conversations, platform)
    stats = analytics.message_stats
    quality = analytics.quality_metrics

    issues_text = ""
    if quality.issues:
        issues_text = "\n".join(f"  - {issue}" for issue in quality.issues)
    else:
        issues_text = "  None detected"

    return (
        f"**{channel.title()} Conversation Analysis**\n\n"
        f"**Overview** ({stats.total_conversations} conversations):\n"
        f"- Reply rate: {stats.reply_rate:.0%}\n"
        f"- Missed conversations: {stats.missed_conversations}\n"
        f"- Avg response time: {stats.avg_response_time_hours:.1f}h\n"
        f"- Responded within 1h: {stats.responded_within_1h}\n"
        f"- Responded within 24h: {stats.responded_within_24h}\n"
        f"- Responded after 24h: {stats.responded_after_24h}\n\n"
        f"**Quality Score**: {quality.overall_quality_score:.0f}/100\n"
        f"- Completion rate: {quality.completion_rate:.0%}\n"
        f"- Avg messages/conversation: {quality.avg_messages_per_conversation:.1f}\n\n"
        f"**Issues**:\n{issues_text}"
    )


def run_loss(cached: dict, channel: str, industry: str = "default") -> str:
    """Run revenue loss calculation."""
    from tools.channel.analytics.models import Platform
    from tools.channel.analytics.conversation_analyzer import ConversationAnalyzer
    from tools.channel.analytics.opportunity_calculator import OpportunityCalculator, format_loss_summary
    from tools.channel.channel_adapter import conversations_from_api

    platform = Platform.INSTAGRAM if channel == "instagram" else Platform.WHATSAPP
    raw_convos = cached.get("conversations", [])
    if not raw_convos:
        return f"No {channel} conversations found for loss calculation."

    conversations = conversations_from_api(raw_convos, platform)
    analyzer = ConversationAnalyzer()
    analytics = analyzer.analyze(conversations, platform)
    calculator = OpportunityCalculator()
    loss = calculator.calculate(analytics, industry=industry)
    return format_loss_summary(loss)


def run_profile(cached: dict, channel: str, style: str = "balanced") -> str:
    """Run profile analysis + personalized opening generation."""
    from tools.channel.analytics.models import Platform
    from tools.channel.analytics.conversation_analyzer import ConversationAnalyzer
    from tools.channel.analytics.opportunity_calculator import OpportunityCalculator
    from tools.channel.analytics.profile_analyzer import ProfileAnalyzer
    from tools.channel.analytics.personalization import PersonalizationEngine
    from tools.channel.channel_adapter import conversations_from_api, profile_from_api

    platform = Platform.INSTAGRAM if channel == "instagram" else Platform.WHATSAPP
    raw_profile = cached.get("profile")
    if not raw_profile:
        return f"No {channel} profile data found in cache."

    user_id = cached.get("user_id", "")
    profile = profile_from_api(raw_profile, platform, str(user_id))
    profile_analyzer = ProfileAnalyzer()
    profile = profile_analyzer.analyze(profile)

    analytics = None
    loss = None
    raw_convos = cached.get("conversations", [])
    if raw_convos:
        conversations = conversations_from_api(raw_convos, platform)
        analyzer = ConversationAnalyzer()
        analytics = analyzer.analyze(conversations, platform)
        calculator = OpportunityCalculator()
        loss = calculator.calculate(analytics)

    engine = PersonalizationEngine()
    opening = engine.generate(profile, analytics, loss, style=style)

    display = profile.display_name or profile.username or "Unknown"
    return (
        f"**Profile Analysis** ({display})\n\n"
        f"- Business category: {profile.business_category}\n"
        f"- Tone: {profile.tone}\n"
        f"- Post frequency: {profile.post_frequency}\n"
        f"- Interests: {', '.join(profile.interests) if profile.interests else 'N/A'}\n\n"
        f"**Personalized Opening** (score: {opening.personalization_score:.0f}/100)\n\n"
        f"**Full version:**\n{opening.full_opening}\n\n"
        f"**Short version:**\n{opening.short_version}\n\n"
        f"**Formal version:**\n{opening.formal_version}"
    )


def auto_persist(seller_id: str, filename: str, content: str):
    """Save result to workspace memory/knowledge."""
    import asyncio
    from storage.factory import get_object_store

    async def _save():
        storage = get_object_store()
        path = f"users/{seller_id}/workspace/memory/knowledge/{filename}"
        try:
            await storage.write_text(path, content)
        except Exception:
            pass

    asyncio.run(_save())


def main():
    parser = argparse.ArgumentParser(description="Channel Diagnosis")
    parser.add_argument("--channel", required=True, choices=["instagram", "whatsapp"])
    parser.add_argument("--seller-id", default=None, help="Override SELLER_ID env var")
    parser.add_argument("--mode", default="full", choices=["full", "analyze", "loss", "profile"])
    parser.add_argument("--industry", default="default")
    parser.add_argument("--style", default="balanced", choices=["aggressive", "balanced", "soft"])
    args = parser.parse_args()

    seller_id = args.seller_id or os.environ.get("SELLER_ID")
    if not seller_id:
        print("Error: SELLER_ID not found. Set env var or pass --seller-id.")
        sys.exit(1)

    cached = load_cached_data(seller_id, args.channel)
    if not cached:
        print(f"Error: No cached data for {args.channel}. Call fetch_channel_data first.")
        sys.exit(1)

    sections = []

    if args.mode in ("full", "analyze"):
        result = run_analyze(cached, args.channel)
        sections.append(result)
        auto_persist(seller_id, f"{args.channel}_analytics.md", result)

    if args.mode in ("full", "loss"):
        result = run_loss(cached, args.channel, args.industry)
        sections.append(result)
        auto_persist(seller_id, f"{args.channel}_revenue_loss.md", result)

    if args.mode in ("full", "profile"):
        result = run_profile(cached, args.channel, args.style)
        sections.append(result)
        auto_persist(seller_id, f"{args.channel}_profile_analysis.md", result)

    print("\n\n---\n\n".join(sections))


if __name__ == "__main__":
    main()
