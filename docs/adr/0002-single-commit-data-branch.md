# ADR 0002: Keep state on a data branch that always has one commit

- Status: accepted
- Date: 2026-11-15

## Context

The monitor needs a place to keep its history between runs, for free. Committing results to the main branch every five minutes adds about 105,000 commits a year, buries real changes and makes every clone larger.

## Decision

Store `state.json` and `status.json` on a branch called `data`. Every run creates a fresh repository with one commit and force-pushes it. The branch never has history, and main stays about code.

## Consequences

- The repository stays small and its history stays readable.
- Concurrent runs would overwrite each other, so the workflow uses a concurrency group that queues instead of cancelling.
- Past states cannot be recovered from the branch. The 90 day history lives inside the state file itself, which is enough for the page.
- If the file is damaged the only recovery is to reset it. The runbook says how, and the probe refuses to overwrite a state file it cannot parse.
