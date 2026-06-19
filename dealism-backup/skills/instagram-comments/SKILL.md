---
name: instagram-comments
description: >
  Handle Instagram post comment operations for the seller. Trigger this skill
  when the user asks to view comments, reply to comments, analyze comment
  sentiment, find leads or superfans in comments, batch reply, or get content
  inspiration from comments. Covers: fetching posts, reading comments,
  sentiment analysis, intent detection, superfan identification, multilingual
  reply, and batch reply workflows.
  Rules:
  1) Call fetch_channel_data(channel="instagram") to verify Instagram is connected before any operation. Stop and prompt authorization if channel_linked is false.
  2) For any write operation (reply), always show a preview and get explicit
     user confirmation before executing — no silent writes.
  3) Batch reply hard limit: maximum 50 comments per batch call.
  4) For post content understanding: use caption if ≥50 chars; otherwise embed
     media_url (IMAGE) or thumbnail_url (VIDEO) as a vision input to analyze visually.
     Never show raw CDN URLs to the user — describe content in plain language and
     attach only the permalink as a labeled link.
metadata: {"openclaw":{"emoji":"💬","always":false}}
---

# Instagram Comments Management

## Prerequisites — Verify Instagram Authorization

Call `fetch_channel_data(user_id=<user_id>, channel="instagram")` to confirm the account is connected.
- If `channel_linked` is `true` → proceed with the workflow
- If `channel_linked` is `false` → respond:
  > "Your Instagram account is not connected yet. Please authorize here: {{DEALISM_APP_HOST}}/bind-channel/instagram"

---

## Scenario 1 — View & Summarize Comments

**Trigger phrases**: "view comments", "recent comments", "summarize comments", "what's under this post"

**Workflow**:

1. Fetch recent posts:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/get_posts.py --limit 50")
   ```
   Present the numbered list with caption preview, date, and comment count.
   Ask which post to inspect, or default to the most recent if user said "latest" / "most recent".

2. Fetch comments for the selected post:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/get_comments.py --media-id ... --page-size 50")
   ```

3. Summarize and present with this format:
   ```
   📝 Post: "[Post caption summary]" ([publish date])
   [N] comments total

   Top topics:
   - [Topic 1]: [X] comments
   - [Topic 2]: [X] comments

   Representative comments:
   ① @username ([date]):
      "[Full comment text]"

   ② @username ([date]):
      "[Full comment text]"

   Would you like me to analyze sentiment, or help you reply to a specific comment?
   ```

   Rules for comment listing:
   - Always show the post caption/title so user knows which post the comments belong to
   - Always show commenter's @username, comment date, and full comment text
   - Never abbreviate or omit the comment text — show complete content
   - If `hasMore=true`, tell the user and offer to load more
   - **For post media/URLs**: never show raw URLs or media links inline. Instead, briefly describe the media content (e.g. "a short video about AI sales automation") and place the permalink as a labeled link below the summary: `🔗 [View post](permalink)`

---

## Scenario 2 — Sentiment Monitoring & PR Alert

**Trigger phrases**: "comment sentiment", "any negative comments", "sentiment analysis", "PR alert", "is anyone complaining"

**Workflow**:

1. Fetch recent posts (default last 20 unless user specifies):
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/get_posts.py --limit 20")
   ```

2. Fetch comments for each post:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/get_comments.py --media-id ... --page-size 50")
   ```

3. Classify each comment: Positive / Neutral / Negative / Inquiry
   Negative signals: complaints about quality, delivery, color difference,
   unfulfilled promises, threats to unfollow, competitor comparisons.

4. Calculate negative ratio per post.
   If any post has negative ratio > 15%, proactively alert:
   > "Hey, the post '[Post summary]' has [N] negative comments ([X]% of total), mostly about: [topics]. Recommend addressing these first."

