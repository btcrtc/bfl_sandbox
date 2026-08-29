'use client';

import NextImage from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  CircleX,
  Cloud,
  Code2,
  Command,
  Copy,
  Dices,
  Download,
  Ellipsis,
  History,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  SquareStack,
  WandSparkles,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  ParameterChip,
  ProductHeader,
  ProductRail,
  SystemLabel,
  parameterChipClass,
  surfaceClass,
} from '@/components/product-system';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Command as CommandMenu,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BFL_ENDPOINTS, MODEL_CAPS, type BflModel } from '@/lib/bfl';
import { estimateRunCostUsd, formatUsd } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import type { HistoryRun } from '@/db/history';

type NodeId = 'prompt' | 'model' | 'generate';

const modelOptions = [
  { value: 'FLUX.2 [max]', description: 'Maximum fidelity and grounding' },
  { value: 'FLUX.2 [pro]', description: 'Fast production quality' },
  { value: 'FLUX.2 [flex]', description: 'Typography and fine control' },
  { value: 'FLUX.2 [klein]', description: 'Low-latency exploration' },
] as const;

const aspectOptions = [
  { value: '1:1', width: 1024, height: 1024 },
  { value: '4:3', width: 1184, height: 896 },
  { value: '3:4', width: 896, height: 1184 },
  { value: '16:9', width: 1344, height: 768 },
  { value: '9:16', width: 768, height: 1344 },
  { value: '3:2', width: 1216, height: 832 },
  { value: '2:3', width: 832, height: 1216 },
  { value: '21:9', width: 1536, height: 640 },
  { value: '9:21', width: 640, height: 1536 },
] as const;

const sampleOutputImages = [
  '/generated/mineral-machine.png',
  '/generated/smoked-glass.png',
  '/generated/field-camera.png',
  '/generated/paper-terrain.png',
] as const;

const nodes: Array<{
  id: NodeId;
  eyebrow: string;
  icon: typeof WandSparkles;
  position: string;
}> = [
  { id: 'prompt', eyebrow: 'INPUT', icon: WandSparkles, position: 'left-[8%] top-[19%]' },
  { id: 'model', eyebrow: 'MODEL', icon: Box, position: 'left-[40%] top-[42%]' },
  { id: 'generate', eyebrow: 'ACTION', icon: Play, position: 'right-[7%] top-[22%]' },
];

const inspectorCopy: Record<NodeId, { label: string; title: string; description: string }> = {
  prompt: {
    label: 'Prompt node',
    title: 'Prompt',
    description: 'Defines the creative direction and reference media.',
  },
  model: {
    label: 'Model node',
    title: 'Model & parameters',
    description: 'Maps model capabilities into validated controls.',
  },
  generate: {
    label: 'Action node',
    title: 'Generate',
    description: 'Creates a durable run and streams status to the history.',
  },
};

type RunPayload = {
  prompt: string;
  model: BflModel;
  width: number;
  height: number;
  outputs: number;
  outputFormat: 'png' | 'jpeg' | 'webp';
  safetyTolerance: number;
  promptUpsampling: boolean;
  seed: number | null;
  guidance: number | null;
};

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32);
}

function isKnownModel(value: string): value is BflModel {
  return value in BFL_ENDPOINTS;
}

function payloadFromRun(run: HistoryRun): RunPayload {
  const parameters = run.parameters as Partial<{
    width: number;
    height: number;
    outputFormat: 'png' | 'jpeg' | 'webp';
    safetyTolerance: number;
    promptUpsampling: boolean;
    seed: number | null;
    guidance: number | null;
  }>;
  return {
    prompt: run.prompt,
    model: isKnownModel(run.modelId) ? run.modelId : 'FLUX.2 [max]',
    width: parameters.width ?? 1024,
    height: parameters.height ?? 768,
    outputs: run.outputCount,
    outputFormat: parameters.outputFormat ?? 'png',
    safetyTolerance: parameters.safetyTolerance ?? 2,
    promptUpsampling: parameters.promptUpsampling !== false,
    seed: parameters.seed ?? null,
    guidance: parameters.guidance ?? null,
  };
}

function buildBflBody(payload: RunPayload) {
  return {
    prompt: payload.prompt,
    width: payload.width,
    height: payload.height,
    output_format: payload.outputFormat,
    safety_tolerance: payload.safetyTolerance,
    prompt_upsampling: payload.promptUpsampling,
    seed: payload.seed,
    ...(payload.guidance != null && MODEL_CAPS[payload.model].guidance
      ? { guidance: payload.guidance }
      : {}),
  };
}

function buildCurl(payload: RunPayload) {
  return [
    `curl -X POST 'https://api.bfl.ai/v1/${BFL_ENDPOINTS[payload.model]}' \\`,
    `  -H 'accept: application/json' \\`,
    `  -H 'content-type: application/json' \\`,
    `  -H "x-key: $BFL_API_KEY" \\`,
    `  -d '${JSON.stringify(buildBflBody(payload), null, 2).replaceAll("'", "'\\''")}'`,
  ].join('\n');
}

const fallbackHistory: HistoryRun[] = [
  ['sample-0', 'Soft industrial product portrait on warm mineral paper', 'FLUX.2 [max]', 2, 18],
  ['sample-1', 'Retro-futurist desktop machine, quiet studio light', 'FLUX.2 [max]', 2, 1_440],
  ['sample-2', 'Compact field recorder with tactile orange controls', 'FLUX.2 [pro]', 4, 1_560],
  ['sample-3', 'Brutalist perfume bottle with smoked glass and sharp caustics', 'FLUX.2 [flex]', 2, 2_940],
  ['sample-4', 'Wayfinding icons for an alpine research station', 'FLUX.2 [klein]', 4, 4_320],
  ['sample-5', 'Editorial still life in moss green, chalk and anodized aluminum', 'FLUX.2 [pro]', 2, 5_760],
  ['sample-6', 'Modular field camera photographed as an archival artifact', 'FLUX.2 [max]', 2, 7_200],
  ['sample-7', 'Folded-paper terrain system with embossed contour labels', 'FLUX.2 [flex]', 3, 10_080],
].map(([id, prompt, modelId, outputCount, ageMinutes]) => ({
  id: String(id),
  status: 'succeeded' as const,
  origin: 'sample',
  modelId: String(modelId),
  prompt: String(prompt),
  parameters: { width: 1024, height: 768, outputFormat: 'png' },
  outputCount: Number(outputCount),
  costCredits: String(modelId).includes('max') ? '38' : '24',
  latencyMs: null,
  errorMessage: null,
  createdAt: Date.now() - Number(ageMinutes) * 60_000,
  updatedAt: Date.now() - Number(ageMinutes) * 60_000,
  assets: [],
  jobs: [],
}));

