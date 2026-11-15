# Monitor pipeline

The monitor is the thing that tells you about the other things, so it needs its own runbook.

## Symptoms

- The status page shows "Monitoring data is N minutes old".
- The status page says the data could not be loaded.
- Every service is "No data yet".
- A run of the Probe workflow is red.

## Quick check

```bash
curl -sS https://raw.githubusercontent.com/indraaryaLabs/satuarah-status/data/status.json | head -c 300
```

The `generatedAt` field should be within the last 10 minutes.

## Causes and fixes

| Cause                                                                  | How to see it                                                                          | Fix                                                                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Scheduled runs were disabled after 60 days without repository activity | Actions tab shows the Probe workflow as disabled                                       | Click Enable workflow, then run it once manually. Repository activity, such as a commit to main, keeps it from happening again |
| GitHub Actions is delayed or having an incident                        | The Probe runs are queued or missing, and the GitHub status page agrees                | Wait. The page already warns visitors                                                                                          |
| The `data` branch was deleted                                          | `git ls-remote` shows no `data` branch                                                 | Run the Probe workflow manually. It starts empty, and history is lost                                                          |
| `state.json` is corrupt                                                | The "Check services" step fails with "state file has an unknown shape" or a JSON error | See below                                                                                                                      |
| The config is invalid                                                  | The step fails with a message naming the field                                         | Fix `config/services.json`; `npm test` validates it                                                                            |
| A secret or permission changed                                         | The Publish step fails with 403                                                        | Check that workflow permissions allow `contents: write` and `issues: write`                                                    |
| `raw.githubusercontent.com` unreachable                                | `curl` above fails but the Probe runs are green                                        | Wait. Nothing is wrong with the data                                                                                           |

## Resetting a corrupt state

This loses history, so save a copy first.

```bash
git fetch origin data
git show origin/data:state.json > state-backup.json
git push origin --delete data
```

Then run the Probe workflow manually. It creates a fresh `data` branch. The status page will show empty history for the days before the reset.

## Running a probe by hand

```bash
npm ci
node monitor/cli.ts --data /tmp/status --force
```

It writes `state.json` and `status.json` into the given folder and prints a summary table. Add `--notify` only with a `GITHUB_TOKEN`, since it opens real issues.
