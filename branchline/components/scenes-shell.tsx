'use client';

import Link from 'next/link';
import NextImage from 'next/image';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Check,
  Captions,
  ChevronRight,
  Clapperboard,
  Copy,
  Dices,
  Expand,
  Film,
  GitBranch,
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
  RotateCcw,
  Scissors,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { EXAMPLE_FRAME_STACK_VARIANTS } from '@/lib/example-frame-stack';
import {
  SCENE_STILL_ESTIMATE_USD,
  VIDEO_RATES_PER_SEC,
  estimateVideoCostUsd,
  formatUsd,
} from '@/lib/pricing';
import { cn } from '@/lib/utils';
import type { HistoryRun } from '@/db/history';
import type { GenerationUsage } from '@/app/api/generations/usage/route';
import type {
  ClipDto,
  SceneDto,
  StoryboardDto,
  SubtitleDto,
  TakeDto,
} from '@/lib/storyboard-service';
import type { LookDto } from '@/app/api/looks/route';

type StoryboardListItem = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type Selection =
  | { kind: 'idea' }
  | { kind: 'scene'; id: string }
  | { kind: 'reel' };

type ReelPlaylistItem = {
  id: string;
  url: string;
  clipUrl: string | null;
  title: string;
  sceneIndex: number;
  sourceDurationSec: number;
  trimStartSec: number;
  trimEndSec: number;
  durationSec: number;
};

function reelVideoPreparationKey(item: ReelPlaylistItem) {
  return `${item.clipUrl ?? 'still'}@${item.trimStartSec.toFixed(3)}`;
}

function waitForMediaEvents(
  video: HTMLVideoElement,
  eventNames: Array<keyof HTMLMediaElementEventMap>,
  timeoutMs: number,
) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      for (const eventName of eventNames) {
        video.removeEventListener(eventName, finish);
      }
      resolve();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    for (const eventName of eventNames) {
      video.addEventListener(eventName, finish, { once: true });
    }
  });
}

function waitForDecodedVideoFrame(video: HTMLVideoElement, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(() => finish());
    } else {
      (video as HTMLMediaElement).addEventListener('timeupdate', finish, {
        once: true,
      });
    }
  });
}

const DURATION_OPTIONS = ['5', '8', '10', '12', '15', '20'];
const SCENE_COUNT_OPTIONS = ['3', '4', '5', '6'];
const MIN_TRIM_MS = 1_000;
const TRIM_STEP_MS = 100;
const BUNDLED_DRAFT_SCENE_TITLES = new Set([
  'The valley before time',
  'Counting time',
  'A heart for darkness',
  'The witnesses arrive',
  'The new work',
  'What was seen',
  'Time captured',
  'It looks back',
  'The work awakens',
]);
const BUNDLED_DRAFT_DURATION_OVERRIDES = new Map([
  ['The new work', 15],
  ['What was seen', 15],
  ['Time captured', 15],
  ['It looks back', 15],
  ['The work awakens', 15],
]);
const BUNDLED_DRAFT_TRIM_OVERRIDES = new Map<string, TrimRange>([
  ['It looks back', { startMs: 0, endMs: 8_000 }],
  ['The work awakens', { startMs: 8_000, endMs: 15_000 }],
]);

type TrimRange = { startMs: number; endMs: number };

function sceneTrimRange(scene: SceneDto, override?: TrimRange): TrimRange {
  const sourceDurationMs = scene.durationSec * 1_000;
  const rawStart = override?.startMs ?? scene.trimStartMs ?? 0;
  const rawEnd = override?.endMs ?? scene.trimEndMs ?? sourceDurationMs;
  const startMs = Math.min(
    Math.max(0, Math.round(rawStart / TRIM_STEP_MS) * TRIM_STEP_MS),
    Math.max(0, sourceDurationMs - MIN_TRIM_MS),
  );
  const endMs = Math.min(
    sourceDurationMs,
    Math.max(
      startMs + MIN_TRIM_MS,
      Math.round(rawEnd / TRIM_STEP_MS) * TRIM_STEP_MS,
    ),
  );
  return { startMs, endMs };
}