5. Present output:
   ```
   📊 Comment Sentiment Analysis (last [N] posts)

   📌 Post: "[Post 1 caption summary]" ([publish date])
   [X] comments: ✅ Positive [N] | ⚪ Neutral [N] | ❌ Negative [N] ([X]%)
   ⚠️ Comments to address:
     · @username ([date]): "[Full comment text]"
     · @username ([date]): "[Full comment text]"

   📌 Post: "[Post 2 caption summary]" ([publish date])
   [X] comments: ✅ Positive [N] | ⚪ Neutral [N] | ❌ Negative [N] ([X]%)
   ...

   Recommendation: [action suggestion]
   ```

   Always group comments under their post — never mix comments from different posts in the same list.

6. Ask the user:
   > "Would you like me to batch reply to these negative comments? Tell me the direction and I'll draft the replies."

---

## Scenario 3 — Lead Generation (Comment-Driven)

**Trigger phrases**: "who's asking about price", "potential customers", "find leads", "auto-reply inquiries"

**Workflow**:

1. Fetch posts and comments (same as Scenario 1, steps 1–2).

2. Identify purchase-intent comments. Intent signals:
   - Asks for price, link, size, stock, shipping: "how much", "where to buy", "in stock",
     "send link", "price", "shipping cost"

3. Present identified leads grouped by post:
   ```
   Found [N] potential customer comments:

   📌 Post: "[Post caption summary]" ([publish date])
   ① @username ([date])
      "[Full comment text]" — Intent: price inquiry

   ② @username ([date])
      "[Full comment text]" — Intent: requesting link
   ```

   Always show which post each lead comment belongs to, and include the full comment text so user understands the context before replying.

4. Ask user for reply strategy:
   > "I can help you reply to them. Please tell me:
   > - Which link do you want to drive them to? (website / store / landing page)
   > - Any discount code available?
   > - Reply tone: formal / friendly / with emoji?"

5. Generate personalized replies for each lead (not templates — reference what they asked).
   Show all previews.

6. After explicit user confirmation:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/batch_reply.py --replies '[{\"comment_id\":\"...\",\"reply_text\":\"...\"},...]'")
   ```

---

## Scenario 4 — Superfan Identification & Engagement

**Trigger phrases**: "who supports me most", "superfans", "active followers", "loyal fans", "top fans"

**Workflow**:

1. Fetch last 30 posts and their comments:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/get_posts.py --limit 30")
   bash("python3 $PROJECT_ROOT/scripts/get_comments.py --media-id ...") — repeat for each post
   ```

2. Aggregate by `username` across all posts:
   - Count distinct posts each user commented on
   - Count total comments
   - Note high like_count comments

3. Superfan criteria (any of the following):
   - Commented on ≥ 3 different posts, OR
   - Total comments ≥ 5, OR
   - Has comments with like_count ≥ 20

4. Present top 10 superfans with their most recent comment as evidence:
   ```
   🏆 Top 10 Superfans

   1. @lucy_fashion — commented on 7 posts, 12 comments total
      Latest comment: on "[Post summary]": "[Comment text]" ([date])

   2. @repeat_fan — commented on 5 posts, 8 comments total
      Latest comment: on "[Post summary]": "[Comment text]" ([date])
   ...
   ```

   Always show at least one representative comment per superfan with the post context, so user can personalize their reply.

5. Ask:
   > "Would you like me to send each superfan a special thank-you reply?
   > Reply tone: casual & warm / formal appreciation / personalized shoutout?"

6. Generate unique personalized reply for each superfan's most recent
   unreplied comment (reference what they actually said — not a generic template).
   Show all previews.

