// Spawn PR reviews into windows of a long-lived tmux session so the user can
// attach via terminal (`tmux attach -t super-review`) to watch progress or
// intervene. Each PR gets its own window named `pr-<id>`.
//
// Completion is tracked via a sentinel file under .tmux-state/pr-<id>.exit
// containing the script's exit code. The pane stays open with a bash shell
// after the script finishes (`exec bash`) so output remains scrollable.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SESSION = 'super-review';
const BASE_DIR = path.resolve(process.cwd(), '..');
const STATE_DIR = path.join(BASE_DIR, '.tmux-state');

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function tryExec(cmd) {
  try { return exec(cmd); } catch { return null; }
}

function isAvailable() {
  return tryExec('command -v tmux') !== null;
}

function sessionExists() {
  return tryExec(`tmux has-session -t ${SESSION} 2>/dev/null`) !== null;
}

function ensureSession() {
  if (sessionExists()) return;
  exec(`tmux new-session -d -s ${SESSION} -n _dashboard`);
}

function listWindows() {
  if (!sessionExists()) return [];
  const out = tryExec(`tmux list-windows -t ${SESSION} -F '#{window_name}'`);
  return out ? out.split('\n').filter(Boolean) : [];
}

function windowName(prId) {
  return `pr-${prId}`;
}

function hasWindow(prId) {
  return listWindows().includes(windowName(prId));
}

function markerPath(prId) {
  return path.join(STATE_DIR, `pr-${prId}.exit`);
}

function killWindow(prId) {
  tryExec(`tmux kill-window -t ${SESSION}:${windowName(prId)} 2>/dev/null`);
  try { fs.unlinkSync(markerPath(prId)); } catch {}
}

/**
 * Spawn `review-single.sh <prId>` in a new tmux window. Returns metadata.
 * If a window for this PR already exists, kills it first.
 */
function startReview(prId, logFile) {
  if (!isAvailable()) throw new Error('tmux is not installed on PATH');
  ensureSession();
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (hasWindow(prId)) killWindow(prId);

  const marker = markerPath(prId);
  try { fs.unlinkSync(marker); } catch {}

  // Single-quoted shell-form so escaping is straightforward. We pass it to
  // tmux as one argument; tmux runs it with /bin/sh -c.
  const script = [
    `cd ${quote(BASE_DIR)}`,
    `DASHBOARD_MODE=1 bash review-single.sh ${Number(prId)} 2>&1 | tee ${quote(logFile)}`,
    `echo $? > ${quote(marker)}`,
    'exec bash',
  ].join(' ; ');

  exec(`tmux new-window -t ${SESSION} -n ${windowName(prId)} -c ${quote(BASE_DIR)} ${quote(script)}`);
  return { session: SESSION, window: windowName(prId), logFile, marker, attach: `tmux attach -t ${SESSION} \\; select-window -t ${windowName(prId)}` };
}

/**
 * Check whether the review is still running:
 *  - window exists, AND
 *  - the exit-code sentinel hasn't been written yet
 */
function isRunning(prId) {
  if (!hasWindow(prId)) return false;
  return !fs.existsSync(markerPath(prId));
}

function exitCode(prId) {
  try {
    const v = fs.readFileSync(markerPath(prId), 'utf-8').trim();
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function paneCommand(prId) {
  return tryExec(`tmux display-message -t ${SESSION}:${windowName(prId)} -p '#{pane_current_command}' 2>/dev/null`);
}

// Minimal single-quote escape: 'foo' → 'foo' ; 'it\'s' → 'it'\''s'
function quote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Spawn `pnpm review fix <prId>` inside one of the openhuman workspace
 * clones, in its own tmux window named `fix-<id>`. Separate from `pr-<id>`
 * (the review window) so both can run concurrently.
 */
function startFix(prId, workspaceDir, logFile) {
  if (!isAvailable()) throw new Error('tmux is not installed on PATH');
  if (!fs.existsSync(workspaceDir)) throw new Error(`workspace not found: ${workspaceDir}`);
  ensureSession();
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const window = `fix-${prId}`;
  if (listWindows().includes(window)) {
    tryExec(`tmux kill-window -t ${SESSION}:${window} 2>/dev/null`);
  }
  const marker = path.join(STATE_DIR, `fix-${prId}.exit`);
  try { fs.unlinkSync(marker); } catch {}

  // `pnpm review fix` spawns interactive `claude`, so we can't pipe it
  // through `tee` (would break the TTY). Use `tmux pipe-pane` instead to
  // mirror the pane's output to a log file without disturbing the terminal.
  const script = [
    `cd ${quote(workspaceDir)}`,
    `pnpm review fix ${Number(prId)}`,
    `echo $? > ${quote(marker)}`,
    'exec bash',
  ].join(' ; ');

  exec(`tmux new-window -t ${SESSION} -n ${window} -c ${quote(workspaceDir)} ${quote(script)}`);
  // Mirror pane output to the log file in the background.
  tryExec(`tmux pipe-pane -o -t ${SESSION}:${window} ${quote(`cat >> ${logFile}`)}`);
  return {
    session: SESSION,
    window,
    logFile,
    marker,
    workspace: workspaceDir,
    attach: `tmux attach -t ${SESSION} \\; select-window -t ${window}`,
  };
}

function isFixRunning(prId) {
  if (!listWindows().includes(`fix-${prId}`)) return false;
  return !fs.existsSync(path.join(STATE_DIR, `fix-${prId}.exit`));
}

function killFixWindow(prId) {
  tryExec(`tmux kill-window -t ${SESSION}:fix-${prId} 2>/dev/null`);
  try { fs.unlinkSync(path.join(STATE_DIR, `fix-${prId}.exit`)); } catch {}
}

module.exports = {
  SESSION,
  STATE_DIR,
  isAvailable,
  sessionExists,
  ensureSession,
  startReview,
  startFix,
  killWindow,
  killFixWindow,
  hasWindow,
  isRunning,
  isFixRunning,
  exitCode,
  paneCommand,
  listWindows,
};
