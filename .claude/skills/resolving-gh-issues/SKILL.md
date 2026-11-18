---
name: resolving-gh-issues
description: Use when asked to fix, work through, or close out open GitHub issues, an issue backlog or queue, or when deciding how an issue ends after its fix. Triggers on "resolve the open issues", "close out the backlog", "fix #N", gh issue list, issue links.
---

# Resolving GitHub Issues

## Overview

Work the open issues one at a time. Every issue ends the same way: a pushed commit, then a close that names that commit.

## The contract

An issue is done only when all of these exist, in this order:

1. **Fix** on current HEAD, verified by the repo's checks (typecheck, tests, real-app probe where the repo demands one).
2. **Commit** — one commit per issue, message names the issue number.
3. **Push** to the branch the default branch integrates from.
4. **Close** naming the commit:
   `gh issue close <N> --comment "Fixed in <short-sha>."`

Never close before the fix is pushed. A close comment without a commit SHA is not done.

## One at a time

Finish the contract above for one issue before starting the next. No shared branch for unrelated issues, no "fix three, commit once".

**Batch only when issues touch the same code** — the same file, function, or test. Then one fix, one commit, and close each batched issue with its own `gh issue close`, each naming the shared commit. Different areas of the codebase means separate passes, even when bundling looks cheaper.

Decide batching by reading the code, not by issue titles: two issues with different titles can land in the same function, and that is a batch.

## If the repo auto-closes

Where commits use `Fixes #N` and GitHub closes on merge, that counts as the close only if you verify it: after merging, check `gh issue view <N>` shows closed and linked to the commit. Unverified auto-close is not done.

## Quick reference

```bash
gh issue list --state open --json number,title
gh issue view <N>                      # re-check it is still valid on HEAD first
git commit -m "Fix <thing> (#N)"
gh issue close <N> --comment "Fixed in $(git rev-parse --short HEAD)."
gh issue list --state open             # the queue you just shortened
```

## Common mistakes

| Mistake | Fix |
|---|---|
| Closing at the end of the session in one sweep | Close each issue as its contract completes |
| Closing on "fixed, will push later" | Push first, then close |
| One commit closing five unrelated issues | One commit per issue; batch only same-code issues |
| Auto-close assumed, never checked | `gh issue view <N>` after merge |
| Issue still valid? guessed | `gh issue view <N>` on current HEAD before fixing |
