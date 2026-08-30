'use client';

import NextImage from 'next/image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronRight,
  Clapperboard,
  Copy,
  Dices,
  Film,
  ImagePlus,
  Images,
  Lightbulb,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
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
  parameterChipClass,
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
import type { ClipDto, SceneDto, StoryboardDto } from '@/lib/storyboard-service';

type StoryboardListItem = { id: string; title: string; createdAt: number; updatedAt: number };

type Selection = { kind: 'idea' } | { kind: 'scene'; id: string } | { kind: 'reel' };

const DURATION_OPTIONS = ['5', '8', '10', '12', '15', '20'];
const SCENE_COUNT_OPTIONS = ['3', '4', '5', '6'];

// --- pipeline step state -----------------------------------------------------

type StepState = 'idle' | 'active' | 'done' | 'error';

const STEP_DOT_CLASS: Record<StepState, string> = {
  idle: 'bg-border',
  active: 'animate-pulse bg-amber-500',
  done: 'bg-[var(--success)]',
  error: 'bg-destructive',
};

function runStepState(run: HistoryRun | null): StepState {
  if (!run) return 'idle';
  if (['queued', 'running'].includes(run.status)) return 'active';
  if (run.status === 'succeeded') return 'done';
  // Keyless preview runs are saved as 'draft' — a neutral state, not a failure.
  if (run.status === 'draft') return 'idle';
  return 'error';
}

function latestClip(scene: SceneDto, tiers: string[]): ClipDto | null {
  return scene.clips.find((clip) => tiers.includes(clip.tier)) ?? null;
}

function clipStepState(clip: ClipDto | null): StepState {
  if (!clip) return 'idle';
  // A clip whose run has not landed in the history window yet is in flight.
  if (!clip.run) return 'active';
  return runStepState(clip.run);
}

function sceneSteps(scene: SceneDto) {
  return {
    still: runStepState(scene.run),
    draft: clipStepState(latestClip(scene, ['draft'])),
    enhance: clipStepState(latestClip(scene, ['hd', 'fhd'])),
  };
}

// ----------------------------------------------------------------------------

