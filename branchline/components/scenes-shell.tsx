'use client';

import NextImage from 'next/image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  Captions,
  ChevronRight,
  Clapperboard,
  Copy,
  Dices,
  Expand,
  Film,
  ImagePlus,
  Images,
  Lightbulb,
  Loader2,
  Maximize2,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Shrink,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
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
import type {
  ClipDto,
  SceneDto,
  StoryboardDto,
  SubtitleDto,
  TakeDto,
} from '@/lib/storyboard-service';
import type { LookDto } from '@/app/api/looks/route';

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
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // Restore the strip density after mount (deferred: no sync setState in
  // effects under the react compiler).
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem('branchline-scenes-density') === 'compact') {
          setDensity('compact');
        }
      } catch {
        // Storage unavailable — keep the default.
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const toggleDensity = useCallback(() => {
    const next = density === 'compact' ? 'comfortable' : 'compact';
    try {
      window.localStorage.setItem('branchline-scenes-density', next);
    } catch {
      // Storage unavailable — the toggle still works for this session.
    }
    setDensity(next);
  }, [density]);

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
    async (sceneId: string, instruction?: string) => {
      if (!activeId) return;
      setGeneratingScenes((current) => new Set(current).add(sceneId));
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}/generate`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(instruction ? { instruction } : {}),
          },
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

  const saveSubtitles = useCallback(
    async (
      sceneId: string,
      clipId: string | null,
      cues: Array<Omit<SubtitleDto, 'id' | 'clipId'>>,
    ) => {
      if (!activeId) return;
      const response = await fetch(
        `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}/subtitles`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clipId, cues }),
        },
      );
      const data = (await response.json()) as { storyboard?: StoryboardDto; error?: string };
      if (!response.ok || !data.storyboard) {
        throw new Error(data.error || 'Could not save subtitles.');
      }
      setStoryboard(data.storyboard);
      setNotice({ tone: 'info', text: 'Subtitle timing saved to the shared storyboard.' });
    },
    [activeId],
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
                density={density}
                onToggleDensity={toggleDensity}
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
                      compact={density === 'compact'}
                      busyScenes={generatingScenes}
                      onSelectTake={(sceneId, generationId) =>
                        void patchScene(sceneId, { activeGenerationId: generationId })
                      }
                      onNewTake={(sceneId) => void generateScene(sceneId)}
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
                          isFinalScene={
                            selectedScene.sceneIndex === storyboard.scenes.length - 1
                          }
                          boardSeed={storyboard.seed}
                          videoEnabled={videoEnabled}
                          busyStill={generatingScenes.has(selectedScene.id)}
                          busyVideo={videoBusyScenes.has(selectedScene.id) || assembling}
                          onPatch={(patch) => void patchScene(selectedScene.id, patch)}
                          onRenderStill={() => void generateScene(selectedScene.id)}
                          onRefine={(instruction) =>
                            void generateScene(selectedScene.id, instruction)
                          }
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
                          busyScenes={videoBusyScenes}
                          onDraftClip={(sceneId) => void draftClip(sceneId)}
                          onEnhance={(sceneId, tier) => void enhanceClip(sceneId, tier)}
                          onSaveSubtitles={saveSubtitles}
                          onOpenScene={(id) => setRawSelection({ kind: 'scene', id })}
                          onTrim={(sceneId, durationSec) =>
                            void patchScene(sceneId, { durationSec })
                          }
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
                onOpenTimeline={() => setRawSelection({ kind: 'reel' })}
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
  density,
  onToggleDensity,
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
  density: 'comfortable' | 'compact';
  onToggleDensity: () => void;
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
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={density === 'compact' ? 'Comfortable strip' : 'Compact strip'}
                onClick={onToggleDensity}
              />
            }
          >
            {density === 'compact' ? <Expand /> : <Shrink />}
          </TooltipTrigger>
          <TooltipContent>
            {density === 'compact' ? 'Comfortable strip' : 'Compact strip'}
          </TooltipContent>
        </Tooltip>
        <LooksChip onPatch={onPatch} />
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

// Applies a saved Look (crafted in the Playground) to this board in one move:
// style note + seed + the look's frame as reference image 1.
function LooksChip({ onPatch }: { onPatch: (patch: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [looks, setLooks] = useState<LookDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFailed(false);
          void fetch('/api/looks', { cache: 'no-store' })
            .then(async (response) => {
              if (!response.ok) throw new Error();
              const data = (await response.json()) as { looks: LookDto[] };
              setLooks(data.looks);
            })
            .catch(() => setFailed(true));
        }
      }}
    >
      <PopoverTrigger
        render={
          <button type="button" className={cn(parameterChipClass, 'h-8')}>
            <Palette className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Looks</span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-80 gap-2 p-3">
        <p className="text-[12px] font-medium">Apply a look</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          A look fills the board&apos;s style note and seed and pins its frame as reference 1 —
          crafted in the Playground via &ldquo;Save as Look&rdquo;.
        </p>
        {failed && <p className="text-[11px] text-destructive">Could not load looks.</p>}
        {!failed && looks == null && (
          <p className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </p>
        )}
        {looks != null && looks.length === 0 && (
          <p className="rounded-md border border-dashed p-2.5 text-[11px] leading-4 text-muted-foreground">
            No looks yet. Iterate a frame in the Playground until the style sings, then save it
            as a Look from the run detail.
          </p>
        )}
        {looks != null && looks.length > 0 && (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {looks.map((look) => (
              <button
                key={look.id}
                type="button"
                onClick={() => {
                  onPatch({
                    styleNote: look.styleNote,
                    seed: look.seed,
                    referenceAssetIds: [look.assetId],
                  });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md border bg-background p-1.5 text-left outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="block aspect-video w-16 shrink-0 overflow-hidden rounded border bg-muted">
                  <NextImage
                    src={look.assetUrl}
                    alt={look.name}
                    width={128}
                    height={72}
                    unoptimized
                    className="size-full object-cover"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">{look.name}</span>
                  <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {look.modelId}
                    {look.seed != null && ` · seed ${look.seed}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  compact,
  busyScenes,
  onSelectTake,
  onNewTake,
}: {
  storyboard: StoryboardDto;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAddScene: () => void;
  videoEnabled: boolean;
  totalSeconds: number;
  compact: boolean;
  busyScenes: Set<string>;
  onSelectTake: (sceneId: string, generationId: string) => void;
  onNewTake: (sceneId: string) => void;
}) {
  const branchesOpen =
    selection.kind === 'scene' &&
    (storyboard.scenes.find((scene) => scene.id === selection.id)?.takes.length ?? 0) > 0;

  return (
    <div className={cn('overflow-x-auto', branchesOpen ? 'pb-24' : 'pb-1')}>
      <div className="flex min-w-max items-stretch">
        <IdeaNode
          idea={storyboard.idea}
          sceneCount={storyboard.scenes.length}
          selected={selection.kind === 'idea'}
          onSelect={() => onSelect({ kind: 'idea' })}
          compact={compact}
        />
        {storyboard.scenes.map((scene) => {
          const selected = selection.kind === 'scene' && selection.id === scene.id;
          return (
            <span key={scene.id} className="contents">
              <Connector compact={compact} />
              <div className="relative">
                <SceneNode
                  scene={scene}
                  isFinalScene={scene.sceneIndex === storyboard.scenes.length - 1}
                  videoEnabled={videoEnabled}
                  selected={selected}
                  onSelect={() => onSelect({ kind: 'scene', id: scene.id })}
                  compact={compact}
                />
                {selected && scene.takes.length > 0 && (
                  <TakeBranches
                    takes={scene.takes}
                    activeGenerationId={scene.generationId}
                    busy={busyScenes.has(scene.id)}
                    onSelect={(generationId) => onSelectTake(scene.id, generationId)}
                    onNew={() => onNewTake(scene.id)}
                  />
                )}
              </div>
            </span>
          );
        })}
        <Connector dashed={storyboard.scenes.length === 0} compact={compact} />
        <button
          onClick={onAddScene}
          className={cn(
            'grid shrink-0 place-items-center self-stretch rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground',
            compact ? 'w-10' : 'w-16',
          )}
          aria-label="Add scene"
        >
          <Plus className="size-4" />
        </button>
        <Connector dashed compact={compact} />
        <ReelNode
          totalSeconds={totalSeconds}
          sceneCount={storyboard.scenes.length}
          selected={selection.kind === 'reel'}
          onSelect={() => onSelect({ kind: 'reel' })}
          compact={compact}
        />
      </div>
    </div>
  );
}

