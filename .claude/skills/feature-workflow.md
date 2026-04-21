---
name: feature-workflow
description: Use when starting any non-trivial feature or fix on TankTracker — orchestrates the project's standard pipeline of product-owner → implementation → code-reviewer → tester. Trigger on phrases like "let's build", "add a feature", "implement", or any bug report where the fix isn't a one-line typo.
---

# TankTracker Feature Workflow

This is the canonical pipeline for non-trivial changes in TankTracker. Follow it in order — skipping a stage is how bugs ship.

## The four stages

### 1. Requirements — spawn `product-owner` agent

**Skip only if:** the user has already given a crisp spec with user, acceptance criteria, and out-of-scope section. If the request is one line like "fix the deposit bug" or "add a new report", that's NOT a crisp spec — invoke `product-owner`.

The PO returns a requirement document. Read it. If anything is unclear, ask the user before proceeding.

### 2. Implementation — main agent (you)

Build only what the PO spec describes. Do not add scope. When you're stuck on a design decision, go back to the PO — don't guess at business intent.

- Run `npm run dev` and exercise the feature yourself during development for any UI change.
- Keep the diff small. One concern per commit.
- Use the known codebase conventions (no TypeScript, inline styles, Firestore data flows through `app/page.js` as props).

### 3. Code review — spawn `code-reviewer` agent

After implementation, before committing, dispatch the `code-reviewer` agent on the diff. Pass it the PO spec as context so it can check the diff against intent, not just style.

Address blockers and majors. Minors/nits are optional.

### 4. Verification — spawn `tester` agent

After code review passes, dispatch the `tester` agent. Pass it the PO acceptance criteria so it tests against the spec.

The tester reports a test report. Read it. Any failures → back to step 2.

## When all four pass

Only now may you:
- Tell the user the work is complete.
- Offer to commit or open a PR.

Do not claim completion before the tester reports pass.

## Parallelism

Code-reviewer and tester can run in parallel once implementation is done — dispatch both in a single message with two Agent tool calls.

## Red flags that mean stop and restart the workflow

- You started coding without a PO spec. STOP. Get the spec.
- You skipped the reviewer because "it's a small change." STOP. Small changes have caused every production bug in history.
- The tester found a regression. You're tempted to "just fix it real quick." STOP. That fix goes through the same pipeline.
