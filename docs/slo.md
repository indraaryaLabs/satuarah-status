# Service level objectives

Targets for products run by one person on free tiers. They are meant to be honest and checkable, not impressive. Revise them when the products or the audience change.

## How availability is measured

- **Indicator.** The share of checks that got a correct answer: right status code, expected content, within the time limit. A slow but correct answer counts as available and is shown as "slow" on the page.
- **Window.** Rolling 30 days, from the monitor's own data (`status.json`).
- **Vantage point.** GitHub Actions runners in the United States. This measures whether a service works, not how fast it feels in Indonesia.
- **Resolution.** One check every 5 minutes (15 for the database path). Outages shorter than that can be missed.

## Targets

| Service                 | Availability | Error budget per 30 days | Slow threshold |
| ----------------------- | ------------ | ------------------------ | -------------- |
| PickFrame web app       | 99.5%        | 3 h 36 min               | 2 s            |
| PickFrame API           | 99.5%        | 3 h 36 min               | 3 s            |
| PickFrame database path | 99.0%        | 7 h 12 min               | 4 s            |
| PickFrame Select app    | 99.5%        | 3 h 36 min               | 2 s            |
| Portfolio               | 99.0%        | 7 h 12 min               | 2 s            |

The error budget is `(1 - target) x 43,200 minutes`. For 99.5% that is 216 minutes.

The slow thresholds are the `degradedMs` values in [`config/services.json`](../config/services.json).

## Budget policy

| Budget used (30 days) | Response                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- |
| Under 50%             | Normal work                                                                         |
| 50% to 100%           | Finish the open incident follow-ups before starting new features on that service    |
| Over 100%             | Reliability work only on that service until a rolling 30 days is back inside target |

## What the numbers do not cover

- Sign-in, payments and anything behind a login. The monitor is anonymous by design.
- Correctness of data. A page that loads with wrong content is not detected beyond the content marker.
- Real user experience. Use browser or server metrics for that, if they are added later.

The anonymous journeys are covered by a separate suite, [pickframe-qa](https://github.com/indraaryaLabs/pickframe-qa), which runs daily against the same deployment.
