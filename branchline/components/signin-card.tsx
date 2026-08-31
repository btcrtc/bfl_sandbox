'use client';

import { useState, type SyntheticEvent } from 'react';
import {
  ArrowRight,
  Braces,
  Clapperboard,
  Layers3,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function safeReturnTo(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/playground';
  return value;
}

export function SignInCard({ returnTo }: { returnTo: string }) {
  const [displayName, setDisplayName] = useState('Portfolio visitor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || 'Could not start the session.');
      window.location.assign(safeReturnTo(returnTo));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not start the session.',
      );
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-svh grid-cols-1 bg-background text-foreground lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
      <section className="relative hidden overflow-hidden border-r bg-[#07100c] p-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(91,192,139,.32),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(70,110,255,.18),transparent_32%)]" />
        <div className="relative flex items-center gap-2.5 text-sm font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-white text-[#07100c]">
            <Braces className="size-4" />
          </span>
          Branchline
        </div>
        <div className="relative my-auto max-w-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300">
            Visual production workspace
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.045em]">
            From one frame to a finished sequence.
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-6 text-white/60">
            Explore a complete cinematic demo, then switch into your private
            empty project and build the workflow from scratch.
          </p>
          <div className="mt-9 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <Clapperboard className="size-4 text-emerald-300" />
              <p className="mt-3 text-sm font-medium">Seeded demo</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Frames, branches, draft clips and a reel.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <Layers3 className="size-4 text-emerald-300" />
              <p className="mt-3 text-sm font-medium">Isolated projects</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Separate boards, runs, assets and generation budgets.
              </p>
            </div>
          </div>
        </div>
        <p className="relative text-[10px] leading-4 text-white/35">
          Portfolio demo · Independent concept, not affiliated with Black Forest
          Labs.
        </p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={signIn} className="w-full max-w-sm">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
              <Braces className="size-4" />
            </span>
            <span className="text-sm font-semibold">Branchline</span>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Secure demo session
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
            Enter the studio
          </h2>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
            Your session and every project you create are isolated from other
            visitors.
          </p>

          <label
            className="mt-7 block text-[11px] font-medium"
            htmlFor="display-name"
          >
            Display name
          </label>
          <Input
            id="display-name"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 h-9"
            maxLength={60}
          />
          {error && (
            <p className="mt-2 text-[11px] text-destructive">{error}</p>
          )}
          <Button type="submit" className="mt-4 h-9 w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            Open demo workspace
          </Button>
          <p className="mt-4 text-center text-[10px] leading-4 text-muted-foreground">
            The demo uses a signed, HTTP-only two-week session cookie. No
            password is stored.
          </p>
        </form>
      </section>
    </main>
  );
}