export function ScenesShell({
  viewer,
  signInPath,
  videoEnabled,
}: {
  viewer: { displayName: string; email: string } | null;
  signInPath: string;
  videoEnabled: boolean;
}) {
  const [storyboardList, setStoryboardList] = useState<StoryboardListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardDto | null>(null);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>(
    viewer ? 'loading' : 'ready',
  );
  const [creating, setCreating] = useState(false);
  const [breakingDown, setBreakingDown] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set());
  const [videoBusyScenes, setVideoBusyScenes] = useState<Set<string>>(new Set());
  const [assembling, setAssembling] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rawSelection, setRawSelection] = useState<Selection>({ kind: 'idea' });

  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Arriving from the Playground with ?pin=<assetId>: hold the id until a
  // board is active, then pin it as a reference exactly once.
  const pendingPinRef = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pin = params.get('pin');
    if (pin) {
      pendingPinRef.current = pin;
      params.delete('pin');
      const query = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
    }
  }, []);

  // --- data loading ---------------------------------------------------------

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
      // Ignore stale responses after the user switched boards.
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

  // While any scene still or clip is queued/running, keep the board fresh.
  // GET /api/generations/[id] advances BFL job state server-side; the
  // storyboard fetch then reads the refreshed rows.
  const hasActiveRun = Boolean(
    storyboard?.scenes.some(
      (scene) =>
        (scene.run && ['queued', 'running'].includes(scene.run.status)) ||
        scene.clips.some((clip) => !clip.run || ['queued', 'running'].includes(clip.run.status)),
    ),
  );
  useEffect(() => {
    if (!hasActiveRun || !activeId || !storyboard) return;
    const runningGenerationIds = storyboard.scenes.flatMap((scene) => [
      ...(scene.run && ['queued', 'running'].includes(scene.run.status) && scene.generationId
        ? [scene.generationId]
        : []),
      ...scene.clips
        .filter((clip) => !clip.run || ['queued', 'running'].includes(clip.run.status))
        .map((clip) => clip.generationId),
    ]);
    const interval = window.setInterval(() => {
      const id = activeIdRef.current;
      if (id) {
        for (const generationId of runningGenerationIds) {
          void fetch(`/api/generations/${encodeURIComponent(generationId)}`, {
            cache: 'no-store',
          });
        }
        void loadStoryboard(id);
      }
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [hasActiveRun, activeId, loadStoryboard, storyboard]);

  // --- board actions --------------------------------------------------------

  const createStoryboard = useCallback(async (kind: 'blank' | 'example' = 'blank') => {
    setCreating(true);
    try {
      const response = await fetch(
        kind === 'example' ? '/api/storyboards/example' : '/api/storyboards',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error);
      await loadList();
      setActiveId(data.id);
      setRawSelection({ kind: 'idea' });
    } catch (error) {
      setNotice({
        tone: 'error',
        text:
          error instanceof Error && error.message
            ? error.message
            : 'Could not create a storyboard.',
      });
    } finally {
      setCreating(false);
    }
  }, [loadList]);

  const patchStoryboard = useCallback(
    async (patch: Record<string, unknown>, options?: { apply?: boolean }) => {
      if (!activeId) return;
      try {
        const response = await fetch(`/api/storyboards/${encodeURIComponent(activeId)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await response.json()) as { storyboard?: StoryboardDto; error?: string };
        if (!response.ok || !data.storyboard) throw new Error(data.error);
        // apply:false keeps local state as-is — used for blur-saves that can
        // race a concurrent breakdown (a late response must not revert it).
        if (options?.apply !== false) setStoryboard(data.storyboard);
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

  const writeSequence = useCallback(
    async (idea: string, sceneCount: number) => {
      if (!activeId || !storyboard) return;
      const hasRenderedWork = storyboard.scenes.some((scene) => scene.run || scene.clips.length);
      if (
        hasRenderedWork &&
        !window.confirm(
          'Rewriting the sequence replaces the current scenes and their renders. Continue?',
        )
      ) {
        return;
      }
      setBreakingDown(true);
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}/breakdown`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idea, sceneCount }),
          },
        );
        const data = (await response.json()) as {
          source?: 'mistral' | 'template';
          storyboard?: StoryboardDto;
          error?: string;
        };
        if (!response.ok || !data.storyboard) throw new Error(data.error);
        setStoryboard(data.storyboard);
        const firstScene = data.storyboard.scenes[0];
        setRawSelection(firstScene ? { kind: 'scene', id: firstScene.id } : { kind: 'idea' });
        setNotice(
          data.source === 'mistral'
            ? {
                tone: 'info',
                text: 'Sequence written by Mistral — walk the nodes, refine each shot, then render.',
              }
            : {
                tone: 'info',
                text: 'Sequence written from template beats. Set MISTRAL_API_KEY on the deployment for AI direction.',
              },
        );
      } catch (error) {
        setNotice({
          tone: 'error',
          text:
            error instanceof Error && error.message
              ? error.message
              : 'Could not write the sequence.',
        });
      } finally {
        setBreakingDown(false);
      }
    },
    [activeId, storyboard],
  );

  // --- scene actions --------------------------------------------------------

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
          text:
            error instanceof Error && error.message ? error.message : 'Could not save the scene.',
        });
      }
    },
    [activeId, loadStoryboard],
  );

  const addScene = useCallback(async () => {
    if (!activeId) return;
    const response = await fetch(`/api/storyboards/${encodeURIComponent(activeId)}/scenes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    await loadStoryboard(activeId);
    if (data?.id) setRawSelection({ kind: 'scene', id: data.id });
  }, [activeId, loadStoryboard]);

  const deleteScene = useCallback(
    async (sceneId: string) => {
      if (!activeId) return;
      await fetch(
        `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}`,
        { method: 'DELETE' },
      );
      setRawSelection({ kind: 'idea' });
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
            error instanceof Error && error.message
              ? error.message
              : 'Could not start the render.',
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

  const markVideoBusy = useCallback((sceneId: string, busy: boolean) => {
    setVideoBusyScenes((current) => {
      const next = new Set(current);
      if (busy) next.add(sceneId);
      else next.delete(sceneId);
      return next;
    });
  }, []);

  const draftClip = useCallback(
    async (sceneId: string) => {
      if (!activeId) return;
      markVideoBusy(sceneId, true);
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}/video`,
          { method: 'POST' },
        );
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error);
        setNotice({
          tone: 'info',
          text: 'Draft clip is rendering — long-running job, expect a few minutes.',
        });
        await loadStoryboard(activeId);
      } catch (error) {
        setNotice({
          tone: 'error',
          text:
            error instanceof Error && error.message ? error.message : 'Could not start the clip.',
        });
      } finally {
        markVideoBusy(sceneId, false);
      }
    },
    [activeId, loadStoryboard, markVideoBusy],
  );

  const enhanceClip = useCallback(
    async (sceneId: string, tier: 'hd' | 'fhd') => {
      if (!activeId) return;
      markVideoBusy(sceneId, true);
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}/video/enhance`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tier }),
          },
        );
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error);
        setNotice({
          tone: 'info',
          text: `Enhancing the draft to ${tier.toUpperCase()} — same shot, full quality.`,
        });
        await loadStoryboard(activeId);
      } catch (error) {
        setNotice({
          tone: 'error',
          text:
            error instanceof Error && error.message
              ? error.message
              : 'Could not start the enhance.',
        });
      } finally {
        markVideoBusy(sceneId, false);
      }
    },
    [activeId, loadStoryboard, markVideoBusy],
  );

  useEffect(() => {
    if (!storyboard || !pendingPinRef.current) return;
    const assetId = pendingPinRef.current;
    pendingPinRef.current = null;
    if (storyboard.references.some((reference) => reference.assetId === assetId)) return;
    const slotsFull = storyboard.references.length >= 3;
    const existingIds = storyboard.references.map((reference) => reference.assetId);
    const timeout = window.setTimeout(() => {
      if (slotsFull) {
        setNotice({
          tone: 'error',
          text: 'All three reference slots are taken — remove one to pin the new image.',
        });
        return;
      }
      void patchStoryboard({ referenceAssetIds: [...existingIds, assetId] });
      setNotice({ tone: 'info', text: 'Reference pinned from the Playground.' });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [storyboard, patchStoryboard]);

  const draftableScenes = (storyboard?.scenes ?? []).filter(
    (scene) =>
      scene.run?.status === 'succeeded' &&
      scene.run.assets.length > 0 &&
      !scene.clips.some((clip) => clip.tier === 'draft'),
  );

  const assembleReel = async () => {
    if (draftableScenes.length === 0) {
      setNotice({
        tone: 'info',
        text: 'Nothing to assemble — every scene with a finished still already has a draft clip.',
      });
      return;
    }
    const totalCost = draftableScenes.reduce(
      (sum, scene) => sum + estimateVideoCostUsd(scene.durationSec, 'draft'),
      0,
    );
    const confirmed = window.confirm(
      `Render ${draftableScenes.length} draft clip(s) for ~${formatUsd(totalCost)}?`,
    );
    if (!confirmed) return;
    setAssembling(true);
    try {
      for (const scene of draftableScenes) {
        await draftClip(scene.id);
      }
    } finally {
      setAssembling(false);
    }
  };

  // --- selection ------------------------------------------------------------

  const scenes = storyboard?.scenes ?? [];
  // Normalize: a selected scene that no longer exists falls back gracefully.
  const selection: Selection =
    rawSelection.kind === 'scene' && !scenes.some((scene) => scene.id === rawSelection.id)
      ? scenes.length
        ? { kind: 'scene', id: scenes[0].id }
        : { kind: 'idea' }
      : rawSelection;
  const selectedScene =
    selection.kind === 'scene'
      ? (scenes.find((scene) => scene.id === selection.id) ?? null)
      : null;

  // Arrow keys walk the strip: idea → scenes → reel. Ignored while typing.
  const selectionOrder: Selection[] = [
    { kind: 'idea' },
    ...scenes.map((scene): Selection => ({ kind: 'scene', id: scene.id })),
    { kind: 'reel' },
  ];
  const selectionOrderRef = useRef<Selection[]>(selectionOrder);
  const selectionRef = useRef<Selection>(selection);
  useEffect(() => {
    selectionOrderRef.current = selectionOrder;
    selectionRef.current = selection;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      // Dialogs, popovers and open dropdowns own their arrow keys.
      if (document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return;
      const order = selectionOrderRef.current;
      const current = selectionRef.current;
      const currentIndex = order.findIndex((entry) =>
        entry.kind === 'scene' && current.kind === 'scene'
          ? entry.id === current.id
          : entry.kind === current.kind,
      );
      if (currentIndex === -1) return;
      const nextIndex = currentIndex + (event.key === 'ArrowRight' ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= order.length) return;
      event.preventDefault();
      setRawSelection(order[nextIndex]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);

  // --- render ---------------------------------------------------------------

  return (
    <TooltipProvider delay={350}>
      <main className="h-svh overflow-hidden bg-background text-foreground">
        <ProductHeader
          concept
          center={
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Clapperboard className="size-3.5" />
              <span>Scenes — one idea, a sequence of shots</span>
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

        <div className="grid h-[calc(100svh-var(--app-header-height))] grid-cols-[var(--app-rail-width)_minmax(0,1fr)]">
          <ProductRail active="scenes" />

          <section className="flex min-h-0 min-w-0 flex-col bg-playground-surface">
            {storyboard && (
              <BoardBar
                storyboard={storyboard}
                boards={storyboardList}
                onSwitch={(id) => {
                  setActiveId(id);
                  setRawSelection({ kind: 'idea' });
                }}
                onCreate={() => void createStoryboard()}
                onCreateExample={() => void createStoryboard('example')}
                creating={creating}
                onPatch={(patch) => void patchStoryboard(patch)}
                onOpenPicker={() => setPickerOpen(true)}
                onRefresh={() => activeId && void loadStoryboard(activeId)}
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1240px] px-6 py-5">
                {storyboard ? (
                  <>
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

                    <SequenceStrip
                      storyboard={storyboard}
                      selection={selection}
                      onSelect={setRawSelection}
                      onAddScene={() => void addScene()}
                      videoEnabled={videoEnabled}
                      totalSeconds={totalSeconds}
                    />

                    <div className="mt-5">
                      {selection.kind === 'idea' && (
                        <IdeaDetail
                          key={storyboard.id}
                          storyboard={storyboard}
                          busy={breakingDown}
                          onSaveIdea={(idea) => void patchStoryboard({ idea }, { apply: false })}
                          onWriteSequence={(idea, count) => void writeSequence(idea, count)}
                        />
                      )}
                      {selection.kind === 'scene' && selectedScene && (
                        <SceneDetail
                          key={selectedScene.id}
                          scene={selectedScene}
                          boardSeed={storyboard.seed}
                          videoEnabled={videoEnabled}
                          busyStill={generatingScenes.has(selectedScene.id)}
                          busyVideo={videoBusyScenes.has(selectedScene.id) || assembling}
                          onPatch={(patch) => void patchScene(selectedScene.id, patch)}
                          onRenderStill={() => void generateScene(selectedScene.id)}
                          onDraftClip={() => void draftClip(selectedScene.id)}
                          onEnhance={(tier) => void enhanceClip(selectedScene.id, tier)}
                          onDelete={() => void deleteScene(selectedScene.id)}
                        />
                      )}
                      {selection.kind === 'reel' && (
                        <ReelDetail
                          storyboard={storyboard}
                          totalSeconds={totalSeconds}
                          videoEnabled={videoEnabled}
                          draftableCount={draftableScenes.length}
                          assembling={assembling}
                          onAssemble={() => void assembleReel()}
                          onNotice={(text) => setNotice({ tone: 'info', text })}
                        />
                      )}
                    </div>
                  </>
                ) : viewer ? (
                  listState === 'loading' ? (
                    <p className="mt-10 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Loading storyboards…
                    </p>
                  ) : (
                    <EmptyBoard
                      onCreate={() => void createStoryboard()}
                      onExample={() => void createStoryboard('example')}
                      creating={creating}
                    />
                  )
                ) : (
                  <SignedOutPreview signInPath={signInPath} />
                )}
              </div>
            </div>

            {storyboard && (
              <VideoPlanBar
                sceneCount={scenes.length}
                totalSeconds={totalSeconds}
                videoEnabled={videoEnabled}
                draftableCount={draftableScenes.length}
                assembling={assembling}
                onAssemble={() => void assembleReel()}
              />
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
              ...storyboard.references
                .map((entry) => entry.assetId)
                .filter((id) => id !== assetId),
              assetId,
            ].slice(-3);
            void patchStoryboard({ referenceAssetIds: next });
          }}
        />
      )}
    </TooltipProvider>
  );
}

// --- board bar ---------------------------------------------------------------

function BoardBar({
  storyboard,
  boards,
  onSwitch,
  onCreate,
  onCreateExample,
  creating,
  onPatch,
  onOpenPicker,
  onRefresh,
}: {
  storyboard: StoryboardDto;
  boards: StoryboardListItem[];
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onCreateExample: () => void;
  creating: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onOpenPicker: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
      <Select value={storyboard.id} onValueChange={(next) => next && onSwitch(next)}>
        <SelectTrigger size="sm" className="h-8! w-40 text-[12px]">
          <Film className="size-3.5 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {boards.map((board) => (
            <SelectItem key={board.id} value={board.id}>
              {board.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New storyboard"
              onClick={onCreate}
              disabled={creating}
            />
          }
        >
          {creating ? <Loader2 className="animate-spin" /> : <Plus />}
        </TooltipTrigger>
        <TooltipContent>New storyboard</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Load example board"
              onClick={onCreateExample}
              disabled={creating}
            />
          }
        >
          <Sparkles />
        </TooltipTrigger>
        <TooltipContent>Load example board</TooltipContent>
      </Tooltip>

      <Input
        key={`${storyboard.id}-title`}
        defaultValue={storyboard.title}
        onBlur={(event) => {
          const value = event.target.value.trim();
          if (value && value !== storyboard.title) onPatch({ title: value });
        }}
        className="h-8 max-w-xs border-0 bg-transparent px-2 text-[13px] font-medium shadow-none focus-visible:ring-1"
        aria-label="Storyboard title"
      />

      <div className="ml-auto flex items-center gap-1.5">
        <ReferencesChip storyboard={storyboard} onPatch={onPatch} onOpenPicker={onOpenPicker} />
        <BoardSeedChip seed={storyboard.seed} onPatch={onPatch} />
        <StyleChip styleNote={storyboard.styleNote} onPatch={onPatch} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh storyboard"
                onClick={onRefresh}
              />
            }
          >
            <RefreshCw />
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function ReferencesChip({
  storyboard,
  onPatch,
  onOpenPicker,
}: {
  storyboard: StoryboardDto;
  onPatch: (patch: Record<string, unknown>) => void;
  onOpenPicker: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className={cn(parameterChipClass, 'h-8')}>
            <Images className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Refs</span>
            <span className="font-mono text-foreground">{storyboard.references.length}/3</span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-72 gap-2 p-3">
        <p className="text-[12px] font-medium">Reference images</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Pinned images ride along as <code>input_image</code> 1–3 with every scene render —
          subject, style, palette.
        </p>
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
                      onPatch({
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
                onClick={onOpenPicker}
                disabled={slotIndex > storyboard.references.length}
                className="grid aspect-square place-items-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-40"
                aria-label="Add reference"
              >
                <ImagePlus className="size-4" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BoardSeedChip({
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
          <button type="button" className={cn(parameterChipClass, 'h-8')}>
            <Dices className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Seed</span>
            <span className="font-mono text-foreground">{seed == null ? 'auto' : seed}</span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 gap-2 p-3">
        <p className="text-[12px] font-medium">Board seed</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          One seed for the whole sequence keeps the look coherent; scenes can override it
          individually.
        </p>
        <Input
          key={seed == null ? 'auto' : String(seed)}
          defaultValue={seed == null ? '' : String(seed)}
          placeholder="Random"
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
              <X /> Random
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StyleChip({
  styleNote,
  onPatch,
}: {
  styleNote: string | null;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className={cn(parameterChipClass, 'h-8 max-w-52')}>
            <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Style</span>
            <span className="truncate font-mono text-foreground">
              {styleNote ? styleNote : '—'}
            </span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-80 gap-2 p-3">
        <p className="text-[12px] font-medium">Style note</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Appended to every scene prompt — the shared visual grammar of the film.
        </p>
        <Textarea
          key={styleNote ?? 'empty'}
          defaultValue={styleNote ?? ''}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value !== (styleNote ?? '')) onPatch({ styleNote: value });
          }}
          placeholder="35mm film, warm mineral palette, soft studio light…"
          className="min-h-20 resize-none bg-background text-[12px] leading-4"
        />
      </PopoverContent>
    </Popover>
  );
}

// --- sequence strip ----------------------------------------------------------

function SequenceStrip({
  storyboard,
  selection,
  onSelect,
  onAddScene,
  videoEnabled,
  totalSeconds,
}: {
  storyboard: StoryboardDto;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAddScene: () => void;
  videoEnabled: boolean;
  totalSeconds: number;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-stretch">
        <IdeaNode
          idea={storyboard.idea}
          sceneCount={storyboard.scenes.length}
          selected={selection.kind === 'idea'}
          onSelect={() => onSelect({ kind: 'idea' })}
        />
        {storyboard.scenes.map((scene) => (
          <span key={scene.id} className="contents">
            <Connector />
            <SceneNode
              scene={scene}
              videoEnabled={videoEnabled}
              selected={selection.kind === 'scene' && selection.id === scene.id}
              onSelect={() => onSelect({ kind: 'scene', id: scene.id })}
            />
          </span>
        ))}
        <Connector dashed={storyboard.scenes.length === 0} />
        <button
          onClick={onAddScene}
          className="grid w-16 shrink-0 place-items-center self-stretch rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          aria-label="Add scene"
        >
          <Plus className="size-4" />
        </button>
        <Connector dashed />
        <ReelNode
          totalSeconds={totalSeconds}
          sceneCount={storyboard.scenes.length}
          selected={selection.kind === 'reel'}
          onSelect={() => onSelect({ kind: 'reel' })}
        />
      </div>
    </div>
  );
}

function Connector({ dashed = false }: { dashed?: boolean }) {
  return (
    <div className="flex w-8 shrink-0 items-center justify-center self-stretch" aria-hidden>
      <span className={cn('h-px w-3 bg-border', dashed && 'opacity-60')} />
      <ChevronRight className="-mx-1.5 size-3 shrink-0 text-muted-foreground/40" />
      <span className={cn('h-px w-3 bg-border', dashed && 'opacity-60')} />
    </div>
  );
}

// Keeps the selected node visible while walking the strip with arrow keys.
function useNodeScrollIntoView(selected: boolean) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [selected]);
  return ref;
}

function nodeClass(selected: boolean) {
  return cn(
    surfaceClass,
    'w-44 shrink-0 cursor-pointer p-2.5 text-left outline-none transition-all hover:-translate-y-0.5 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50',
    selected && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
  );
}

function IdeaNode({
  idea,
  sceneCount,
  selected,
  onSelect,
}: {
  idea: string | null;
  sceneCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useNodeScrollIntoView(selected);
  return (
    <button ref={ref} onClick={onSelect} className={nodeClass(selected)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Idea
        </span>
        <span className="grid size-5 place-items-center rounded bg-muted">
          <Lightbulb className="size-3" />
        </span>
      </div>
      <p
        className={cn(
          'line-clamp-4 min-h-16 text-[11px] leading-4',
          idea ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {idea || 'Describe the film — one paragraph the whole sequence is written from.'}
      </p>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {sceneCount ? `${sceneCount} scenes` : 'no scenes yet'}
      </p>
    </button>
  );
}

function SceneNode({
  scene,
  videoEnabled,
  selected,
  onSelect,
}: {
  scene: SceneDto;
  videoEnabled: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const steps = sceneSteps(scene);
  const stillAsset = scene.run?.assets[0];
  const clip = latestClip(scene, ['fhd', 'hd', 'draft']);
  const clipAsset = clip?.run?.assets[0];
  const rendering =
    runStepState(scene.run) === 'active' ||
    scene.clips.some((entry) => clipStepState(entry) === 'active');
  const ref = useNodeScrollIntoView(selected);

  return (
    <button ref={ref} onClick={onSelect} className={nodeClass(selected)}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Scene {String(scene.sceneIndex + 1).padStart(2, '0')}
        </span>
        {rendering && <Loader2 className="size-3 animate-spin text-amber-600" />}
      </div>
      <div className="relative mb-1.5 aspect-video overflow-hidden rounded border bg-muted">
        {clipAsset ? (
          <video
            src={clipAsset.url}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : stillAsset ? (
          <NextImage
            src={stillAsset.url}
            alt={scene.title}
            width={320}
            height={180}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            {runStepState(scene.run) === 'error' ? (
              <ShieldAlert className="size-4 text-amber-600" />
            ) : (
              <Images className="size-4" />
            )}
          </span>
        )}
        <span className="absolute bottom-1 right-1 rounded bg-background/85 px-1 font-mono text-[9px] backdrop-blur">
          {scene.durationSec}s
        </span>
      </div>
      <p className="truncate text-[11px] font-medium">{scene.title}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <StepDot label="Still" state={steps.still} />
        <StepDot label="Draft clip" state={videoEnabled ? steps.draft : 'idle'} />
        <StepDot label="Enhanced" state={videoEnabled ? steps.enhance : 'idle'} />
      </div>
    </button>
  );
}

function StepDot({ label, state }: { label: string; state: StepState }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn('size-1.5 rounded-full', STEP_DOT_CLASS[state])} />}
      />
      <TooltipContent>
        {label}: {state}
      </TooltipContent>
    </Tooltip>
  );
}

function ReelNode({
  totalSeconds,
  sceneCount,
  selected,
  onSelect,
}: {
  totalSeconds: number;
  sceneCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useNodeScrollIntoView(selected);
  return (
    <button ref={ref} onClick={onSelect} className={nodeClass(selected)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Reel
        </span>
        <span className="grid size-5 place-items-center rounded bg-muted">
          <Film className="size-3" />
        </span>
      </div>
      <p className="text-[15px] font-medium leading-5">{totalSeconds}s</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {sceneCount} scene{sceneCount === 1 ? '' : 's'}
      </p>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        draft ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'draft'))}
      </p>
    </button>
  );
}

// --- detail: idea ------------------------------------------------------------

function IdeaDetail({
  storyboard,
  busy,
  onSaveIdea,
  onWriteSequence,
}: {
  storyboard: StoryboardDto;
  busy: boolean;
  onSaveIdea: (idea: string) => void;
  onWriteSequence: (idea: string, sceneCount: number) => void;
}) {
  const [idea, setIdea] = useState(storyboard.idea ?? '');
  const [sceneCount, setSceneCount] = useState('4');
  const canWrite = idea.trim().length >= 10 && idea.length <= 2_000 && !busy;

  return (
    <Surface className="p-5">
      <SystemLabel>Core idea</SystemLabel>
      <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
        One paragraph: who, where, what happens. The sequence of shots is written from this —
        then every scene is yours to refine and render.
      </p>
      <div className="relative mt-3 max-w-2xl">
        <Textarea
          value={idea}
          maxLength={2_000}
          onChange={(event) => setIdea(event.target.value)}
          onBlur={() => {
            if (idea.trim() !== (storyboard.idea ?? '')) onSaveIdea(idea.trim());
          }}
          placeholder="A lighthouse keeper discovers the light attracts something from the deep. Night storm, one lantern, the sea answering back…"
          className="min-h-28 resize-none bg-background pb-7 text-sm leading-5"
        />
        <span className="absolute bottom-2 right-2 font-mono text-[9px] text-muted-foreground">
          {idea.length.toLocaleString()} / 2,000
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={sceneCount} onValueChange={(next) => next && setSceneCount(next)}>
          <SelectTrigger size="sm" className="h-8! w-28 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCENE_COUNT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option} scenes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => onWriteSequence(idea.trim(), Number(sceneCount))} disabled={!canWrite}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {storyboard.scenes.length ? 'Rewrite sequence' : 'Write scene sequence'}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Shot list by Mistral — the same model family that reads prompts inside FLUX.2.
        </span>
      </div>
    </Surface>
  );
}

// --- detail: scene -----------------------------------------------------------

type StageTab = 'still' | 'draft' | 'hd' | 'fhd';

function SceneDetail({
  scene,
  boardSeed,
  videoEnabled,
  busyStill,
  busyVideo,
  onPatch,
  onRenderStill,
  onDraftClip,
  onEnhance,
  onDelete,
}: {
  scene: SceneDto;
  boardSeed: number | null;
  videoEnabled: boolean;
  busyStill: boolean;
  busyVideo: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onRenderStill: () => void;
  onDraftClip: () => void;
  onEnhance: (tier: 'hd' | 'fhd') => void;
  onDelete: () => void;
}) {
  const draft = latestClip(scene, ['draft']);
  const hd = latestClip(scene, ['hd']);
  const fhd = latestClip(scene, ['fhd']);
  const defaultTab: StageTab = fhd ? 'fhd' : hd ? 'hd' : draft ? 'draft' : 'still';
  const [tab, setTab] = useState<StageTab>(defaultTab);

  const stillRunning = runStepState(scene.run) === 'active';
  const draftRunning = clipStepState(draft) === 'active';
  const enhanceRunning = clipStepState(hd) === 'active' || clipStepState(fhd) === 'active';
  const hasStill = Boolean(scene.run?.assets[0]);
  const hasFinishedDraft = draft?.run?.status === 'succeeded';
  const effectiveSeed = scene.seed ?? boardSeed;

  const tabs: Array<{ id: StageTab; label: string; present: boolean }> = [
    { id: 'still', label: 'Still', present: Boolean(scene.run) },
    { id: 'draft', label: 'Draft', present: Boolean(draft) },
    { id: 'hd', label: 'HD', present: Boolean(hd) },
    { id: 'fhd', label: 'FHD', present: Boolean(fhd) },
  ];

  return (
    <Surface className="p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setTab(entry.id)}
                className={cn(
                  parameterChipClass,
                  'h-7',
                  tab === entry.id && 'border-foreground/35 bg-accent/35',
                  !entry.present && 'opacity-50',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <SceneStage
            tab={tab}
            scene={scene}
            draft={draft}
            hd={hd}
            fhd={fhd}
            effectiveSeed={effectiveSeed}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <SystemLabel>Scene {String(scene.sceneIndex + 1).padStart(2, '0')}</SystemLabel>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete scene"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const hasWork = Boolean(scene.run || scene.clips.length);
                      if (!hasWork || window.confirm('Delete this scene and its renders?')) {
                        onDelete();
                      }
                    }}
                  />
                }
              >
                <Trash2 />
              </TooltipTrigger>
              <TooltipContent>Delete scene</TooltipContent>
            </Tooltip>
          </div>
          <Input
            key={`${scene.id}-title`}
            defaultValue={scene.title}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== scene.title) onPatch({ title: value });
            }}
            className="mt-1 h-8 border-0 bg-transparent px-0 text-[15px] font-medium shadow-none focus-visible:ring-1"
            aria-label="Scene title"
          />
          <Textarea
            key={`${scene.id}-prompt`}
            defaultValue={scene.prompt}
            onBlur={(event) => {
              if (event.target.value.trim() !== scene.prompt) {
                onPatch({ prompt: event.target.value });
              }
            }}
            placeholder="Describe this shot — subject, setting, camera, light, motion…"
            className="mt-2 min-h-24 resize-none bg-background text-[13px] leading-5"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
          </div>

          <SystemLabel className="mb-2 mt-4">Pipeline</SystemLabel>
          <div className="space-y-2">
            <StepRow
              index={1}
              label={hasStill ? 'Re-render still' : 'Render still'}
              cost={`~${formatUsd(SCENE_STILL_ESTIMATE_USD)}`}
              state={runStepState(scene.run)}
              busy={busyStill || stillRunning}
              disabled={busyStill || stillRunning || scene.prompt.trim().length < 3}
              onRun={onRenderStill}
              hint={
                scene.prompt.trim().length < 3
                  ? 'Write the shot prompt first.'
                  : 'FLUX.2 [pro] frame with the board references and seed.'
              }
              error={scene.run?.errorMessage ?? null}
            />
            {videoEnabled ? (
              <>
                <StepRow
                  index={2}
                  label={hasFinishedDraft ? 'Re-draft clip' : 'Draft clip'}
                  cost={`~${formatUsd(estimateVideoCostUsd(scene.durationSec, 'draft'))}`}
                  state={clipStepState(draft)}
                  busy={busyVideo || draftRunning}
                  disabled={!hasStill || busyVideo || draftRunning || enhanceRunning}
                  onRun={onDraftClip}
                  hint={
                    hasStill
                      ? 'FLUX 3 Video draft from the still — cheap preview with audio.'
                      : 'Render the still first.'
                  }
                  error={draft?.run?.errorMessage ?? null}
                />
                <StepRow
                  index={3}
                  label="Enhance"
                  state={clipStepState(fhd) === 'idle' ? clipStepState(hd) : clipStepState(fhd)}
                  busy={busyVideo || enhanceRunning}
                  disabled={!hasFinishedDraft || busyVideo || draftRunning || enhanceRunning}
                  hint={
                    hasFinishedDraft
                      ? 'Replays the exact draft — same seed and motion — at full quality.'
                      : 'Finish a draft clip first.'
                  }
                  error={hd?.run?.errorMessage ?? fhd?.run?.errorMessage ?? null}
                  actions={
                    <>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onEnhance('hd')}
                        disabled={!hasFinishedDraft || busyVideo || draftRunning || enhanceRunning}
                      >
                        HD ~{formatUsd(estimateVideoCostUsd(scene.durationSec, 'hd'))}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onEnhance('fhd')}
                        disabled={!hasFinishedDraft || busyVideo || draftRunning || enhanceRunning}
                      >
                        FHD ~{formatUsd(estimateVideoCostUsd(scene.durationSec, 'fhd'))}
                      </Button>
                    </>
                  }
                />
              </>
            ) : (
              <p className="rounded-md border border-dashed p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                Video steps are off on this deployment — set <code>VIDEO_ENABLED=true</code> to
                unlock FLUX 3 Video draft → enhance.
              </p>
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

function SceneStage({
  tab,
  scene,
  draft,
  hd,
  fhd,
  effectiveSeed,
}: {
  tab: StageTab;
  scene: SceneDto;
  draft: ClipDto | null;
  hd: ClipDto | null;
  fhd: ClipDto | null;
  effectiveSeed: number | null;
}) {
  const clip = tab === 'draft' ? draft : tab === 'hd' ? hd : tab === 'fhd' ? fhd : null;
  const stillAsset = scene.run?.assets[0];

  let content: ReactNode;
  let meta: string;
  if (tab === 'still') {
    if (stillAsset) {
      content = (
        <NextImage
          src={stillAsset.url}
          alt={scene.title}
          width={1344}
          height={768}
          unoptimized
          className="size-full object-cover"
        />
      );
    } else if (runStepState(scene.run) === 'active') {
      content = <StagePlaceholder icon="spinner" text="Rendering the still…" />;
    } else if (scene.run?.status === 'draft') {
      content = (
        <StagePlaceholder
          icon="image"
          text="Saved as a shared draft — add BFL_API_KEY on the deployment to render live."
        />
      );
    } else if (scene.run && scene.run.status !== 'succeeded') {
      content = <StagePlaceholder icon="alert" text={scene.run.errorMessage ?? 'Render failed.'} />;
    } else {
      content = <StagePlaceholder icon="image" text="No still yet — run step 1." />;
    }
    meta = `FLUX.2 [pro] · ${scene.run?.status ?? 'not rendered'} · seed ${
      effectiveSeed == null ? 'random' : effectiveSeed
    }${scene.run?.costCredits ? ` · ${formatCost(scene.run.costCredits)}` : ''}`;
  } else {
    const clipAsset = clip?.run?.assets[0];
    if (clipAsset) {
      content = (
        <video controls preload="metadata" src={clipAsset.url} className="size-full bg-black">
          <track kind="captions" label="Captions unavailable" />
        </video>
      );
    } else if (clip && clipStepState(clip) === 'active') {
      content = (
        <StagePlaceholder icon="spinner" text={`Rendering the ${tab} clip — a few minutes…`} />
      );
    } else if (clip?.run && clip.run.status !== 'succeeded') {
      content = <StagePlaceholder icon="alert" text={clip.run.errorMessage ?? 'Clip failed.'} />;
    } else {
      content = <StagePlaceholder icon="film" text={`No ${tab} clip yet.`} />;
    }
    meta = `FLUX 3 Video [${tab}] · ${clip?.run?.status ?? 'not rendered'}${
      clip?.run?.costCredits ? ` · ${formatCost(clip.run.costCredits)}` : ''
    }`;
  }

  return (
    <div>
      <div className="aspect-video overflow-hidden rounded-md border bg-muted">{content}</div>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {meta}
      </p>
    </div>
  );
}

function StagePlaceholder({
  icon,
  text,
}: {
  icon: 'spinner' | 'alert' | 'image' | 'film';
  text: string;
}) {
  return (
    <span className="grid size-full place-items-center p-6">
      <span className="flex max-w-sm flex-col items-center gap-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        {icon === 'spinner' && <Loader2 className="size-5 animate-spin" />}
        {icon === 'alert' && <ShieldAlert className="size-5 text-amber-600" />}
        {icon === 'image' && <Images className="size-5" />}
        {icon === 'film' && <Film className="size-5" />}
        {text}
      </span>
    </span>
  );
}

function StepRow({
  index,
  label,
  cost,
  state,
  busy,
  disabled,
  onRun,
  hint,
  error,
  actions,
}: {
  index: number;
  label: string;
  cost?: string;
  state: StepState;
  busy: boolean;
  disabled: boolean;
  onRun?: () => void;
  hint: string;
  error: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px]">
          {index}
        </span>
        <span className={cn('size-1.5 shrink-0 rounded-full', STEP_DOT_CLASS[state])} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{label}</span>
        {actions ?? (
          <Button size="xs" variant="outline" onClick={onRun} disabled={disabled}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {cost}
          </Button>
        )}
      </div>
      <p className="mt-1 pl-7 text-[10px] leading-relaxed text-muted-foreground">{hint}</p>
      {error && state === 'error' && (
        <p className="mt-1 rounded bg-amber-500/10 px-2 py-1 pl-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
          {error}
        </p>
      )}
    </div>
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
            {seed == null ? 'board seed' : seed}
          </button>
        }
      />
      <PopoverContent align="start" side="bottom" className="w-64 gap-2 p-3">
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

// --- detail: reel ------------------------------------------------------------

function ReelDetail({
  storyboard,
  totalSeconds,
  videoEnabled,
  draftableCount,
  assembling,
  onAssemble,
  onNotice,
}: {
  storyboard: StoryboardDto;
  totalSeconds: number;
  videoEnabled: boolean;
  draftableCount: number;
  assembling: boolean;
  onAssemble: () => void;
  onNotice: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const exportBoard = async () => {
    const payload = {
      title: storyboard.title,
      idea: storyboard.idea,
      styleNote: storyboard.styleNote,
      seed: storyboard.seed,
      references: storyboard.references.map((reference) => reference.assetId),
      scenes: storyboard.scenes.map((scene) => ({
        title: scene.title,
        prompt: scene.prompt,
        durationSec: scene.durationSec,
        seed: scene.seed,
      })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      onNotice('Clipboard is unavailable in this browser.');
    }
  };

  return (
    <Surface className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SystemLabel>Reel</SystemLabel>
          <p className="mt-1 text-[15px] font-medium">
            {storyboard.scenes.length} scenes · {totalSeconds}s
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Draft everything cheap, watch the cut, enhance only the keepers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportBoard()}>
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Export board JSON'}
          </Button>
          {videoEnabled && (
            <Button size="sm" onClick={onAssemble} disabled={assembling || draftableCount === 0}>
              {assembling ? <Loader2 className="animate-spin" /> : <Clapperboard />}
              Assemble draft reel{draftableCount > 0 ? ` (${draftableCount})` : ''}
            </Button>
          )}
        </div>
      </div>

      {storyboard.scenes.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {storyboard.scenes.map((scene) => {
            const steps = sceneSteps(scene);
            const bestClip = latestClip(scene, ['fhd', 'hd', 'draft']);
            return (
              <div
                key={scene.id}
                className="flex items-center gap-3 rounded-md border bg-background px-2.5 py-1.5"
              >
                <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                  Scene {String(scene.sceneIndex + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px]">{scene.title}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {scene.durationSec}s
                </span>
                <span className="flex items-center gap-1.5">
                  <StepDot label="Still" state={steps.still} />
                  <StepDot label="Draft clip" state={videoEnabled ? steps.draft : 'idle'} />
                  <StepDot label="Enhanced" state={videoEnabled ? steps.enhance : 'idle'} />
                </span>
                <span className="w-14 text-right font-mono text-[10px] uppercase text-muted-foreground">
                  {bestClip ? bestClip.tier : steps.still === 'done' ? 'still' : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="rounded border px-1.5 py-0.5">
          draft ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'draft'))}
        </span>
        <span className="rounded border px-1.5 py-0.5">
          enhance HD ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'hd'))}
        </span>
        <span className="rounded border px-1.5 py-0.5">
          FHD ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'fhd'))}
        </span>
        <span className="rounded border px-1.5 py-0.5">audio included</span>
      </div>
    </Surface>
  );
}

// --- plan bar ----------------------------------------------------------------

function VideoPlanBar({
  sceneCount,
  totalSeconds,
  videoEnabled,
  draftableCount,
  assembling,
  onAssemble,
}: {
  sceneCount: number;
  totalSeconds: number;
  videoEnabled: boolean;
  draftableCount: number;
  assembling: boolean;
  onAssemble: () => void;
}) {
  return (
    <div className="shrink-0 border-t bg-background px-6 py-2.5">
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2">
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
            HD ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'hd'))}
          </span>
          <span className="rounded border px-1.5 py-0.5">
            FHD ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'fhd'))}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {videoEnabled ? (
            <Button
              size="sm"
              className="h-8 text-[12px]"
              onClick={onAssemble}
              disabled={assembling || draftableCount === 0}
            >
              {assembling ? <Loader2 className="animate-spin" /> : <Clapperboard />}
              Assemble draft reel{draftableCount > 0 ? ` (${draftableCount})` : ''}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="h-5 rounded-md font-mono text-[9px] tracking-wider"
                    >
                      CONCEPT
                    </Badge>
                    <Button size="sm" className="h-8 text-[12px]" disabled>
                      <Clapperboard /> Assemble draft reel
                    </Button>
                  </span>
                }
              />
              <TooltipContent side="top" className="max-w-64">
                Stills render live through FLUX.2. Set VIDEO_ENABLED=true on the deployment to turn
                on the FLUX 3 Video draft → enhance pipeline.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

// --- empty states ------------------------------------------------------------

function EmptyBoard({
  onCreate,
  onExample,
  creating,
}: {
  onCreate: () => void;
  onExample: () => void;
  creating: boolean;
}) {
  return (
    <Surface className="mx-auto mt-10 max-w-lg p-8 text-center">
      <Clapperboard className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-3 text-[18px] font-semibold tracking-[-0.02em]">
        One idea. A sequence of shots.
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
        Describe the film in a paragraph — the shot list writes itself, scene by scene. Then walk
        the sequence: refine each prompt, render the still, draft the clip, enhance the keepers.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Button onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} New storyboard
        </Button>
        <Button variant="outline" onClick={onExample} disabled={creating}>
          <Sparkles /> Load example board
        </Button>
      </div>
    </Surface>
  );
}

function SignedOutPreview({ signInPath }: { signInPath: string }) {
  return (
    <Surface className="mx-auto mt-10 max-w-lg p-8 text-center">
      <Clapperboard className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-3 text-[18px] font-semibold tracking-[-0.02em]">
        Scenes — one idea, a sequence of shots
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
        Type the idea, get a sequential shot list, and walk it node by node: pinned references keep
        the subject consistent through FLUX.2, and each finished still becomes a FLUX 3 Video draft
        you enhance only when it earns it.
      </p>
      <a href={signInPath} className={buttonVariants({ className: 'mt-4' })}>
        Sign in to build
      </a>
    </Surface>
  );
}

// --- reference picker --------------------------------------------------------

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
            run.assets
              .filter((asset) => !asset.mimeType.startsWith('video/'))
              .map((asset) => ({ id: asset.id, url: asset.url, prompt: run.prompt })),
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
            Pick any output from your shared history. It will ride along as a FLUX.2 reference
            image with every scene render.
          </DialogDescription>
        </DialogHeader>
        {state === 'loading' && (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading your outputs…
          </p>
        )}
        {state === 'error' && <p className="text-[12px] text-destructive">Could not load history.</p>}
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

// --- helpers -----------------------------------------------------------------

// costCredits stores BFL-reported credits; 1 credit = $0.01.
function formatCost(credits: string | null) {
  if (!credits) return '';
  const value = Number(credits);
  return Number.isFinite(value) ? `$${(value / 100).toFixed(2)}` : '';
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
