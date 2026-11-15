# ADR 0004: Smooth failures, count honestly

- Status: accepted
- Date: 2026-11-15

## Context

A single dropped packet should not page anyone, but a monitor that hides real failures is worse than none. Free-tier backends also have cold starts that look like slowness.

## Decision

- **Retry inside the run.** A failed attempt is retried once after two seconds. The first attempt that is not down is the observation.
- **Confirm across runs.** A service is published as failing only after two bad observations in a row. Recovery is shown on the first good one.
- **Incidents start at the first failure**, not when it was confirmed, so durations are not understated.
- **Three levels.** `up`, `degraded` (correct but slower than the limit) and `down`. Degraded counts as available, because the service answered.
- **Count every observation**, including ones that never became an incident. Availability is floored to two decimals, so 99.996% displays as 99.99% and never as 100.00% while a failure exists.
- **Day colour.** Green when every check passed. Amber when any failed or was slow but at least 99% were available. Red when more than 1% were not.

## Consequences

- Short blips lower the percentage without creating an incident, which is the honest outcome.
- Detection takes up to two check intervals, about ten minutes, for a service that goes down.
- The rules are covered by unit tests in `monitor/test/`, so a change to them is visible in review.