export function PlaygroundShell({
  viewer,
  signInPath,
}: {
  viewer: { displayName: string; email: string } | null;
  signInPath: string;
}) {
  const [selectedNode, setSelectedNode] = useState<NodeId>('model');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prompt, setPrompt] = useState(
    'A precise product portrait of a compact creative machine, warm mineral background, soft studio light, tactile controls.',
  );
  const [historyItems, setHistoryItems] = useState<HistoryRun[]>(viewer ? [] : fallbackHistory);
  const [historyState, setHistoryState] = useState<'loading' | 'synced' | 'error'>(
    viewer ? 'loading' : 'error',
  );
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'fallback'>(
    viewer ? 'connecting' : 'fallback',
  );
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [model, setModel] = useState<BflModel>('FLUX.2 [max]');
  const [aspect, setAspect] = useState<(typeof aspectOptions)[number]['value']>('4:3');
  const [outputs, setOutputs] = useState('2');
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [safety, setSafety] = useState('2');
  const [promptUpsampling, setPromptUpsampling] = useState(true);
  const [seed, setSeed] = useState<number | null>(null);
  const [guidance, setGuidance] = useState(3.5);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [apiPayloadOpen, setApiPayloadOpen] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [highlightRunId, setHighlightRunId] = useState<string | null>(null);

  const dimensions = aspectOptions.find((option) => option.value === aspect) ?? aspectOptions[1];
  const selected = inspectorCopy[selectedNode];
  const activePollsRef = useRef<Set<string>>(new Set());
  const pollRunRef = useRef<(id: string) => void>(() => {});
  const runWorkflowRef = useRef<() => void>(() => {});
  const realtimeStateRef = useRef(realtimeState);
  useEffect(() => {
    realtimeStateRef.current = realtimeState;
  }, [realtimeState]);

  const refreshHistory = useCallback(async () => {
    if (!viewer) return;
    try {
      const response = await fetch('/api/history', { cache: 'no-store' });
      if (!response.ok) throw new Error('History is unavailable');
      const data = (await response.json()) as { runs: HistoryRun[] };
      setHistoryItems(data.runs);
      setHistoryState('synced');
      // Resume polling for any run still in flight — a run started in another
      // tab (or before a reload) keeps progressing as long as anyone watches.
      for (const run of data.runs) {
        if (run.origin === 'live' && ['queued', 'running'].includes(run.status)) {
          pollRunRef.current(run.id);
        }
      }
    } catch {
      setHistoryItems((current) => (current.length ? current : fallbackHistory));
      setHistoryState('error');
    }
  }, [viewer]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshHistory(), 0);
    return () => window.clearTimeout(initialRefresh);
  }, [refreshHistory]);

  useEffect(() => {
    if (!viewer) return;
    let socket: WebSocket | null = null;
    let retry: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
      socket.onopen = () => {
        setRealtimeState('live');
        void refreshHistory();
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string' || event.data === 'pong') return;
        try {
          const message = JSON.parse(event.data) as { type?: string };
          if (message.type === 'history:changed') void refreshHistory();
        } catch {
          // Ignore non-JSON heartbeat messages.
        }
      };
      socket.onerror = () => setRealtimeState('fallback');
      socket.onclose = () => {
        setRealtimeState('fallback');
        if (!disposed) retry = window.setTimeout(connect, 4_000);
      };
    };

    connect();
    const fallbackRefresh = window.setInterval(() => {
      if (realtimeStateRef.current !== 'live') void refreshHistory();
    }, 15_000);
    return () => {
      disposed = true;
      window.clearInterval(fallbackRefresh);
      if (retry) window.clearTimeout(retry);
      socket?.close();
    };
  }, [refreshHistory, viewer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runWorkflowRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pollRun = (id: string) => {
    if (activePollsRef.current.has(id)) return;
    activePollsRef.current.add(id);
    const startedAt = Date.now();
    let delay = 2_500;

    const tick = async () => {
      try {
        const response = await fetch(`/api/generations/${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 404) {
          activePollsRef.current.delete(id);
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as { run: HistoryRun | null };
          await refreshHistory();
          if (!data.run || !['queued', 'running'].includes(data.run.status)) {
            activePollsRef.current.delete(id);
            return;
          }
          delay = 2_500;
        } else {
          delay = Math.min(delay * 2, 30_000);
        }
      } catch {
        delay = Math.min(delay * 2, 30_000);
      }
      // The server marks jobs failed after its own 15-minute deadline; this
      // client-side stop is just a backstop against infinite loops.
      if (Date.now() - startedAt > 20 * 60_000) {
        activePollsRef.current.delete(id);
        return;
      }
      window.setTimeout(() => void tick(), delay);
    };

    window.setTimeout(() => void tick(), 1_200);
  };
  useEffect(() => {
    pollRunRef.current = pollRun;
  });

  const buildPayload = useCallback(
    (): RunPayload => ({
      prompt,
      model,
      width: dimensions.width,
      height: dimensions.height,
      outputs: Number(outputs),
      outputFormat,
      safetyTolerance: Number(safety),
      promptUpsampling,
      seed,
      guidance: MODEL_CAPS[model].guidance ? guidance : null,
    }),
    [prompt, model, dimensions, outputs, outputFormat, safety, promptUpsampling, seed, guidance],
  );

  const runWorkflow = useCallback(
    async (payload?: RunPayload) => {
      if (isRunning) return;
      const body = payload ?? buildPayload();
      if (body.prompt.trim().length < 3) return;
      setIsRunning(true);
      setRunMessage(null);
      try {
        const response = await fetch('/api/generations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { id?: string; mode?: string; error?: string };
        if (!response.ok || !data.id) throw new Error(data.error || 'Could not create the run.');
        setLastRunAt(Date.now());
        setHistoryOpen(true);
        setHighlightRunId(data.id);
        window.setTimeout(() => setHighlightRunId((current) => (current === data.id ? null : current)), 6_000);
        await refreshHistory();
        setRunMessage(
          data.mode === 'preview'
            ? { tone: 'info', text: 'Shared draft saved. Add BFL_API_KEY to enable live output.' }
            : { tone: 'info', text: 'Live generation started. Results stream into the history panel.' },
        );
        if (data.mode === 'live') pollRunRef.current(data.id);
      } catch (error) {
        setRunMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Could not create the run.',
        });
      } finally {
        setIsRunning(false);
      }
    },
    [buildPayload, isRunning, refreshHistory],
  );
  useEffect(() => {
    runWorkflowRef.current = () => void runWorkflow();
  }, [runWorkflow]);

  const applyRunToInspector = useCallback((run: HistoryRun, options?: { varySeed?: boolean }) => {
    const payload = payloadFromRun(run);
    setPrompt(payload.prompt);
    setModel(payload.model);
    const matchedAspect = aspectOptions.find(
      (option) => option.width === payload.width && option.height === payload.height,
    );
    if (matchedAspect) setAspect(matchedAspect.value);
    setOutputs(String(Math.min(4, Math.max(1, payload.outputs))));
    setOutputFormat(payload.outputFormat);
    setSafety(String(payload.safetyTolerance));
    setPromptUpsampling(payload.promptUpsampling);
    setSeed(options?.varySeed ? randomSeed() : payload.seed);
    if (payload.guidance != null) setGuidance(payload.guidance);
    setSelectedNode('model');
    setDetailRunId(null);
    setRunMessage({ tone: 'info', text: 'Parameters loaded from the selected run.' });
  }, []);

  const rerunFromRun = useCallback(
    (run: HistoryRun, options?: { varySeed?: boolean; safetyBump?: boolean }) => {
      const payload = payloadFromRun(run);
      if (options?.varySeed) payload.seed = randomSeed();
      if (options?.safetyBump) payload.safetyTolerance = Math.min(6, payload.safetyTolerance + 1);
      applyRunToInspector(run, { varySeed: options?.varySeed });
      if (options?.safetyBump) setSafety(String(payload.safetyTolerance));
      setDetailRunId(null);
      void runWorkflow(payload);
    },
    [applyRunToInspector, runWorkflow],
  );

  const copyToClipboard = useCallback(async (text: string, note: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setRunMessage({ tone: 'info', text: note });
    } catch {
      setRunMessage({ tone: 'error', text: 'Clipboard is unavailable in this browser.' });
    }
  }, []);

  // Edges are measured from real node geometry so they stay attached at every
  // viewport, instead of hardcoded path coordinates.
  const canvasRef = useRef<HTMLElement | null>(null);
  const nodeRefs = useRef<Record<NodeId, HTMLButtonElement | null>>({
    prompt: null,
    model: null,
    generate: null,
  });
  const [edgePaths, setEdgePaths] = useState<{ promptModel: string; modelGenerate: string }>({
    promptModel: '',
    modelGenerate: '',
  });
  const measureEdges = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const edge = (from: NodeId, to: NodeId) => {
      const source = nodeRefs.current[from]?.getBoundingClientRect();
      const target = nodeRefs.current[to]?.getBoundingClientRect();
      if (!source || !target) return '';
      const x1 = source.right - canvasRect.left;
      const y1 = source.top - canvasRect.top + source.height / 2;
      const x2 = target.left - canvasRect.left;
      const y2 = target.top - canvasRect.top + target.height / 2;
      const bend = Math.max(36, (x2 - x1) / 2);
      return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
    };
    setEdgePaths({
      promptModel: edge('prompt', 'model'),
      modelGenerate: edge('model', 'generate'),
    });
  }, []);
  useEffect(() => {
    measureEdges();
    const observer = new ResizeObserver(() => measureEdges());
    if (canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener('resize', measureEdges);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureEdges);
    };
  }, [measureEdges]);

  const estimatedCost = useMemo(
    () => estimateRunCostUsd(model, dimensions.width, dimensions.height, Number(outputs)),
    [model, dimensions, outputs],
  );
  const anyRunActive = historyItems.some((item) => ['queued', 'running'].includes(item.status));
  const detailRun = detailRunId
    ? (historyItems.find((item) => item.id === detailRunId) ?? null)
    : null;

  const nodeMeta: Record<NodeId, { title: string; meta: string }> = {
    prompt: {
      title: 'Prompt',
      meta: `${promptUpsampling ? 'Upsampling on' : 'Raw prompt'} · ${prompt.length.toLocaleString()} chars`,
    },
    model: {
      title: model,
      meta: `${aspect} · ${outputs} outputs · ~${formatUsd(estimatedCost)}`,
    },
    generate: {
      title: 'Generate',
      meta: isRunning
        ? 'Submitting run…'
        : anyRunActive
          ? 'Run in progress'
          : lastRunAt
            ? `Last run ${formatAge(lastRunAt)}`
            : 'Ready to run',
    },
  };

  return (
    <TooltipProvider delay={350}>
      <main className="h-svh overflow-hidden bg-background text-foreground">
        <ProductHeader
          concept
          center={
            <button
              className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">Type command or search…</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd>
            </button>
          }
          end={
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                <Cloud
                  className={cn(
                    'size-3.5',
                    !viewer
                      ? 'text-muted-foreground'
                      : realtimeState === 'fallback'
                        ? 'text-amber-600'
                        : 'text-[var(--success)]',
                  )}
                />
                <span>
                  {!viewer
                    ? 'Local preview'
                    : realtimeState === 'live'
                      ? 'Realtime connected'
                      : realtimeState === 'fallback'
                        ? 'Polling fallback'
                        : 'Connecting realtime…'}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label="Workspace settings" />}
                >
                  <Settings2 />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Studio workspace</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked disabled>
                      Shared history (always on)
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={promptUpsampling}
                      onCheckedChange={setPromptUpsampling}
                    >
                      Prompt upsampling
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      void copyToClipboard(
                        JSON.stringify({ workflow: 'branchline/v1', ...buildPayload() }, null, 2),
                        'Workflow JSON copied to clipboard.',
                      )
                    }
                  >
                    <Download /> Export JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setApiPayloadOpen(true)}>
                    <Code2 /> View API payload
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                  Sign in to sync
                </a>
              )}
            </div>
          }
        />

        <div className="grid h-[calc(100svh-var(--app-header-height))] grid-cols-[var(--app-rail-width)_var(--app-inspector-width)_minmax(0,1fr)_var(--app-history-width)] max-2xl:grid-cols-[var(--app-rail-width)_var(--app-inspector-width)_minmax(0,1fr)]">
          <ProductRail active="playground" />

          <aside className="flex min-h-0 flex-col border-r bg-playground-surface">
            <div className="flex h-[var(--app-header-height)] items-center justify-between border-b px-4">
              <div>
                <SystemLabel>{selected.label}</SystemLabel>
                <p className="mt-0.5 text-[13px] font-medium leading-4">{selected.title}</p>
              </div>
              <IconTooltip label="Open advanced parameters">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open advanced parameters"
                  onClick={() => setAdvancedOpen(true)}
                >
                  <SlidersHorizontal />
                </Button>
              </IconTooltip>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <InspectorLabel>Model</InspectorLabel>
              <Select
                value={model}
                onValueChange={(value) => value && isKnownModel(value) && setModel(value)}
              >
                <SelectTrigger className="mb-4 h-9! w-full bg-playground-surface-elevated text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectLabel>Image generation</SelectLabel>
                    {modelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="py-2">
                        <span className="flex flex-col">
                          <span className="font-medium">{option.value}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <InspectorLabel>Prompt</InspectorLabel>
              <div className="relative mb-5">
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-[120px] resize-none bg-playground-surface-elevated pb-10 text-sm leading-5"
                />
                <span className="absolute bottom-2 left-3 font-mono text-[10px] text-muted-foreground">
                  ⌘ ↵ to run
                </span>
                <span className="absolute bottom-2 right-2 font-mono text-[10px] text-muted-foreground">
                  {prompt.length.toLocaleString()} / 10,000
                </span>
              </div>

              <InspectorLabel>Parameters</InspectorLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                <AspectParameter
                  label="Aspect ratio"
                  value={aspect}
                  onValueChange={(value) => setAspect(value as typeof aspect)}
                />
                <ParameterSelect
                  label="Outputs"
                  value={outputs}
                  options={['1', '2', '3', '4']}
                  onValueChange={setOutputs}
                />
                <ParameterSelect
                  label="Safety"
                  value={safety}
                  options={['0', '1', '2', '3', '4', '5', '6']}
                  onValueChange={setSafety}
                />
                <ParameterSelect
                  label="Format"
                  value={outputFormat.toUpperCase()}
                  options={['PNG', 'JPEG', 'WEBP']}
                  onValueChange={(value) =>
                    setOutputFormat(value.toLowerCase() as typeof outputFormat)
                  }
                />
              </div>

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-2.5">
                <CollapsibleTrigger className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  <span>{advancedOpen ? 'Hide advanced' : 'Advanced parameters'}</span>
                  <ChevronDown
                    className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-180')}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="space-y-3 rounded-md border bg-playground-surface-elevated p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-medium">Prompt upsampling</p>
                        <p className="text-[10px] text-muted-foreground">
                          Expand intent before inference
                        </p>
                      </div>
                      <Switch
                        size="sm"
                        checked={promptUpsampling}
                        onCheckedChange={setPromptUpsampling}
                      />
                    </div>
                    <Separator />
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div>
                          <p className="text-[12px] font-medium">Seed</p>
                          <p className="text-[10px] text-muted-foreground">
                            {seed == null
                              ? 'Random on every run'
                              : `Fixed — outputs get seed +0…+${Number(outputs) - 1}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <IconTooltip label="Roll a new fixed seed">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Roll a new fixed seed"
                              onClick={() => setSeed(randomSeed())}
                            >
                              <Dices />
                            </Button>
                          </IconTooltip>
                          {seed != null && (
                            <IconTooltip label="Back to random">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Back to random seed"
                                onClick={() => setSeed(null)}
                              >
                                <X />
                              </Button>
                            </IconTooltip>
                          )}
                        </div>
                      </div>
                      <Input
                        value={seed == null ? '' : String(seed)}
                        onChange={(event) => {
                          const raw = event.target.value.replace(/[^0-9]/g, '');
                          if (!raw) {
                            setSeed(null);
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isSafeInteger(parsed)) setSeed(Math.min(parsed, 2 ** 32 - 1));
                        }}
                        inputMode="numeric"
                        placeholder="Random"
                        className="h-8 bg-background font-mono text-[12px]"
                      />
                    </div>
                    <Separator />
                    {MODEL_CAPS[model].guidance ? (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[12px] font-medium">Guidance</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {guidance.toFixed(1)}
                          </span>
                        </div>
                        <Slider
                          value={[guidance]}
                          min={1.5}
                          max={5}
                          step={0.1}
                          onValueChange={(value) =>
                            Array.isArray(value) && typeof value[0] === 'number' && setGuidance(value[0])
                          }
                        />
                      </div>
                    ) : (
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        Guidance is only exposed by FLUX.2 [flex]; {model} manages it internally, so
                        the control is hidden.
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="border-t bg-playground-surface p-4">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Estimated run</span>
                <span>
                  ~{formatUsd(estimatedCost)} · {outputs} outputs
                </span>
              </div>
              {runMessage && (
                <p
                  className={cn(
                    'mb-2 text-[11px] leading-4',
                    runMessage.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {runMessage.text}
                </p>
              )}
              <Button
                className="h-9 w-full justify-between bg-foreground px-3 text-[13px] text-background hover:bg-foreground/85 hover:text-background"
                onClick={() => void runWorkflow()}
                disabled={isRunning || prompt.trim().length < 3}
              >
                <span className="flex items-center gap-2">
                  {isRunning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  {isRunning ? 'Creating run…' : 'Run workflow'}
                </span>
                <span className="font-mono text-[10px]">⌘ ↵</span>
              </Button>
            </div>
          </aside>

          <section
            ref={canvasRef}
            className="relative min-w-0 overflow-hidden bg-[var(--canvas)]"
          >
            <div className="absolute inset-0 graph-grid opacity-60" />
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-background/90 font-mono text-[10px] backdrop-blur"
              >
                STUDIO WORKFLOW
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {lastRunAt ? `Last run ${formatAge(lastRunAt)}` : 'Draft — not run yet'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="absolute right-4 top-4 z-10 bg-background/90 text-xs backdrop-blur 2xl:hidden"
              onClick={() => setHistoryOpen((value) => !value)}
            >
              <History /> History
            </Button>

            <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
              {edgePaths.promptModel && <path d={edgePaths.promptModel} className="graph-edge" />}
              {edgePaths.modelGenerate && (
                <path
                  d={edgePaths.modelGenerate}
                  className={cn('graph-edge', (isRunning || anyRunActive) && 'graph-edge-active')}
                />
              )}
            </svg>

            {nodes.map((node) => {
              const Icon = node.icon;
              const active = selectedNode === node.id;
              return (
                <button
                  key={node.id}
                  ref={(element) => {
                    nodeRefs.current[node.id] = element;
                  }}
                  onClick={() => setSelectedNode(node.id)}
                  className={cn(
                    surfaceClass,
                    'absolute z-10 w-[21%] min-w-44 max-w-52 p-4 text-left shadow-[var(--floating-shadow)] transition-all hover:-translate-y-0.5',
                    node.position,
                    active && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
                  )}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {node.eyebrow}
                    </span>
                    <span className="grid size-6 place-items-center rounded-md bg-muted">
                      <Icon className="size-3.5" />
                    </span>
                  </div>
                  <p className="text-[15px] font-medium leading-5">{nodeMeta[node.id].title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {nodeMeta[node.id].meta}
                  </p>
                  {node.id !== 'generate' && (
                    <span className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-[var(--brand)]" />
                  )}
                  {node.id !== 'prompt' && (
                    <span className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-border" />
                  )}
                </button>
              );
            })}

            <div className="absolute bottom-4 left-4 z-10 flex items-center rounded-md border bg-background/90 p-1 shadow-xs backdrop-blur">
              <IconTooltip label="Node editing — planned (see roadmap)">
                <Button variant="ghost" size="icon-xs" aria-label="Add node (planned)" disabled>
                  <Plus />
                </Button>
              </IconTooltip>
              <IconTooltip label="Fit workflow — planned (see roadmap)">
                <Button variant="ghost" size="icon-xs" aria-label="Fit workflow (planned)" disabled>
                  <Command />
                </Button>
              </IconTooltip>
              <IconTooltip label="View API payload">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="View API payload"
                  onClick={() => setApiPayloadOpen(true)}
                >
                  <Code2 />
                </Button>
              </IconTooltip>
            </div>
          </section>

          <HistoryPanel
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            items={historyItems}
            state={historyState}
            realtime={realtimeState}
            viewer={Boolean(viewer)}
            highlightId={highlightRunId}
            onRefresh={refreshHistory}
            onOpenRun={setDetailRunId}
            onCopyPrompt={(run) => void copyToClipboard(run.prompt, 'Prompt copied to clipboard.')}
            onReuse={(run) => applyRunToInspector(run)}
          />
        </div>
      </main>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandMenu>
          <CommandInput placeholder="Search commands or recent runs…" />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>
            <CommandGroup heading="Workflow">
              <CommandItem
                onSelect={() => {
                  setSelectedNode('prompt');
                  setCommandOpen(false);
                }}
              >
                <WandSparkles /> Edit prompt
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setSelectedNode('model');
                  setCommandOpen(false);
                }}
              >
                <Box /> Configure model
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false);
                  void runWorkflow();
                }}
              >
                <Play /> Run workflow <CommandShortcut>⌘ ↵</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setApiPayloadOpen(true);
                  setCommandOpen(false);
                }}
              >
                <Code2 /> View API payload
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Workspace">
              <CommandItem
                onSelect={() => {
                  setHistoryOpen(true);
                  setCommandOpen(false);
                }}
              >
                <History /> Open shared history
              </CommandItem>
            </CommandGroup>
            {historyItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent runs">
                  {historyItems.slice(0, 5).map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`run-${item.id} ${item.prompt}`}
                      onSelect={() => {
                        setDetailRunId(item.id);
                        setCommandOpen(false);
                      }}
                    >
                      <SquareStack />
                      <span className="min-w-0 flex-1 truncate">{item.prompt}</span>
                      <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">
                        {item.origin === 'sample' ? 'example' : item.status}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </CommandMenu>
      </CommandDialog>

      <ApiPayloadDialog
        open={apiPayloadOpen}
        onOpenChange={setApiPayloadOpen}
        payload={buildPayload()}
        onCopy={copyToClipboard}
      />

      {detailRun && (
        <RunDetailDialog
          run={detailRun}
          onOpenChange={(open) => {
            if (!open) setDetailRunId(null);
          }}
          onCopy={copyToClipboard}
          onReuse={applyRunToInspector}
          onRerun={rerunFromRun}
        />
      )}
    </TooltipProvider>
  );
}

function IconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children as ReactElement} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function InspectorLabel({ children }: { children: ReactNode }) {
  return <SystemLabel className="mb-2">{children}</SystemLabel>;
}

function ParameterSelect({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onValueChange(next)}>
      <SelectTrigger className={cn(parameterChipClass, 'h-7! w-auto py-0 pr-1.5')}>
        <span className="text-muted-foreground">{label}</span>
        <SelectValue className="font-mono text-foreground" />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AspectParameter({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    aspectOptions.find((option) => option.value === value) ?? aspectOptions[0];
  const selectedGlyph = ratioGlyphSize(selected.width, selected.height);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <ParameterChip label={label} value={value} active={open}>
            <span className="flex h-4 w-6 items-center justify-center">
              <span
                className="rounded-[2px] border border-foreground/40 bg-muted"
                style={selectedGlyph}
              />
            </span>
          </ParameterChip>
        }
      />
      <PopoverContent align="start" side="bottom" className="w-[296px] gap-0 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div>
            <p className="text-[12px] font-medium">Aspect ratio</p>
            <span className="font-mono text-[10px] text-muted-foreground">aspect_ratio</span>
          </div>
          <Badge variant="outline" className="ml-auto h-5 rounded-md font-mono text-[9px]">
            ~1 MP
          </Badge>
        </div>
        <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Sets width and height to matching ~1MP dimensions.
        </p>
        <Select
          value={value}
          onValueChange={(next) => {
            if (!next) return;
            onValueChange(next);
            setOpen(false);
          }}
        >
          <SelectTrigger className="h-7! w-full bg-playground-surface-elevated text-[11px]">
            <SelectValue>
              {selected.value} · {selected.width}×{selected.height}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" side="bottom" className="min-w-60">
            <SelectGroup>
              <SelectLabel>Preset ratios</SelectLabel>
              {aspectOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="py-1.5">
                  <span className="flex h-4 w-6 items-center justify-center">
                    <span
                      className="rounded-[2px] border border-foreground/30 bg-muted"
                      style={ratioGlyphSize(option.width, option.height)}
                    />
                  </span>
                  <span className="font-medium">{option.value}</span>
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                    {option.width}×{option.height}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  );
}

function ratioGlyphSize(width: number, height: number) {
  const maxWidth = 20;
  const maxHeight = 14;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(5, Math.round(width * scale)),
    height: Math.max(5, Math.round(height * scale)),
  };
}

const statusBadgeStyles: Record<string, string> = {
  succeeded: 'border-[var(--success)]/40 text-[var(--success)]',
  running: 'border-amber-500/50 text-amber-600',
  queued: 'border-amber-500/50 text-amber-600',
  partial: 'border-amber-500/60 text-amber-700',
  moderated: 'border-amber-500/60 text-amber-700',
  failed: 'border-destructive/40 text-destructive',
  draft: 'text-muted-foreground',
};

function StatusBadge({ status, origin }: { status: string; origin: string }) {
  const label = origin === 'sample' ? 'example' : status;
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 rounded-md px-1.5 font-mono text-[9px] uppercase',
        origin === 'sample' ? 'text-muted-foreground' : statusBadgeStyles[status],
      )}
    >
      {label}
    </Badge>
  );
}

