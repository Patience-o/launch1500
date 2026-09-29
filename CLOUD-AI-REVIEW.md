# Launch1500 Cloud AI Review

Date: 2026-09-26
Status: PROPOSED. No provider, API key, paid request or public deployment activated.

## Working Locally

The website assistant gathers a project brief, suggests an initial package, explains the published scope, calculates a provisional estimate and a 30% deposit, and prepares an editable WhatsApp message. It is a deterministic guided assistant, not a connected AI model. Conversation and project details stay in the current browser tab and are not persisted. Language preference is stored separately by the existing page.

The visitor must complete the brief, review the message, and explicitly consent before opening WhatsApp. The visitor must still press Send in WhatsApp. Editing the message revokes that consent. No real payment, founder approval, HQ submission or automatic website build is implemented by this assistant.

## Proposed First Cloud Connection

[Recommendation] Use OpenAI Responses through a server-side endpoint with `gpt-5.4-mini-2026-03-17` as a fixed initial evaluation model. It supports structured outputs and function calling; selection remains subject to account availability and English/Arabic acceptance tests. This is a baseline proposal, not a claim that it is the best or newest model.

The model would explain website options and turn free-text requirements into a draft brief. Package prices and deposit calculations would remain controlled by validated application code, never model-generated totals. The model would have no authority to send messages, take payments, publish sites, approve work or access founder records.

Setup requires a server-side secret reference, authenticated and rate-limited access, visitor consent, bounded request size, limited context, timeouts, protected usage counters and a verified spending stop. Keys must never be entered in the page, committed, or pasted into chat. The current static page alone cannot safely host a private API key.

Proposed pilot scope: private local testing only, synthetic business examples only, no names/contact details, no production visitors, no public deployment, no web search initially. Prepare integration and mocked failure tests first; a separate approval is required before paid requests.

## Privacy And Data Leaving The System

After separate activation approval and visitor consent, the minimum website requirements and relevant package context would go from the backend to OpenAI. Contact name and phone should remain local and be added only to the reviewed WhatsApp message. Do not send passwords, payment details, patient records, confidential documents or other sensitive information.

Use `store: false`, avoid a persistent conversation store, avoid customer-content logging, and display provider/offline status truthfully. This does not establish zero retention: [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data) describe default abuse-monitoring retention of up to 30 days, with stated exceptions. Zero Data Retention is a separately approved provider control, not a property this application can promise.

## Cost Illustration

[Confirmed] The [standard API pricing table](https://developers.openai.com/api/docs/pricing) lists GPT-5.4 mini at USD 0.75 per million input tokens and USD 4.50 per million output tokens, checked on the date above. This proposal does not use batch, priority, regional or paid search pricing.

[Assumed] A ten-reply conversation averaging 2,000 input tokens and 400 output tokens per reply would use 20,000 input and 4,000 output tokens in total: about USD 0.033 per conversation, or USD 3.30 per 100 conversations. Context replay and reasoning output can increase usage; this is an illustration, not a fixed quote. Hosting, taxes and optional tools are excluded.

[Recommendation] Propose a USD 10 total synthetic-test budget only after cost counters and a conservative pre-request hard stop are implemented and tested. A provider dashboard budget alert alone must not be represented as an enforced cap. No money has been spent by this implementation.

## Approval And Risks

Founder decision needed: approve setup-only work for the bounded private pilot above, revise the provider/scope/budget, postpone, or reject. Setup-only approval does not authorize API-key access, paid API requests, real customer data, web search, public deployment or payment integration.

Risks: inaccurate model advice, invented scope promises, prompt injection, data disclosure, unexpected usage, rate limits and provider outages. Mitigations to build and verify: deterministic quotation rules, allowlisted read-only functions, consent, minimal data, capped usage, bounded retries, refusal of external actions and an honest local guided fallback. Implementation duration and production readiness remain unverified.

If approved: prepare the server interface and mocked tests, then provide the exact secret setup instructions and paid-test impact report for a separate decision. If postponed/rejected: the local guided assistant remains usable without a provider connection.

## Local Verification And Rollback

Run `node launch1500_tests.js` from the project root. It uses its own temporary loopback server and intercepts the WhatsApp handoff without sending a message. Use `http://127.0.0.1:8890/launch1500/` for the existing local preview; the Launch1500 page and three demos also support direct file opening.

Changes are confined to the Launch1500 interface, demo navigation and its focused tests. No credentials, production configuration or customer data were migrated. A rollback should reverse only this task's page/style/script changes, preserving any unrelated work. Do not reset the enclosing home-directory Git repository.

Primary references: [model capabilities](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [API pricing](https://developers.openai.com/api/docs/pricing), [data controls](https://developers.openai.com/api/docs/guides/your-data).
