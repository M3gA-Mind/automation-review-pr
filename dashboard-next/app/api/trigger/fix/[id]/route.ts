import { NextResponse } from 'next/server';
import path from 'path';
import { triggerJobs, tmux } from '@/lib/server-deps';

export const dynamic = 'force-dynamic';

// Workspace where `pnpm review fix <pr>` should run. Defaults to
// ~/work/tinyhumansai/openhuman-1 (the first of the 18 parallel clones used
// by the super-review setup); override with FIX_WORKSPACE_DIR.
const FIX_WORKSPACE_DIR =
  process.env.FIX_WORKSPACE_DIR ||
  path.join(process.env.HOME || '', 'work', 'tinyhumansai', 'openhuman-1');

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const prId = parseInt(idStr, 10);

  if (!tmux.isAvailable()) {
    return NextResponse.json({ error: 'tmux not installed on the server' }, { status: 500 });
  }
  if (tmux.isFixRunning(prId)) {
    return NextResponse.json({ error: `Fix for PR #${prId} is already running` }, { status: 409 });
  }

  const logFile = path.join(triggerJobs.LOGS_DIR, `fix-PR-${prId}-tmux-${triggerJobs.timestamp()}.log`);

  try {
    const info = tmux.startFix(prId, FIX_WORKSPACE_DIR, logFile);
    return NextResponse.json({
      pr: prId,
      session: info.session,
      window: info.window,
      workspace: info.workspace,
      attach: info.attach,
      logFile: info.logFile,
      message: `Fix for PR #${prId} started in ${info.session}:${info.window}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