function OutputCell({
  run,
  outputIndex,
  className,
}: {
  run: HistoryRun;
  outputIndex: number;
  className?: string;
}) {
  const job = run.jobs.find((candidate) => candidate.outputIndex === outputIndex);
  const asset = job
    ? (run.assets.find((candidate) => candidate.jobId === job.id) ?? run.assets[outputIndex])
    : run.assets[outputIndex];
  const jobStatus = job?.status ?? (run.status === 'succeeded' ? 'succeeded' : run.status);
  // Sample runs have no stored assets; show the bundled example imagery.
  const sampleImage =
    run.origin === 'sample'
      ? sampleOutputImages[
          ((Number(run.id.replace(/\D/g, '')) || 0) + outputIndex) % sampleOutputImages.length
        ]
      : null;

  return (
    <div
      className={cn(
        'grid place-items-center overflow-hidden rounded border bg-muted',
        className,
      )}
    >
      {asset ? (
        <NextImage
          src={asset.url}
          alt={`Output ${outputIndex + 1}`}
          width={160}
          height={120}
          unoptimized
          className="size-full object-cover"
        />
      ) : sampleImage ? (
        <NextImage
          src={sampleImage}
          alt="Example generated output"
          width={160}
          height={120}
          className="size-full object-cover"
        />
      ) : jobStatus === 'running' || jobStatus === 'queued' ? (
        <Loader2 className="size-4 animate-spin text-foreground/35" />
      ) : jobStatus === 'moderated' ? (
        <ShieldAlert className="size-4 text-amber-600" />
      ) : jobStatus === 'failed' ? (
        <CircleX className="size-4 text-destructive/70" />
      ) : (
        <ImageIcon className="size-4 text-foreground/35" />
      )}
    </div>
  );
}

