'use client';

import NextImage from 'next/image';
import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Box,
  ChevronDown,
  Cloud,
  Code2,
  Command,
  Copy,
  Download,
  Ellipsis,
  History,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  RefreshCw,
  Save,
  Share2,
  Shuffle,
  SquareStack,
  Star,
  WandSparkles,
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';

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

const nodes: Array<{
  id: NodeId;
  eyebrow: string;
  title: string;
  meta: string;
  icon: typeof WandSparkles;
  position: string;
}> = [
  {
    id: 'prompt',
    eyebrow: 'INPUT',
    title: 'Product portrait',
    meta: '2 references · 1,284 chars',
    icon: WandSparkles,
    position: 'left-[8%] top-[19%]',
  },
  {
    id: 'model',
    eyebrow: 'MODEL',
    title: 'FLUX.2 [max]',
    meta: '4:3 · 2 outputs · $0.38',
    icon: Box,
    position: 'left-[40%] top-[42%]',
  },
  {
    id: 'generate',
    eyebrow: 'ACTION',
    title: 'Generate',
    meta: 'Ready to run',
    icon: Play,
    position: 'right-[7%] top-[22%]',
  },
];

type HistoryRun = {
  id: string;
  status: string;
  origin: string;
  modelId: string;
  prompt: string;
  outputCount: number;
  costCredits: string | null;
  errorMessage: string | null;
  createdAt: number;
  assets: Array<{ id: string; url: string }>;
};

const fallbackHistory: HistoryRun[] = [
  [
    'sample-0',
    'Soft industrial product portrait on warm mineral paper',
    'FLUX.2 [max]',
    2,
    18,
  ],
  [
    'sample-1',
    'Retro-futurist desktop machine, quiet studio light',
    'FLUX.2 [max]',
    2,
    1_440,
  ],
  [
    'sample-2',
    'Compact field recorder with tactile orange controls',
    'FLUX.2 [pro]',
    4,
    1_560,
  ],
  [
    'sample-3',
    'Brutalist perfume bottle with smoked glass and sharp caustics',
    'FLUX.2 [flex]',
    2,
    2_940,
  ],
  [
    'sample-4',
    'Wayfinding icons for an alpine research station',
    'FLUX.2 [klein]',
    4,
    4_320,
  ],
  [
    'sample-5',
    'Editorial still life in moss green, chalk and anodized aluminum',
    'FLUX.2 [pro]',
    2,
    5_760,
  ],
  [
    'sample-6',
    'Modular field camera photographed as an archival artifact',
    'FLUX.2 [max]',
    2,
    7_200,
  ],
  [
    'sample-7',
    'Folded-paper terrain system with embossed contour labels',
    'FLUX.2 [flex]',
    3,
    10_080,
  ],
].map(([id, prompt, modelId, outputCount, ageMinutes]) => ({
  id: String(id),
  status: 'succeeded',
  origin: 'sample',
  modelId: String(modelId),
  prompt: String(prompt),
  outputCount: Number(outputCount),
  costCredits: String(modelId).includes('max') ? '38' : '24',
  errorMessage: null,
  createdAt: Date.now() - Number(ageMinutes) * 60_000,
  assets: [],
}));

const inspectorCopy: Record<
  NodeId,
  { label: string; title: string; description: string }