// Branches fanning out below the selected scene node: each take is a variant
// of the shot; clicking one makes it the active still, the dashed tile
// renders another.
function TakeBranches({
  takes,
  activeGenerationId,
  busy,
  onSelect,
  onNew,
}: {
  takes: TakeDto[];
  activeGenerationId: string | null;
  busy: boolean;
  onSelect: (generationId: string) => void;
  onNew: () => void;
}) {
  // Real canvas edges, same language as the playground graph: one bezier per
  // branch fanning from the node's bottom-center to each take tile.
  const TILE_W = 64;
  const TILE_GAP = 6;
  const EDGE_H = 26;
  const itemCount = takes.length + 1;
  const rowWidth = itemCount * TILE_W + (itemCount - 1) * TILE_GAP;
  const startX = rowWidth / 2;
  const bend = EDGE_H * 0.62;
  const edgePath = (index: number) => {
    const endX = index * (TILE_W + TILE_GAP) + TILE_W / 2;
    return `M ${startX} 0 C ${startX} ${bend}, ${endX} ${EDGE_H - bend}, ${endX} ${EDGE_H}`;
  };

  return (
    <div className="absolute left-1/2 top-full z-10 flex -translate-x-1/2 flex-col items-center">
      <svg
        width={rowWidth}
        height={EDGE_H}
        viewBox={`0 0 ${rowWidth} ${EDGE_H}`}
        className="shrink-0"
        aria-hidden
      >
        {takes.map((take, index) => (
          <path
            key={take.id}
            d={edgePath(index)}
            className={cn(
              'graph-edge',
              take.generationId === activeGenerationId && 'graph-edge-active',
            )}
          />
        ))}
        <path d={edgePath(takes.length)} className="graph-edge" strokeDasharray="3 3" />
      </svg>
      <div className="flex items-start" style={{ gap: TILE_GAP }}>
        {takes.map((take, index) => {
          const asset = take.run?.assets[0];
          const active = take.generationId === activeGenerationId;
          return (
            <button
              key={take.id}
              type="button"
              onClick={() => !active && onSelect(take.generationId)}
              className={cn(
                'relative aspect-video w-16 shrink-0 overflow-hidden rounded border bg-muted shadow-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50',
                active
                  ? 'cursor-default border-[var(--brand)] ring-2 ring-[var(--brand-soft)]'
                  : 'hover:-translate-y-0.5 hover:border-foreground/30',
              )}
              aria-label={`Take ${index + 1}${active ? ' (active)' : ''}`}
              aria-pressed={active}
            >
              {asset ? (
                <NextImage
                  src={asset.url}
                  alt={`Take ${index + 1}`}
                  width={128}
                  height={72}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-muted-foreground">
                  {take.run && ['queued', 'running'].includes(take.run.status) ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ShieldAlert className="size-3" />
                  )}
                </span>
              )}
              <span className="absolute bottom-0 left-0 rounded-tr bg-background/85 px-0.5 font-mono text-[8px] backdrop-blur">
                T{index + 1}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onNew}
          disabled={busy}
          className="grid aspect-video w-16 shrink-0 place-items-center rounded border border-dashed bg-background/60 text-muted-foreground shadow-sm outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          aria-label="Render a new take"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Connector({ dashed = false, compact = false }: { dashed?: boolean; compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center self-stretch',
        compact ? 'w-5' : 'w-8',
      )}
      aria-hidden
    >
      <span className={cn('h-px bg-border', compact ? 'w-1.5' : 'w-3', dashed && 'opacity-60')} />
      <ChevronRight className="-mx-1.5 size-3 shrink-0 text-muted-foreground/40" />
      <span className={cn('h-px bg-border', compact ? 'w-1.5' : 'w-3', dashed && 'opacity-60')} />
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

function nodeClass(selected: boolean, compact = false) {
  return cn(
    surfaceClass,
    'shrink-0 cursor-pointer text-left outline-none transition-all hover:-translate-y-0.5 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50',
    compact ? 'w-28 p-1.5' : 'w-44 p-2.5',
    selected && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
  );
}

function IdeaNode({
  idea,
  sceneCount,
  selected,
  onSelect,
  compact,
}: {
  idea: string | null;
  sceneCount: number;
  selected: boolean;
  onSelect: () => void;
  compact: boolean;
}) {
  const ref = useNodeScrollIntoView(selected);
  return (
    <button ref={ref} onClick={onSelect} className={nodeClass(selected, compact)}>
      <div className={cn('flex items-center justify-between', compact ? 'mb-1' : 'mb-2')}>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Idea
        </span>
        <span className="grid size-5 place-items-center rounded bg-muted">
          <Lightbulb className="size-3" />
        </span>
      </div>
      <p
        className={cn(
          compact ? 'line-clamp-3 min-h-12 text-[10px] leading-4' : 'line-clamp-4 min-h-16 text-[11px] leading-4',
          idea ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {idea || 'Describe the film — one paragraph the whole sequence is written from.'}
      </p>
      {!compact && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {sceneCount ? `${sceneCount} scenes` : 'no scenes yet'}
        </p>
      )}
    </button>
  );
}

function SceneNode({
  scene,
  isFinalScene,
  videoEnabled,
  selected,
  onSelect,
  compact,
}: {
  scene: SceneDto;
  isFinalScene: boolean;
  videoEnabled: boolean;
  selected: boolean;
  onSelect: () => void;
  compact: boolean;
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
    <button
      ref={ref}
      onClick={onSelect}
      className={nodeClass(selected, compact)}
      title={compact ? scene.title : undefined}
    >
      <div className={cn('flex items-center justify-between', compact ? 'mb-1' : 'mb-1.5')}>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {compact
            ? String(scene.sceneIndex + 1).padStart(2, '0')
            : `Scene ${String(scene.sceneIndex + 1).padStart(2, '0')}`}
        </span>
        {rendering && <Loader2 className="size-3 animate-spin text-amber-600" />}
      </div>
      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded border bg-muted',
          compact ? 'mb-1' : 'mb-1.5',
        )}
      >
        {clipAsset ? (
          <video
            src={clipAsset.url}
            poster={stillAsset?.url}
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
        {scene.takes.length > 1 && (
          <span className="absolute left-1 top-1 rounded bg-background/85 px-1 font-mono text-[9px] backdrop-blur">
            {scene.takes.length} takes
          </span>
        )}
        {isFinalScene && (stillAsset || clipAsset) && <EndCardLogo compact />}
      </div>
      {!compact && <p className="truncate text-[11px] font-medium">{scene.title}</p>}
      <div className={cn('flex items-center', compact ? 'mt-1 gap-1' : 'mt-1.5 gap-1.5')}>
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

function EndCardLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 z-20 w-[9.5703125%] -translate-x-1/2 -translate-y-1/2',
        compact && 'min-w-3',
      )}
      aria-label="Black Forest Labs logo overlay"
    >
      <NextImage
        src="/brand/bfl-mark-white.svg"
        alt=""
        width={196}
        height={140}
        className="block h-auto w-full"
      />
    </span>
  );
}

function ReelNode({
  totalSeconds,
  sceneCount,
  selected,
  onSelect,
  compact,
}: {
  totalSeconds: number;
  sceneCount: number;
  selected: boolean;
  onSelect: () => void;
  compact: boolean;
}) {
  const ref = useNodeScrollIntoView(selected);
  return (
    <button ref={ref} onClick={onSelect} className={nodeClass(selected, compact)}>
      <div className={cn('flex items-center justify-between', compact ? 'mb-1' : 'mb-2')}>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Reel
        </span>
        <span className="grid size-5 place-items-center rounded bg-muted">
          <Film className="size-3" />
        </span>
      </div>
      <p className={cn('font-medium', compact ? 'text-[13px] leading-4' : 'text-[15px] leading-5')}>
        {totalSeconds}s
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {sceneCount} scene{sceneCount === 1 ? '' : 's'}
      </p>
      {!compact && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          draft ~{formatUsd(estimateVideoCostUsd(totalSeconds, 'draft'))}
        </p>
      )}
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

const STAGE_COPY: Record<
  StageTab,
  { index: string; label: string; eyebrow: string; description: string }
> = {
  still: {
    index: '01',
    label: 'Frame',
    eyebrow: 'Scene description',
    description: 'Compose and branch the source image.',
  },
  draft: {
    index: '02',
    label: 'Motion',
    eyebrow: 'Video direction',
    description: 'Direct movement, timing and sound.',
  },
  hd: {
    index: '03',
    label: 'HD',
    eyebrow: 'Master upscale',
    description: 'Promote the approved motion draft.',
  },
  fhd: {
    index: '04',
    label: 'Full HD',
    eyebrow: 'Delivery upscale',
    description: 'Create the final delivery master.',
  },
};

function StageRail({
  value,
  onChange,
  states,
}: {
  value: StageTab;
  onChange: (value: StageTab) => void;
  states: Record<StageTab, StepState>;
}) {
  return (
    <nav aria-label="Scene production stages" className="relative grid grid-cols-4 gap-1.5 lg:block">
      <span
        aria-hidden
        className="absolute bottom-8 left-[17px] top-8 hidden w-px bg-border lg:block"
      />
      {(Object.keys(STAGE_COPY) as StageTab[]).map((id) => {
        const entry = STAGE_COPY[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'relative z-10 flex min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50 lg:mb-2 lg:w-full lg:px-3 lg:py-3',
              active
                ? 'border-[var(--brand)] bg-[var(--brand-soft)] shadow-sm'
                : 'border-transparent bg-background/55 hover:border-border hover:bg-background',
            )}
          >
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border bg-background font-mono text-[9px] font-semibold',
                active && 'border-[var(--brand)] text-[var(--brand)]',
              )}
            >
              {entry.index}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[11px] font-semibold lg:text-[12px]">
                  {entry.label}
                </span>
                <span className={cn('size-1.5 shrink-0 rounded-full', STEP_DOT_CLASS[states[id]])} />
              </span>
              <span className="mt-0.5 hidden text-[9px] leading-3 text-muted-foreground lg:block">
                {entry.eyebrow}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function SceneDetail({
  scene,
  isFinalScene,
  boardSeed,
  videoEnabled,
  busyStill,
  busyVideo,
  onPatch,
  onRenderStill,
  onRefine,
  onDraftClip,
  onEnhance,
  onDelete,
}: {
  scene: SceneDto;
  isFinalScene: boolean;
  boardSeed: number | null;
  videoEnabled: boolean;
  busyStill: boolean;
  busyVideo: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onRenderStill: () => void;
  onRefine: (instruction: string) => void;
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

  const stageStates: Record<StageTab, StepState> = {
    still: runStepState(scene.run),
    draft: clipStepState(draft),
    hd: clipStepState(hd),
    fhd: clipStepState(fhd),
  };
  const stage = STAGE_COPY[tab];

  return (
    <Surface className="p-4 lg:p-5">
      <div className="grid gap-4 lg:grid-cols-[142px_minmax(0,1.2fr)_minmax(330px,0.8fr)] lg:gap-5">
        <StageRail value={tab} onChange={setTab} states={stageStates} />

        <div className="min-w-0">
          <SceneStage
            tab={tab}
            scene={scene}
            draft={draft}
            hd={hd}
            fhd={fhd}
            effectiveSeed={effectiveSeed}
            isFinalScene={isFinalScene}
          />
          {tab === 'still' && scene.takes.length > 0 && (
            <TakesTree
              takes={scene.takes}
              activeGenerationId={scene.generationId}
              onSetActive={(generationId) => onPatch({ activeGenerationId: generationId })}
              onNewTake={onRenderStill}
              busy={busyStill || stillRunning}
            />
          )}
          {tab === 'still' && hasStill && (
            <RefineTakeForm busy={busyStill || stillRunning} onRefine={onRefine} />
          )}
        </div>

        <div className="min-w-0 rounded-lg border bg-background/55 p-3.5">
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
          <div className="mt-3 flex items-start justify-between gap-3 border-t pt-3">
            <div>
              <SystemLabel>{stage.eyebrow}</SystemLabel>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                {stage.description}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 font-mono text-[9px] uppercase">
              {stage.index} · {stage.label}
            </Badge>
          </div>

          {tab === 'still' && (
            <>
              <Textarea
                key={`${scene.id}-prompt`}
                defaultValue={scene.prompt}
                onBlur={(event) => {
                  if (event.target.value.trim() !== scene.prompt) {
                    onPatch({ prompt: event.target.value });
                  }
                }}
                placeholder="Describe this frame — subject, setting, camera, lens and light…"
                className="mt-2 min-h-32 resize-none bg-background text-[13px] leading-5"
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
            </>
          )}

          {tab === 'draft' && (
            <>
              <Textarea
                key={`${scene.id}-video-prompt`}
                defaultValue={scene.videoPrompt ?? ''}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (scene.videoPrompt ?? '')) onPatch({ videoPrompt: value || null });
                }}
                placeholder="Describe only what changes: performance, camera move, environmental motion, timing and sound."
                className="mt-2 min-h-40 resize-none border-primary/20 bg-primary/[0.025] text-[13px] leading-5"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Motion only · source frame remains locked
                </span>
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
              </div>
            </>
          )}

          <div className="mt-4">
            {tab === 'still' && (
            <StepRow
              index={1}
              label={hasStill ? 'Render new take' : 'Render still'}
              cost={`~${formatUsd(SCENE_STILL_ESTIMATE_USD)}`}
              state={runStepState(scene.run)}
              busy={busyStill || stillRunning}
              disabled={busyStill || stillRunning || scene.prompt.trim().length < 3}
              onRun={onRenderStill}
              hint={
                scene.prompt.trim().length < 3
                  ? 'Write the shot prompt first.'
                  : hasStill
                    ? 'FLUX.2 [pro] frame — earlier takes stay selectable under the stage.'
                    : 'FLUX.2 [pro] frame with the board references and seed.'
              }
              error={scene.run?.errorMessage ?? null}
            />
            )}

            {tab === 'draft' &&
              (videoEnabled ? (
                <StepRow
                  index={2}
                  label={hasFinishedDraft ? 'Render another motion draft' : 'Render motion draft'}
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
              ) : (
                <p className="rounded-md border border-dashed p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                  Video generation is off on this deployment.
                </p>
              ))}

            {tab === 'hd' && (
                <StepRow
                  index={3}
                  label={hd ? 'Rebuild HD master' : 'Upscale to HD'}
                  cost={`~${formatUsd(estimateVideoCostUsd(scene.durationSec, 'hd'))}`}
                  state={clipStepState(hd)}
                  busy={busyVideo || enhanceRunning}
                  disabled={!hasFinishedDraft || busyVideo || draftRunning || enhanceRunning}
                  onRun={() => onEnhance('hd')}
                  hint={
                    hasFinishedDraft
                      ? 'No new prompt at this stage. Preserve the approved motion and upscale it to an HD master.'
                      : 'Finish a draft clip first.'
                  }
                  error={hd?.run?.errorMessage ?? null}
                />
            )}

            {tab === 'fhd' && (
              <StepRow
                index={4}
                label={fhd ? 'Rebuild Full HD master' : 'Upscale to Full HD'}
                cost={`~${formatUsd(estimateVideoCostUsd(scene.durationSec, 'fhd'))}`}
                state={clipStepState(fhd)}
                busy={busyVideo || enhanceRunning}
                disabled={!hasFinishedDraft || busyVideo || draftRunning || enhanceRunning}
                onRun={() => onEnhance('fhd')}
                hint={
                  hasFinishedDraft
                    ? 'Delivery-only operation. The approved draft prompt, timing and seed stay unchanged.'
                    : 'Finish a draft clip first.'
                }
                error={fhd?.run?.errorMessage ?? null}
              />
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
  isFinalScene,
}: {
  tab: StageTab;
  scene: SceneDto;
  draft: ClipDto | null;
  hd: ClipDto | null;
  fhd: ClipDto | null;
  effectiveSeed: number | null;
  isFinalScene: boolean;
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
    meta = `${scene.run?.modelId ?? 'FLUX.2 [pro]'} · ${scene.run?.status ?? 'not rendered'} · seed ${
      effectiveSeed == null ? 'random' : effectiveSeed
    }${scene.run?.costCredits ? ` · ${formatCost(scene.run.costCredits)}` : ''}`;
  } else {
    const clipAsset = clip?.run?.assets[0];
    if (clipAsset) {
      content = (
        <video
          controls
          preload="metadata"
          src={clipAsset.url}
          poster={scene.run?.assets[0]?.url}
          className="size-full bg-black"
        >
          <track kind="captions" label="Captions unavailable" />
        </video>
      );
    } else if (clip && clipStepState(clip) === 'active') {
      content = (
        <StagePlaceholder icon="spinner" text={`Rendering the ${tab} clip — a few minutes…`} />
      );
    } else if (clip?.run && clip.run.status !== 'succeeded') {
      content = <StagePlaceholder icon="alert" text={clip.run.errorMessage ?? 'Clip failed.'} />;
    } else if (scene.run?.assets[0]) {
      // Placeholder cut: the active take stands in for the clip until video
      // renders, so the edit reads end-to-end before spending a credit.
      content = (
        <div className="relative size-full">
          <NextImage
            src={scene.run.assets[0].url}
            alt={scene.title}
            width={1344}
            height={768}
            unoptimized
            className="size-full object-cover opacity-35"
          />
          <span className="absolute inset-0 grid place-items-center p-6">
            <span className="flex max-w-sm flex-col items-center gap-2 text-center text-[11px] leading-relaxed">
              <Film className="size-5" />
              {tab === 'draft'
                ? `Placeholder — the draft clip animates this take (${scene.durationSec}s · ~${formatUsd(estimateVideoCostUsd(scene.durationSec, 'draft'))}).`
                : `Placeholder — enhance replays the draft in ${tab.toUpperCase()} (~${formatUsd(estimateVideoCostUsd(scene.durationSec, tab as 'hd' | 'fhd'))}).`}
            </span>
          </span>
        </div>
      );
    } else {
      content = <StagePlaceholder icon="film" text={`No ${tab} clip yet — render the still first.`} />;
    }
    meta = `FLUX 3 Video [${tab}] · ${clip?.run?.status ?? 'not rendered'}${
      clip?.run?.costCredits ? ` · ${formatCost(clip.run.costCredits)}` : ''
    }`;
  }

  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
        {content}
        {isFinalScene && (stillAsset || clip?.run?.assets[0]) && <EndCardLogo />}
      </div>
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

// Image-to-image refinement of the active take: describe what to add, remove
// or change — the current frame rides along as the reference and a new take
// branches off with the edit applied. The presets are a director's four
// questions over a still: what's in the frame, where's the camera, how it's
// lit, what's in the air.
const REFINE_PRESETS = [
  {
    label: 'Objects in frame',
    text: 'Seed additional period-true objects into the frame that deepen the story — place them naturally in the existing composition: ',
  },
  {
    label: 'Camera',
    text: 'Keep the moment and the subjects, move the camera to a different setup — new angle, height and lens: ',
  },
  {
    label: 'Light',
    text: 'Relight the same frame — change the key source, ratio and color temperature while keeping the blocking: ',
  },
  {
    label: 'Atmosphere',
    text: 'Shift the weather and atmosphere of the same shot: ',
  },
] as const;

function RefineTakeForm({
  busy,
  onRefine,
}: {
  busy: boolean;
  onRefine: (instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const submit = () => {
    const trimmed = instruction.trim();
    if (trimmed.length < 3 || busy) return;
    onRefine(trimmed);
    setInstruction('');
  };
  return (
    <div className="mt-2">
      <SystemLabel>Refine this take</SystemLabel>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {REFINE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => setInstruction(preset.text)}
            className={cn(parameterChipClass, 'h-6 text-[10px]')}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          placeholder="Add rain streaks · remove the second lantern · make her older…"
          maxLength={500}
          className="h-8 bg-background text-[12px]"
          aria-label="Refinement instruction"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={submit}
          disabled={busy || instruction.trim().length < 3}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Refine
        </Button>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        Keeps the shot, applies your change, branches off the active take (~
        {formatUsd(SCENE_STILL_ESTIMATE_USD)}). Pick a question, finish the sentence.
      </p>
    </div>
  );
}

// --- take tree ---------------------------------------------------------------
// Variations of a frame form a real tree: a fresh render is a root, every
// refinement (seeded objects, camera move, relight…) branches off its parent
// via the run's refinedFrom link. Layout is computed from data, so the canvas
// edges always land on their tiles.

const TREE_TILE_W = 96;
const TREE_GAP = 10;
const TREE_EDGE_H = 24;

type TakeNode = TakeDto & { children: TakeNode[] };

function buildTakeTree(takes: TakeDto[]): TakeNode[] {
  const nodes = new Map<string, TakeNode>(
    takes.map((take) => [take.generationId, { ...take, children: [] }]),
  );
  const roots: TakeNode[] = [];
  for (const node of nodes.values()) {
    const refinedFrom = node.run?.parameters?.refinedFrom;
    const parent =
      typeof refinedFrom === 'string' ? nodes.get(refinedFrom) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const byAge = (a: TakeNode, b: TakeNode) => a.createdAt - b.createdAt;
  for (const node of nodes.values()) node.children.sort(byAge);
  return roots.sort(byAge);
}

function subtreeWidth(node: TakeNode): number {
  if (!node.children.length) return TREE_TILE_W;
  return (
    node.children.reduce((total, child) => total + subtreeWidth(child), 0) +
    TREE_GAP * (node.children.length - 1)
  );
}

function TakeTile({
  node,
  label,
  active,
  onSetActive,
}: {
  node: TakeNode;
  label: string;
  active: boolean;
  onSetActive: (generationId: string) => void;
}) {
  const asset = node.run?.assets[0];
  const instruction = node.run?.parameters?.instruction;
  return (
    <button
      type="button"
      onClick={() => !active && onSetActive(node.generationId)}
      title={typeof instruction === 'string' ? instruction : undefined}
      className={cn(
        'relative aspect-video w-24 shrink-0 overflow-hidden rounded border bg-muted outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50',
        active
          ? 'cursor-default border-[var(--brand)] ring-2 ring-[var(--brand-soft)]'
          : 'hover:border-foreground/30',
      )}
      aria-label={`${label}${active ? ' (active)' : ''}`}
      aria-pressed={active}
    >
      {asset ? (
        <NextImage
          src={asset.url}
          alt={label}
          width={192}
          height={108}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <span className="grid size-full place-items-center text-muted-foreground">
          {node.run && ['queued', 'running'].includes(node.run.status) ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ShieldAlert className="size-3.5" />
          )}
        </span>
      )}
      <span className="absolute bottom-0.5 left-0.5 rounded bg-background/85 px-1 font-mono text-[9px] backdrop-blur">
        {label}
      </span>
    </button>
  );
}

function TakeTreeBranch({
  node,
  labels,
  activeGenerationId,
  onSetActive,
}: {
  node: TakeNode;
  labels: Map<string, string>;
  activeGenerationId: string | null;
  onSetActive: (generationId: string) => void;
}) {
  const width = subtreeWidth(node);
  const childWidths = node.children.map(subtreeWidth);
  const childCenters = childWidths.map(
    (childWidth, childIndex) =>
      childWidths.slice(0, childIndex).reduce((total, value) => total + value, 0) +
      childIndex * TREE_GAP +
      childWidth / 2,
  );
  const bend = TREE_EDGE_H * 0.62;

  return (
    <div style={{ width }} className="flex shrink-0 flex-col items-center">
      <TakeTile
        node={node}
        label={labels.get(node.generationId) ?? 'T?'}
        active={node.generationId === activeGenerationId}
        onSetActive={onSetActive}
      />
      {node.children.length > 0 && (
        <>
          <svg
            width={width}
            height={TREE_EDGE_H}
            viewBox={`0 0 ${width} ${TREE_EDGE_H}`}
            className="shrink-0"
            aria-hidden
          >
            {node.children.map((child, childIndex) => (
              <path
                key={child.id}
                d={`M ${width / 2} 0 C ${width / 2} ${bend}, ${childCenters[childIndex]} ${TREE_EDGE_H - bend}, ${childCenters[childIndex]} ${TREE_EDGE_H}`}
                className={cn(
                  'graph-edge',
                  child.generationId === activeGenerationId && 'graph-edge-active',
                )}
              />
            ))}
          </svg>
          <div className="flex items-start" style={{ gap: TREE_GAP }}>
            {node.children.map((child) => (
              <TakeTreeBranch
                key={child.id}
                node={child}
                labels={labels}
                activeGenerationId={activeGenerationId}
                onSetActive={onSetActive}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TakesTree({
  takes,
  activeGenerationId,
  onSetActive,
  onNewTake,
  busy,
}: {
  takes: TakeDto[];
  activeGenerationId: string | null;
  onSetActive: (generationId: string) => void;
  onNewTake: () => void;
  busy: boolean;
}) {
  const roots = buildTakeTree(takes);
  const labels = new Map(
    takes
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((take, index) => [take.generationId, `T${index + 1}`]),
  );
  return (
    <div className="mt-2">
      <SystemLabel>Take tree</SystemLabel>
      <div className="mt-1.5 overflow-x-auto pb-1">
        <div className="flex items-start" style={{ gap: TREE_GAP }}>
          {roots.map((root) => (
            <TakeTreeBranch
              key={root.id}
              node={root}
              labels={labels}
              activeGenerationId={activeGenerationId}
              onSetActive={onSetActive}
            />
          ))}
          <button
            type="button"
            onClick={onNewTake}
            disabled={busy}
            className="grid aspect-video w-24 shrink-0 place-items-center rounded border border-dashed text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            aria-label="Render a new root take"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <span className="flex flex-col items-center gap-0.5">
                <Plus className="size-3.5" />
                <span className="font-mono text-[8px] uppercase tracking-wider">New take</span>
              </span>
            )}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        A refinement branches off the take it was made from — click any node to make it the
        scene&apos;s active frame.
      </p>
    </div>
  );
}

// --- reel timeline -----------------------------------------------------------

const TIMELINE_PX_PER_SEC = 22;

function clampDuration(value: number) {
  return Math.min(20, Math.max(5, value));
}

// One scene on the timeline: width encodes duration, the right edge is a drag
// handle that trims it (arrow keys work too), and the body selects the clip
// inside the reel editor. Opening the source scene is an explicit action in
// the active-video panel, so selecting a sub-video never throws the editor away.
function TimelineBlock({
  scene,
  playing,
  selected,
  onSelect,
  onTrim,
}: {
  scene: SceneDto;
  playing: boolean;
  selected: boolean;
  onSelect: (clipId: string | null) => void;
  onTrim: (durationSec: number) => void;
}) {
  const [dragDur, setDragDur] = useState<number | null>(null);
  const dragStateRef = useRef<{ startX: number; startDur: number } | null>(null);
  const dragDurRef = useRef<number | null>(null);
  const durationSec = dragDur ?? scene.durationSec;
  const asset = scene.run?.assets[0];
  const clip = latestClip(scene, ['fhd', 'hd', 'draft']);
  const clipAsset = clip?.run?.status === 'succeeded' ? clip.run.assets[0] : undefined;

  return (
    <div
      className={cn(
        'relative h-20 shrink-0 overflow-hidden rounded-md border bg-muted transition-all',
        selected && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
        playing && 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--brand)]',
      )}
      style={{ width: durationSec * TIMELINE_PX_PER_SEC }}
    >
      <button
        type="button"
        onClick={() => onSelect(clip?.id ?? null)}
        className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={`Select ${clip ? `${clip.tier} video` : 'still'} for scene ${String(scene.sceneIndex + 1).padStart(2, '0')}: ${scene.title}`}
      />
      <div className="pointer-events-none relative z-[1] size-full">
        {clipAsset ? (
          <video
            src={clipAsset.url}
            poster={asset?.url}
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover opacity-80"
          />
        ) : (
          asset && (
            <NextImage
              src={asset.url}
              alt=""
              width={320}
              height={180}
              unoptimized
              className="absolute inset-0 size-full object-cover opacity-80"
            />
          )
        )}
        {clip && (
          <span
            className={cn(
              'absolute right-1 top-1 rounded bg-background/85 px-1 font-mono text-[8px] uppercase tracking-wider backdrop-blur',
              !clipAsset && 'text-muted-foreground',
            )}
          >
            {clipAsset ? clip.tier : `${clip.tier}…`}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-1 pt-3">
          <p className="truncate font-mono text-[9px] uppercase tracking-wider">
            {String(scene.sceneIndex + 1).padStart(2, '0')} · {durationSec}s
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Trim scene ${scene.sceneIndex + 1} duration: ${durationSec} seconds. Arrow keys adjust.`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStateRef.current = { startX: event.clientX, startDur: scene.durationSec };
          dragDurRef.current = scene.durationSec;
          setDragDur(scene.durationSec);
        }}
        onPointerMove={(event) => {
          const drag = dragStateRef.current;
          if (!drag) return;
          const next = clampDuration(
            Math.round(drag.startDur + (event.clientX - drag.startX) / TIMELINE_PX_PER_SEC),
          );
          dragDurRef.current = next;
          setDragDur(next);
        }}
        onPointerUp={() => {
          const finalDur = dragDurRef.current;
          dragStateRef.current = null;
          dragDurRef.current = null;
          setDragDur(null);
          if (finalDur != null && finalDur !== scene.durationSec) onTrim(finalDur);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          const next = clampDuration(scene.durationSec + (event.key === 'ArrowRight' ? 1 : -1));
          if (next !== scene.durationSec) onTrim(next);
        }}
        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize border-l border-background/60 bg-foreground/10 outline-none transition-colors hover:bg-foreground/25 focus-visible:bg-foreground/25"
      ></button>
    </div>
  );
}

type EditableSubtitle = Omit<SubtitleDto, 'id' | 'clipId'> & { id?: string };

function SubtitleEditor({
  scene,
  clipId,
  onSave,
}: {
  scene: SceneDto;
  clipId: string | null;
  onSave: (
    sceneId: string,
    clipId: string | null,
    cues: Array<Omit<SubtitleDto, 'id' | 'clipId'>>,
  ) => Promise<void>;
}) {
  const scoped = scene.subtitles.filter((cue) => cue.clipId === clipId);
  const inherited = clipId ? scene.subtitles.filter((cue) => cue.clipId === null) : [];
  const source = scoped.length ? scoped : inherited;
  const [cues, setCues] = useState<EditableSubtitle[]>(() =>
    source.map(({ id, startMs, endMs, text, speaker, language }) => ({
      ...(scoped.length ? { id } : {}),
      startMs,
      endMs,
      text,
      speaker,
      language,
    })),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const exact = scene.subtitles.filter((cue) => cue.clipId === clipId);
    const fallback = clipId ? scene.subtitles.filter((cue) => cue.clipId === null) : [];
    const next = exact.length ? exact : fallback;
    const timeout = window.setTimeout(
      () =>
        setCues(
          next.map(({ id, startMs, endMs, text, speaker, language }) => ({
            ...(exact.length ? { id } : {}),
            startMs,
            endMs,
            text,
            speaker,
            language,
          })),
        ),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [clipId, scene.id, scene.subtitles]);

  const addCue = () => {
    const previousEnd = cues.at(-1)?.endMs ?? 0;
    const startMs = Math.min(previousEnd + (previousEnd ? 100 : 400), scene.durationSec * 1_000 - 500);
    setCues((current) => [
      ...current,
      {
        startMs: Math.max(0, startMs),
        endMs: Math.min(scene.durationSec * 1_000, Math.max(startMs + 500, startMs + 2_000)),
        text: '',
        speaker: null,
        language: 'de',
      },
    ]);
  };

  const commit = async () => {
    setSaving(true);
    try {
      await onSave(
        scene.id,
        clipId,
        cues
          .filter((cue) => cue.text.trim())
          .map(({ startMs, endMs, text, speaker, language }) => ({
            startMs: Math.max(0, Math.round(startMs)),
            endMs: Math.min(scene.durationSec * 1_000, Math.round(endMs)),
            text: text.trim(),
            speaker: speaker?.trim() || null,
            language: language || 'de',
          })),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Captions className="size-3.5" />
          <SystemLabel>Subtitles</SystemLabel>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[8px] uppercase text-muted-foreground">
            {clipId ? 'clip override' : 'scene master'}
          </span>
        </div>
        <Button variant="ghost" size="xs" onClick={addCue}>
          <Plus /> Cue
        </Button>
      </div>
      <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
        {cues.length === 0 && (
          <button
            type="button"
            onClick={addCue}
            className="w-full rounded-md border border-dashed px-2 py-3 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Add the first timed cue
          </button>
        )}
        {cues.map((cue, index) => (
          <div key={cue.id ?? `new-${index}`} className="rounded-md border bg-muted/30 p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Input
                aria-label="Subtitle start time in seconds"
                value={(cue.startMs / 1_000).toFixed(1)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setCues((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, startMs: value * 1_000 } : item,
                    ),
                  );
                }}
                className="h-7 w-14 px-1.5 font-mono text-[10px]"
              />
              <span className="text-[9px] text-muted-foreground">→</span>
              <Input
                aria-label="Subtitle end time in seconds"
                value={(cue.endMs / 1_000).toFixed(1)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setCues((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, endMs: value * 1_000 } : item,
                    ),
                  );
                }}
                className="h-7 w-14 px-1.5 font-mono text-[10px]"
              />
              <Input
                aria-label="Speaker"
                value={cue.speaker ?? ''}
                onChange={(event) =>
                  setCues((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, speaker: event.target.value } : item,
                    ),
                  )
                }
                placeholder="Speaker"
                className="h-7 min-w-0 flex-1 px-1.5 text-[10px]"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove subtitle cue"
                onClick={() => setCues((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              value={cue.text}
              onChange={(event) =>
                setCues((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, text: event.target.value } : item,
                  ),
                )
              }
              rows={2}
              maxLength={240}
              className="min-h-14 resize-none bg-background px-2 py-1.5 text-[11px] leading-4"
            />
          </div>
        ))}
      </div>
      <Button className="mt-2 w-full" size="sm" onClick={() => void commit()} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Check />} Save subtitle track
      </Button>
    </div>
  );
}

function ReelDetail({
  storyboard,
  totalSeconds,
  videoEnabled,
  draftableCount,
  assembling,
  onAssemble,
  onNotice,
  busyScenes,
  onDraftClip,
  onEnhance,
  onSaveSubtitles,
  onOpenScene,
  onTrim,
}: {
  storyboard: StoryboardDto;
  totalSeconds: number;
  videoEnabled: boolean;
  draftableCount: number;
  assembling: boolean;
  onAssemble: () => void;
  onNotice: (text: string) => void;
  busyScenes: Set<string>;
  onDraftClip: (sceneId: string) => void;
  onEnhance: (sceneId: string, tier: 'hd' | 'fhd') => void;
  onSaveSubtitles: (
    sceneId: string,
    clipId: string | null,
    cues: Array<Omit<SubtitleDto, 'id' | 'clipId'>>,
  ) => Promise<void>;
  onOpenScene: (id: string) => void;
  onTrim: (sceneId: string, durationSec: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const initialScene = storyboard.scenes[0] ?? null;
  const [activeSceneId, setActiveSceneId] = useState<string | null>(initialScene?.id ?? null);
  const [activeClipId, setActiveClipId] = useState<string | null>(
    initialScene ? latestClip(initialScene, ['fhd', 'hd', 'draft'])?.id ?? null : null,
  );

  const activeScene =
    storyboard.scenes.find((scene) => scene.id === activeSceneId) ?? storyboard.scenes[0] ?? null;
  const activeClip =
    activeScene && activeClipId
      ? (activeScene.clips.find((clip) => clip.id === activeClipId) ?? null)
      : null;

  useEffect(() => {
    if (!activeScene) {
      const timeout = window.setTimeout(() => {
        setActiveSceneId(storyboard.scenes[0]?.id ?? null);
        setActiveClipId(
          storyboard.scenes[0]
            ? latestClip(storyboard.scenes[0], ['fhd', 'hd', 'draft'])?.id ?? null
            : null,
        );
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    if (activeClipId && !activeScene.clips.some((clip) => clip.id === activeClipId)) {
      const timeout = window.setTimeout(
        () => setActiveClipId(latestClip(activeScene, ['fhd', 'hd', 'draft'])?.id ?? null),
        0,
      );
      return () => window.clearTimeout(timeout);
    }
  }, [activeClipId, activeScene, storyboard.scenes]);

  // Animatic: play the cut in real time — scenes with a finished clip play
  // the video, the rest hold their still for the scene duration. The edit
  // reads end-to-end at whatever stage the renders are in.
  const [playlist, setPlaylist] = useState<Array<{
    id: string;
    url: string;
    clipUrl: string | null;
    title: string;
    sceneIndex: number;
    durationSec: number;
  }> | null>(null);
  const [playPos, setPlayPos] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playingItem = playlist && playPos < playlist.length ? playlist[playPos] : null;

  useEffect(() => {
    if (!playlist) return;
    if (playPos >= playlist.length) {
      const timeout = window.setTimeout(() => {
        setPlaylist(null);
        setPlayPos(0);
        setElapsed(0);
        setIsPaused(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [playlist, playPos]);

  useEffect(() => {
    if (!playingItem || playingItem.clipUrl || isPaused) return;
    const interval = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 0.1;
        if (next >= playingItem.durationSec) {
          window.setTimeout(() => setPlayPos((position) => position + 1), 0);
          return 0;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [isPaused, playingItem]);

  useEffect(() => {
    const video = playerVideoRef.current;
    if (!video || !playingItem?.clipUrl) return;
    video.muted = muted;
    if (isPaused) {
      video.pause();
    } else {
      void video.play().catch(() => setIsPaused(true));
    }
  }, [isPaused, muted, playingItem?.clipUrl, playingItem?.id]);

  useEffect(() => {
    if (!playingItem) return;
    const scene = storyboard.scenes.find((entry) => entry.id === playingItem.id);
    if (!scene) return;
    const clip = latestClip(scene, ['fhd', 'hd', 'draft']);
    const timeout = window.setTimeout(() => {
      setActiveSceneId(scene.id);
      setActiveClipId(clip?.id ?? null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [playingItem, storyboard.scenes]);

  const buildPlaylist = () =>
    storyboard.scenes.flatMap((scene) => {
      const asset = scene.run?.assets[0];
      const clip = latestClip(scene, ['fhd', 'hd', 'draft']);
      const clipAsset = clip?.run?.status === 'succeeded' ? clip.run.assets[0] : undefined;
      return asset || clipAsset
        ? [
            {
              id: scene.id,
              url: asset?.url ?? '',
              clipUrl: clipAsset?.url ?? null,
              title: scene.title,
              sceneIndex: scene.sceneIndex,
              durationSec: scene.durationSec,
            },
          ]
        : [];
    });
  const activeStill = activeScene?.run?.assets[0];
  const activeClipAsset =
    activeClip?.run?.status === 'succeeded' ? activeClip.run.assets[0] : undefined;
  const selectedPreview =
    activeScene && (activeStill || activeClipAsset)
      ? {
          id: activeScene.id,
          url: activeStill?.url ?? '',
          clipUrl: activeClipAsset?.url ?? null,
          title: activeScene.title,
          sceneIndex: activeScene.sceneIndex,
          durationSec: activeScene.durationSec,
        }
      : null;
  const previewItem = playingItem ?? selectedPreview ?? buildPlaylist()[0] ?? null;
  const previewScene = previewItem
    ? (storyboard.scenes.find((scene) => scene.id === previewItem.id) ?? null)
    : null;
  const previewClipId = playingItem
    ? previewScene
      ? latestClip(previewScene, ['fhd', 'hd', 'draft'])?.id ?? null
      : null
    : activeClip?.id ?? null;
  const previewSubtitles = previewScene
    ? (() => {
        const exact = previewScene.subtitles.filter((cue) => cue.clipId === previewClipId);
        return exact.length ? exact : previewScene.subtitles.filter((cue) => cue.clipId === null);
      })()
    : [];
  const activeSubtitle = playingItem
    ? previewSubtitles.find(
        (cue) => elapsed * 1_000 >= cue.startMs && elapsed * 1_000 <= cue.endMs,
      )
    : previewSubtitles[0];

  const startAnimatic = () => {
    const items = buildPlaylist();
    if (!items.length) {
      onNotice('Render at least one still first — the cut plays from stills.');
      return;
    }
    setPlayPos(0);
    setElapsed(0);
    setIsPaused(false);
    setPlaylist(items);
  };

  // Jump the cut to a specific scene (scrub-bar segments).
  const jumpTo = (sceneId: string) => {
    const items = buildPlaylist();
    const index = items.findIndex((item) => item.id === sceneId);
    if (index < 0) {
      onNotice('Render this scene first — nothing to play there yet.');
      return;
    }
    setPlaylist(items);
    setPlayPos(index);
    setElapsed(0);
    setIsPaused(false);
  };
  const currentSceneIndex = playingItem
    ? storyboard.scenes.findIndex((scene) => scene.id === playingItem.id)
    : -1;
  const stopAnimatic = () => {
    setPlaylist(null);
    setPlayPos(0);
    setElapsed(0);
    setIsPaused(false);
  };

  const previousSegment = () => {
    if (!playlist) return;
    setElapsed(0);
    setIsPaused(false);
    setPlayPos((position) => Math.max(0, position - 1));
  };

  const nextSegment = () => {
    if (!playlist) return;
    setElapsed(0);
    setIsPaused(false);
    setPlayPos((position) => position + 1);
  };

  const togglePlayback = () => {
    if (!playingItem) {
      startAnimatic();
      return;
    }
    setIsPaused((value) => !value);
  };

  const openFullscreen = () => {
    const container = playerContainerRef.current;
    if (container?.requestFullscreen) void container.requestFullscreen();
  };

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
        videoPrompt: scene.videoPrompt,
        durationSec: scene.durationSec,
        seed: scene.seed,
        subtitles: scene.subtitles,
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
          <Button
            variant="outline"
            size="sm"
            onClick={togglePlayback}
          >
            {playingItem && !isPaused ? <Pause /> : <Play />}{' '}
            {playingItem && !isPaused ? 'Pause cut' : playingItem ? 'Resume cut' : 'Play cut'}
          </Button>
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

      {previewItem && (
        <div className="mt-4 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div
          ref={playerContainerRef}
          className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black shadow-sm"
        >
          {playingItem ? (
            playingItem.clipUrl ? (
              <video
                ref={playerVideoRef}
                key={playingItem.id}
                src={playingItem.clipUrl}
                poster={playingItem.url || undefined}
                autoPlay
                muted={muted}
                playsInline
                onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
                onEnded={nextSegment}
                onError={nextSegment}
                className="size-full bg-black object-cover"
              >
                <track kind="captions" label="Captions are rendered as an editable overlay" />
              </video>
            ) : (
              <NextImage
                key={playingItem.id}
                src={playingItem.url}
                alt={playingItem.title}
                width={1344}
                height={768}
                unoptimized
                className="size-full object-cover"
              />
            )
          ) : previewItem.clipUrl ? (
            <video
              src={previewItem.clipUrl}
              poster={previewItem.url || undefined}
              muted
              playsInline
              preload="metadata"
              className="size-full bg-black object-cover"
            />
          ) : (
            <NextImage
              src={previewItem.url}
              alt={previewItem.title}
              width={1344}
              height={768}
              unoptimized
              className="size-full object-cover"
            />
          )}
          {!playingItem && (
            <button
              type="button"
              onClick={startAnimatic}
              className="absolute inset-0 z-10 grid place-items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Play the cut"
            >
              <span className="grid size-14 place-items-center rounded-full bg-background/85 shadow-lg backdrop-blur transition-transform hover:scale-105">
                <Play className="ml-0.5 size-6" />
              </span>
            </button>
          )}
          {previewScene?.sceneIndex === storyboard.scenes.length - 1 && <EndCardLogo />}
          {activeSubtitle && (
            <div className="pointer-events-none absolute inset-x-[10%] bottom-16 z-20 text-center">
              <span className="inline rounded bg-black/78 px-2.5 py-1 text-[14px] font-medium leading-6 text-[#ffd84d] shadow-lg [box-decoration-break:clone] [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
                {activeSubtitle.speaker ? `${activeSubtitle.speaker}: ` : ''}
                {activeSubtitle.text}
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent p-3 pt-10 text-white">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={previousSegment}
                disabled={!playingItem || playPos === 0}
                className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded bg-white/10 backdrop-blur transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35"
                aria-label="Previous segment"
              >
                <SkipBack className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={togglePlayback}
                className="pointer-events-auto grid size-8 shrink-0 place-items-center rounded-full bg-white text-black shadow transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label={playingItem && !isPaused ? 'Pause playback' : 'Play the cut'}
              >
                {playingItem && !isPaused ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="ml-px size-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={nextSegment}
                disabled={!playingItem}
                className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded bg-white/10 backdrop-blur transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35"
                aria-label="Next segment"
              >
                <SkipForward className="size-3.5" />
              </button>
              <p className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider">
                {playingItem
                  ? `${String(playingItem.sceneIndex + 1).padStart(2, '0')}/${String(storyboard.scenes.length).padStart(2, '0')} · ${playingItem.title} · ${playingItem.durationSec}s${playingItem.clipUrl ? ' · clip' : ' · still'}`
                  : `Cut ready · ${storyboard.scenes.length} scenes · ${totalSeconds}s — clips play where rendered, stills hold`}
              </p>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/72">
                {formatPlayerTime(playingItem ? elapsed : 0)} /{' '}
                {formatPlayerTime(playingItem?.durationSec ?? totalSeconds)}
              </span>
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label={muted ? 'Unmute playback' : 'Mute playback'}
              >
                {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={openFullscreen}
                className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label="Enter fullscreen"
              >
                <Maximize2 className="size-3.5" />
              </button>
            </div>
            <div className="pointer-events-auto mt-2 flex h-2 w-full gap-px overflow-hidden rounded-full bg-white/10">
              {storyboard.scenes.map((scene, sceneIndex) => {
                const segmentState =
                  currentSceneIndex < 0
                    ? 'idle'
                    : sceneIndex < currentSceneIndex
                      ? 'done'
                      : sceneIndex === currentSceneIndex
                        ? 'current'
                        : 'pending';
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => jumpTo(scene.id)}
                    style={{ width: `${(scene.durationSec / Math.max(totalSeconds, 1)) * 100}%` }}
                    className={cn(
                      'relative h-full overflow-hidden outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
                      segmentState === 'done'
                        ? 'bg-[#ffd84d]'
                        : 'bg-white/20 hover:bg-white/40',
                    )}
                    aria-label={`Play from scene ${sceneIndex + 1}: ${scene.title}`}
                  >
                    {segmentState === 'current' && playingItem && (
                      <span
                        key={playingItem.id}
                        className="absolute inset-y-0 left-0 bg-[#ffd84d] transition-[width] duration-100"
                        style={{
                          width: `${Math.min(100, (elapsed / Math.max(playingItem.durationSec, 0.1)) * 100)}%`,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {activeScene && (
          <aside className="rounded-lg border bg-background p-3 shadow-xs xl:max-h-[min(570px,calc(100svh-250px))] xl:overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SystemLabel>Active video</SystemLabel>
                <p className="mt-1 truncate text-[13px] font-medium">
                  {String(activeScene.sceneIndex + 1).padStart(2, '0')} · {activeScene.title}
                </p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {activeClip ? `${activeClip.tier} clip` : 'source still'} · {activeScene.durationSec}s
                </p>
              </div>
              <span className="size-2 shrink-0 rounded-full bg-[var(--brand)] shadow-[0_0_0_4px_var(--brand-soft)]" />
            </div>

            <div className="mt-3">
              <SystemLabel>Versions</SystemLabel>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveClipId(null)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
                    !activeClip && 'border-[var(--brand)] bg-[var(--brand-soft)]',
                  )}
                >
                  <span className="block font-mono text-[9px] uppercase tracking-wider">Still</span>
                  <span className="block truncate text-[10px] text-muted-foreground">Master frame</span>
                </button>
                {activeScene.clips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => setActiveClipId(clip.id)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
                      activeClip?.id === clip.id && 'border-[var(--brand)] bg-[var(--brand-soft)]',
                    )}
                  >
                    <span className="block font-mono text-[9px] uppercase tracking-wider">
                      {clip.tier}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {clip.run?.status ?? 'rendering'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.025] p-2.5">
              <SystemLabel>Image → video prompt</SystemLabel>
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                {activeScene.videoPrompt ||
                  'No separate motion direction yet. Drafting will fall back to the still prompt.'}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => jumpTo(activeScene.id)}>
                <Play /> Play from here
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenScene(activeScene.id)}>
                Open source scene
              </Button>
              {videoEnabled && !activeScene.clips.some((clip) => clip.tier === 'draft') && (
                <Button
                  size="sm"
                  onClick={() => onDraftClip(activeScene.id)}
                  disabled={busyScenes.has(activeScene.id) || !activeStill}
                >
                  {busyScenes.has(activeScene.id) ? <Loader2 className="animate-spin" /> : <Play />}
                  Draft video
                </Button>
              )}
              {videoEnabled && activeScene.clips.some((clip) => clip.tier === 'draft') && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEnhance(activeScene.id, 'hd')}
                    disabled={busyScenes.has(activeScene.id)}
                  >
                    Enhance HD
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEnhance(activeScene.id, 'fhd')}
                    disabled={busyScenes.has(activeScene.id)}
                  >
                    Enhance FHD
                  </Button>
                </>
              )}
            </div>

            <SubtitleEditor
              key={`${activeScene.id}:${activeClip?.id ?? 'master'}`}
              scene={activeScene}
              clipId={activeClip?.id ?? null}
              onSave={onSaveSubtitles}
            />
          </aside>
        )}
        </div>
      )}

      {storyboard.scenes.length > 0 && (
        <div className="mt-3">
          <SystemLabel>Track</SystemLabel>
          <div className="mt-1.5 overflow-x-auto pb-1">
            <div
              className="relative mb-0.5 h-4"
              style={{
                width:
                  totalSeconds * TIMELINE_PX_PER_SEC + (storyboard.scenes.length - 1) * 4,
              }}
              aria-hidden
            >
              {Array.from(
                { length: Math.floor(totalSeconds / 5) + 1 },
                (_, tickIndex) => tickIndex * 5,
              ).map((second) => (
                <span
                  key={second}
                  className="absolute top-0 flex flex-col items-start gap-0.5"
                  style={{ left: second * TIMELINE_PX_PER_SEC }}
                >
                  <span className="h-1.5 w-px bg-border" />
                  <span className="font-mono text-[8px] leading-none text-muted-foreground">
                    {second}s
                  </span>
                </span>
              ))}
            </div>
            <div className="flex min-w-max items-stretch gap-1">
              {storyboard.scenes.map((scene) => (
                <TimelineBlock
                  key={scene.id}
                  scene={scene}
                  playing={playingItem?.id === scene.id}
                  selected={activeScene?.id === scene.id}
                  onSelect={(clipId) => {
                    setActiveSceneId(scene.id);
                    setActiveClipId(clipId);
                    stopAnimatic();
                  }}
                  onTrim={(durationSec) => onTrim(scene.id, durationSec)}
                />
              ))}
            </div>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Click a block to select its active clip and keep editing · drag the right edge to trim ·
            click a segment in the player bar to play from that scene.
          </p>
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
  onOpenTimeline,
}: {
  sceneCount: number;
  totalSeconds: number;
  videoEnabled: boolean;
  draftableCount: number;
  assembling: boolean;
  onAssemble: () => void;
  onOpenTimeline: () => void;
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
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[12px]"
            onClick={onOpenTimeline}
          >
            <Film /> Timeline
          </Button>
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

function formatPlayerTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
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
