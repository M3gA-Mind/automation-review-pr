import { execSync } from 'child_process';

const REPO = 'tinyhumansai/openhuman';
const REVIEWER = 'graycyrus';

// Best-effort assignee add. If the call fails (already assigned, API down,
// rate-limited, etc.) the caller proceeds anyway — assignment shouldn't
// block the actual workflow.
export function assignReviewer(prId: number): { assigned: boolean; error?: string } {
  try {
    execSync(`gh pr edit ${prId} --repo ${REPO} --add-assignee ${REVIEWER}`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { assigned: true };
  } catch (err: any) {
    const msg = (err.stderr || err.message || '').toString().trim();
    console.warn(`[assign] Could not assign ${REVIEWER} to PR #${prId}: ${msg}`);
    return { assigned: false, error: msg };
  }
}
