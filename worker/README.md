# Launch1500 concierge — live AI backend (Cloudflare Worker)

This folder is the optional backend for the on-site concierge's **live mode**. Free-text
questions are answered by Claude through this Worker; every deterministic flow (demo
matcher, project brief, package quote, consent + WhatsApp handoff, quick-topic chips)
stays on the page and never touches this backend.

If the Worker is missing, unreachable, or has no API key, the assistant stays in its
guided mode automatically. Nothing on the site breaks.

- Runtime: plain ES-module Worker, **zero npm dependencies**.
- Model: `claude-sonnet-5` (the `MODEL` var in `wrangler.toml`).
- Secret: `ANTHROPIC_API_KEY` — a Worker secret only. It is never written to this
  folder, to the site, to chat, or to any file.
- The folder is excluded from the static site by `../.surgeignore`.

## Setup (in this order)

All `npx wrangler …` commands need Node 22 or newer. On this Mac use Node 24:

```bash
export PATH="/opt/homebrew/bin:$PATH"     # Node 24
cd worker
```

`wrangler` is not installed in this folder on purpose (the Worker has zero dependencies).
The first `npx wrangler …` command asks "Need to install the following packages: wrangler —
Ok to proceed?" — answer `y`.

1. **Log in to Cloudflare** (opens a browser window):

   ```bash
   npx wrangler login
   ```

2. **Create the usage KV namespace** and paste its id into `wrangler.toml`:

   ```bash
   npx wrangler kv namespace create USAGE
   ```

   The command prints something like `id = "0123…abcd"`. Replace
   `REPLACE_WITH_KV_ID` in `wrangler.toml` with that value. The namespace only ever
   holds hashed per-client window counters and per-day counters — no IPs, no text.

3. **Store the Anthropic API key as a secret.** Paste the key into the terminal prompt
   when asked. Do not paste it in chat, in a file, or on the command line:

   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

   Because the Worker has not been deployed yet, wrangler asks: "There doesn't seem to be
   a Worker called "launch1500-concierge". Do you want to create a new Worker with that
   name and add secrets to it?" — answer `y`. (If you prefer, run step 4 first — `/health`
   then reports `"live": false` — and add the secret afterwards; it takes effect
   immediately without a redeploy.)

4. **Deploy:**

   ```bash
   npx wrangler deploy
   ```

   The output ends with the public URL, e.g.
   `https://launch1500-concierge.<your-subdomain>.workers.dev`.

5. **Point the site at it.** In `../assistant.js`, near the top, replace the placeholder:

   ```js
   var AI_ENDPOINT = (window.LAUNCH_AI_ENDPOINT || 'https://launch1500-concierge.REPLACE_ME.workers.dev').replace(/\/$/, '');
   ```

   with your `workers.dev` URL, then publish the static site as usual. (Alternatively,
   set `window.LAUNCH_AI_ENDPOINT` before `assistant.js` loads — it takes precedence.)

## Checking it

```bash
curl -s https://launch1500-concierge.<your-subdomain>.workers.dev/health
# → {"ok":true,"live":true,"model":"claude-sonnet-5"}
```

`"live": false` means the secret is not set (step 3). The page probes this same URL once,
when the assistant is first opened, and switches its status line to
"Live AI connected (Claude)" only when `live` is `true`.

`/chat` only accepts browser requests from the origins listed in `ALLOWED_ORIGINS`;
a plain `curl` without an `Origin` header gets `403` by design.

Run the local test suite (no network, no key needed):

```bash
/opt/homebrew/bin/node --test /Users/omranalroomi/Desktop/MotherBrain-Company-Island-Master-SSD/launch1500/worker/test
# also passes on Node 20:
/Users/omranalroomi/.nvm/versions/node/v20.19.4/bin/node --test /Users/omranalroomi/Desktop/MotherBrain-Company-Island-Master-SSD/launch1500/worker/test
```

## What each request costs

Each `/chat` call sends the system prompt (the published facts and rules, roughly a few
hundred tokens), the last few turns of the conversation (the page sends at most 8
messages, each capped at 1,200 characters) and a short business-type/goal line. The reply
is capped at 350 output tokens.

Claude Sonnet 5 is billed per million input tokens and per million output tokens; check
the current rates on Anthropic's pricing page before estimating. As an illustration, a
typical question is well under 1,000 input tokens and under 200 output tokens, so the
spend per question is a fraction of a cent, and the `DAILY_LIMIT` of 300 requests keeps
the worst case bounded to a few hundred short requests per day.

Hard limits enforced by the Worker:

| Limit | Value | Where |
|---|---|---|
| Requests per client per 10 minutes | 30 | `IP_LIMIT` |
| Requests per UTC day, all clients | 300 | `DAILY_LIMIT` |
| Request body | 16 KB | code |
| Messages per request | 1–12, ≤ 1,200 chars each, ≤ 8,000 total | code |
| Upstream timeout | 20 s | code |
| Reply length | 1,500 chars, 350 output tokens | code |

When a limit is hit the page shows the guided answer instead; after two consecutive
failures it switches back to guided mode for the rest of the visit.

## Switching it off

Any of these makes the site fall back to guided mode automatically — no site change needed:

- Remove the key: `npx wrangler secret delete ANTHROPIC_API_KEY` → `/health` reports
  `"live": false` and `/chat` returns `503`.
- Delete the Worker: `npx wrangler delete` → the probe fails and the page stays guided.
- Revoke the key in the Anthropic console → `/chat` returns `502`; the page falls back.

## Changing the allowed origins or the daily cap

Edit `[vars]` in `wrangler.toml` and redeploy (`npx wrangler deploy`):

- `ALLOWED_ORIGINS` — comma-separated, exact-match origins (scheme + host + port, no path,
  no trailing slash). Add a new host here before pointing its copy of the site at the Worker.
- `DAILY_LIMIT` — global requests per day. `IP_LIMIT` — per-client requests per 10 minutes.

Values set in the Cloudflare dashboard are overwritten by the next `wrangler deploy`,
so keep `wrangler.toml` as the source of truth.

## Privacy notes

- Only the question text, the recent conversation turns, the business name, and the
  business type / goal / package are sent. Name, phone, notes, custom requests and the
  WhatsApp draft never leave the page (the page's `buildAiContext` cannot produce them,
  and the Worker drops any name/phone/email-looking context keys anyway).
- The Worker never stores or logs IPs or message text. Rate-limit keys are SHA-256
  hashes of `ip:window` truncated to 32 hex chars, and expire on their own. The daily
  counter is spread over eight `day:YYYY-MM-DD:<0-7>` keys (summed on read) so
  concurrent customers do not hit KV's one-write-per-second-per-key limit; if KV itself
  fails, the request is refused with `429` and nothing is sent upstream.
- Upstream error bodies are never forwarded to the browser.
