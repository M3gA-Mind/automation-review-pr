# Approve Button

## Overview

The Approve button appears on the PR detail page when a PR has `clean` status (0 critical/major findings from automated review). It posts a GitHub APPROVE review as `graycyrus` after running pre-flight checks.

## Flow

1. User clicks "Approve" on a clean PR's detail page
2. Backend runs pre-flight checks:
   - **CI passing**: all GitHub checks must be in `pass` bucket
   - **No conflicts**: PR must be `MERGEABLE`
   - **Status clean**: PR must be in `clean` status in the DB
3. If checks pass: posts APPROVE review via GitHub API
4. Updates tracking file:
   - Changes status from `clean` to `approved`
   - Appends approval entry with timestamp, reviewer, pre-flight results, review URL
5. Moves tracking file to `approved/` directory
6. Writes approval log to `logs/approve-PR-<N>-<timestamp>.log`

## Pre-flight checks

If any check fails, the endpoint returns HTTP 400 with a checks object:

```json
{
  "error": "Pre-flight failed: CI not passing",
  "checks": {
    "status_clean": true,
    "ci_passing": false,
    "no_conflicts": true
  }
}
```

## Tracking file update

Appended to the PR's tracking `.md` file:

```markdown
### Approved — 2026-05-19T10:30:00.000Z
**Approved by**: graycyrus
**Pre-flight**: CI pass | No conflicts
**GitHub review URL**: https://github.com/tinyhumansai/openhuman/pull/2080#pullrequestreview-123456
```

## API

```
POST /api/trigger/approve/:id
```

**Success response** (200):
```json
{
  "success": true,
  "review_url": "https://github.com/...",
  "checks": { "status_clean": true, "ci_passing": true, "no_conflicts": true }
}
```

**Failure response** (400):
```json
{
  "error": "Pre-flight failed: CI not passing, merge conflicts",
  "checks": { "status_clean": true, "ci_passing": false, "no_conflicts": false }
}
```
