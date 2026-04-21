---
name: verify-before-commit
description: Use before creating any commit or PR on TankTracker. Runs lint, build, and confirms the change was manually exercised. Trigger whenever you're about to run `git commit`, `git push`, or `gh pr create`, or when the user says "commit this" / "push" / "make a PR".
---

# Verify Before Commit — TankTracker

Evidence before commit. No "it should work."

## Required checks

Run these in parallel:

```bash
npm run lint
npm run build
```

Both must pass. A warning is not a pass — read the output.

## UI change? Also required:

If the diff touches anything in `views/`, `components/`, or `app/page.js` rendering, you must have:

1. Started the dev server (`npm run dev`) at some point during this task.
2. Loaded the affected page in a browser and used the feature.
3. Seen the expected behavior with your own eyes OR confirmed via the `tester` agent's report.

If none of those happened, STOP and do them before committing. If you cannot (e.g., no browser available), tell the user explicitly: "I have not manually verified this UI change" — do not commit silently assuming it works.

## Firestore schema change? Also required:

If the diff changes what's written to Firestore (new fields, renamed fields, changed types):

- Confirm existing documents won't break on read (defensive default or migration).
- Check all readers of that collection — grep for the collection name and the changed field.
- Note the migration need in the commit message if one is required.

## Secrets and config check

```bash
git diff --cached --name-only
```

Flag any of these appearing in the staged diff:
- `*firebase-adminsdk*.json`
- `.env*`
- `*credentials*`
- Any new file with `secret`, `key`, or `token` in the name

If flagged, stop and confirm with the user before committing.

## Output

Report to the user in this form before running `git commit`:

```
Pre-commit verification:
- lint: PASS
- build: PASS
- UI manually verified: yes / N/A (no UI change) / no (reason)
- Firestore schema change: no / yes (migration: [plan])
- No secrets in diff: confirmed

Ready to commit.
```

If anything is not PASS, do not commit.
