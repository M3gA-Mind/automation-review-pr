import { NextResponse } from 'next/server';
import path from 'path';
import { execSync } from 'child_process';
import { triggerJobs, tmux } from '@/lib/server-deps';

export const dynamic = 'force-dynamic';

const REPO = 'tinyhumansai/openhuman';
const REVIEWER = 'graycyrus';

// Add the reviewer as a GitHub assignee. Best-effort — if the PR already has
// them assigned, or the API call fails, log and move on; the review itself
// should still proceed.
function assignReviewer(prId: number): { assigned: boolean; error?: string } {
  try {
    execSync(`gh pr edit ${prId} --repo ${REPO} --add-assignee ${REVIEWER}`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { assigned: true };
  } catch (err: any) {
    const msg = (err.stderr || err.message || '').toString().trim();
    console.warn(`[trigger] Could not assign ${REVIEWER} to PR #${prId}: ${msg}`);
    return { assigned: false, error: msg };
  }
}

// Reviews now run inside a tmux window of the long-lived `super-review`
// session. The user can attach with `tmux attach -t super-review` to watch
// or intervene. Completion is detected via the exit-code sentinel file
// written by tmux.js.

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const prId = parseInt(idStr, 10);

  if (!tmux.isAvailable()) {
    return NextResponse.json({ error: 'tmux not installed on the server' }, { status: 500 });
  }

  if (tmux.isRunning(prId)) {
    return NextResponse.json({ error: `Review for PR #${prId} is already running` }, { status: 409 });
  }

  const logFile = path.join(triggerJobs.LOGS_DIR, `review-PR-${prId}-tmux-${triggerJobs.timestamp()}.log`);

  try {
    const info = tmux.startReview(prId, logFile);
    const assign = assignReviewer(prId);
    return NextResponse.json({
      pr: prId,
      session: info.session,
      window: info.window,
      attach: info.attach,
      logFile: info.logFile,
      assigned: assign.assigned,
      assign_error: assign.error ?? null,
      message: `Review for PR #${prId} started in ${info.session}:${info.window}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
