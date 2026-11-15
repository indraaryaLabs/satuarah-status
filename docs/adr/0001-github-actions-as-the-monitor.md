# ADR 0001: Use GitHub Actions as the monitor

- Status: accepted
- Date: 2026-11-15

## Context

The products run on free tiers, so the monitor must cost nothing and must not depend on a server that can itself sleep or expire. Options considered:

- A hosted uptime service on its free plan. Cheap, but the history, data and design are theirs, and it shows nothing about how monitoring works.
- A small server on a free host. Free hosts sleep after idle time or expire databases, which would make the monitor less reliable than the things it watches.
- Scheduled GitHub Actions on a public repository. No cost limit for public repositories, no server to keep alive.

## Decision

Run the probe as a scheduled workflow every five minutes.

## Consequences

- Zero cost and no infrastructure.
- Scheduled runs are best effort and can start late or be skipped under load. The page therefore shows the age of its data and warns when it is old, instead of pretending to be real time.
- GitHub disables scheduled workflows after 60 days without repository activity. This is documented in the monitor runbook.
- All checks come from one place (United States datacenters). Latency numbers describe that vantage point.
- Checks are limited to what an HTTP request can see.
