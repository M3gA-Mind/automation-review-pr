'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Section } from './Section';
import { Badge } from './Badge';
import { Button } from './Button';

interface FixStatus {
  running: boolean;
  mapping: { pane_id: string; window: string; workspace: string; logFile: string; started_at: string } | null;
  content: string | null;
}

// Live terminal viewer that polls /api/trigger/fix/[id] every 2s, calls
// `tmux capture-pane` on the targeted pane, and renders the output in a
// monospaced panel with auto-scroll. Only visible once a fix has been
// triggered (i.e., a mapping file exists for this PR).
export function FixTerminal({ prId }: { prId: number }) {
  const [status, setStatus] = useState<FixStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await api.fixStatus(prId);
        if (cancelled) return;
        setStatus(data);
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [prId]);

  // Auto-scroll to bottom when content updates, unless the user scrolled up.
  useEffect(() => {
    const el = preRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [status?.content]);

  if (!status || !status.mapping) return null;

  const onScroll = () => {
    const el = preRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const m = status.mapping;
  const attach = `tmux attach -t super-review \\; select-window -t ${m.window}`;

  return (
    <Section
      title="Fix Terminal"
      badge={
        <div className="flex items-center gap-2">
          <Badge tone={status.running ? 'yellow' : error ? 'red' : 'green'}>
            {status.running ? 'running' : error ? 'error' : 'done'}
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)]">
            {m.workspace.split('/').pop()} · {m.window} · {m.pane_id}
          </span>
        </div>
      }
    >
      <div className="text-xs text-[var(--color-text-muted)] mb-2 flex items-center gap-3 flex-wrap">
        <span>Started {new Date(m.started_at).toLocaleTimeString()}</span>
        <button
          onClick={() => navigator.clipboard?.writeText(attach)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] px-2 py-0.5"
          title="Copy tmux attach command"
        >
          Copy attach cmd
        </button>
        <Button
          size="sm"
          variant="red"
          onClick={async () => {
            try { await api.cancelJob(`fix-${prId}`); } catch (e: any) { alert(e.message); }
          }}
          disabled={!status.running}
        >
          Cancel
        </Button>
      </div>
      <pre
        ref={preRef}
        onScroll={onScroll}
        className="bg-black/40 border border-[var(--color-border)] rounded p-3 text-xs leading-snug font-mono max-h-[480px] overflow-auto whitespace-pre-wrap break-words"
      >
        {status.content || '(empty)'}
      </pre>
    </Section>
  );
}