7. After confirmation:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/batch_reply.py --replies '[...]'")
   ```

---

## Scenario 5 — Content Inspiration from Comments

**Trigger phrases**: "what should I post next", "what do my followers want to see", "content ideas from comments", "content direction"

**Workflow**:

1. Fetch last 10 posts and their comments.

2. Extract topics, questions, and explicit content requests from comments.
   Cluster into themes ranked by frequency × engagement (comment + like count).

3. Present output:
   ```
   💡 Based on [M] comments across the last [N] posts, here are content direction recommendations:

   🥇 [Topic 1] — mentioned in [N] comments, [X] total likes
      Representative voice: "[Actual comment quote]"
      Suggested topic: [Specific title]

   🥈 [Topic 2] — mentioned in [N] comments, [X] total likes
      Representative voice: "[Actual comment quote]"
      Suggested topic: [Specific title]

   🥉 [Topic 3] — ...
   ```

---

## Scenario 6 — Multilingual Reply

**Trigger phrases**: "reply in their language", "multilingual", "English comments", "non-Chinese comments", "auto-detect language"

**Workflow**:

1. Fetch comments for specified post(s).

2. Detect language for each comment. Group by language and report:
   > "Language breakdown: Chinese [N] | English [N] | Spanish [N] ..."

3. Ask user:
   > "Which languages would you like me to reply in? I can handle all of them, or specific ones.
   > Reply tone: official brand voice / casual and natural / with local slang?"

4. Generate localized replies — do NOT just translate.
   Adapt to local tone and natural expressions:
   - Chinese: use casual expressions like "好滴", "哈哈", "超棒"
   - English: use contractions and casual emoji if appropriate
   - Spanish: use warmth markers "¡Gracias!" and local expressions

5. Show all previews grouped by language.

6. After confirmation:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/batch_reply.py --replies '[...]'")
   ```

---

## Single Reply Workflow

When user says "reply to comment #X" or "reply to @username":

1. Identify the target comment — ask for clarification if ambiguous.
2. Before drafting, confirm context to user:
   > "📌 Post: "[Post caption summary]"
   > 💬 @username ([date]) said: "[Full comment text]"
   >
   > Here's my draft reply:
   > [reply content]
   >
   > Confirm and send?"
3. After confirmation:
   ```bash
   bash("python3 $PROJECT_ROOT/scripts/reply_comment.py --comment-id ... --text '...'")
   ```
4. Confirm success to user: "✅ Reply sent to @username's comment on '[Post summary]'."

---

## Batch Reply Rules (CRITICAL — must follow)

1. **Preview before send**: Always display ALL replies in a numbered list
   before calling `batch_reply.py`. Never send without explicit confirmation.

2. **Hard limit 50**: If more than 50, split into rounds and inform the user.

3. **Skip already-replied**: If `already_replied=true` on a comment, skip it
   and inform the user in the summary.

4. **Report failures clearly**:
   > "Successfully replied to [N] comments, [M] failed.
   > Failures may be due to deleted comments or permission issues."

5. **Large batch notice**: If batch > 20, mention:
   > "Sending now — this may take 10–20 seconds for large batches, please wait..."

---

## Key Principles

1. **Read before write** — always fetch and present data before any reply action
2. **Always show full context** — every comment display must include: post title/caption,
   commenter @username, comment date, and full comment text.
   Never show comments without their post context — the user must always know
   "which post, who said it, what they said"
3. **Never expose comment_id to users** — comment_id is internal and used only in
   tool calls. Never display it in any user-facing output.
4. **Reuse data in context** — if posts/comments were already fetched earlier
   in the conversation, reuse them; do not re-fetch unnecessarily
5. **Graceful degradation** — if a post has 0 comments, say so clearly
   and offer to check another post
6. **No silent writes** — every reply requires explicit user confirmation
7. **Understand post content before summarizing** — use this decision flow for every post:
   - If `caption` is long enough (≥ 50 characters): use it directly as the content description.
   - If `caption` is short or empty AND `media_type` is `IMAGE` or `CAROUSEL_ALBUM`:
     embed the `media_url` as an inline image reference so you can visually analyze it,
     then describe what you see in plain language (e.g. "a product photo showing a skincare set").
     Example of how to reference the image in your thinking:
     > [Image: <media_url>] → describe content based on visual analysis
   - If `caption` is short or empty AND `media_type` is `VIDEO` or `REEL`:
     embed `thumbnail_url` (if available) as an image reference for the cover frame,
     and infer content from caption + media_product_type (e.g. "a Reel likely about...").
   - Never paste raw `media_url`, `thumbnail_url`, or CDN links directly to the user.
     Always present the final description in natural language, with `permalink` as a
     labeled link at the bottom: `🔗 [View post on Instagram](permalink)`.

