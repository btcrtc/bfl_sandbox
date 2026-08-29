'use client';

import NextImage from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Dices,
  Film,
  ImagePlus,
  Images,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  ProductHeader,
  ProductRail,
  Surface,
  SystemLabel,
  ThemeToggle,
  surfaceClass,
} from '@/components/product-system';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  SCENE_STILL_ESTIMATE_USD,
  VIDEO_RATES_PER_SEC,
  estimateVideoCostUsd,
  formatUsd,
} from '@/lib/pricing';
import { cn } from '@/lib/utils';
import type { HistoryRun } from '@/db/history';
import type { SceneDto, StoryboardDto } from '@/lib/storyboard-service';

type StoryboardListItem = { id: string; title: string; createdAt: number; updatedAt: number };

const DURATION_OPTIONS = ['5', '8', '10', '12', '15', '20'];

export function ScenesShell({
  viewer,
  signInPath,
}: {
  viewer: { displayName: string; email: string } | null;
  signInPath: string;
}) {
  const [storyboardList, setStoryboardList] = useState<StoryboardListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardDto | null>(null);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>(
    viewer ? 'loading' : 'ready',
  );
  const [creating, setCreating] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const loadList = useCallback(async () => {
    if (!viewer) return;
    try {
      const response = await fetch('/api/storyboards', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { storyboards: StoryboardListItem[] };
      setStoryboardList(data.storyboards);
      setListState('ready');
      setActiveId((current) => current ?? data.storyboards[0]?.id ?? null);
    } catch {
      setListState('error');
    }
  }, [viewer]);

  const loadStoryboard = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/storyboards/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { storyboard: StoryboardDto };
      // Ignore stale responses after the user switched storyboards.
      if (activeIdRef.current === id) setStoryboard(data.storyboard);
    } catch {
      setNotice({ tone: 'error', text: 'Could not load the storyboard.' });
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadList(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadList]);

  useEffect(() => {
    if (!activeId) return;
    const timeout = window.setTimeout(() => void loadStoryboard(activeId), 0);
    return () => window.clearTimeout(timeout);
  }, [activeId, loadStoryboard]);

  // While any scene still is queued/running, keep the board fresh.
  const hasActiveRun = Boolean(
    storyboard?.scenes.some(
      (scene) => scene.run && ['queued', 'running'].includes(scene.run.status),
    ),
  );
  useEffect(() => {
    if (!hasActiveRun || !activeId) return;
    const interval = window.setInterval(() => {
      const id = activeIdRef.current;
      if (id) {
        // GET /api/generations/[id] advances BFL job state server-side; the
        // storyboard fetch then reads the refreshed rows.
        const running = storyboard?.scenes.filter(
          (scene) => scene.run && ['queued', 'running'].includes(scene.run.status),
        );
        for (const scene of running ?? []) {
          if (scene.generationId) {
            void fetch(`/api/generations/${encodeURIComponent(scene.generationId)}`, {
              cache: 'no-store',
            });
          }
        }
        void loadStoryboard(id);
      }
    }, 3_500);
    return () => window.clearInterval(interval);
  }, [hasActiveRun, activeId, loadStoryboard, storyboard]);

  const createStoryboard = useCallback(async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/storyboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error);
      await loadList();
      setActiveId(data.id);
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error && error.message ? error.message : 'Could not create a storyboard.',
      });
    } finally {
      setCreating(false);
    }
  }, [loadList]);

  const patchStoryboard = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!activeId) return;
      try {
        const response = await fetch(`/api/storyboards/${encodeURIComponent(activeId)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await response.json()) as { storyboard?: StoryboardDto; error?: string };
        if (!response.ok || !data.storyboard) throw new Error(data.error);
        setStoryboard(data.storyboard);
        void loadList();
      } catch (error) {
        setNotice({
          tone: 'error',
          text: error instanceof Error && error.message ? error.message : 'Could not save changes.',
        });
      }
    },
    [activeId, loadList],
  );

  const patchScene = useCallback(
    async (sceneId: string, patch: Record<string, unknown>) => {
      if (!activeId) return;
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error);
        }
        void loadStoryboard(activeId);
      } catch (error) {
        setNotice({
          tone: 'error',
          text: error instanceof Error && error.message ? error.message : 'Could not save the scene.',
        });
      }
    },
    [activeId, loadStoryboard],
  );

  const addScene = useCallback(async () => {
    if (!activeId) return;
    await fetch(`/api/storyboards/${encodeURIComponent(activeId)}/scenes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    void loadStoryboard(activeId);
  }, [activeId, loadStoryboard]);

  const deleteScene = useCallback(
    async (sceneId: string) => {
      if (!activeId) return;
      await fetch(
        `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}`,
        { method: 'DELETE' },
      );
      void loadStoryboard(activeId);
    },
    [activeId, loadStoryboard],
  );

  const generateScene = useCallback(
    async (sceneId: string) => {
      if (!activeId) return;
      setGeneratingScenes((current) => new Set(current).add(sceneId));
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}/generate`,
          { method: 'POST' },
        );
        const data = (await response.json()) as { mode?: string; error?: string };
        if (!response.ok) throw new Error(data.error);
        setNotice(
          data.mode === 'preview'
            ? {
                tone: 'info',
                text: 'Draft saved — add BFL_API_KEY to render scene stills live.',
              }
            : { tone: 'info', text: 'Scene still is rendering.' },
        );
        await loadStoryboard(activeId);
      } catch (error) {
        setNotice({
          tone: 'error',
          text:
            error instanceof Error && error.message ? error.message : 'Could not start the render.',
        });
      } finally {
        setGeneratingScenes((current) => {
          const next = new Set(current);
          next.delete(sceneId);
          return next;
        });
      }
    },
    [activeId, loadStoryboard],
  );

  const totalSeconds = storyboard?.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) ?? 0;

  return (
    <TooltipProvider delay={350}>
      <main className="h-svh overflow-hidden bg-background text-foreground">
        <ProductHeader
          concept
          center={
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Clapperboard className="size-3.5" />
              <span>Scenes — reference-driven storyboards</span>
            </div>
          }
          end={
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {viewer ? (
                <Tooltip>
                  <TooltipTrigger className="grid size-7 place-items-center rounded-full bg-accent font-mono text-[10px] text-accent-foreground">
                    {initials(viewer.displayName)}
                  </TooltipTrigger>
                  <TooltipContent>{viewer.email}</TooltipContent>
                </Tooltip>
              ) : (
                <a
                  href={signInPath}
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'sm',
                    className: 'h-7 text-[11px]',
                  })}
                >
                  Sign in to build
                </a>
              )}
            </div>
          }
        />

        <div className="grid h-[calc(100svh-var(--app-header-height))] grid-cols-[var(--app-rail-width)_var(--app-inspector-width)_minmax(0,1fr)]">
          <ProductRail active="scenes" />

          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r bg-playground-surface p-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <SystemLabel>Storyboards</SystemLabel>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void createStoryboard()}
                  disabled={creating || !viewer}
                >
                  {creating ? <Loader2 className="animate-spin" /> : <Plus />} New
                </Button>
              </div>
              {!viewer && (
                <p className="rounded-md border border-dashed p-3 text-[11px] leading-relaxed text-muted-foreground">
                  Sign in to create storyboards. Below is what the workspace looks like once a
                  reference is pinned and scenes are laid out.
                </p>
              )}
              {viewer && listState === 'loading' && (
                <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Loading…
                </p>
              )}
              {viewer && listState === 'ready' && storyboardList.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-[11px] leading-relaxed text-muted-foreground">
                  No storyboards yet. Create one, pin a reference image, and carry one subject
                  through a sequence of scenes.
                </p>
              )}
              <div className="space-y-1">
                {storyboardList.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent',
                      item.id === activeId && 'bg-sidebar-accent font-medium',
                    )}
                  >
                    <Film className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {storyboard && (
              <>
                <div>
                  <SystemLabel className="mb-2">References</SystemLabel>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Array.from({ length: 3 }, (_, slotIndex) => {
                      const reference = storyboard.references[slotIndex];
                      if (reference) {
                        return (
                          <div
                            key={reference.assetId}
                            className="group relative aspect-square overflow-hidden rounded-md border"
                          >
                            <NextImage
                              src={reference.url}
                              alt={`Reference ${slotIndex + 1}`}
                              width={200}
                              height={200}
                              unoptimized
                              className="size-full object-cover"
                            />
                            <button
                              onClick={() =>
                                void patchStoryboard({
                                  referenceAssetIds: storyboard.references
                                    .filter((entry) => entry.assetId !== reference.assetId)
                                    .map((entry) => entry.assetId),
                                })
                              }
                              aria-label={`Remove reference ${slotIndex + 1}`}
                              className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-background/85 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={`empty-${slotIndex}`}
                          onClick={() => setPickerOpen(true)}
                          disabled={slotIndex > storyboard.references.length}
                          className="grid aspect-square place-items-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-40"
                          aria-label="Add reference"
                        >
                          <ImagePlus className="size-4" />
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    Pinned images ride along as <code>input_image</code> 1–3 with every scene
                    render — subject, style, palette.
                  </p>
                </div>

                <div>
                  <SystemLabel className="mb-2">Style continuity</SystemLabel>
                  <div className="space-y-2.5 rounded-md border bg-playground-surface-elevated p-3 shadow-xs">
                    <div>
                      <p className="mb-1 text-[11px] font-medium">Style note</p>
                      <Textarea
                        key={`${storyboard.id}-style`}
                        defaultValue={storyboard.styleNote ?? ''}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (value !== (storyboard.styleNote ?? ''))
                            void patchStoryboard({ styleNote: value });
                        }}
                        placeholder="35mm film, warm mineral palette, soft studio light…"
                        className="min-h-16 resize-none bg-background text-[12px] leading-4"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Appended to every scene prompt.
                      </p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[11px] font-medium">Pinned seed</p>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="Roll a new seed"
                                  onClick={() =>
                                    void patchStoryboard({
                                      seed: Math.floor(Math.random() * 2 ** 32),
                                    })
                                  }
                                />
                              }
                            >
                              <Dices />
                            </TooltipTrigger>
                            <TooltipContent>Roll a new seed</TooltipContent>
                          </Tooltip>
                          {storyboard.seed != null && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Unpin seed"
                                    onClick={() => void patchStoryboard({ seed: null })}
                                  />
                                }
                              >
                                <X />
                              </TooltipTrigger>
                              <TooltipContent>Unpin seed</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <Input
                        key={`${storyboard.id}-seed`}
                        defaultValue={storyboard.seed == null ? '' : String(storyboard.seed)}
                        placeholder="Random"
                        inputMode="numeric"
                        onBlur={(event) => {
                          const raw = event.target.value.replace(/[^0-9]/g, '');
                          const next = raw ? Math.min(Number(raw), 2 ** 32 - 1) : null;
                          if (next !== storyboard.seed) void patchStoryboard({ seed: next });
                        }}
                        className="h-8 bg-background font-mono text-[12px]"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-playground-surface">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1200px] px-6 py-5">
                {storyboard ? (
                  <>
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <SystemLabel>Storyboard</SystemLabel>
                        <Input
                          key={`${storyboard.id}-title`}
                          defaultValue={storyboard.title}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value && value !== storyboard.title)
                              void patchStoryboard({ title: value });
                          }}
                          className="mt-1 h-10 max-w-md border-0 bg-transparent px-0 text-[22px] font-semibold tracking-[-0.02em] shadow-none focus-visible:ring-0"
                          aria-label="Storyboard title"
                        />
                      </div>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Refresh storyboard"
                              onClick={() => activeId && void loadStoryboard(activeId)}
                            />
                          }
                        >
                          <RefreshCw />
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                      </Tooltip>
                    </div>

                    {notice && (
                      <p
                        className={cn(
                          'mb-3 text-[11px] leading-4',
                          notice.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {notice.text}
                      </p>
                    )}

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {storyboard.scenes.map((scene) => (
                        <SceneCard
                          key={scene.id}
                          scene={scene}
                          busy={generatingScenes.has(scene.id)}
                          onPatch={(patch) => void patchScene(scene.id, patch)}
                          onGenerate={() => void generateScene(scene.id)}
                          onDelete={() => void deleteScene(scene.id)}
                        />
                      ))}
                      <button
                        onClick={() => void addScene()}
                        className="grid min-h-56 place-items-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        <span className="flex flex-col items-center gap-1.5 text-[12px]">
                          <Plus className="size-4" /> Add scene
                        </span>
                      </button>
                    </div>
                  </>
                ) : viewer ? (
                  <EmptyBoard onCreate={() => void createStoryboard()} creating={creating} />
                ) : (
                  <SignedOutPreview signInPath={signInPath} />
                )}
              </div>
            </div>

            {storyboard && (
              <VideoPlanBar sceneCount={storyboard.scenes.length} totalSeconds={totalSeconds} />
            )}
          </section>
        </div>
      </main>

      {storyboard && pickerOpen && (
        <ReferencePickerDialog
          onOpenChange={setPickerOpen}
          onPick={(assetId) => {
            setPickerOpen(false);
            const next = [
              ...storyboard.references.map((entry) => entry.assetId).filter((id) => id !== assetId),
              assetId,
            ].slice(-3);
            void patchStoryboard({ referenceAssetIds: next });
          }}
        />
      )}
    </TooltipProvider>
  );
}

function SceneCard({
  scene,
  busy,
  onPatch,
  onGenerate,
  onDelete,
}: {
  scene: SceneDto;
  busy: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onGenerate: () => void;
  onDelete: () => void;
}) {
  const run = scene.run;
  const asset = run?.assets[0];
  const running = Boolean(run && ['queued', 'running'].includes(run.status));
  const draftCost = estimateVideoCostUsd(scene.durationSec, 'draft');

  return (
    <article className={cn(surfaceClass, 'flex flex-col overflow-hidden')}>
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Scene {String(scene.sceneIndex + 1).padStart(2, '0')}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Delete scene"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
      <Input
        key={`${scene.id}-title`}
        defaultValue={scene.title}
        onBlur={(event) => {
          const value = event.target.value.trim();
          if (value && value !== scene.title) onPatch({ title: value });
        }}
        className="mx-3 h-7 border-0 bg-transparent px-0 text-[13px] font-medium shadow-none focus-visible:ring-0"
        aria-label="Scene title"
      />

      <div className="relative mx-3 mt-1.5 aspect-video overflow-hidden rounded-md border bg-muted">
        {asset ? (
          <NextImage
            src={asset.url}
            alt={scene.title}
            width={640}
            height={360}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            {running || busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : run && ['moderated', 'partial'].includes(run.status) ? (
              <ShieldAlert className="size-5 text-amber-600" />
            ) : run && run.status === 'failed' ? (
              <X className="size-5 text-destructive/70" />
            ) : (
              <Images className="size-5" />
            )}
          </span>
        )}
        {run && (
          <span className="absolute left-1.5 top-1.5">
            <Badge
              variant="outline"
              className="h-5 rounded-md bg-background/85 px-1.5 font-mono text-[9px] uppercase backdrop-blur"
            >
              {run.status}
            </Badge>
          </span>
        )}
      </div>
      {run?.errorMessage && (
        <p className="mx-3 mt-1.5 rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
          {run.errorMessage}
        </p>
      )}

      <Textarea
        key={`${scene.id}-prompt`}
        defaultValue={scene.prompt}
        onBlur={(event) => {
          if (event.target.value.trim() !== scene.prompt) onPatch({ prompt: event.target.value });
        }}
        placeholder="Describe this shot…"
        className="mx-3 mt-2 min-h-16 flex-1 resize-none bg-background text-[12px] leading-4"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={String(scene.durationSec)}
            onValueChange={(next) => next && onPatch({ durationSec: Number(next) })}
          >
            <SelectTrigger size="sm" className="h-7! w-[74px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SceneSeedControl seed={scene.seed} onPatch={onPatch} />
          <span className="font-mono text-[10px] text-muted-foreground">
            draft ~{formatUsd(draftCost)}
          </span>
        </div>
        <Button size="xs" variant="outline" onClick={onGenerate} disabled={busy || running}>
          {busy || running ? <Loader2 className="animate-spin" /> : <Play />}
          {asset ? 'Re-render' : 'Render still'}
        </Button>
      </div>
    </article>
  );
}

function SceneSeedControl({
  seed,
  onPatch,
}: {
  seed: number | null;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={seed == null ? 'Scene seed: board default' : `Scene seed: ${seed}`}
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            <Dices className="size-3" />
            {seed == null ? 'board' : seed}
          </button>
        }
      />
      <PopoverContent align="start" side="top" className="w-64 gap-2 p-3">
        <p className="text-[12px] font-medium">Scene seed</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Overrides the board seed for this shot only — re-roll one bad frame without breaking the
          rest of the sequence.
        </p>
        <Input
          key={seed == null ? 'board' : String(seed)}
          defaultValue={seed == null ? '' : String(seed)}
          placeholder="Board default"
          inputMode="numeric"
          onBlur={(event) => {
            const raw = event.target.value.replace(/[^0-9]/g, '');
            const next = raw ? Math.min(Number(raw), 2 ** 32 - 1) : null;
            if (next !== seed) onPatch({ seed: next });
          }}
          className="h-8 bg-background font-mono text-[12px]"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => onPatch({ seed: Math.floor(Math.random() * 2 ** 32) })}
          >
            <Dices /> Re-roll
          </Button>
          {seed != null && (
            <Button variant="ghost" size="xs" onClick={() => onPatch({ seed: null })}>
              <X /> Board default
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VideoPlanBar({ sceneCount, totalSeconds }: { sceneCount: number; totalSeconds: number }) {
  return (
    <div className="shrink-0 border-t bg-background px-6 py-3">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Film className="size-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium">
            {sceneCount} scenes · {totalSeconds}s reel
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="rounded border px-1.5 py-0.5">
            draft ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'draft'))} ·{' '}
            {formatUsd(VIDEO_RATES_PER_SEC.draft)}/s
          </span>
          <span className="rounded border px-1.5 py-0.5">
            enhance HD ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'hd'))}
          </span>
          <span className="rounded border px-1.5 py-0.5">
            FHD ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'fhd'))}
          </span>
          <span className="rounded border px-1.5 py-0.5">audio included</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="h-5 rounded-md font-mono text-[9px] tracking-wider">
            CONCEPT
          </Badge>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Button size="sm" className="h-8 text-[12px]" disabled>
                    <Clapperboard /> Assemble draft reel
                  </Button>
                </span>
              }
            />
            <TooltipContent side="top" className="max-w-64">
              Stills above render live through FLUX.2. The FLUX 3 Video draft → enhance step is
              staged behind a flag until the video API contract is wired — see the roadmap in the
              README.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <p className="mx-auto mt-1.5 w-full max-w-[1200px] text-[10px] leading-relaxed text-muted-foreground">
        Plan the reel at draft rate ({formatUsd(VIDEO_RATES_PER_SEC.draft)}/s), approve the cut,
        then enhance only what you keep — each still costs ~{formatUsd(SCENE_STILL_ESTIMATE_USD)}{' '}
        with a pinned reference.
      </p>
    </div>
  );
}

function EmptyBoard({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <Surface className="mx-auto mt-10 max-w-lg p-8 text-center">
      <Clapperboard className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-3 text-[18px] font-semibold tracking-[-0.02em]">
        Carry one subject through a whole sequence
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
        Pin a generated image as the reference, write a scene list, and render stills that keep the
        subject consistent — then plan the video reel at draft economics before spending on
        enhancement.
      </p>
      <Button className="mt-4" onClick={onCreate} disabled={creating}>
        {creating ? <Loader2 className="animate-spin" /> : <Plus />} New storyboard
      </Button>
    </Surface>
  );
}

function SignedOutPreview({ signInPath }: { signInPath: string }) {
  return (
    <Surface className="mx-auto mt-10 max-w-lg p-8 text-center">
      <Clapperboard className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-3 text-[18px] font-semibold tracking-[-0.02em]">
        Scenes — reference-driven storyboards
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
        Generate a hero image in the Playground, pin it as a reference, and fan it out across
        scenes: every still is a real FLUX.2 render with <code>input_image</code> continuity, and
        the reel is priced at FLUX 3 Video draft → enhance rates before you commit.
      </p>
      <a href={signInPath} className={buttonVariants({ className: 'mt-4' })}>
        Sign in to build
      </a>
    </Surface>
  );
}

function ReferencePickerDialog({
  onOpenChange,
  onPick,
}: {
  onOpenChange: (open: boolean) => void;
  onPick: (assetId: string) => void;
}) {
  const [assets, setAssets] = useState<Array<{ id: string; url: string; prompt: string }>>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Mounted fresh on every open, so the loading state resets naturally.
  useEffect(() => {
    void fetch('/api/history', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { runs: HistoryRun[] };
        setAssets(
          data.runs.flatMap((run) =>
            run.assets.map((asset) => ({ id: asset.id, url: asset.url, prompt: run.prompt })),
          ),
        );
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pin a reference</DialogTitle>
          <DialogDescription>
            Pick any output from your shared history. It will be sent as the FLUX.2 reference image
            with every scene render.
          </DialogDescription>
        </DialogHeader>
        {state === 'loading' && (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading your outputs…
          </p>
        )}
        {state === 'error' && (
          <p className="text-[12px] text-destructive">Could not load history.</p>
        )}
        {state === 'ready' && assets.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-[12px] leading-relaxed text-muted-foreground">
            No stored outputs yet — generate an image in the Playground first, then pin it here as
            the storyboard reference.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {assets.map((asset) => (
            <button
              key={asset.id}
              onClick={() => onPick(asset.id)}
              className="group overflow-hidden rounded-md border transition-colors hover:border-[var(--brand)]"
              aria-label={`Use as reference: ${asset.prompt.slice(0, 60)}`}
            >
              <NextImage
                src={asset.url}
                alt={asset.prompt.slice(0, 60)}
                width={200}
                height={150}
                unoptimized
                className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.03]"
              />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  );
}
