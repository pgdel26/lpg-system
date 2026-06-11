# TankTracker (gasul-inventory)

Next.js + Firestore app for a Philippine LPG cylinder retail business. Product name: TankTracker. Repo/package name: `gasul-inventory`.

## Teaching Mode

I'm a Salesforce developer learning this stack (Next.js, React, Firestore). When possible, draw analogies to Apex, SOQL, Lightning components, or platform events.

After every code change you make:

1. **What changed** — list the files and a one-line summary of each edit
2. **Why this approach** — explain the reasoning, including why you chose this pattern over alternatives
3. **Stack concept** — name the underlying concept (e.g., "this uses React's useEffect cleanup function because...") and link it to something I might already know from Salesforce/Apex
4. **What to watch for** — gotchas, side effects, or related patterns I'll likely encounter next
5. **Check my understanding** — end with one question to make sure I followed

Don't skip this even for small changes. If a change is trivial (typo, formatting), say so and skip the deep explanation.

## Stack and conventions

- **Framework:** Next.js 16 (App Router), React 19. No TypeScript anywhere — do not introduce it.
- **Styling:** Inline `style={{}}` objects are the house style. Do not add Tailwind class usage (Tailwind is installed but not used this way), CSS modules, or styled-components.
- **Data:** Firebase / Firestore. All subscriptions and mutations live in `app/page.js`. Pages in `views/` receive data and handlers as props — they do not touch Firestore directly.
- **No test framework.** Verification is lint + build + manual in the dev server. Don't scaffold Jest/Vitest unless the user asks.
- **No commit co-author footers on solo commits** (the user is the only contributor).

## Directory map

- `app/page.js` — top-level page; Firestore subscriptions, mutation handlers, routing between views.
- `app/layout.js` — root layout.
- `views/` — page-level components (DashboardPage, ProductsPage, etc.).
- `components/` — reusable UI (SaleModal, CustomerSearch, ConfirmModal, Icons, Toast, LoginPage).
- `lib/utils.js` — shared helpers. **`today()` is the canonical date-string helper — use it, don't `new Date().toISOString()`.**
- `lib/allowedEmails.js` — email allowlist for access.
- `scripts/` — one-off migration scripts (node, admin SDK).

## Domain essentials

Don't fumble these — the Product Owner agent's file has the full domain, but at minimum:

- **Products** have a `category` field. The two categories with first-class pricing support are `cylinder` (two prices: full + refill) and `accessories` (single SRP). Other categories exist (e.g., `cylinder_deposit`) and must not be silently ignored.
- **Pricebooks** have states: `active` (at most one), `draft` (at most one), deactivated (historical, immutable). Active is what sales price against.
- **Sales** accept cash or GCash (Philippine mobile wallet). GCash ref number is optional.

## Known hotspot: hardcoded category filters

The single most common bug class in this repo. Before changing any code that involves `p.category`, read `.claude/skills/safe-category-change.md`. The CYLINDER_DEPOSIT April 2026 bug is the canonical example — products in new categories appear on the Products subtab but silently disappear from pricebook modals.

## Agents (in `.claude/agents/`)

Use these via the `Agent` tool with `subagent_type` set to the name:

- **`product-owner`** — defines business requirements with acceptance criteria. Call before building any non-trivial feature.
- **`ui-ux-designer`** — designs/critiques UI surfaces and flows in TankTracker's existing visual language. Call when designing a new screen or when something feels off. Pairs with `product-owner` (PO defines what; designer decides how).
- **`code-reviewer`** — reviews diffs for correctness, simplicity, security, conventions. Call before committing.
- **`tester`** — verifies features end-to-end (lint, build, manual UI). Call before declaring work done.

## Skills (in `.claude/skills/`)

These encode workflows and guardrails. The harness auto-triggers them based on their descriptions, but you can also invoke them via the `Skill` tool:

- **`feature-workflow`** — PO → implement → review → test pipeline for non-trivial work.
- **`verify-before-commit`** — lint + build + manual verification before committing.
- **`safe-category-change`** — mandatory when touching product categories.
- **`pricebook-testing`** — invariants and state-transition matrix for pricebook changes.

## Common commands

```bash
npm run dev       # start dev server at localhost:3000
npm run build     # production build — must pass before commit
npm run lint      # eslint — must pass before commit
```

## Security

- **Never commit or reference `gasul-inventory-firebase-adminsdk-*.json` from client-side code.** It's admin SDK credentials. It should only be read by scripts in `scripts/`.
- Client-side "is admin" checks are UX only. Real access control is Firestore rules. Don't write code that treats a client-side role check as a security boundary.

## Working on this repo

1. For any non-trivial change, start with the `feature-workflow` skill.
2. For simple typo/style fixes, you can skip the pipeline — but still run lint + build before committing.
3. Match the existing code style. If you're reaching for a new pattern/library, ask the user first.
4. Keep diffs focused. One concern per commit. No "while I'm here" drive-bys.