function HistoryPanel({
  open,
  onClose,
  items,
  state,
  realtime,
  viewer,
  highlightId,
  onRefresh,
  onOpenRun,
  onCopyPrompt,
  onReuse,
}: {
  open: boolean;
  onClose: () => void;
  items: HistoryRun[];
  state: 'loading' | 'synced' | 'error';
  realtime: 'connecting' | 'live' | 'fallback';
  viewer: boolean;
  highlightId: string | null;
  onRefresh: () => Promise<void>;
  onOpenRun: (id: string) => void;
  onCopyPrompt: (run: HistoryRun) => void;
  onReuse: (run: HistoryRun) => void;
}) {
  const [filter, setFilter] = useState('all');
  const visibleItems = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'running') return ['running', 'queued'].includes(item.status);
    if (filter === 'attention') return ['failed', 'partial', 'moderated'].includes(item.status);
    if (filter === 'sample') return item.origin === 'sample';
    return item.status === filter;
  });
  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col border-l bg-background max-2xl:absolute max-2xl:bottom-0 max-2xl:right-0 max-2xl:top-[var(--app-header-height)] max-2xl:z-30 max-2xl:w-[var(--app-history-width)] max-2xl:shadow-2xl',
        open ? 'max-2xl:flex' : 'max-2xl:hidden',
        '2xl:flex',
      )}
    >
      <div className="flex h-[var(--app-header-height)] shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <History className="size-3.5" />
          <span className="text-[13px] font-medium">Shared history</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-1 font-mono text-[10px]',
              !viewer
                ? 'text-muted-foreground'
                : state === 'error'
                  ? 'text-destructive'
                  : 'text-[var(--success)]',
            )}
          >
            <Cloud className="size-3" />{' '}
            {!viewer ? 'SAMPLES' : state === 'synced' ? 'SYNCED' : state === 'error' ? 'OFFLINE' : 'SYNCING'}
          </span>
          <Button
            className="2xl:hidden"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close history"
          >
            <ArrowRight />
          </Button>
        </div>
      </div>

      <div className="border-b px-4 py-2.5">
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
          <Cloud className="size-3.5" />
          {viewer
            ? `Synced to Studio workspace · ${
                realtime === 'live'
                  ? 'WebSocket'
                  : realtime === 'fallback'
                    ? '15s fallback'
                    : 'connecting'
              }`
            : 'Sample data — sign in to run and sync generations.'}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <SystemLabel>Recent runs</SystemLabel>
          <div className="flex items-center gap-1">
            <Select value={filter} onValueChange={(next) => next && setFilter(next)}>
              <SelectTrigger
                size="sm"
                className="h-6! w-[110px] border-0 bg-transparent px-1.5 text-[10px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All runs</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="attention">Needs attention</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
                <SelectItem value="sample">Examples</SelectItem>
              </SelectContent>
            </Select>
            <IconTooltip label="Refresh history">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void onRefresh()}
                aria-label="Refresh history"
              >
                <RefreshCw className={cn(state === 'loading' && 'animate-spin')} />
              </Button>
            </IconTooltip>
          </div>
        </div>
        <div className="space-y-2.5">
          {items.length === 0 && state === 'loading' && (
            <div className="grid min-h-36 place-items-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Loading shared runs…
              </span>
            </div>
          )}
          {items.length === 0 && state === 'error' && (
            <div className="rounded-lg border border-dashed p-4 text-[11px] leading-relaxed text-muted-foreground">
              Shared history could not connect. The canvas still works locally; retry when the
              server is available.
            </div>
          )}
          {items.length === 0 && state === 'synced' && (
            <div className="rounded-lg border border-dashed p-4 text-[11px] leading-relaxed text-muted-foreground">
              No runs yet. Describe an image in the inspector and press{' '}
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘ ↵</kbd> to create
              your first shared generation.
            </div>
          )}
          {items.length > 0 && visibleItems.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-[11px] leading-relaxed text-muted-foreground">
              No runs match this filter.
            </div>
          )}
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className={cn(
                surfaceClass,
                'relative bg-playground-surface p-3 transition-colors hover:border-foreground/25 focus-within:border-foreground/25',
                highlightId === item.id && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
              )}
            >
              <button
                type="button"
                aria-label={`Open run: ${item.prompt.slice(0, 80)}`}
                onClick={() => onOpenRun(item.id)}
                className="absolute inset-0 z-0 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <div className="pointer-events-none relative z-10">
              <div className="mb-2 flex gap-1">
                {Array.from({ length: Math.min(4, item.outputCount) }, (_, outputIndex) => (
                  <OutputCell
                    key={outputIndex}
                    run={item}
                    outputIndex={outputIndex}
                    className="h-14 flex-1"
                  />
                ))}
              </div>
              <p className="line-clamp-2 text-[12px] font-medium leading-[17px]">{item.prompt}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <span>{item.modelId}</span>
                <span>·</span>
                <span>{item.outputCount} outputs</span>
                <span>·</span>
                <span>{formatCost(item.costCredits)}</span>
                {typeof item.parameters.seed === 'number' && (
                  <>
                    <span>·</span>
                    <span>seed {item.parameters.seed}</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {formatAge(item.createdAt)}
                </span>
                <div className="pointer-events-auto flex items-center gap-1">
                  <StatusBadge status={item.status} origin={item.origin} />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-xs" aria-label="Run actions" />}
                    >
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onOpenRun(item.id)}>
                        <ImageIcon /> Open run
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onCopyPrompt(item)}>
                        <Copy /> Copy prompt
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onReuse(item)}>
                        <SquareStack /> Reuse parameters
                      </DropdownMenuItem>
                      {item.assets.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          {item.assets.map((asset, assetIndex) => (
                            <DropdownMenuItem
                              key={asset.id}
                              render={
                                <a
                                  href={asset.url}
                                  download={`branchline-${item.id.slice(0, 8)}-${assetIndex + 1}`}
                                  aria-label={`Download output ${assetIndex + 1}`}
                                >
                                  <Download /> Download output {assetIndex + 1}
                                </a>
                              }
                            />
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {item.errorMessage && item.origin !== 'sample' && (
                <p
                  className={cn(
                    'mt-2 rounded px-2 py-1.5 text-[10px] leading-relaxed',
                    item.status === 'moderated' || item.status === 'partial'
                      ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {item.errorMessage}
                </p>
              )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ApiPayloadDialog({
  open,
  onOpenChange,
  payload,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: RunPayload;
  onCopy: (text: string, note: string) => Promise<void>;
}) {
  const body = buildBflBody(payload);
  const json = JSON.stringify(body, null, 2);
  const curl = buildCurl(payload);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>API payload</DialogTitle>
          <DialogDescription>
            The exact request Branchline submits to{' '}
            <span className="font-mono text-[11px]">
              api.bfl.ai/v1/{BFL_ENDPOINTS[payload.model]}
            </span>
            {payload.outputs > 1 &&
              ` — sent once per output${payload.seed != null ? ', with seed +0…+' + (payload.outputs - 1) : ''}`}
            .
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {json}
        </pre>
        <div className="flex flex-wrap gap-2">
          <CopyButton
            label="Copy JSON"
            onCopy={() => onCopy(json, 'Request JSON copied to clipboard.')}
          />
          <CopyButton
            label="Copy as curl"
            onCopy={() => onCopy(curl, 'curl command copied to clipboard.')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RunDetailDialog({
  run,
  onOpenChange,
  onCopy,
  onReuse,
  onRerun,
}: {
  run: HistoryRun;
  onOpenChange: (open: boolean) => void;
  onCopy: (text: string, note: string) => Promise<void>;
  onReuse: (run: HistoryRun) => void;
  onRerun: (run: HistoryRun, options?: { varySeed?: boolean; safetyBump?: boolean }) => void;
}) {
  const payload = payloadFromRun(run);
  const isSample = run.origin === 'sample';
  const gridColumns = run.outputCount > 1 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} origin={run.origin} />
            <span className="font-mono text-[11px] text-muted-foreground">{run.modelId}</span>
            <span className="text-[11px] text-muted-foreground">· {formatAge(run.createdAt)}</span>
          </div>
          <DialogTitle className="text-left text-[14px] font-medium leading-5">
            {run.prompt}
          </DialogTitle>
        </DialogHeader>

        <div className={cn('grid gap-2', gridColumns)}>
          {Array.from({ length: run.outputCount }, (_, outputIndex) => {
            const job = run.jobs.find((candidate) => candidate.outputIndex === outputIndex);
            const asset = job
              ? (run.assets.find((candidate) => candidate.jobId === job.id) ??
                run.assets[outputIndex])
              : run.assets[outputIndex];
            return (
              <div key={outputIndex} className="space-y-1">
                <OutputCell run={run} outputIndex={outputIndex} className="min-h-32 w-full" />
                <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                  <span>
                    #{outputIndex + 1}
                    {payload.seed != null && ` · seed ${(payload.seed + outputIndex) % 2 ** 32}`}
                  </span>
                  {asset && (
                    <a
                      href={asset.url}
                      download={`branchline-${run.id.slice(0, 8)}-${outputIndex + 1}`}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <Download className="size-3" /> Download
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {isSample && (
          <p className="text-[11px] text-muted-foreground">
            Example run — outputs were not stored for samples.
          </p>
        )}

        {run.errorMessage && !isSample && (
          <div
            className={cn(
              'space-y-2 rounded-md border p-3 text-[12px] leading-relaxed',
              run.status === 'moderated' || run.status === 'partial'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                : 'border-destructive/30 bg-destructive/5 text-destructive',
            )}
          >
            <p>{run.errorMessage}</p>
            <div className="flex flex-wrap gap-2">
              {run.status === 'moderated' || run.status === 'partial' ? (
                <Button variant="outline" size="xs" onClick={() => onRerun(run, { safetyBump: true })}>
                  <RotateCcw /> Retry at safety +1
                </Button>
              ) : (
                <Button variant="outline" size="xs" onClick={() => onRerun(run)}>
                  <RotateCcw /> Re-run
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
          <ReceiptRow label="Model" value={run.modelId} />
          <ReceiptRow label="Size" value={`${payload.width}×${payload.height}`} />
          <ReceiptRow label="Format" value={payload.outputFormat.toUpperCase()} />
          <ReceiptRow
            label="Seed"
            value={payload.seed == null ? 'Random' : `${payload.seed} (+i per output)`}
          />
          <ReceiptRow
            label="Guidance"
            value={payload.guidance == null ? '—' : payload.guidance.toFixed(1)}
          />
          <ReceiptRow label="Safety" value={String(payload.safetyTolerance)} />
          <ReceiptRow label="Upsampling" value={payload.promptUpsampling ? 'On' : 'Off'} />
          <ReceiptRow label="Outputs" value={String(run.outputCount)} />
          <ReceiptRow label="Cost" value={formatCost(run.costCredits)} />
          {run.latencyMs != null && (
            <ReceiptRow label="Observed time" value={`${(run.latencyMs / 1000).toFixed(1)}s`} />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton
            label="Copy prompt"
            onCopy={() => onCopy(run.prompt, 'Prompt copied to clipboard.')}
          />
          <CopyButton
            label="Copy JSON"
            onCopy={() =>
              onCopy(JSON.stringify(buildBflBody(payload), null, 2), 'Request JSON copied.')
            }
          />
          <CopyButton
            label="Copy as curl"
            onCopy={() => onCopy(buildCurl(payload), 'curl command copied.')}
          />
          <Button variant="outline" size="xs" onClick={() => onReuse(run)}>
            <SquareStack /> Reuse parameters
          </Button>
          {payload.seed != null && (
            <Button variant="outline" size="xs" onClick={() => onRerun(run)}>
              <RotateCcw /> Re-run same seed
            </Button>
          )}
          <Button variant="outline" size="xs" onClick={() => onRerun(run, { varySeed: true })}>
            <Dices /> Vary seed & run
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-[12px] font-medium">{value}</p>
    </div>
  );
}

function CopyButton({ label, onCopy }: { label: string; onCopy: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => {
        void onCopy().then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        });
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? 'Copied' : label}
    </Button>
  );
}

function formatAge(timestamp: number) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  if (hours < 48) return 'Yesterday';
  return `${Math.round(hours / 24)} days ago`;
}

// costCredits stores BFL-reported credits; 1 credit = $0.01.
function formatCost(credits: string | null) {
  if (!credits) return '—';
  const value = Number(credits);
  return Number.isFinite(value) ? `$${(value / 100).toFixed(2)}` : '—';
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