function sceneCutDurationSec(scene: SceneDto, override?: TrimRange) {
  const trim = sceneTrimRange(scene, override);
  return (trim.endMs - trim.startMs) / 1_000;
}

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
  const [storyboardList, setStoryboardList] = useState<StoryboardListItem[]>(
    [],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardDto | null>(null);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>(
    viewer ? 'loading' : 'ready',
  );
  const [creating, setCreating] = useState(false);
  const [breakingDown, setBreakingDown] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(
    new Set(),
  );
  const [videoBusyScenes, setVideoBusyScenes] = useState<Set<string>>(
    new Set(),
  );
  const [assembling, setAssembling] = useState(false);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'error';
    text: string;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rawSelection, setRawSelection] = useState<Selection>({ kind: 'idea' });
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    'comfortable',
  );

  // Restore the strip density after mount (deferred: no sync setState in
  // effects under the react compiler).
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        if (
          window.localStorage.getItem('branchline-scenes-density') === 'compact'
        ) {
          setDensity('compact');
        }
      } catch {
        // Storage unavailable — keep the default.
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // A Frame Stack return link restores both the board and the exact scene.
  // Keep this separate from the reference-pin query so the two flows can
  // coexist without consuming one another's parameters.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const storyboardId = params.get('storyboardId');
      const sceneId = params.get('sceneId');
      if (storyboardId) setActiveId(storyboardId);
      if (sceneId) setRawSelection({ kind: 'scene', id: sceneId });
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

  const exampleClipsSyncedRef = useRef(new Set<string>());
  const exampleFrameStackSyncedRef = useRef(new Set<string>());

  const loadList = useCallback(async () => {
    if (!viewer) return;
    try {
      const response = await fetch('/api/storyboards', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as {
        storyboards: StoryboardListItem[];
      };
      setStoryboardList(data.storyboards);
      setListState('ready');
      setActiveId((current) => current ?? data.storyboards[0]?.id ?? null);
    } catch {
      setListState('error');
    }
  }, [viewer]);

  const loadStoryboard = useCallback(async (id: string) => {
    try {
      const response = await fetch(
        `/api/storyboards/${encodeURIComponent(id)}`,
        {
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { storyboard: StoryboardDto };
      const needsBundledDraft = data.storyboard.scenes.some(
        (scene) =>
          (BUNDLED_DRAFT_SCENE_TITLES.has(scene.title) &&
            !scene.clips.some((clip) => clip.tier === 'draft')) ||
          (BUNDLED_DRAFT_DURATION_OVERRIDES.get(scene.title) !== undefined &&
            BUNDLED_DRAFT_DURATION_OVERRIDES.get(scene.title) !==
              scene.durationSec) ||
          (() => {
            const expectedTrim = BUNDLED_DRAFT_TRIM_OVERRIDES.get(scene.title);
            if (!expectedTrim) return false;
            const actualTrim = sceneTrimRange(scene);
            return (
              actualTrim.startMs !== expectedTrim.startMs ||
              actualTrim.endMs !== expectedTrim.endMs
            );
          })(),
      );
      if (
        needsBundledDraft &&
        !exampleClipsSyncedRef.current.has(data.storyboard.id)
      ) {
        exampleClipsSyncedRef.current.add(data.storyboard.id);
        const syncResponse = await fetch(
          `/api/storyboards/${encodeURIComponent(id)}/example-clips`,
          { method: 'POST' },
        );
        if (syncResponse.ok) {
          const syncData = (await syncResponse.json()) as {
            storyboard?: StoryboardDto;
          };
          if (syncData.storyboard) data.storyboard = syncData.storyboard;
        }
      }
      const exampleFrameStackScene = data.storyboard.scenes.find(
        (scene) =>
          scene.sceneIndex === 1 &&
          scene.run?.origin === 'example' &&
          scene.takes.length < EXAMPLE_FRAME_STACK_VARIANTS.length + 1,
      );
      if (
        exampleFrameStackScene &&
        !exampleFrameStackSyncedRef.current.has(data.storyboard.id)
      ) {
        exampleFrameStackSyncedRef.current.add(data.storyboard.id);
        const syncResponse = await fetch(
          `/api/storyboards/${encodeURIComponent(id)}/scenes/${encodeURIComponent(exampleFrameStackScene.id)}/frame-stack`,
          { method: 'POST' },
        );
        const syncData = (await syncResponse.json().catch(() => null)) as {
          added?: number;
        } | null;
        if (syncResponse.ok && (syncData?.added ?? 0) > 0) {
          const refreshedResponse = await fetch(
            `/api/storyboards/${encodeURIComponent(id)}`,
            { cache: 'no-store' },
          );
          if (refreshedResponse.ok) {
            const refreshed = (await refreshedResponse.json()) as {
              storyboard: StoryboardDto;
            };
            data.storyboard = refreshed.storyboard;
          }
        }
      }
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
        scene.clips.some(
          (clip) =>
            !clip.run || ['queued', 'running'].includes(clip.run.status),
        ),
    ),
  );
  useEffect(() => {
    if (!hasActiveRun || !activeId || !storyboard) return;
    const runningGenerationIds = storyboard.scenes.flatMap((scene) => [
      ...(scene.run &&
      ['queued', 'running'].includes(scene.run.status) &&
      scene.generationId
        ? [scene.generationId]
        : []),
      ...scene.clips
        .filter(
          (clip) =>
            !clip.run || ['queued', 'running'].includes(clip.run.status),
        )
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

  const createStoryboard = useCallback(
    async (kind: 'blank' | 'example' = 'blank') => {
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
    },
    [loadList],
  );

  const patchStoryboard = useCallback(
    async (patch: Record<string, unknown>, options?: { apply?: boolean }) => {
      if (!activeId) return;
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
        const data = (await response.json()) as {
          storyboard?: StoryboardDto;
          error?: string;
        };
        if (!response.ok || !data.storyboard) throw new Error(data.error);
        // apply:false keeps local state as-is — used for blur-saves that can
        // race a concurrent breakdown (a late response must not revert it).
        if (options?.apply !== false) setStoryboard(data.storyboard);
        void loadList();
      } catch (error) {
        setNotice({
          tone: 'error',
          text:
            error instanceof Error && error.message
              ? error.message
              : 'Could not save changes.',
        });
      }
    },
    [activeId, loadList],
  );

  const writeSequence = useCallback(
    async (idea: string, sceneCount: number) => {
      if (!activeId || !storyboard) return;
      const hasRenderedWork = storyboard.scenes.some(
        (scene) => scene.run || scene.clips.length,
      );
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
        setRawSelection(
          firstScene ? { kind: 'scene', id: firstScene.id } : { kind: 'idea' },
        );
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
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error);
        }
        await loadStoryboard(activeId);
      } catch (error) {
        setNotice({
          tone: 'error',
          text:
            error instanceof Error && error.message
              ? error.message
              : 'Could not save the scene.',
        });
      }
    },
    [activeId, loadStoryboard],
  );

  const addScene = useCallback(async () => {
    if (!activeId) return;
    const response = await fetch(
      `/api/storyboards/${encodeURIComponent(activeId)}/scenes`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    const data = (await response.json().catch(() => null)) as {
      id?: string;
    } | null;
    await loadStoryboard(activeId);
    if (data?.id) setRawSelection({ kind: 'scene', id: data.id });
  }, [activeId, loadStoryboard]);

  const deleteScene = useCallback(
    async (sceneId: string) => {
      if (!activeId) return;
      await fetch(
        `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}`,
        {
          method: 'DELETE',
        },
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
        const data = (await response.json()) as {
          mode?: string;
          error?: string;
        };
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

  const syncSceneFrameStack = useCallback(
    async (sceneId: string) => {
      if (!activeId) return;
      try {
        const response = await fetch(
          `/api/storyboards/${encodeURIComponent(activeId)}/scenes/${encodeURIComponent(sceneId)}/frame-stack`,
          { method: 'POST' },
        );
        const data = (await response.json().catch(() => null)) as {
          added?: number;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(data?.error);
        if ((data?.added ?? 0) > 0) await loadStoryboard(activeId);
      } catch (error) {
        setNotice({
          tone: 'error',
          text:
            error instanceof Error && error.message
              ? error.message
              : 'Could not load the existing Frame Stack.',
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
            error instanceof Error && error.message
              ? error.message
              : 'Could not start the clip.',
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
      const data = (await response.json()) as {
        storyboard?: StoryboardDto;
        error?: string;
      };
      if (!response.ok || !data.storyboard) {
        throw new Error(data.error || 'Could not save subtitles.');
      }
      setStoryboard(data.storyboard);
      setNotice({
        tone: 'info',
        text: 'Subtitle timing saved to the shared storyboard.',
      });
    },
    [activeId],
  );

  useEffect(() => {
    if (!storyboard || !pendingPinRef.current) return;
    const assetId = pendingPinRef.current;
    pendingPinRef.current = null;
    if (
      storyboard.references.some((reference) => reference.assetId === assetId)
    )
      return;
    const slotsFull = storyboard.references.length >= 3;
    const existingIds = storyboard.references.map(
      (reference) => reference.assetId,
    );
    const timeout = window.setTimeout(() => {
      if (slotsFull) {
        setNotice({
          tone: 'error',
          text: 'All three reference slots are taken — remove one to pin the new image.',
        });
        return;
      }
      void patchStoryboard({ referenceAssetIds: [...existingIds, assetId] });
      setNotice({
        tone: 'info',
        text: 'Reference pinned from the Playground.',
      });
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
    rawSelection.kind === 'scene' &&
    !scenes.some((scene) => scene.id === rawSelection.id)
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
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        return;
      if (target?.isContentEditable) return;
      // Dialogs, popovers and open dropdowns own their arrow keys.
      if (
        document.querySelector(
          '[role="dialog"], [role="listbox"], [role="menu"]',
        )
      )
        return;
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

  const totalSeconds = scenes.reduce(
    (sum, scene) => sum + sceneCutDurationSec(scene),
    0,
  );

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
                          notice.tone === 'error'
                            ? 'text-destructive'
                            : 'text-muted-foreground',
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
                    />

                    <div className="mt-5">
                      {selection.kind === 'idea' && (
                        <IdeaDetail
                          key={storyboard.id}
                          storyboard={storyboard}
                          busy={breakingDown}
                          onSaveIdea={(idea) =>
                            void patchStoryboard({ idea }, { apply: false })
                          }
                          onWriteSequence={(idea, count) =>
                            void writeSequence(idea, count)
                          }
                        />
                      )}
                      {selection.kind === 'scene' && selectedScene && (
                        <SceneDetail
                          key={selectedScene.id}
                          storyboardId={storyboard.id}
                          scene={selectedScene}
                          isFinalScene={
                            selectedScene.sceneIndex ===
                            storyboard.scenes.length - 1
                          }
                          boardSeed={storyboard.seed}
                          videoEnabled={videoEnabled}
                          busyStill={generatingScenes.has(selectedScene.id)}
                          busyVideo={
                            videoBusyScenes.has(selectedScene.id) || assembling
                          }
                          onPatch={(patch) =>
                            patchScene(selectedScene.id, patch)
                          }
                          onRenderStill={() =>
                            void generateScene(selectedScene.id)
                          }
                          onRefine={(instruction) =>
                            void generateScene(selectedScene.id, instruction)
                          }
                          onSyncFrameStack={() =>
                            syncSceneFrameStack(selectedScene.id)
                          }
                          onDraftClip={() => void draftClip(selectedScene.id)}
                          onEnhance={(tier) =>
                            void enhanceClip(selectedScene.id, tier)
                          }
                          onDelete={() => void deleteScene(selectedScene.id)}
                        />
                      )}
                      {selection.kind === 'reel' && (
                        <ReelDetail
                          storyboard={storyboard}
                          videoEnabled={videoEnabled}
                          draftableCount={draftableScenes.length}
                          assembling={assembling}
                          onAssemble={() => void assembleReel()}
                          onNotice={(text) => setNotice({ tone: 'info', text })}
                          busyScenes={videoBusyScenes}
                          onDraftClip={(sceneId) => void draftClip(sceneId)}
                          onEnhance={(sceneId, tier) =>
                            void enhanceClip(sceneId, tier)
                          }
                          onSaveSubtitles={saveSubtitles}
                          onOpenScene={(id) =>
                            setRawSelection({ kind: 'scene', id })
                          }
                          onTrim={(sceneId, trim) =>
                            void patchScene(sceneId, {
                              trimStartMs: trim.startMs,
                              trimEndMs: trim.endMs,
                            })
                          }
                        />
                      )}
                    </div>
                  </>
                ) : viewer ? (
                  listState === 'loading' ? (
                    <p className="mt-10 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Loading
                      storyboards…
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
      <Select
        value={storyboard.id}
        onValueChange={(next) => next && onSwitch(next)}
      >
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
                aria-label={
                  density === 'compact' ? 'Comfortable strip' : 'Compact strip'
                }
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
        <ReferencesChip
          storyboard={storyboard}
          onPatch={onPatch}
          onOpenPicker={onOpenPicker}
        />
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
function LooksChip({
  onPatch,
}: {
  onPatch: (patch: Record<string, unknown>) => void;
}) {
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
          A look fills the board&apos;s style note and seed and pins its frame
          as reference 1 — crafted in the Playground via &ldquo;Save as
          Look&rdquo;.
        </p>
        {failed && (
          <p className="text-[11px] text-destructive">Could not load looks.</p>
        )}
        {!failed && looks == null && (
          <p className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </p>
        )}
        {looks != null && looks.length === 0 && (
          <p className="rounded-md border border-dashed p-2.5 text-[11px] leading-4 text-muted-foreground">
            No looks yet. Iterate a frame in the Playground until the style
            sings, then save it as a Look from the run detail.
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
                  <span className="block truncate text-[12px] font-medium">
                    {look.name}
                  </span>
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
            <span className="font-mono text-foreground">
              {storyboard.references.length}/3
            </span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-72 gap-2 p-3">
        <p className="text-[12px] font-medium">Reference images</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Pinned images ride along as <code>input_image</code> 1–3 with every
          scene render — subject, style, palette.
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
                          .filter(
                            (entry) => entry.assetId !== reference.assetId,
                          )
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
            <span className="font-mono text-foreground">
              {seed == null ? 'auto' : seed}
            </span>
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 gap-2 p-3">
        <p className="text-[12px] font-medium">Board seed</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          One seed for the whole sequence keeps the look coherent; scenes can
          override it individually.
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
            onClick={() =>
              onPatch({ seed: Math.floor(Math.random() * 2 ** 32) })
            }
          >
            <Dices /> Re-roll
          </Button>
          {seed != null && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onPatch({ seed: null })}
            >
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
          <button
            type="button"
            className={cn(parameterChipClass, 'h-8 max-w-52')}
          >
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
          Appended to every scene prompt — the shared visual grammar of the
          film.
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
}: {
  storyboard: StoryboardDto;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAddScene: () => void;
  videoEnabled: boolean;
  totalSeconds: number;
  compact: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-stretch overflow-hidden pb-1">
      <div className="relative z-20 flex shrink-0 items-stretch bg-playground-surface pr-1 shadow-[12px_0_20px_-18px_rgba(0,0,0,0.55)]">
        <IdeaNode
          idea={storyboard.idea}
          sceneCount={storyboard.scenes.length}
          selected={selection.kind === 'idea'}
          onSelect={() => onSelect({ kind: 'idea' })}
          compact={compact}
        />
        <Connector compact={compact} />
      </div>

      <div className="min-w-0 overflow-x-auto overflow-y-hidden px-1">
        <div className="flex min-w-max items-stretch">
          {storyboard.scenes.map((scene) => {
            const selected =
              selection.kind === 'scene' && selection.id === scene.id;
            return (
              <span key={scene.id} className="contents">
                <div className="relative">
                  <SceneNode
                    scene={scene}
                    isFinalScene={
                      scene.sceneIndex === storyboard.scenes.length - 1
                    }
                    videoEnabled={videoEnabled}
                    selected={selected}
                    onSelect={() => onSelect({ kind: 'scene', id: scene.id })}
                    compact={compact}
                  />
                </div>
                <Connector compact={compact} />
              </span>
            );
          })}
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
        </div>
      </div>

      <div className="relative z-20 flex shrink-0 items-stretch bg-playground-surface pl-1 shadow-[-12px_0_20px_-18px_rgba(0,0,0,0.55)]">
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

function Connector({
  dashed = false,
  compact = false,
}: {
  dashed?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center self-stretch',
        compact ? 'w-5' : 'w-8',
      )}
      aria-hidden
    >
      <span
        className={cn(
          'h-px bg-border',
          compact ? 'w-1.5' : 'w-3',
          dashed && 'opacity-60',
        )}
      />
      <ChevronRight className="-mx-1.5 size-3 shrink-0 text-muted-foreground/40" />
      <span
        className={cn(
          'h-px bg-border',
          compact ? 'w-1.5' : 'w-3',
          dashed && 'opacity-60',
        )}
      />
    </div>
  );
}

// Keeps the selected node visible while walking the strip with arrow keys.
function useNodeScrollIntoView(selected: boolean) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
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
    <button
      ref={ref}
      onClick={onSelect}
      className={nodeClass(selected, compact)}
    >
      <div
        className={cn(
          'flex items-center justify-between',
          compact ? 'mb-1' : 'mb-2',
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Idea
        </span>
        <span className="grid size-5 place-items-center rounded bg-muted">
          <Lightbulb className="size-3" />
        </span>
      </div>
      <p
        className={cn(
          compact
            ? 'line-clamp-3 min-h-12 text-[10px] leading-4'
            : 'line-clamp-4 min-h-16 text-[11px] leading-4',
          idea ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {idea ||
          'Describe the film — one paragraph the whole sequence is written from.'}
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
      <div
        className={cn(
          'flex items-center justify-between',
          compact ? 'mb-1' : 'mb-1.5',
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {compact
            ? String(scene.sceneIndex + 1).padStart(2, '0')
            : `Scene ${String(scene.sceneIndex + 1).padStart(2, '0')}`}
        </span>
        {rendering && (
          <Loader2 className="size-3 animate-spin text-amber-600" />
        )}
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
      {!compact && (
        <p className="truncate text-[11px] font-medium">{scene.title}</p>
      )}
      <div
        className={cn(
          'flex items-center',
          compact ? 'mt-1 gap-1' : 'mt-1.5 gap-1.5',
        )}
      >
        <StepDot label="Still" state={steps.still} />
        <StepDot
          label="Draft clip"
          state={videoEnabled ? steps.draft : 'idle'}
        />
        <StepDot
          label="Enhanced"
          state={videoEnabled ? steps.enhance : 'idle'}
        />
      </div>
    </button>
  );
}

function StepDot({ label, state }: { label: string; state: StepState }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn('size-1.5 rounded-full', STEP_DOT_CLASS[state])}
          />
        }
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
    <button
      ref={ref}
      onClick={onSelect}
      className={nodeClass(selected, compact)}
    >
      <div
        className={cn(
          'flex items-center justify-between',
          compact ? 'mb-1' : 'mb-2',
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Reel
        </span>
        <span className="grid size-5 place-items-center rounded bg-muted">
          <Film className="size-3" />
        </span>
      </div>
      <p
        className={cn(
          'font-medium',
          compact ? 'text-[13px] leading-4' : 'text-[15px] leading-5',
        )}
      >
        {formatCutDuration(totalSeconds)}
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
        One paragraph: who, where, what happens. The sequence of shots is
        written from this — then every scene is yours to refine and render.
      </p>
      <div className="relative mt-3 max-w-2xl">
        <Textarea
          value={idea}
          maxLength={2_000}
          onChange={(event) => setIdea(event.target.value)}
          onBlur={() => {
            if (idea.trim() !== (storyboard.idea ?? ''))
              onSaveIdea(idea.trim());
          }}
          placeholder="A lighthouse keeper discovers the light attracts something from the deep. Night storm, one lantern, the sea answering back…"
          className="min-h-28 resize-none bg-background pb-7 text-sm leading-5"
        />
        <span className="absolute bottom-2 right-2 font-mono text-[9px] text-muted-foreground">
          {idea.length.toLocaleString()} / 2,000
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={sceneCount}
          onValueChange={(next) => next && setSceneCount(next)}
        >
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
        <Button
          onClick={() => onWriteSequence(idea.trim(), Number(sceneCount))}
          disabled={!canWrite}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {storyboard.scenes.length
            ? 'Rewrite sequence'
            : 'Write scene sequence'}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Shot list by Mistral — the same model family that reads prompts inside
          FLUX.2.
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
    <nav
      aria-label="Scene production stages"
      className="relative grid grid-cols-4 gap-1.5 lg:block"
    >
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
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    STEP_DOT_CLASS[states[id]],
                  )}
                />
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
  storyboardId,
  scene,
  isFinalScene,
  boardSeed,
  videoEnabled,
  busyStill,
  busyVideo,
  onPatch,
  onRenderStill,
  onRefine,
  onSyncFrameStack,
  onDraftClip,
  onEnhance,
  onDelete,
}: {
  storyboardId: string;
  scene: SceneDto;
  isFinalScene: boolean;
  boardSeed: number | null;
  videoEnabled: boolean;
  busyStill: boolean;
  busyVideo: boolean;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onRenderStill: () => void;
  onRefine: (instruction: string) => void;
  onSyncFrameStack: () => Promise<void>;
  onDraftClip: () => void;
  onEnhance: (tier: 'hd' | 'fhd') => void;
  onDelete: () => void;
}) {
  const draft = latestClip(scene, ['draft']);
  const hd = latestClip(scene, ['hd']);
  const fhd = latestClip(scene, ['fhd']);
  const defaultTab: StageTab = fhd
    ? 'fhd'
    : hd
      ? 'hd'
      : draft
        ? 'draft'
        : 'still';
  const [tab, setTab] = useState<StageTab>(defaultTab);
  const [frameTrackOpen, setFrameTrackOpen] = useState(false);
  const [frameTrackSyncing, setFrameTrackSyncing] = useState(false);

  const stillRunning = runStepState(scene.run) === 'active';
  const draftRunning = clipStepState(draft) === 'active';
  const enhanceRunning =
    clipStepState(hd) === 'active' || clipStepState(fhd) === 'active';
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
    <>
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
              onOpenFrameTrack={
                hasStill
                  ? () => {
                      setFrameTrackOpen(true);
                      setFrameTrackSyncing(true);
                      void onSyncFrameStack().finally(() =>
                        setFrameTrackSyncing(false),
                      );
                    }
                  : undefined
              }
            />
            {tab === 'still' && hasStill && (
              <RefineTakeForm
                busy={busyStill || stillRunning}
                onRefine={onRefine}
              />
            )}
          </div>

          <div className="min-w-0 rounded-lg border bg-background/55 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <SystemLabel>
                Scene {String(scene.sceneIndex + 1).padStart(2, '0')}
              </SystemLabel>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Delete scene"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const hasWork = Boolean(
                          scene.run || scene.clips.length,
                        );
                        if (
                          !hasWork ||
                          window.confirm('Delete this scene and its renders?')
                        ) {
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
                if (value && value !== scene.title)
                  void onPatch({ title: value });
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
              <Badge
                variant="outline"
                className="shrink-0 font-mono text-[9px] uppercase"
              >
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
                      void onPatch({ prompt: event.target.value });
                    }
                  }}
                  placeholder="Describe this frame — subject, setting, camera, lens and light…"
                  className="mt-2 min-h-32 resize-none bg-background text-[13px] leading-5"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Select
                    value={String(scene.durationSec)}
                    onValueChange={(next) =>
                      next && onPatch({ durationSec: Number(next) })
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7! w-[74px] text-[11px]"
                    >
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
                    if (value !== (scene.videoPrompt ?? '')) {
                      void onPatch({ videoPrompt: value || null });
                    }
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
                    onValueChange={(next) =>
                      next && onPatch({ durationSec: Number(next) })
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7! w-[74px] text-[11px]"
                    >
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
                  disabled={
                    busyStill || stillRunning || scene.prompt.trim().length < 3
                  }
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
                    label={
                      hasFinishedDraft
                        ? 'Render another motion draft'
                        : 'Render motion draft'
                    }
                    cost={`~${formatUsd(estimateVideoCostUsd(scene.durationSec, 'draft'))}`}
                    state={clipStepState(draft)}
                    busy={busyVideo || draftRunning}
                    disabled={
                      !hasStill || busyVideo || draftRunning || enhanceRunning
                    }
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
                  disabled={
                    !hasFinishedDraft ||
                    busyVideo ||
                    draftRunning ||
                    enhanceRunning
                  }
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
                  disabled={
                    !hasFinishedDraft ||
                    busyVideo ||
                    draftRunning ||
                    enhanceRunning
                  }
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
      <FrameTrackDialog
        open={frameTrackOpen}
        onOpenChange={setFrameTrackOpen}
        storyboardId={storyboardId}
        scene={scene}
        onSetActive={(generationId) =>
          onPatch({ activeGenerationId: generationId })
        }
        syncing={frameTrackSyncing}
      />
    </>
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
  onOpenFrameTrack,
}: {
  tab: StageTab;
  scene: SceneDto;
  draft: ClipDto | null;
  hd: ClipDto | null;
  fhd: ClipDto | null;
  effectiveSeed: number | null;
  isFinalScene: boolean;
  onOpenFrameTrack?: () => void;
}) {
  const clip =
    tab === 'draft' ? draft : tab === 'hd' ? hd : tab === 'fhd' ? fhd : null;
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
      content = (
        <StagePlaceholder
          icon="alert"
          text={scene.run.errorMessage ?? 'Render failed.'}
        />
      );
    } else {
      content = (
        <StagePlaceholder icon="image" text="No still yet — run step 1." />
      );
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
        <StagePlaceholder
          icon="spinner"
          text={`Rendering the ${tab} clip — a few minutes…`}
        />
      );
    } else if (clip?.run && clip.run.status !== 'succeeded') {
      content = (
        <StagePlaceholder
          icon="alert"
          text={clip.run.errorMessage ?? 'Clip failed.'}
        />
      );
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
      content = (
        <StagePlaceholder
          icon="film"
          text={`No ${tab} clip yet — render the still first.`}
        />
      );
    }
    meta = `FLUX 3 Video [${tab}] · ${clip?.run?.status ?? 'not rendered'}${
      clip?.run?.costCredits ? ` · ${formatCost(clip.run.costCredits)}` : ''
    }`;
  }

  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
        {content}
        {isFinalScene && (stillAsset || clip?.run?.assets[0]) && (
          <EndCardLogo />
        )}
        {tab === 'still' && stillAsset && onOpenFrameTrack && (
          <button
            type="button"
            onClick={onOpenFrameTrack}
            className="absolute right-2 top-2 z-30 flex h-8 items-center gap-1.5 rounded-md border border-white/20 bg-black/65 px-2.5 text-[10px] font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="Open Frame Track"
          >
            <GitBranch className="size-3.5" /> Frame Track
          </button>
        )}
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
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            STEP_DOT_CLASS[state],
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
          {label}
        </span>
        {actions ?? (
          <Button
            size="xs"
            variant="outline"
            onClick={onRun}
            disabled={disabled}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {cost}
          </Button>
        )}
      </div>
      <p className="mt-1 pl-7 text-[10px] leading-relaxed text-muted-foreground">
        {hint}
      </p>
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
            aria-label={
              seed == null ? 'Scene seed: board default' : `Scene seed: ${seed}`
            }
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
          Overrides the board seed for this shot only — re-roll one bad frame
          without breaking the rest of the sequence.
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
            onClick={() =>
              onPatch({ seed: Math.floor(Math.random() * 2 ** 32) })
            }
          >
            <Dices /> Re-roll
          </Button>
          {seed != null && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onPatch({ seed: null })}
            >
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
        {formatUsd(SCENE_STILL_ESTIMATE_USD)}). Pick a question, finish the
        sentence.
      </p>
    </div>
  );
}

// Variations form a real tree through each run's refinedFrom link. The tree is
// rendered only inside Frame Track, where choosing an active video source is
// explicit and contextual.

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

const FRAME_TRACK_TILE_W = 164;
const FRAME_TRACK_GAP = 24;
const FRAME_TRACK_EDGE_H = 30;

function frameTrackSubtreeWidth(node: TakeNode): number {
  if (!node.children.length) return FRAME_TRACK_TILE_W;
  return Math.max(
    FRAME_TRACK_TILE_W,
    node.children.reduce(
      (total, child) => total + frameTrackSubtreeWidth(child),
      0,
    ) +
      FRAME_TRACK_GAP * (node.children.length - 1),
  );
}

function FrameTrackTake({
  node,
  label,
  active,
  selected,
  usage,
  onSelect,
}: {
  node: TakeNode;
  label: string;
  active: boolean;
  selected: boolean;
  usage: GenerationUsage[];
  onSelect: () => void;
}) {
  const asset = node.run?.assets[0];
  const instruction = node.run?.parameters.instruction;
  const boardCount = new Set(usage.map((entry) => entry.storyboardId)).size;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group w-[164px] overflow-hidden rounded-lg border bg-background text-left shadow-[var(--surface-shadow)] outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/50',
        active ? 'border-[var(--brand)]' : 'hover:border-foreground/30',
        selected && 'ring-2 ring-foreground/20',
        active && selected && 'ring-[var(--brand-soft)]',
      )}
      aria-label={`Preview ${label}${active ? ', current video source' : ''}`}
      aria-pressed={selected}
    >
      <span className="relative block aspect-video overflow-hidden bg-muted">
        {asset ? (
          <NextImage
            src={asset.url}
            alt={`${label} frame`}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            {node.run && ['queued', 'running'].includes(node.run.status) ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Images className="size-4" />
            )}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-8 text-white">
          <span className="font-mono text-[8px] uppercase tracking-wider">
            {label}
          </span>
          {active && (
            <span className="rounded-full bg-[var(--brand)] px-1.5 py-0.5 font-mono text-[7px] uppercase">
              video source
            </span>
          )}
        </span>
      </span>
      <span className="block p-2">
        <span className="block truncate text-[10px] font-medium">
          {typeof instruction === 'string' ? instruction : 'Base frame'}
        </span>
        <span className="mt-1 flex items-center justify-between gap-2 font-mono text-[8px] uppercase text-muted-foreground">
          <span>{node.run?.status ?? 'saved'}</span>
          <span>
            {boardCount} board{boardCount === 1 ? '' : 's'}
          </span>
        </span>
      </span>
    </button>
  );
}

function FrameTrackBranch({
  node,
  labels,
  activeGenerationId,
  selectedGenerationId,
  usage,
  onSelect,
}: {
  node: TakeNode;
  labels: Map<string, string>;
  activeGenerationId: string | null;
  selectedGenerationId: string | null;
  usage: Record<string, GenerationUsage[]>;
  onSelect: (generationId: string) => void;
}) {
  const width = frameTrackSubtreeWidth(node);
  const childWidths = node.children.map(frameTrackSubtreeWidth);
  const childCenters = childWidths.map(
    (childWidth, childIndex) =>
      childWidths
        .slice(0, childIndex)
        .reduce((total, value) => total + value, 0) +
      childIndex * FRAME_TRACK_GAP +
      childWidth / 2,
  );
  const bend = FRAME_TRACK_EDGE_H * 0.62;
  return (
    <div style={{ width }} className="flex shrink-0 flex-col items-center">
      <FrameTrackTake
        node={node}
        label={labels.get(node.generationId) ?? 'T?'}
        active={node.generationId === activeGenerationId}
        selected={node.generationId === selectedGenerationId}
        usage={usage[node.generationId] ?? []}
        onSelect={() => onSelect(node.generationId)}
      />
      {node.children.length > 0 && (
        <>
          <svg
            width={width}
            height={FRAME_TRACK_EDGE_H}
            viewBox={`0 0 ${width} ${FRAME_TRACK_EDGE_H}`}
            className="shrink-0"
            aria-hidden
          >
            {node.children.map((child, childIndex) => (
              <path
                key={child.id}
                d={`M ${width / 2} 0 C ${width / 2} ${bend}, ${childCenters[childIndex]} ${FRAME_TRACK_EDGE_H - bend}, ${childCenters[childIndex]} ${FRAME_TRACK_EDGE_H}`}
                className={cn(
                  'graph-edge',
                  child.generationId === activeGenerationId &&
                    'graph-edge-active',
                )}
              />
            ))}
          </svg>
          <div className="flex items-start" style={{ gap: FRAME_TRACK_GAP }}>
            {node.children.map((child) => (
              <FrameTrackBranch
                key={child.id}
                node={child}
                labels={labels}
                activeGenerationId={activeGenerationId}
                selectedGenerationId={selectedGenerationId}
                usage={usage}
                onSelect={onSelect}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FrameTrackDialog({
  open,
  onOpenChange,
  storyboardId,
  scene,
  onSetActive,
  syncing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyboardId: string;
  scene: SceneDto;
  onSetActive: (generationId: string) => Promise<void>;
  syncing: boolean;
}) {
  const [selectedGenerationId, setSelectedGenerationId] = useState<
    string | null
  >(scene.generationId);
  const [usage, setUsage] = useState<Record<string, GenerationUsage[]>>({});
  const [usageState, setUsageState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [applying, setApplying] = useState(false);
  const roots = buildTakeTree(scene.takes);
  const labels = new Map(
    scene.takes
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((take, index) => [take.generationId, `T${index + 1}`]),
  );
  const selectedTake =
    scene.takes.find((take) => take.generationId === selectedGenerationId) ??
    scene.takes.find((take) => take.generationId === scene.generationId) ??
    scene.takes[0] ??
    null;
  const selectedUsage = selectedTake
    ? (usage[selectedTake.generationId] ?? [])
    : [];
  const selectedAsset = selectedTake?.run?.assets[0];
  const selectedActive = Boolean(
    selectedTake && scene.generationId === selectedTake.generationId,
  );
  const fullPageHref = `/playground?storyboardId=${encodeURIComponent(storyboardId)}&sceneId=${encodeURIComponent(scene.id)}`;
  const takeIds = scene.takes.map((take) => take.generationId).join(',');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSelectedGenerationId((current) =>
        current && scene.takes.some((take) => take.generationId === current)
          ? current
          : (scene.generationId ?? scene.takes[0]?.generationId ?? null),
      );
      setUsageState('loading');
      void fetch(`/api/generations/usage?ids=${encodeURIComponent(takeIds)}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          return (await response.json()) as {
            usage: Record<string, GenerationUsage[]>;
          };
        })
        .then((data) => {
          setUsage(data.usage);
          setUsageState('ready');
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          setUsageState('error');
        });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, scene.generationId, scene.takes, takeIds]);

  const applySelectedFrame = async () => {
    if (!selectedTake || selectedActive || !selectedAsset) return;
    setApplying(true);
    try {
      await onSetActive(selectedTake.generationId);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-[1500px]! grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0!">
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle>
                  Frame Track · Scene{' '}
                  {String(scene.sceneIndex + 1).padStart(2, '0')}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="font-mono text-[8px] uppercase"
                >
                  {scene.takes.length} take{scene.takes.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <DialogDescription className="mt-1 text-[11px]">
                Existing Frame Stack branches for this shot. The green node is
                the image currently feeding video.
              </DialogDescription>
            </div>
            <Link
              href={fullPageHref}
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className: 'h-8',
              })}
            >
              <Maximize2 /> Open full Frame Stack
            </Link>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-h-0 overflow-auto bg-[var(--canvas)]">
            <div className="pointer-events-none absolute inset-0 graph-grid opacity-60" />
            {syncing && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-background/55 backdrop-blur-[1px]">
                <p className="flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-[10px] text-muted-foreground shadow-sm">
                  <Loader2 className="size-3.5 animate-spin" /> Loading existing
                  Frame Stack branches…
                </p>
              </div>
            )}
            <div className="relative flex min-h-full min-w-max items-start justify-center p-10">
              <div
                className="flex items-start"
                style={{ gap: FRAME_TRACK_GAP }}
              >
                {roots.map((root) => (
                  <FrameTrackBranch
                    key={root.id}
                    node={root}
                    labels={labels}
                    activeGenerationId={scene.generationId}
                    selectedGenerationId={selectedTake?.generationId ?? null}
                    usage={usage}
                    onSelect={setSelectedGenerationId}
                  />
                ))}
              </div>
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-l bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <SystemLabel>Selected frame</SystemLabel>
              <Badge
                variant={selectedActive ? 'default' : 'outline'}
                className={cn(
                  'font-mono text-[8px] uppercase',
                  selectedActive &&
                    'bg-[var(--brand-soft)] text-[var(--brand)]',
                )}
              >
                {selectedActive ? 'video source' : 'preview only'}
              </Badge>
            </div>
            <div className="relative mt-2 aspect-video overflow-hidden rounded-lg border bg-muted">
              {selectedAsset ? (
                <NextImage
                  src={selectedAsset.url}
                  alt="Selected frame"
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-muted-foreground">
                  <Images className="size-5" />
                </span>
              )}
            </div>
            <p className="mt-2 text-[12px] font-medium">
              {selectedTake
                ? (labels.get(selectedTake.generationId) ?? 'Take')
                : 'No take'}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              {typeof selectedTake?.run?.parameters.instruction === 'string'
                ? selectedTake.run.parameters.instruction
                : scene.prompt}
            </p>

            <div className="mt-4 border-t pt-4">
              <div className="flex items-center justify-between gap-2">
                <SystemLabel>Used by boards</SystemLabel>
                <span className="font-mono text-[8px] uppercase text-muted-foreground">
                  {
                    new Set(selectedUsage.map((entry) => entry.storyboardId))
                      .size
                  }{' '}
                  linked
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {usageState === 'loading' && (
                  <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Resolving
                    dependencies…
                  </p>
                )}
                {usageState === 'error' && (
                  <p className="text-[10px] text-destructive">
                    Could not load frame dependencies.
                  </p>
                )}
                {usageState === 'ready' && selectedUsage.length === 0 && (
                  <p className="rounded-md border border-dashed p-2.5 text-[10px] text-muted-foreground">
                    Not used by another board yet.
                  </p>
                )}
                {selectedUsage.map((entry) => (
                  <div
                    key={`${entry.kind}:${entry.storyboardId}:${entry.sceneId}`}
                    className="rounded-md border bg-muted/25 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium">
                        {entry.storyboardTitle}
                      </span>
                      <Badge
                        variant="outline"
                        className="font-mono text-[7px] uppercase"
                      >
                        {entry.active
                          ? 'active'
                          : entry.kind === 'reference'
                            ? 'reference'
                            : 'take'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[8px] uppercase text-muted-foreground">
                      {entry.sceneIndex == null
                        ? 'Board reference'
                        : `Scene ${String(entry.sceneIndex + 1).padStart(2, '0')} · ${entry.sceneTitle}`}
                      {entry.storyboardId === storyboardId
                        ? ' · this board'
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
          <p className="max-w-xl text-[10px] leading-4 text-muted-foreground">
            The active node is the still used by the next image-to-video render.
            Existing video clips remain attached to their original source.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => void applySelectedFrame()}
              disabled={selectedActive || !selectedAsset || applying}
            >
              {applying ? <Loader2 className="animate-spin" /> : <Check />}
              {selectedActive ? 'Current video source' : 'Use as video source'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- reel timeline -----------------------------------------------------------

const TIMELINE_PX_PER_SEC = 22;

// One scene on the timeline: width encodes the non-destructive cut duration,
// both source edges are draggable (arrow keys work too), and the body selects the clip
// inside the reel editor. Opening the source scene is an explicit action in
// the active-video panel, so selecting a sub-video never throws the editor away.
function TimelineBlock({
  scene,
  trim,
  playProgress,
  selected,
  onSelect,
  onTrimPreview,
  onTrimCommit,
}: {
  scene: SceneDto;
  trim: TrimRange;
  playProgress: number | null;
  selected: boolean;
  onSelect: (clipId: string | null) => void;
  onTrimPreview: (trim: TrimRange | null) => void;
  onTrimCommit: (trim: TrimRange) => void;
}) {
  const [dragTrim, setDragTrim] = useState<TrimRange | null>(null);
  const dragStateRef = useRef<{
    edge: 'in' | 'out';
    startX: number;
    initial: TrimRange;
  } | null>(null);
  const dragTrimRef = useRef<TrimRange | null>(null);
  const visibleTrim = dragTrim ?? trim;
  const durationSec = (visibleTrim.endMs - visibleTrim.startMs) / 1_000;
  const sourceDurationMs = scene.durationSec * 1_000;
  const trimmed =
    visibleTrim.startMs > 0 || visibleTrim.endMs < sourceDurationMs;
  const asset = scene.run?.assets[0];
  const clip = latestClip(scene, ['fhd', 'hd', 'draft']);
  const clipAsset =
    clip?.run?.status === 'succeeded' ? clip.run.assets[0] : undefined;

  const beginTrim = (
    edge: 'in' | 'out',
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const initial = sceneTrimRange(scene, trim);
    dragStateRef.current = { edge, startX: event.clientX, initial };
    dragTrimRef.current = initial;
    setDragTrim(initial);
  };

  const moveTrim = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const deltaMs =
      Math.round(
        ((event.clientX - drag.startX) / TIMELINE_PX_PER_SEC / TRIM_STEP_MS) *
          1_000,
      ) * TRIM_STEP_MS;
    const next =
      drag.edge === 'in'
        ? {
            startMs: Math.min(
              Math.max(0, drag.initial.startMs + deltaMs),
              drag.initial.endMs - MIN_TRIM_MS,
            ),
            endMs: drag.initial.endMs,
          }
        : {
            startMs: drag.initial.startMs,
            endMs: Math.max(
              drag.initial.startMs + MIN_TRIM_MS,
              Math.min(sourceDurationMs, drag.initial.endMs + deltaMs),
            ),
          };
    dragTrimRef.current = next;
    setDragTrim(next);
    onTrimPreview(next);
  };

  const commitTrim = () => {
    const finalTrim = dragTrimRef.current;
    dragStateRef.current = null;
    dragTrimRef.current = null;
    setDragTrim(null);
    if (
      finalTrim &&
      (finalTrim.startMs !== trim.startMs || finalTrim.endMs !== trim.endMs)
    ) {
      onTrimCommit(finalTrim);
    }
  };

  const cancelTrim = () => {
    dragStateRef.current = null;
    dragTrimRef.current = null;
    setDragTrim(null);
    onTrimPreview(null);
  };

  const nudgeTrim = (edge: 'in' | 'out', direction: -1 | 1) => {
    const next =
      edge === 'in'
        ? {
            startMs: Math.min(
              Math.max(0, trim.startMs + direction * TRIM_STEP_MS),
              trim.endMs - MIN_TRIM_MS,
            ),
            endMs: trim.endMs,
          }
        : {
            startMs: trim.startMs,
            endMs: Math.max(
              trim.startMs + MIN_TRIM_MS,
              Math.min(sourceDurationMs, trim.endMs + direction * TRIM_STEP_MS),
            ),
          };
    if (next.startMs !== trim.startMs || next.endMs !== trim.endMs)
      onTrimCommit(next);
  };

  return (
    <div
      className={cn(
        'relative h-20 shrink-0 overflow-hidden rounded-md border bg-muted transition-all',
        selected && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
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
        {trimmed && (
          <span className="absolute left-1 top-1 rounded bg-black/72 px-1 font-mono text-[8px] uppercase tracking-wider text-white backdrop-blur">
            {formatTrimTime(visibleTrim.startMs)}–
            {formatTrimTime(visibleTrim.endMs)}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-1 pt-3">
          <p className="truncate font-mono text-[9px] uppercase tracking-wider">
            {String(scene.sceneIndex + 1).padStart(2, '0')} ·{' '}
            {formatCutDuration(durationSec)}
          </p>
        </div>
      </div>
      {playProgress != null && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 z-[2] border-r border-[#ffd84d] bg-[#ffd84d]/12"
          style={{
            width: `${Math.min(100, Math.max(0, playProgress * 100))}%`,
          }}
          aria-hidden
        />
      )}
      <button
        type="button"
        aria-label={`Trim in scene ${scene.sceneIndex + 1}: ${formatTrimTime(visibleTrim.startMs)}. Arrow keys adjust by 0.1 seconds.`}
        onPointerDown={(event) => beginTrim('in', event)}
        onPointerMove={moveTrim}
        onPointerUp={commitTrim}
        onPointerCancel={cancelTrim}
        onLostPointerCapture={commitTrim}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          nudgeTrim('in', event.key === 'ArrowRight' ? 1 : -1);
        }}
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize border-r border-background/70 bg-[var(--brand)]/80 outline-none transition-colors before:absolute before:inset-y-0 before:-left-1 before:-right-1 hover:bg-[var(--brand)] focus-visible:bg-[var(--brand)]"
      ></button>
      <button
        type="button"
        aria-label={`Trim out scene ${scene.sceneIndex + 1}: ${formatTrimTime(visibleTrim.endMs)}. Arrow keys adjust by 0.1 seconds.`}
        onPointerDown={(event) => beginTrim('out', event)}
        onPointerMove={moveTrim}
        onPointerUp={commitTrim}
        onPointerCancel={cancelTrim}
        onLostPointerCapture={commitTrim}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          nudgeTrim('out', event.key === 'ArrowRight' ? 1 : -1);
        }}
        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize border-l border-background/70 bg-[var(--brand)]/80 outline-none transition-colors before:absolute before:inset-y-0 before:-left-1 before:-right-1 hover:bg-[var(--brand)] focus-visible:bg-[var(--brand)]"
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
  const inherited = clipId
    ? scene.subtitles.filter((cue) => cue.clipId === null)
    : [];
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
    const fallback = clipId
      ? scene.subtitles.filter((cue) => cue.clipId === null)
      : [];
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
    const startMs = Math.min(
      previousEnd + (previousEnd ? 100 : 400),
      scene.durationSec * 1_000 - 500,
    );
    setCues((current) => [
      ...current,
      {
        startMs: Math.max(0, startMs),
        endMs: Math.min(
          scene.durationSec * 1_000,
          Math.max(startMs + 500, startMs + 2_000),
        ),
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
          <div
            key={cue.id ?? `new-${index}`}
            className="rounded-md border bg-muted/30 p-2"
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <Input
                aria-label="Subtitle start time in seconds"
                value={(cue.startMs / 1_000).toFixed(1)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setCues((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, startMs: value * 1_000 }
                        : item,
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
                      itemIndex === index
                        ? { ...item, endMs: value * 1_000 }
                        : item,
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
                      itemIndex === index
                        ? { ...item, speaker: event.target.value }
                        : item,
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
                onClick={() =>
                  setCues((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              value={cue.text}
              onChange={(event) =>
                setCues((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, text: event.target.value }
                      : item,
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
      <Button
        className="mt-2 w-full"
        size="sm"
        onClick={() => void commit()}
        disabled={saving}
      >
        {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
        subtitle track
      </Button>
    </div>
  );
}

function ReelDetail({
  storyboard,
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
  onTrim: (sceneId: string, trim: TrimRange) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [trimDrafts, setTrimDrafts] = useState<Record<string, TrimRange>>({});
  const initialScene = storyboard.scenes[0] ?? null;
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    initialScene?.id ?? null,
  );
  const [activeClipId, setActiveClipId] = useState<string | null>(
    initialScene
      ? (latestClip(initialScene, ['fhd', 'hd', 'draft'])?.id ?? null)
      : null,
  );

  const activeScene =
    storyboard.scenes.find((scene) => scene.id === activeSceneId) ??
    storyboard.scenes[0] ??
    null;
  const activeClip =
    activeScene && activeClipId
      ? (activeScene.clips.find((clip) => clip.id === activeClipId) ?? null)
      : null;
  const trimFor = (scene: SceneDto) =>
    sceneTrimRange(scene, trimDrafts[scene.id]);
  const activeTrim = activeScene ? trimFor(activeScene) : null;
  const cutTotalSeconds = storyboard.scenes.reduce(
    (sum, scene) => sum + sceneCutDurationSec(scene, trimDrafts[scene.id]),
    0,
  );

  useEffect(() => {
    if (!activeScene) {
      const timeout = window.setTimeout(() => {
        setActiveSceneId(storyboard.scenes[0]?.id ?? null);
        setActiveClipId(
          storyboard.scenes[0]
            ? (latestClip(storyboard.scenes[0], ['fhd', 'hd', 'draft'])?.id ??
                null)
            : null,
        );
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    if (
      activeClipId &&
      !activeScene.clips.some((clip) => clip.id === activeClipId)
    ) {
      const timeout = window.setTimeout(
        () =>
          setActiveClipId(
            latestClip(activeScene, ['fhd', 'hd', 'draft'])?.id ?? null,
          ),
        0,
      );
      return () => window.clearTimeout(timeout);
    }
  }, [activeClipId, activeScene, storyboard.scenes]);

  // Animatic: play the cut in real time — scenes with a finished clip play
  // the video, the rest hold their still for the scene duration. The edit
  // reads end-to-end at whatever stage the renders are in.
  const [playlist, setPlaylist] = useState<ReelPlaylistItem[] | null>(null);
  const [playPos, setPlayPos] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [muted, setMuted] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const playerVideoRefs = useRef(new Map<string, HTMLVideoElement>());
  const preparedVideoKeysRef = useRef(new Set<string>());
  const videoPreparationRef = useRef(new Map<string, Promise<boolean>>());
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const mediaAdvanceRef = useRef<string | null>(null);
  const transitionRequestRef = useRef(0);
  const playingItem =
    playlist && playPos < playlist.length ? playlist[playPos] : null;
  const playlistVideoSources = (playlist ?? []).reduce<
    Array<{ url: string; poster: string }>
  >((sources, item) => {
    if (
      item.clipUrl &&
      !sources.some((source) => source.url === item.clipUrl)
    ) {
      sources.push({ url: item.clipUrl, poster: item.url });
    }
    return sources;
  }, []);

  const prepareVideo = useCallback(
    (item: ReelPlaylistItem): Promise<boolean> => {
      if (!item.clipUrl) return Promise.resolve(true);
      const key = reelVideoPreparationKey(item);
      if (preparedVideoKeysRef.current.has(key)) return Promise.resolve(true);
      const pending = videoPreparationRef.current.get(key);
      if (pending) return pending;

      const preparation = (async () => {
        // Refs have been committed before effects run. One animation frame also
        // covers a playlist that was mounted by the same user action.
        let video = playerVideoRefs.current.get(item.clipUrl!);
        if (!video) {
          await new Promise<void>((resolve) =>
            window.requestAnimationFrame(() => resolve()),
          );
          video = playerVideoRefs.current.get(item.clipUrl!);
        }
        if (!video) return false;
        const targetVideo = video;

        targetVideo.preload = 'auto';
        targetVideo.muted = true;

        if (targetVideo.readyState < HTMLMediaElement.HAVE_METADATA) {
          targetVideo.load();
          await waitForMediaEvents(
            targetVideo,
            ['loadedmetadata', 'error'],
            4_000,
          );
        }
        if (targetVideo.error) return false;

        const duration = Number.isFinite(targetVideo.duration)
          ? targetVideo.duration
          : item.sourceDurationSec;
        const target = Math.min(
          item.trimStartSec,
          Math.max(0, duration - 0.04),
        );
        if (Math.abs(targetVideo.currentTime - target) > 0.04) {
          targetVideo.currentTime = target;
          await waitForMediaEvents(
            targetVideo,
            ['seeked', 'canplay', 'error'],
            4_000,
          );
        }
        if (targetVideo.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          await waitForMediaEvents(
            targetVideo,
            ['canplay', 'canplaythrough', 'error'],
            4_000,
          );
        }
        if (
          targetVideo.error ||
          targetVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        )
          return false;

        // Seeking a hidden paused video does not consistently force Safari and
        // Chromium to decode its first frame. A muted one-frame prime does.
        try {
          await targetVideo.play();
          await waitForDecodedVideoFrame(targetVideo, 800);
        } catch {
          // A decoded seeked frame is still useful if autoplay is unavailable.
        } finally {
          targetVideo.pause();
          targetVideo.currentTime = target;
        }

        preparedVideoKeysRef.current.add(key);
        return true;
      })().finally(() => {
        videoPreparationRef.current.delete(key);
      });

      videoPreparationRef.current.set(key, preparation);
      return preparation;
    },
    [],
  );

  const applyTrimPreview = (scene: SceneDto, trim: TrimRange | null) => {
    setTrimDrafts((current) => {
      const next = { ...current };
      if (trim) next[scene.id] = trim;
      else delete next[scene.id];
      return next;
    });
    const nextTrim = sceneTrimRange(scene, trim ?? undefined);
    setPlaylist(
      (current) =>
        current?.map((item) =>
          item.id === scene.id
            ? {
                ...item,
                trimStartSec: nextTrim.startMs / 1_000,
                trimEndSec: nextTrim.endMs / 1_000,
                durationSec: (nextTrim.endMs - nextTrim.startMs) / 1_000,
              }
            : item,
        ) ?? null,
    );
  };

  const commitTrim = (scene: SceneDto, trim: TrimRange) => {
    applyTrimPreview(scene, trim);
    onTrim(scene.id, trim);
  };

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
    let cancelled = false;
    const activeUrl = playingItem?.clipUrl ?? null;
    const video = activeUrl
      ? (playerVideoRefs.current.get(activeUrl) ?? null)
      : null;
    playerVideoRef.current = video;
    for (const [url, candidate] of playerVideoRefs.current) {
      if (url !== activeUrl) candidate.pause();
    }
    if (!video || !playingItem?.clipUrl) return;
    preparedVideoKeysRef.current.delete(reelVideoPreparationKey(playingItem));
    const needsSeek =
      video.currentTime < playingItem.trimStartSec ||
      video.currentTime >= playingItem.trimEndSec;
    if (needsSeek) {
      mediaAdvanceRef.current = playingItem.id;
      setIsBuffering(true);
      video.currentTime = playingItem.trimStartSec;
      setElapsed(0);
    }

    const beginPlayback = async () => {
      if (needsSeek && video.seeking) {
        await waitForMediaEvents(video, ['seeked', 'error'], 3_000);
      }
      if (cancelled) return;
      mediaAdvanceRef.current = null;
      setIsBuffering(false);
      if (isPaused) {
        video.pause();
      } else {
        void video.play().catch(() => setIsPaused(true));
      }
    };
    void beginPlayback();
    return () => {
      cancelled = true;
    };
  }, [
    isPaused,
    muted,
    playingItem,
    playingItem?.clipUrl,
    playingItem?.id,
    playingItem?.trimEndSec,
    playingItem?.trimStartSec,
  ]);

  useEffect(() => {
    if (!playlist || !playingItem) return;
    const nextItem = playlist[playPos + 1];
    if (!nextItem?.clipUrl || nextItem.clipUrl === playingItem.clipUrl) return;
    void prepareVideo(nextItem);
  }, [playPos, playingItem, playlist, prepareVideo]);

  useEffect(() => {
    if (!playingItem) return;
    const scene = storyboard.scenes.find(
      (entry) => entry.id === playingItem.id,
    );
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
      const clipAsset =
        clip?.run?.status === 'succeeded' ? clip.run.assets[0] : undefined;
      const trim = trimFor(scene);
      return asset || clipAsset
        ? [
            {
              id: scene.id,
              url: asset?.url ?? '',
              clipUrl: clipAsset?.url ?? null,
              title: scene.title,
              sceneIndex: scene.sceneIndex,
              sourceDurationSec: scene.durationSec,
              trimStartSec: trim.startMs / 1_000,
              trimEndSec: trim.endMs / 1_000,
              durationSec: (trim.endMs - trim.startMs) / 1_000,
            },
          ]
        : [];
    });
  const activeStill = activeScene?.run?.assets[0];
  const activeClipAsset =
    activeClip?.run?.status === 'succeeded'
      ? activeClip.run.assets[0]
      : undefined;
  const selectedPreview =
    activeScene && (activeStill || activeClipAsset)
      ? (() => {
          const trim = trimFor(activeScene);
          return {
            id: activeScene.id,
            url: activeStill?.url ?? '',
            clipUrl: activeClipAsset?.url ?? null,
            title: activeScene.title,
            sceneIndex: activeScene.sceneIndex,
            sourceDurationSec: activeScene.durationSec,
            trimStartSec: trim.startMs / 1_000,
            trimEndSec: trim.endMs / 1_000,
            durationSec: (trim.endMs - trim.startMs) / 1_000,
          };
        })()
      : null;
  const previewItem =
    playingItem ?? selectedPreview ?? buildPlaylist()[0] ?? null;
  const previewScene = previewItem
    ? (storyboard.scenes.find((scene) => scene.id === previewItem.id) ?? null)
    : null;
  const previewClipId = playingItem
    ? previewScene
      ? (latestClip(previewScene, ['fhd', 'hd', 'draft'])?.id ?? null)
      : null
    : (activeClip?.id ?? null);
  const previewSubtitles = previewScene
    ? (() => {
        const exact = previewScene.subtitles.filter(
          (cue) => cue.clipId === previewClipId,
        );
        return exact.length
          ? exact
          : previewScene.subtitles.filter((cue) => cue.clipId === null);
      })()
    : [];
  const activeSubtitle = playingItem
    ? previewSubtitles.find(
        (cue) =>
          (elapsed + playingItem.trimStartSec) * 1_000 >= cue.startMs &&
          (elapsed + playingItem.trimStartSec) * 1_000 <= cue.endMs,
      )
    : previewSubtitles[0];
  const elapsedBeforeScene = playlist
    ? playlist
        .slice(0, playPos)
        .reduce((sum, item) => sum + item.durationSec, 0)
    : 0;
  const cutElapsed = playingItem ? elapsedBeforeScene + elapsed : 0;

  const startAnimatic = () => {
    const items = buildPlaylist();
    if (!items.length) {
      onNotice('Render at least one still first — the cut plays from stills.');
      return;
    }
    setPlayPos(0);
    setElapsed(0);
    setIsPaused(false);
    setIsBuffering(false);
    mediaAdvanceRef.current = null;
    transitionRequestRef.current += 1;
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
    playerVideoRef.current?.pause();
    setPlaylist(items);
    setPlayPos(index);
    setElapsed(0);
    setIsPaused(false);
    setIsBuffering(false);
    mediaAdvanceRef.current = items[index]?.id ?? null;
    transitionRequestRef.current += 1;
  };
  const currentSceneIndex = playingItem
    ? storyboard.scenes.findIndex((scene) => scene.id === playingItem.id)
    : -1;
  const stopAnimatic = () => {
    playerVideoRef.current?.pause();
    setPlaylist(null);
    setPlayPos(0);
    setElapsed(0);
    setIsPaused(false);
    setIsBuffering(false);
    mediaAdvanceRef.current = playingItem?.id ?? null;
    transitionRequestRef.current += 1;
  };

  const previousSegment = () => {
    if (!playlist) return;
    playerVideoRef.current?.pause();
    mediaAdvanceRef.current = playingItem?.id ?? null;
    transitionRequestRef.current += 1;
    setIsBuffering(false);
    setElapsed(0);
    setIsPaused(false);
    setPlayPos((position) => Math.max(0, position - 1));
  };

  const nextSegment = (manual = true) => {
    if (!playlist) return;
    const nextPosition = playPos + 1;
    const nextItem = playlist[nextPosition];
    const currentItem = playingItem;
    if (manual) mediaAdvanceRef.current = currentItem?.id ?? null;
    const request = ++transitionRequestRef.current;
    const seamlessContinuation = Boolean(
      currentItem?.clipUrl &&
      nextItem?.clipUrl === currentItem.clipUrl &&
      Math.abs(nextItem.trimStartSec - currentItem.trimEndSec) <= 0.15,
    );
    const complete = () => {
      if (request !== transitionRequestRef.current) return;
      if (!seamlessContinuation) playerVideoRef.current?.pause();
      setIsBuffering(false);
      setElapsed(0);
      setIsPaused(false);
      setPlayPos(nextPosition);
    };

    if (
      nextItem?.clipUrl &&
      nextItem.clipUrl !== currentItem?.clipUrl &&
      !preparedVideoKeysRef.current.has(reelVideoPreparationKey(nextItem))
    ) {
      setIsBuffering(true);
      void prepareVideo(nextItem).then(complete);
      return;
    }
    complete();
  };

  const advanceFromMedia = () => {
    if (!playingItem || mediaAdvanceRef.current === playingItem.id) return;
    mediaAdvanceRef.current = playingItem.id;
    nextSegment(false);
  };

  const updateVideoClock = (video: HTMLVideoElement) => {
    if (!playingItem) return;
    const localTime = Math.max(0, video.currentTime - playingItem.trimStartSec);
    setElapsed(Math.min(playingItem.durationSec, localTime));
    if (video.currentTime >= playingItem.trimEndSec - 0.025) advanceFromMedia();
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
        trimStartMs: trimFor(scene).startMs,
        trimEndMs: trimFor(scene).endMs,
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
            {storyboard.scenes.length} scenes ·{' '}
            {formatCutDuration(cutTotalSeconds)} cut
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Draft everything cheap, watch the cut, enhance only the keepers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={togglePlayback}>
            {playingItem && !isPaused ? <Pause /> : <Play />}{' '}
            {playingItem && !isPaused
              ? 'Pause cut'
              : playingItem
                ? 'Resume cut'
                : 'Play cut'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportBoard()}
          >
            {copied ? <Check /> : <Copy />}{' '}
            {copied ? 'Copied' : 'Export board JSON'}
          </Button>
          {videoEnabled && (
            <Button
              size="sm"
              onClick={onAssemble}
              disabled={assembling || draftableCount === 0}
            >
              {assembling ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Clapperboard />
              )}
              Assemble draft reel
              {draftableCount > 0 ? ` (${draftableCount})` : ''}
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
              <>
                {playlistVideoSources.map((source) => {
                  const sourceItem = playlist?.find(
                    (item) => item.clipUrl === source.url,
                  );
                  const active = source.url === playingItem.clipUrl;
                  return (
                    <video
                      ref={(node) => {
                        if (node) playerVideoRefs.current.set(source.url, node);
                        else playerVideoRefs.current.delete(source.url);
                      }}
                      key={source.url}
                      src={source.url}
                      poster={source.poster || undefined}
                      preload="auto"
                      muted={active ? muted : true}
                      playsInline
                      aria-hidden={!active}
                      onLoadedMetadata={(event) => {
                        if (!sourceItem) return;
                        event.currentTarget.currentTime = Math.min(
                          sourceItem.trimStartSec,
                          event.currentTarget.duration ||
                            sourceItem.sourceDurationSec,
                        );
                      }}
                      onTimeUpdate={(event) => {
                        if (active) updateVideoClock(event.currentTarget);
                      }}
                      onPlaying={() => {
                        if (active) setIsBuffering(false);
                      }}
                      onWaiting={() => {
                        if (active) setIsBuffering(true);
                      }}
                      onStalled={() => {
                        if (active) setIsBuffering(true);
                      }}
                      onEnded={() => {
                        if (active) advanceFromMedia();
                      }}
                      onError={() => {
                        if (active) advanceFromMedia();
                      }}
                      className={cn(
                        'absolute inset-0 size-full bg-black object-contain',
                        active
                          ? 'z-[1] opacity-100'
                          : 'pointer-events-none z-0 opacity-0',
                      )}
                    >
                      <track
                        kind="captions"
                        label="Captions are rendered as an editable overlay"
                      />
                    </video>
                  );
                })}
                {!playingItem.clipUrl && (
                  <NextImage
                    key={playingItem.id}
                    src={playingItem.url}
                    alt={playingItem.title}
                    width={1344}
                    height={768}
                    unoptimized
                    className="relative z-[1] size-full object-contain"
                  />
                )}
              </>
            ) : previewItem.clipUrl ? (
              <video
                src={previewItem.clipUrl}
                poster={previewItem.url || undefined}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = Math.min(
                    previewItem.trimStartSec,
                    event.currentTarget.duration ||
                      previewItem.sourceDurationSec,
                  );
                }}
                className="size-full bg-black object-contain"
              />
            ) : (
              <NextImage
                src={previewItem.url}
                alt={previewItem.title}
                width={1344}
                height={768}
                unoptimized
                className="size-full object-contain"
              />
            )}
            {playingItem && isBuffering && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/72 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-white shadow backdrop-blur">
                  <Loader2 className="size-3 animate-spin" /> Preparing next
                  shot
                </span>
              </div>
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
            {previewScene?.sceneIndex === storyboard.scenes.length - 1 && (
              <EndCardLogo />
            )}
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
                  aria-label={
                    playingItem && !isPaused ? 'Pause playback' : 'Play the cut'
                  }
                >
                  {playingItem && !isPaused ? (
                    <Pause className="size-3.5" />
                  ) : (
                    <Play className="ml-px size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => nextSegment()}
                  disabled={!playingItem}
                  className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded bg-white/10 backdrop-blur transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35"
                  aria-label="Next segment"
                >
                  <SkipForward className="size-3.5" />
                </button>
                <p className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider">
                  {playingItem
                    ? `${String(playingItem.sceneIndex + 1).padStart(2, '0')}/${String(storyboard.scenes.length).padStart(2, '0')} · ${playingItem.title} · ${formatCutDuration(playingItem.durationSec)} · ${formatTrimTime(playingItem.trimStartSec * 1_000)}–${formatTrimTime(playingItem.trimEndSec * 1_000)}`
                    : `Cut ready · ${storyboard.scenes.length} scenes · ${formatCutDuration(cutTotalSeconds)} — clips play where rendered, stills hold`}
                </p>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/72">
                  {formatPlayerTime(cutElapsed)} /{' '}
                  {formatPlayerTime(cutTotalSeconds)}
                </span>
                <button
                  type="button"
                  onClick={() => setMuted((value) => !value)}
                  className="pointer-events-auto grid size-7 shrink-0 place-items-center rounded transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label={muted ? 'Unmute playback' : 'Mute playback'}
                >
                  {muted ? (
                    <VolumeX className="size-3.5" />
                  ) : (
                    <Volume2 className="size-3.5" />
                  )}
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
                      style={{
                        width: `${(sceneCutDurationSec(scene, trimDrafts[scene.id]) / Math.max(cutTotalSeconds, 0.1)) * 100}%`,
                      }}
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
                    {String(activeScene.sceneIndex + 1).padStart(2, '0')} ·{' '}
                    {activeScene.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {activeClip ? `${activeClip.tier} clip` : 'source still'} ·{' '}
                    {activeTrim
                      ? `${formatCutDuration((activeTrim.endMs - activeTrim.startMs) / 1_000)} cut / ${activeScene.durationSec}s source`
                      : `${activeScene.durationSec}s`}
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
                      !activeClip &&
                        'border-[var(--brand)] bg-[var(--brand-soft)]',
                    )}
                  >
                    <span className="block font-mono text-[9px] uppercase tracking-wider">
                      Still
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      Master frame
                    </span>
                  </button>
                  {activeScene.clips.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => setActiveClipId(clip.id)}
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
                        activeClip?.id === clip.id &&
                          'border-[var(--brand)] bg-[var(--brand-soft)]',
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

              {activeTrim && (
                <div className="mt-3 rounded-md border bg-muted/25 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Scissors className="size-3.5" />
                      <SystemLabel>Cut range</SystemLabel>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={
                        activeTrim.startMs === 0 &&
                        activeTrim.endMs === activeScene.durationSec * 1_000
                      }
                      onClick={() =>
                        commitTrim(activeScene, {
                          startMs: 0,
                          endMs: activeScene.durationSec * 1_000,
                        })
                      }
                    >
                      <RotateCcw /> Reset
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[
                      ['In', formatTrimTime(activeTrim.startMs)],
                      ['Out', formatTrimTime(activeTrim.endMs)],
                      [
                        'Cut',
                        formatCutDuration(
                          (activeTrim.endMs - activeTrim.startMs) / 1_000,
                        ),
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded border bg-background px-2 py-1.5"
                      >
                        <span className="block font-mono text-[8px] uppercase text-muted-foreground">
                          {label}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] tabular-nums">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="relative mt-2 h-5 overflow-hidden rounded bg-foreground/8">
                    <span
                      className="absolute inset-y-0 rounded-sm border-x-2 border-[var(--brand)] bg-[var(--brand-soft)]"
                      style={{
                        left: `${(activeTrim.startMs / (activeScene.durationSec * 1_000)) * 100}%`,
                        width: `${((activeTrim.endMs - activeTrim.startMs) / (activeScene.durationSec * 1_000)) * 100}%`,
                      }}
                    />
                    <span className="absolute inset-y-0 left-1/2 w-px bg-background/80" />
                  </div>
                  <p className="mt-1.5 text-[9px] leading-3.5 text-muted-foreground">
                    Drag the green IN and OUT handles on the track. Playback and
                    both timelines use this exact source range.
                  </p>
                </div>
              )}

              <div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.025] p-2.5">
                <SystemLabel>Image → video prompt</SystemLabel>
                <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                  {activeScene.videoPrompt ||
                    'No separate motion direction yet. Drafting will fall back to the still prompt.'}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => jumpTo(activeScene.id)}
                >
                  <Play /> Play from here
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenScene(activeScene.id)}
                >
                  Open source scene
                </Button>
                {videoEnabled &&
                  !activeScene.clips.some((clip) => clip.tier === 'draft') && (
                    <Button
                      size="sm"
                      onClick={() => onDraftClip(activeScene.id)}
                      disabled={busyScenes.has(activeScene.id) || !activeStill}
                    >
                      {busyScenes.has(activeScene.id) ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Play />
                      )}
                      Draft video
                    </Button>
                  )}
                {videoEnabled &&
                  activeScene.clips.some((clip) => clip.tier === 'draft') && (
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
                  cutTotalSeconds * TIMELINE_PX_PER_SEC +
                  (storyboard.scenes.length - 1) * 4,
              }}
              aria-hidden
            >
              {Array.from(
                { length: Math.floor(cutTotalSeconds / 5) + 1 },
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
                  trim={trimFor(scene)}
                  playProgress={
                    playingItem?.id === scene.id
                      ? elapsed / Math.max(playingItem.durationSec, 0.1)
                      : null
                  }
                  selected={activeScene?.id === scene.id}
                  onSelect={(clipId) => {
                    setActiveSceneId(scene.id);
                    setActiveClipId(clipId);
                    stopAnimatic();
                  }}
                  onTrimPreview={(trim) => applyTrimPreview(scene, trim)}
                  onTrimCommit={(trim) => commitTrim(scene, trim)}
                />
              ))}
            </div>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Click a block to select its active clip · drag either green edge for
            source IN/OUT · the yellow playhead and both segmented bars follow
            the resulting cut in real time.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="rounded border px-1.5 py-0.5">
          draft ~{formatUsd(estimateVideoCostUsd(cutTotalSeconds, 'draft'))}
        </span>
        <span className="rounded border px-1.5 py-0.5">
          enhance HD ~{formatUsd(estimateVideoCostUsd(cutTotalSeconds, 'hd'))}
        </span>
        <span className="rounded border px-1.5 py-0.5">
          FHD ~{formatUsd(estimateVideoCostUsd(cutTotalSeconds, 'fhd'))}
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
            {sceneCount} scenes · {formatCutDuration(totalSeconds)} reel
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
              {assembling ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Clapperboard />
              )}
              Assemble draft reel
              {draftableCount > 0 ? ` (${draftableCount})` : ''}
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
                Stills render live through FLUX.2. Set VIDEO_ENABLED=true on the
                deployment to turn on the FLUX 3 Video draft → enhance pipeline.
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
        Describe the film in a paragraph — the shot list writes itself, scene by
        scene. Then walk the sequence: refine each prompt, render the still,
        draft the clip, enhance the keepers.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Button onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} New
          storyboard
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
        Type the idea, get a sequential shot list, and walk it node by node:
        pinned references keep the subject consistent through FLUX.2, and each
        finished still becomes a FLUX 3 Video draft you enhance only when it
        earns it.
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
  const [assets, setAssets] = useState<
    Array<{ id: string; url: string; prompt: string }>
  >([]);
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
              .map((asset) => ({
                id: asset.id,
                url: asset.url,
                prompt: run.prompt,
              })),
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
            Pick any output from your shared history. It will ride along as a
            FLUX.2 reference image with every scene render.
          </DialogDescription>
        </DialogHeader>
        {state === 'loading' && (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading your outputs…
          </p>
        )}
        {state === 'error' && (
          <p className="text-[12px] text-destructive">
            Could not load history.
          </p>
        )}
        {state === 'ready' && assets.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-[12px] leading-relaxed text-muted-foreground">
            No stored outputs yet — generate an image in the Playground first,
            then pin it here as the storyboard reference.
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
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe - minutes * 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${remainder}`;
}

function formatTrimTime(milliseconds: number) {
  return formatPlayerTime(milliseconds / 1_000);
}

function formatCutDuration(seconds: number) {
  return `${Math.max(0, seconds).toFixed(1)}s`;
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