> = {
  prompt: {
    label: 'Prompt node',
    title: 'Product portrait',
    description: 'Defines the creative direction and reference media.',
  },
  model: {
    label: 'Model node',
    title: 'FLUX.2 [max]',
    description: 'Maps model capabilities into validated controls.',
  },
  generate: {
    label: 'Action node',
    title: 'Generate',
    description: 'Creates a durable run and streams status to the history.',
  },
};

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
  const [historyItems, setHistoryItems] = useState<HistoryRun[]>(
    viewer ? [] : fallbackHistory,
  );
  const [historyState, setHistoryState] = useState<
    'loading' | 'synced' | 'error'
  >(viewer ? 'loading' : 'error');
  const [realtimeState, setRealtimeState] = useState<
    'connecting' | 'live' | 'fallback'
  >(viewer ? 'connecting' : 'fallback');
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [model, setModel] =
    useState<(typeof modelOptions)[number]['value']>('FLUX.2 [max]');
  const [aspect, setAspect] =
    useState<(typeof aspectOptions)[number]['value']>('4:3');
  const [outputs, setOutputs] = useState('2');
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg' | 'webp'>(
    'png',
  );
  const [safety, setSafety] = useState('2');
  const [promptUpsampling, setPromptUpsampling] = useState(true);
  const [seedMode, setSeedMode] = useState<'random' | 'fixed'>('random');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const dimensions =
    aspectOptions.find((option) => option.value === aspect) ?? aspectOptions[1];
  const selected = inspectorCopy[selectedNode];

  const refreshHistory = useCallback(async () => {
    if (!viewer) return;
    try {
      const response = await fetch('/api/history', { cache: 'no-store' });
      if (!response.ok) throw new Error('History is unavailable');
      const data = (await response.json()) as { runs: HistoryRun[] };
      setHistoryItems(data.runs);
      setHistoryState('synced');
    } catch {
      setHistoryItems((current) =>
        current.length ? current : fallbackHistory,
      );
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
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/realtime`,
      );
      socket.onopen = () => setRealtimeState('live');
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
    const fallbackRefresh = window.setInterval(
      () => void refreshHistory(),
      15_000,
    );
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
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pollRun = (id: string) => {
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      const response = await fetch(
        `/api/generations/${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        if (attempts >= 120) window.clearInterval(timer);
        return;
      }
      const data = (await response.json()) as { run: HistoryRun | null };
      await refreshHistory();
      if (
        !data.run ||
        !['queued', 'running'].includes(data.run.status) ||
        attempts >= 120
      ) {
        window.clearInterval(timer);
      }
    }, 2_500);
  };

  const runWorkflow = async () => {
    setIsRunning(true);
    setRunMessage(null);
    try {
      const response = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model,
          width: dimensions.width,
          height: dimensions.height,
          outputs: Number(outputs),
          outputFormat,
          safetyTolerance: Number(safety),
          promptUpsampling,
          seed: seedMode === 'fixed' ? 112358 : null,
        }),
      });
      const data = (await response.json()) as {
        id?: string;
        mode?: string;
        error?: string;
      };
      if (!response.ok || !data.id)
        throw new Error(data.error || 'Could not create the run.');
      await refreshHistory();
      setRunMessage(
        data.mode === 'preview'
          ? 'Shared draft saved. Add BFL_API_KEY to enable live output.'
          : 'Live generation started. Results will appear here automatically.',
      );
      if (data.mode === 'live') pollRun(data.id);
    } catch (error) {
      setRunMessage(
        error instanceof Error ? error.message : 'Could not create the run.',
      );
    } finally {
      setIsRunning(false);
    }
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
              <span className="min-w-0 flex-1 truncate">
                Type command or search…
              </span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                ⌘ K
              </kbd>
            </button>
          }
          end={
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                <Cloud
                  className={cn(
                    'size-3.5',
                    realtimeState === 'fallback'
                      ? 'text-amber-600'
                      : 'text-[var(--success)]',
                  )}
                />
                <span>
                  {realtimeState === 'live'
                    ? 'Realtime connected'
                    : realtimeState === 'fallback'
                      ? 'Polling fallback'
                      : 'Connecting realtime…'}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Workspace settings"
                    />
                  }
                >
                  <Settings2 />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Studio workspace</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem checked>
                    Shared history
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={promptUpsampling}
                    onCheckedChange={setPromptUpsampling}
                  >
                    Prompt upsampling
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Share2 /> Share workflow
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Download /> Export JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {viewer ? (
                <Tooltip>
                  <TooltipTrigger className="grid size-7 place-items-center rounded-full bg-[#ead9cc] font-mono text-[10px]">
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
                    className: 'h-7 text-[10px]',
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
                <p className="mt-0.5 text-[13px] font-medium leading-4">
                  {selected.title}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More node settings"
              >
                <SlidersHorizontal />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <InspectorLabel>Model</InspectorLabel>
              <Select
                value={model}
                onValueChange={(value) => setModel(value as typeof model)}
              >
                <SelectTrigger className="mb-4 h-9! w-full bg-playground-surface-elevated text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectLabel>Image generation</SelectLabel>
                    {modelOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="py-2"
                      >
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
                <span className="absolute bottom-2 right-2 font-mono text-[9px] text-muted-foreground">
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

              <Collapsible
                open={advancedOpen}
                onOpenChange={setAdvancedOpen}
                className="mt-2.5"
              >
                <CollapsibleTrigger className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  <span>{advancedOpen ? 'Hide advanced' : '+3 advanced'}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform',
                      advancedOpen && 'rotate-180',
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="space-y-3 rounded-md border bg-playground-surface-elevated p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-medium">
                          Prompt upsampling
                        </p>
                        <p className="text-[9px] text-muted-foreground">
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
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-medium">Seed</p>
                        <p className="text-[9px] text-muted-foreground">
                          {seedMode === 'random'
                            ? 'Random on every run'
                            : 'Fixed · 112358'}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setSeedMode((value) =>
                            value === 'random' ? 'fixed' : 'random',
                          )
                        }
                        className="flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[9px] hover:bg-accent"
                      >
                        <Shuffle className="size-3" /> {seedMode}
                      </button>
                    </div>
                    <Separator />
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium">
                          Guidance
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground">
                          3.5
                        </span>
                      </div>
                      <Slider
                        defaultValue={[3.5]}
                        min={1.5}
                        max={5}
                        step={0.1}
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="border-t bg-playground-surface p-4">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Estimated run</span>
                <span>
                  {model.includes('max') ? '$0.14+' : '$0.06+'} · {outputs}{' '}
                  outputs
                </span>
              </div>
              {runMessage && (
                <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
                  {runMessage}
                </p>
              )}
              <Button
                className="h-9 w-full justify-between bg-foreground px-3 text-[13px] text-background hover:bg-foreground/85 hover:text-background"
                onClick={runWorkflow}
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

          <section className="relative min-w-0 overflow-hidden bg-[var(--canvas)]">
            <div className="absolute inset-0 graph-grid opacity-60" />
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-background/90 font-mono text-[9px] backdrop-blur"
              >
                PRODUCT PORTRAIT / V3
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                Saved 12 sec ago
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

            <svg
              className="pointer-events-none absolute inset-0 size-full"
              viewBox="0 0 1000 700"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M 290 184 C 355 184, 350 342, 400 342"
                className="graph-edge"
              />
              <path
                d="M 610 342 C 670 342, 665 202, 720 202"
                className="graph-edge graph-edge-active"
              />
            </svg>

            {nodes.map((node) => {
              const Icon = node.icon;
              const active = selectedNode === node.id;
              const nodeTitle = node.id === 'model' ? model : node.title;
              const nodeMeta =
                node.id === 'model'
                  ? `${aspect} · ${outputs} outputs · ${outputFormat.toUpperCase()}`
                  : node.id === 'prompt'
                    ? `${promptUpsampling ? 'Upsampling on' : 'Raw prompt'} · ${prompt.length.toLocaleString()} chars`
                    : isRunning
                      ? 'Creating shared run…'
                      : 'Ready to run';
              return (
                <button
                  key={node.id}
                  onClick={() => setSelectedNode(node.id)}
                  className={cn(
                    surfaceClass,
                    'absolute z-10 w-[21%] min-w-44 max-w-52 p-4 text-left shadow-[var(--floating-shadow)] transition-all hover:-translate-y-0.5',
                    node.position,
                    active &&
                      'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
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
                  <p className="text-[15px] font-medium leading-5">
                    {nodeTitle}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {nodeMeta}
                  </p>
                  <span className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-[var(--brand)]" />
                </button>
              );
            })}

            <div className="absolute bottom-4 left-4 z-10 flex items-center rounded-md border bg-background/90 p-1 shadow-xs backdrop-blur">
              <IconTooltip label="Add node">
                <Button variant="ghost" size="icon-xs" aria-label="Add node">
                  <Plus />
                </Button>
              </IconTooltip>
              <IconTooltip label="Fit workflow">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Fit workflow"
                >
                  <Command />
                </Button>
              </IconTooltip>
              <IconTooltip label="View API payload">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="View API payload"
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
            onRefresh={refreshHistory}
          />
        </div>
      </main>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandMenu>
          <CommandInput placeholder="Search commands, nodes, or runs…" />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>
            <CommandGroup heading="Workflow">
              <CommandItem
                onSelect={() => {
                  setSelectedNode('prompt');
                  setCommandOpen(false);
                }}
              >
                <WandSparkles /> Edit prompt{' '}
                <CommandShortcut>G P</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setSelectedNode('model');
                  setCommandOpen(false);
                }}
              >
                <Box /> Configure model <CommandShortcut>G M</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  void runWorkflow();
                  setCommandOpen(false);
                }}
              >
                <Play /> Run workflow <CommandShortcut>⌘ ↵</CommandShortcut>
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
              <CommandItem>
                <Save /> Save as preset
              </CommandItem>
              <CommandItem>
                <Copy /> Duplicate workflow
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandMenu>
      </CommandDialog>
    </TooltipProvider>
  );
}

function IconTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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
      <SelectTrigger className={cn(parameterChipClass, 'w-auto py-0 pr-1.5')}>
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
    <>
      <ParameterChip
        label={label}
        value={value}
        active={open}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex h-4 w-6 items-center justify-center">
          <span
            className="rounded-[2px] border border-foreground/40 bg-muted"
            style={selectedGlyph}
          />
        </span>
      </ParameterChip>
      {open && (
        <div className="order-10 mt-1 w-full rounded-md border border-border bg-playground-surface-elevated p-3 shadow-xs">
          <div className="mb-2 flex items-center gap-2">
            <div>
              <p className="text-[12px] font-medium">Aspect ratio</p>
              <span className="font-mono text-[10px] text-muted-foreground">
                aspect_ratio
              </span>
            </div>
            <Badge
              variant="outline"
              className="ml-auto h-5 rounded-md font-mono text-[9px]"
            >
              ~1 MP
            </Badge>
          </div>
          <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Sets width and height to matching ~1MP dimensions; fine-tune under
            Advanced.
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
            <SelectContent align="start" className="min-w-60">
              <SelectGroup>
                <SelectLabel>Preset ratios</SelectLabel>
                {aspectOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="py-1.5"
                  >
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
        </div>
      )}
    </>
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

function HistoryPanel({
  open,
  onClose,
  items,
  state,
  realtime,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  items: HistoryRun[];
  state: 'loading' | 'synced' | 'error';
  realtime: 'connecting' | 'live' | 'fallback';
  onRefresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState('all');
  const visibleItems =
    filter === 'all'
      ? items
      : items.filter(
          (item) => item.status === filter || item.origin === filter,
        );
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
              state === 'error' ? 'text-destructive' : 'text-[var(--success)]',
            )}
          >
            <Cloud className="size-3" />{' '}
            {state === 'synced'
              ? 'SYNCED'
              : state === 'error'
                ? 'OFFLINE'
                : 'SYNCING'}
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
          Synced to Studio workspace ·{' '}
          {realtime === 'live'
            ? 'WebSocket'
            : realtime === 'fallback'
              ? '15s fallback'
              : 'connecting'}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <SystemLabel>Recent runs</SystemLabel>
          <div className="flex items-center gap-1">
            <Select
              value={filter}
              onValueChange={(next) => next && setFilter(next)}
            >
              <SelectTrigger
                size="sm"
                className="h-6! w-[86px] border-0 bg-transparent px-1.5 text-[10px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All runs</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
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
                <RefreshCw
                  className={cn(state === 'loading' && 'animate-spin')}
                />
              </Button>
            </IconTooltip>
          </div>
        </div>
        <div className="space-y-2.5">
          {items.length === 0 && state === 'loading' && (
            <div className="grid min-h-36 place-items-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Loading shared
                runs…
              </span>
            </div>
          )}
          {items.length === 0 && state === 'error' && (
            <div className="rounded-lg border border-dashed p-4 text-[11px] leading-relaxed text-muted-foreground">
              Shared history could not connect. The canvas still works locally;
              retry when the server is available.
            </div>
          )}
          {visibleItems.map((item, itemIndex) => (
            <article
              key={item.id}
              className={cn(
                surfaceClass,
                'bg-playground-surface p-3 transition-colors hover:border-foreground/25',
              )}
            >
              <div className="flex gap-2.5">
                <div className="flex shrink-0 gap-1">
                  {Array.from(
                    { length: Math.min(2, item.outputCount) },
                    (_, preview) => (
                      <div
                        key={preview}
                        className={cn(
                          'grid h-10 w-12 place-items-center overflow-hidden rounded border',
                          ['bg-[#ebe7dd]', 'bg-[#e1e9e5]', 'bg-[#e5e4ec]'][
                            itemIndex % 3
                          ],
                        )}
                      >
                        {item.assets[preview] ? (
                          <NextImage
                            src={item.assets[preview].url}
                            alt="Generated output"
                            width={48}
                            height={40}
                            unoptimized
                            className="size-full object-cover"
                          />
                        ) : item.status === 'running' ||
                          item.status === 'queued' ? (
                          <Loader2 className="size-4 animate-spin text-foreground/35" />
                        ) : (
                          <ImageIcon className="size-4 text-foreground/35" />
                        )}
                      </div>
                    ),
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12px] font-medium leading-[17px]">
                    {item.prompt}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    <span>{item.modelId}</span>
                    <span>·</span>
                    <span>{item.outputCount} outputs</span>
                    <span>·</span>
                    <span>{formatCost(item.costCredits)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {formatAge(item.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  <Badge
                    variant="outline"
                    className="h-5 rounded-md px-1.5 font-mono text-[8px] uppercase"
                  >
                    {item.origin === 'sample' ? 'example' : item.status}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Run actions"
                        />
                      }
                    >
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem>
                        <Star /> Favorite
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy /> Copy prompt
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <SquareStack /> Duplicate run
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Download /> Download outputs
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {item.errorMessage && item.origin !== 'sample' && (
                <p className="mt-2 rounded bg-muted px-2 py-1.5 text-[9px] leading-relaxed text-muted-foreground">
                  {item.errorMessage}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </aside>
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
