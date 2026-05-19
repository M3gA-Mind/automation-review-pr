# PR Review Automation — tinyhumansai/openhuman

## What this repo does

Automated PR reviewer for `tinyhumansai/openhuman`. Runs hourly via cron, discovers open PRs, reviews them using Claude CLI, posts reviews to GitHub as `graycyrus`, and tracks everything in local markdown files.

## Architecture

```
review-pr/
├── cron-pr-review.sh          # Hourly cron — discovers + reviews PRs in parallel
├── review-single.sh           # Reviews one PR: bash pre-checks → single Claude invocation
├── prompt-parts/              # Modular prompt snippets assembled conditionally
│   ├── header.md, core-steps.md, review-post.md, tracking-update.md, footer.md  (always)
│   ├── linked-issues.md, continuation.md, smart-re-review.md                    (conditional)
│   └── coderabbit-dedup.md, dep-audit.md, test-coverage.md, impact-scan.md      (conditional)
├── discover-prompt.md         # Cron: find eligible PRs
├── .archive/                  # Archived old phase-a/phase-b prompts
├── tinyhumansai-openhuman/    # Per-PR tracking files (under review / changes requested)
├── to-be-approved/            # Clean PRs awaiting manual approval
├── approved/                  # PRs approved via dashboard
├── already-merged/            # Merged PRs (archived tracking files)
├── logs/                      # Cron + per-PR review/approve/merge logs
├── status.json                # Live review status (written by review-single.sh)
├── docs/                      # Feature documentation
└── dashboard/                 # Web UI (Express + SQLite) at localhost:3847
    ├── server.js              # Express server, wires everything
    ├── db.js                  # SQLite schema + queries (WAL mode)
    ├── parser.js              # Parses .md tracking files into structured data
    ├── migrate.js             # Seeds DB from existing .md files on startup
    ├── sync.js                # fs.watch() — auto-syncs when .md files change
    ├── github-sync.js         # Fetches all open PRs from GitHub API (paginated, every 30 min)
    ├── github-sync-worker.js  # Worker process for non-blocking GitHub sync
    ├── routes/api.js          # REST API (includes per-PR sync, approve, merge endpoints)
    ├── routes/trigger.js      # Review/approve/merge trigger endpoints
    └── public/                # Frontend (vanilla HTML/CSS/JS)
```

## Key conventions

- **Reviewer identity**: Posts as `graycyrus` (Cyrus Grey)
- **Target repo**: `tinyhumansai/openhuman`
- **Never auto-approve** — only REQUEST_CHANGES or COMMENT. Clean PRs go to `to-be-approved/`
- **Never merge** — merging is manual
- **Don't duplicate CodeRabbit** — always dedup first
- **Track everything** — every review action recorded in the tracking .md file

## Tracking file format

Each PR gets `PR-<N>.md` with: metadata (author, branch, URL, status, last reviewed commit), review history (per-cycle: type, commit, gates, findings by severity, action taken, GitHub review URL).

## Dashboard

- **Port**: 3847 (configurable via PORT env var)
- **DB**: `dashboard/data/reviews.db` (SQLite, WAL mode)
- **Two data sources**: (1) .md tracking files parsed into `prs` + `review_cycles` tables, (2) GitHub API into `prs` + `pr_github` table
- **Single `prs` table** for all PRs — both sources merge via ON CONFLICT upsert
- **`pr_github`** is a 1:1 extension table with GitHub-only metadata (diff stats, mergeable, labels, etc.)
- **Member detection**: org members fetched from `gh api orgs/tinyhumansai/members`, cached 1h
- **File watcher**: `fs.watch()` on tracking dirs for near-real-time sync
- **status.json**: written by review-single.sh to show live review progress

## Running

```bash
# Start dashboard
cd dashboard && node server.js

# Manual review
./review-single.sh <PR_NUMBER>

# Cron (hourly)
0 * * * * /Users/cyrus/Desktop/automation/review-pr/cron-pr-review.sh
```

## Dependencies

- `claude` CLI — for running reviews
- `gh` CLI — GitHub API access
- Node.js v22 — dashboard server
- Dashboard npm packages: express, better-sqlite3, marked, cors
