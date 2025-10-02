# Architecture Decision Records (ADRs)

Documents key architectural decisions with context and rationale.

## Format

```markdown
# [Number]. [Title]

Date: YYYY-MM-DD

## Status

[Accepted | Deprecated | Superseded]

## Context

Problem or requirement

## Decision

Technical solution chosen

## Consequences

Trade-offs and implications

## Alternatives Considered

Other options evaluated

## References

Relevant links
```

## Index

| #                                       | Title                           | Date       |
| --------------------------------------- | ------------------------------- | ---------- |
| [001](001-monorepo-architecture.md)     | Monorepo Architecture with pnpm | 2025-01-02 |
| [004](004-multi-rail-payment-system.md) | Multi-Rail Payment System       | 2025-01-02 |

## Adding ADRs

1. Number sequentially: `00X-title.md`
2. Fill template sections
3. Update this index
4. Submit PR

## When to Write

Document decisions that:

- Affect architecture significantly
- Have important trade-offs
- Impact multiple components
- Are hard to reverse
