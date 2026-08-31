'use client';

import Link from 'next/link';
import NextImage from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Aperture,
  ArrowRight,
  Box,
  Camera,
  Check,
  ChevronDown,
  CircleX,
  Clapperboard,
  Cloud,
  Code2,
  Copy,
  Dices,
  Download,
  Ellipsis,
  History,
  GitBranch,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  SquareStack,
  SunMedium,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  ParameterChip,
  ProductHeader,
  ProductRail,
  SystemLabel,
  ThemeToggle,
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
  { id: 'prompt', eyebrow: 'STORY BEAT', icon: WandSparkles, position: 'left-[3%] top-[10%]' },
  { id: 'model', eyebrow: 'VISUAL GRAMMAR', icon: Box, position: 'left-[39.5%] top-[10%]' },
  { id: 'generate', eyebrow: 'MASTER FRAME', icon: Play, position: 'right-[3%] top-[10%]' },
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

type BranchRequest = {
  parentRunId: string;
  parentAssetId: string;
  variationType: FrameLayerType;
  variationLabel: string;
  variationPrompt: string;
};

type FrameLayerType = 'camera' | 'lens' | 'light' | 'color' | 'refine';

const FRAME_LAYER_META: Record<
  FrameLayerType,
  { label: string; description: string; icon: typeof Camera }
> = {
  camera: {
    label: 'Camera',
    description: 'Position, height, angle and blocking.',
    icon: Camera,
  },
  lens: {
    label: 'Lens',
    description: 'Focal length, glass character and depth.',
    icon: Aperture,
  },
  light: {
    label: 'Light',
    description: 'Motivation, ratio, colour and atmosphere.',
    icon: SunMedium,
  },
  color: {
    label: 'Color',
    description: 'Palette, contrast curve and color separation.',
    icon: Palette,
  },
  refine: {
    label: 'Polish',
    description: 'A final material or production-design pass.',
    icon: WandSparkles,
  },
};

const FRAME_LAYER_PRESETS: Record<
  FrameLayerType,
  Array<{ label: string; prompt: string }>
> = {
  camera: [
    {
      label: 'Low three-quarter',
      prompt:
        'Move the camera to a low three-quarter position at threshold height. Preserve every subject and set element while making foreground depth more dramatic.',
    },
    {
      label: 'Strict overhead',
      prompt:
        'Move to a strict overhead composition. Preserve the story action, spatial geography, production design and light direction.',
    },
  ],
  lens: [
    {
      label: 'Cooke S4 · 40 mm',
      prompt:
        'Photograph through a Cooke S4 40 mm lens: gentle warmth, rounded falloff, soft highlight roll-off and dimensional but natural perspective.',
    },
    {
      label: 'Zeiss Super Speed · 85 mm',
      prompt:
        'Photograph through a Zeiss Super Speed 85 mm lens wide open: compressed depth, crisp centre, soft edge falloff and subtle vintage halation.',
    },
  ],
  light: [
    {
      label: 'Tungsten practical',
      prompt:
        'Motivate the key from one tungsten practical in frame. Keep deep negative fill, warm skin-side highlights and a cool ambient background.',
    },
    {
      label: 'Blue-hour ambient',
      prompt:
        'Shift the ambient exposure to blue hour with soft cyan skylight, restrained warm practicals and dense, readable shadow detail.',
    },
  ],
  color: [
    {
      label: 'Warm mineral',
      prompt:
        'Grade toward warm mineral amber, tobacco brown and dense neutral black. Keep skin natural and protect the candle highlight from clipping.',
    },
    {
      label: 'Cyan / amber split',
      prompt:
        'Use restrained cyan shadows and amber practical highlights with clean neutral skin, readable blacks and no artificial teal-orange saturation.',
    },
  ],
  refine: [
    {
      label: 'Material fidelity',
      prompt:
        'Increase material specificity and micro-detail without changing composition: believable wood grain, worn metal, fabric texture and controlled film grain.',
    },
    {
      label: 'Production polish',
      prompt:
        'Polish the frame for final production: remove incidental visual noise, strengthen the focal hierarchy and preserve natural photographic texture.',
    },
  ],
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

function FrameBranchCard({
  eyebrow,
  label,
  note,
  image,
  run,
  icon: Icon,
  actionLabel,
  disabled,
  onAction,
  onOpen,
}: {
  eyebrow: string;
  label: string;
  note: string;
  image: string;
  run: HistoryRun | null;
  icon: typeof Camera;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
  onOpen?: () => void;
}) {
  const asset = run?.assets[0];
  const inFlight = run && ['queued', 'running'].includes(run.status);
  return (
    <article
      className={cn(
        'group overflow-hidden rounded-lg border bg-background shadow-xs transition-colors',
        run && 'border-foreground/25',
      )}
    >
      <button
        type="button"
        onClick={run && onOpen ? onOpen : onAction}
        className="relative block aspect-[2.13/1] w-full overflow-hidden bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <NextImage
          src={asset?.url ?? image}
          alt=""
          fill
          unoptimized
          className={cn('object-cover transition-transform duration-300 group-hover:scale-[1.02]', !asset && 'opacity-65')}
        />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-5 font-mono text-[8px] uppercase tracking-wider text-white/90">
          {run ? (inFlight ? run.status : 'generated branch') : 'planned branch'}
        </span>
      </button>
      <div className="p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </span>
          <Icon className="size-3 text-muted-foreground" />
        </div>
        <p className="mt-0.5 truncate text-[11px] font-medium">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-[9px] leading-3.5 text-muted-foreground">{note}</p>
        {!run && (
          <Button
            variant="ghost"
            size="xs"
            className="mt-1.5 w-full justify-start px-1.5"
            onClick={onAction}
            disabled={disabled}
          >
            <Plus /> {actionLabel}
          </Button>
        )}
      </div>
    </article>
  );
}

type RecipeLayer = {
  type: FrameLayerType | 'base';
  label: string;
  value: string;
  inherited?: boolean;
};

type FrameCanvasState = 'empty' | 'base' | 'one-branch' | 'branching';
type RecipeNodeId = 'base' | 'cooke' | 'cooke-light' | 'zeiss' | 'zeiss-light';

const FRAME_CANVAS_STATES: Array<{
  value: FrameCanvasState;
  label: string;
  nodeCount: number;
  description: string;
}> = [
  {
    value: 'empty',
    label: 'Empty canvas',
    nodeCount: 0,
    description: 'Start by defining and rendering one root frame.',
  },
  {
    value: 'base',
    label: 'Base only',
    nodeCount: 1,
    description: 'The root can still be replaced because it has no descendants.',
  },
  {
    value: 'one-branch',
    label: 'One branch',
    nodeCount: 2,
    description: 'The root is locked; continue from either selected node.',
  },
  {
    value: 'branching',
    label: 'Branching',
    nodeCount: 5,
    description: 'Compare independent optical paths and keep extending approved decisions.',
  },
];

const FRAME_RECIPE_CONTEXT: Record<
  RecipeNodeId,
  { label: string; eyebrow: string; nextType: FrameLayerType; childCount: number }
> = {
  base: { label: 'Clockmaker at work', eyebrow: 'Root frame', nextType: 'lens', childCount: 2 },
  cooke: { label: 'Cooke S4 · 40 mm', eyebrow: 'Lens branch A', nextType: 'light', childCount: 1 },
  'cooke-light': {
    label: 'Tungsten practical',
    eyebrow: 'Light iteration',
    nextType: 'refine',
    childCount: 0,
  },
  zeiss: {
    label: 'Zeiss Super Speed · 85 mm',
    eyebrow: 'Lens branch B',
    nextType: 'light',
    childCount: 1,
  },
  'zeiss-light': {
    label: 'Blue-hour ambient',
    eyebrow: 'Light iteration',
    nextType: 'refine',
    childCount: 0,
  },
};

function RecipeLayerIcon({ type }: { type: RecipeLayer['type'] }) {
  if (type === 'base') return <ImageIcon className="size-3" />;
  const Icon = FRAME_LAYER_META[type].icon;
  return <Icon className="size-3" />;
}

function FrameRecipeNode({
  eyebrow,
  title,
  note,
  image,
  layers,
  selected,
  onSelect,
  compact = false,
  children,
}: {
  eyebrow: string;
  title: string;
  note: string;
  image: string;
  layers: RecipeLayer[];
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  const inheritedCount = layers.filter((layer) => layer.inherited).length;
  const visibleLayers = compact ? layers.filter((layer) => !layer.inherited) : layers;

  return (
    <article
      className={cn(
        'relative overflow-visible rounded-xl border bg-background shadow-[var(--floating-shadow)] transition-all',
        selected
          ? 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]'
          : 'hover:-translate-y-0.5 hover:border-foreground/25',
      )}
    >
      <span className="absolute -left-1.5 top-20 size-3 rounded-full border-2 border-background bg-border" />
      <span className="absolute -right-1.5 top-20 size-3 rounded-full border-2 border-background bg-[var(--brand)]" />
      <button
        type="button"
        onClick={onSelect}
        className="relative block aspect-[2.15/1] w-full overflow-hidden rounded-t-[11px] bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <NextImage src={image} alt={title} fill unoptimized className="object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-3 pb-2 pt-9 text-white">
          <span className="block font-mono text-[8px] uppercase tracking-[0.13em] text-white/68">
            {eyebrow}
          </span>
          <span className="mt-0.5 block truncate text-[12px] font-medium">{title}</span>
        </span>
        {selected && (
          <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-0.5 font-mono text-[8px] uppercase text-black shadow">
            active path
          </span>
        )}
      </button>
      <div className="p-2.5">
        {!compact && (
          <p className="line-clamp-2 min-h-7 text-[9px] leading-3.5 text-muted-foreground">
            {note}
          </p>
        )}
        {compact && inheritedCount > 0 && (
          <p className="font-mono text-[8px] uppercase text-muted-foreground">
            {inheritedCount} inherited layer{inheritedCount === 1 ? '' : 's'}
          </p>
        )}
        <div className="mt-2 space-y-1">
          {visibleLayers.map((layer, index) => (
            <button
              key={`${layer.type}:${layer.value}:${index}`}
              type="button"
              onClick={onSelect}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
                layer.inherited ? 'border-dashed bg-muted/25' : 'bg-background',
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
                <RecipeLayerIcon type={layer.type} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[7px] uppercase tracking-wider text-muted-foreground">
                  {layer.label}{layer.inherited ? ' · inherited' : ''}
                </span>
                <span className="block truncate text-[9px] font-medium">{layer.value}</span>
              </span>
              <ChevronDown className="size-3 -rotate-90 text-muted-foreground/50" />
            </button>
          ))}
        </div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </article>
  );
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
    'An elderly clockmaker works alone at a scarred wooden bench, holding a brass gear beside one candle in a nearly black forest workshop. Preserve tactile period tools, smoke and deep nocturnal atmosphere.',
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
  const [branchingRunId, setBranchingRunId] = useState<string | null>(null);
  const [activeFrameRunId, setActiveFrameRunId] = useState<string | null>(null);
  const [frameLayerType, setFrameLayerType] = useState<FrameLayerType>('lens');
  const [frameLayerLabel, setFrameLayerLabel] = useState(
    FRAME_LAYER_PRESETS.lens[0].label,
  );
  const [frameLayerPrompt, setFrameLayerPrompt] = useState(
    FRAME_LAYER_PRESETS.lens[0].prompt,
  );
  const [selectedRecipeNode, setSelectedRecipeNode] = useState<RecipeNodeId | null>('base');
  const [frameCanvasState, setFrameCanvasState] = useState<FrameCanvasState>('branching');
  const [frameCanvasZoom, setFrameCanvasZoom] = useState(85);
  const [frameCanvasCompact, setFrameCanvasCompact] = useState(false);
  const [frameStackFullscreen, setFrameStackFullscreen] = useState(false);
  const frameStackRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const syncFullscreen = () => setFrameStackFullscreen(document.fullscreenElement === frameStackRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

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
    async (payload?: RunPayload, branch?: BranchRequest) => {
      if (isRunning) return;
      const body = payload ?? buildPayload();
      if (body.prompt.trim().length < 3) return;
      setIsRunning(true);
      setRunMessage(null);
      try {
        const response = await fetch('/api/generations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, ...branch }),
        });
        const data = (await response.json()) as { id?: string; mode?: string; error?: string };
        if (!response.ok || !data.id) throw new Error(data.error || 'Could not create the run.');
        setLastRunAt(Date.now());
        if (!branch) {
          setBranchingRunId(data.id);
          setActiveFrameRunId(data.id);
        } else {
          setActiveFrameRunId(data.id);
        }
        setHistoryOpen(true);
        setHighlightRunId(data.id);
        window.setTimeout(() => setHighlightRunId((current) => (current === data.id ? null : current)), 6_000);
        await refreshHistory();
        setRunMessage(
          data.mode === 'preview'
            ? {
                tone: 'info',
                text: branch
                  ? 'Variation branch saved. Add BFL_API_KEY to render it live.'
                  : 'Shared master frame saved. Add BFL_API_KEY to enable live output.',
              }
            : {
                tone: 'info',
                text: branch
                  ? 'Variation is rendering from its parent frame.'
                  : 'Live master frame started. Results stream into the history panel.',
              },
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

  const createFrameVariation = useCallback(
    (
      parent: HistoryRun | null,
      variationType: FrameLayerType,
      variationLabel: string,
      direction: string,
    ) => {
      const parentAsset = parent?.assets[0];
      if (!parent || !parentAsset) {
        setRunMessage({
          tone: 'info',
          text: 'Render the parent frame first — each branch keeps its visual continuity.',
        });
        return;
      }
      const payload = payloadFromRun(parent);
      payload.outputs = 1;
      payload.seed = randomSeed();
      payload.prompt = [
        parent.prompt,
        '',
        `${FRAME_LAYER_META[variationType].label} layer — ${variationLabel}: ${direction}`,
        variationType === 'camera'
          ? 'Preserve the subjects, wardrobe, production design, lighting continuity and story beat. Change only camera position, angle and blocking.'
          : variationType === 'lens'
            ? 'Preserve camera position, subjects, blocking, light and geography. Change only focal rendering and optical character.'
            : variationType === 'light'
              ? 'Preserve camera, lens, subjects, blocking and production design. Change only the motivated light and atmosphere.'
              : variationType === 'color'
                ? 'Preserve the approved composition, subjects, camera, lens and lighting geometry. Change only palette, contrast and color separation.'
                : 'Preserve the approved composition, camera, lens and lighting. Apply only the finishing instruction above.',
      ].join('\n');
      setPrompt(payload.prompt);
      setSeed(payload.seed);
      void runWorkflow(payload, {
        parentRunId: parent.id,
        parentAssetId: parentAsset.id,
        variationType,
        variationLabel,
        variationPrompt: direction,
      });
    },
    [runWorkflow],
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
  const fieldRef = useRef<HTMLDivElement | null>(null);
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
    const canvas = fieldRef.current;
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
    if (fieldRef.current) observer.observe(fieldRef.current);
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
  const branchRoot =
    (branchingRunId ? historyItems.find((item) => item.id === branchingRunId) : null) ??
    historyItems.find(
      (item) =>
        item.assets.length > 0 &&
        ['live', 'preview'].includes(item.origin) &&
        typeof item.parameters.parentRunId !== 'string',
    ) ??
    null;
  const frameLayerRuns = historyItems.filter((item) =>
    ['camera', 'lens', 'light', 'color', 'refine'].includes(
      String(item.parameters.variationType),
    ),
  );
  const activeFrame =
    (activeFrameRunId
      ? historyItems.find((item) => item.id === activeFrameRunId && item.assets.length > 0)
      : null) ?? branchRoot;
  const activeFrameLabel =
    activeFrame && typeof activeFrame.parameters.variationLabel === 'string'
      ? activeFrame.parameters.variationLabel
      : 'Base image';
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

  const chooseFrameLayerType = (type: FrameLayerType) => {
    const first = FRAME_LAYER_PRESETS[type][0];
    setFrameLayerType(type);
    setFrameLayerLabel(first.label);
    setFrameLayerPrompt(first.prompt);
  };

  const chooseFrameLayerPreset = (value: string) => {
    const preset = FRAME_LAYER_PRESETS[frameLayerType].find((entry) => entry.label === value);
    if (!preset) return;
    setFrameLayerLabel(preset.label);
    setFrameLayerPrompt(preset.prompt);
  };

  const prepareRecipeNode = (nodeId: RecipeNodeId, nextType: FrameLayerType) => {
    setSelectedRecipeNode(nodeId);
    if (branchRoot) setActiveFrameRunId(branchRoot.id);
    chooseFrameLayerType(nextType);
  };

  const selectRecipeNode = (nodeId: RecipeNodeId) => {
    prepareRecipeNode(nodeId, FRAME_RECIPE_CONTEXT[nodeId].nextType);
  };

  const changeFrameCanvasState = (nextState: FrameCanvasState) => {
    setFrameCanvasState(nextState);
    const nextSelection: RecipeNodeId | null =
      nextState === 'empty'
        ? null
        : nextState === 'one-branch'
          ? 'cooke'
          : 'base';
    setSelectedRecipeNode(nextSelection);
    if (nextSelection) chooseFrameLayerType(FRAME_RECIPE_CONTEXT[nextSelection].nextType);
  };

  const toggleFrameStackFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await frameStackRef.current?.requestFullscreen();
  };

  const selectedRecipeContext = selectedRecipeNode
    ? FRAME_RECIPE_CONTEXT[selectedRecipeNode]
    : null;
  const frameStateMeta = FRAME_CANVAS_STATES.find((entry) => entry.value === frameCanvasState)!;
  const showBaseNode = frameCanvasState !== 'empty';
  const showCookeNode = frameCanvasState === 'one-branch' || frameCanvasState === 'branching';
  const showFullBranching = frameCanvasState === 'branching';
  const rootDescendantCount =
    frameCanvasState === 'branching' ? 4 : frameCanvasState === 'one-branch' ? 1 : 0;
  const selectedDescendantCount =
    selectedRecipeNode === 'base'
      ? rootDescendantCount
      : frameCanvasState === 'one-branch' && selectedRecipeNode === 'cooke'
        ? 0
        : selectedRecipeContext?.childCount ?? 0;

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
              <ThemeToggle />
              <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                <Cloud
                  className={cn(
                    'size-3.5',
                    !viewer || realtimeState === 'fallback'
                      ? 'text-muted-foreground'
                      : 'text-[var(--success)]',
                  )}
                />
                <span>
                  {!viewer
                    ? 'Local preview'
                    : realtimeState === 'live'
                      ? 'Realtime connected'
                      : realtimeState === 'fallback'
                        ? 'Synced · 15s refresh'
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

        <div className="grid h-[calc(100svh-var(--app-header-height))] grid-cols-[var(--app-rail-width)_minmax(0,1fr)_var(--app-history-width)] max-2xl:grid-cols-[var(--app-rail-width)_minmax(0,1fr)]">
          <ProductRail active="playground" />

          <aside className="hidden min-h-0 flex-col border-r bg-playground-surface">
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

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              {selectedNode === 'generate' && (
                <div className="order-1 mb-5">
                  <InspectorLabel>Run summary</InspectorLabel>
                  <div className="space-y-1.5 rounded-md border bg-playground-surface-elevated p-3 shadow-xs">
                    <SummaryRow label="Model" value={model} />
                    <SummaryRow
                      label="Size"
                      value={`${aspect} · ${dimensions.width}×${dimensions.height}`}
                    />
                    <SummaryRow label="Outputs" value={`${outputs} · ${outputFormat.toUpperCase()}`} />
                    <SummaryRow label="Seed" value={seed == null ? 'Random' : String(seed)} />
                    <SummaryRow label="Estimate" value={`~${formatUsd(estimatedCost)}`} />
                  </div>
                  <Button
                    variant="outline"
                    size="xs"
                    className="mt-2"
                    onClick={() => setSelectedNode('prompt')}
                  >
                    <WandSparkles /> Edit prompt
                  </Button>
                </div>
              )}
              <div
                className={cn(
                  selectedNode === 'prompt' ? 'order-2' : 'order-1',
                  selectedNode === 'generate' && 'hidden',
                )}
              >
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
              </div>

              <div
                className={cn(
                  selectedNode === 'prompt' ? 'order-1' : 'order-2',
                  selectedNode === 'generate' && 'hidden',
                )}
              >
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
              </div>

              <div className="order-3">
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
            ref={frameStackRef}
            className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--canvas)]"
          >
            <div className="pointer-events-none absolute inset-0 graph-grid opacity-60" />

            <div className="relative z-30 flex min-h-[var(--app-header-height)] shrink-0 flex-wrap items-center gap-2 border-b bg-background/94 px-4 py-2 backdrop-blur-md">
              <div className="mr-2 min-w-48">
                <div className="flex items-center gap-1.5">
                  <Layers3 className="size-3.5" />
                  <span className="text-[13px] font-medium">Frame Stack</span>
                  <Badge variant="outline" className="h-5 font-mono text-[8px] uppercase">
                    node context
                  </Badge>
                </div>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Select a node, then define exactly one next decision
                </p>
              </div>

              <Select
                value={frameCanvasState}
                onValueChange={(value) => {
                  if (FRAME_CANVAS_STATES.some((entry) => entry.value === value)) {
                    changeFrameCanvasState(value as FrameCanvasState);
                  }
                }}
              >
                <SelectTrigger className="h-8! w-44 bg-background text-[11px]">
                  <span className="font-mono text-[8px] uppercase text-muted-foreground">State</span>
                  <span className="flex flex-1 text-left">{frameStateMeta.label}</span>
                </SelectTrigger>
                <SelectContent align="start">
                  {FRAME_CANVAS_STATES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value} className="py-2">
                      <span className="flex flex-col">
                        <span>{entry.label}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {entry.nodeCount} node{entry.nodeCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="hidden max-w-72 text-[9px] leading-3.5 text-muted-foreground xl:block">
                {frameStateMeta.description}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8" onClick={() => setApiPayloadOpen(true)}>
                  <Code2 /> API
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setHistoryOpen(true)}>
                  <History /> History
                </Button>
                <Separator orientation="vertical" className="mx-1 h-5" />
                <IconTooltip label="Zoom out">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom out"
                    onClick={() => setFrameCanvasZoom((value) => Math.max(55, value - 10))}
                  >
                    <ZoomOut />
                  </Button>
                </IconTooltip>
                <span className="w-9 text-center font-mono text-[9px] text-muted-foreground">
                  {frameCanvasZoom}%
                </span>
                <IconTooltip label="Zoom in">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom in"
                    onClick={() => setFrameCanvasZoom((value) => Math.min(115, value + 10))}
                  >
                    <ZoomIn />
                  </Button>
                </IconTooltip>
                <IconTooltip label="Fit graph">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fit graph"
                    onClick={() => setFrameCanvasZoom(frameCanvasState === 'branching' ? 75 : 90)}
                  >
                    <RotateCcw />
                  </Button>
                </IconTooltip>
                <IconTooltip label={frameCanvasCompact ? 'Show full recipes' : 'Compact node recipes'}>
                  <Button
                    variant={frameCanvasCompact ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    aria-label={frameCanvasCompact ? 'Show full recipes' : 'Compact node recipes'}
                    onClick={() => setFrameCanvasCompact((value) => !value)}
                  >
                    <SquareStack />
                  </Button>
                </IconTooltip>
                <IconTooltip label={frameStackFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={frameStackFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
                    onClick={() => void toggleFrameStackFullscreen()}
                  >
                    {frameStackFullscreen ? <Minimize2 /> : <Maximize2 />}
                  </Button>
                </IconTooltip>
              </div>
            </div>

            <div className="relative z-10 min-h-0 flex-1 overflow-auto">
              {runMessage && (
                <div
                  className={cn(
                    'sticky left-4 top-3 z-40 w-fit max-w-xl rounded-md border bg-background/95 px-3 py-2 text-[10px] shadow-sm',
                    runMessage.tone === 'error' && 'border-destructive/30 text-destructive',
                  )}
                >
                  {runMessage.text}
                </div>
              )}

              <div
                className="relative mx-auto w-[1400px] px-5 pb-8 pt-4 transition-[zoom] duration-200"
                style={{ zoom: frameCanvasZoom / 100 } as CSSProperties}
              >
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <SystemLabel>Clockmaker exploration · {frameStateMeta.label}</SystemLabel>
                    <p className="mt-1 text-[12px] font-medium">
                      {frameCanvasState === 'empty'
                        ? 'Generate the root before branching'
                        : 'The selected node owns the next action'}
                    </p>
                    <p className="mt-0.5 max-w-2xl text-[10px] leading-4 text-muted-foreground">
                      {frameCanvasState === 'empty'
                        ? 'The empty canvas has no editable node. The dock defines the prompt and render settings for node 00.'
                        : frameCanvasState === 'base'
                          ? 'With no descendants, the root can still be replaced. The first branch locks it and preserves continuity.'
                          : 'A root with descendants is immutable. Branches inherit its recipe, then add one explicit camera, lens, light, colour or polish decision.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[8px] uppercase text-muted-foreground">
                    <span>{frameStateMeta.nodeCount} node{frameStateMeta.nodeCount === 1 ? '' : 's'}</span>
                    <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-border" /> inherited</span>
                    <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[var(--brand)]" /> local</span>
                  </div>
                </div>

                <div className="relative h-[860px] overflow-hidden rounded-2xl border bg-background/42 shadow-inner backdrop-blur-[2px]">
                  {frameCanvasState === 'empty' ? (
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="w-[360px] rounded-2xl border border-dashed bg-background/80 p-8 text-center shadow-sm backdrop-blur-sm">
                        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                          <ImageIcon className="size-5" />
                        </span>
                        <p className="mt-4 text-[14px] font-medium">Start with one root frame</p>
                        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                          Define the scene prompt and render settings in the context dock below. The
                          canvas becomes branchable only after that first frame exists.
                        </p>
                        <Button
                          size="sm"
                          className="mt-4"
                          onClick={() => void runWorkflow()}
                          disabled={isRunning || prompt.trim().length < 3}
                        >
                          {isRunning ? <Loader2 className="animate-spin" /> : <Play />}
                          Generate root frame
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <svg
                        className="pointer-events-none absolute inset-0 size-full"
                        viewBox="0 0 1360 860"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        {frameCanvasState === 'one-branch' && (
                          <path d="M 610 410 C 660 410, 700 410, 750 410" className="graph-edge graph-edge-active" />
                        )}
                        {showFullBranching && (
                          <>
                            <path d="M 334 410 C 372 410, 376 180, 425 180" className="graph-edge" />
                            <path d="M 334 410 C 372 410, 376 620, 425 620" className="graph-edge" />
                            <path d="M 735 180 C 770 180, 786 180, 825 180" className="graph-edge graph-edge-active" />
                            <path d="M 735 620 C 770 620, 786 620, 825 620" className="graph-edge graph-edge-active" />
                            <path d="M 1135 180 C 1168 180, 1180 180, 1212 180" className="graph-edge" strokeDasharray="4 4" />
                            <path d="M 1135 620 C 1168 620, 1180 620, 1212 620" className="graph-edge" strokeDasharray="4 4" />
                          </>
                        )}
                      </svg>

                      {showBaseNode && (
                        <article
                          className={cn(
                            'absolute top-[240px] w-[310px] overflow-visible rounded-xl border bg-background shadow-[var(--floating-shadow)] transition-all hover:-translate-y-0.5',
                            frameCanvasState === 'base'
                              ? 'left-[525px]'
                              : frameCanvasState === 'one-branch'
                                ? 'left-[300px]'
                                : 'left-6',
                            selectedRecipeNode === 'base' && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
                          )}
                        >
                          {showCookeNode && <span className="absolute -right-1.5 top-20 size-3 rounded-full border-2 border-background bg-[var(--brand)]" />}
                          <button
                            type="button"
                            onClick={() => selectRecipeNode('base')}
                            className="relative block aspect-[2.15/1] w-full overflow-hidden rounded-t-[11px] bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                          >
                            <NextImage
                              src="/scenes/ads-art/scene-02.webp"
                              alt="Clockmaker base frame"
                              fill
                              unoptimized
                              className="object-cover"
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-9 text-white">
                              <span className="block font-mono text-[8px] uppercase tracking-[0.13em] text-white/68">00 · root frame</span>
                              <span className="mt-0.5 block text-[12px] font-medium">Clockmaker at work</span>
                            </span>
                            {selectedRecipeNode === 'base' && (
                              <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-0.5 font-mono text-[8px] uppercase text-black shadow">
                                selected
                              </span>
                            )}
                          </button>
                          <div className="p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <SystemLabel>Base prompt</SystemLabel>
                              <span className={cn(
                                'rounded px-1.5 py-0.5 font-mono text-[8px] uppercase',
                                rootDescendantCount > 0 ? 'bg-muted text-muted-foreground' : 'bg-[var(--brand-soft)] text-[var(--brand)]',
                              )}>
                                {rootDescendantCount > 0
                                  ? `${rootDescendantCount} descendant${rootDescendantCount === 1 ? '' : 's'} · locked`
                                  : 'mutable root'}
                              </span>
                            </div>
                            {!frameCanvasCompact && (
                              <p className="mt-1.5 line-clamp-3 text-[10px] leading-4 text-muted-foreground">
                                {prompt}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              <span className={cn(parameterChipClass, 'h-6 text-[8px]')}>{model}</span>
                              <span className={cn(parameterChipClass, 'h-6 text-[8px]')}>{aspect}</span>
                              <span className={cn(parameterChipClass, 'h-6 text-[8px]')}>seed {seed ?? 'random'}</span>
                            </div>
                          </div>
                        </article>
                      )}

                      {showCookeNode && (
                        <div className={cn('absolute w-[310px]', frameCanvasState === 'one-branch' ? 'left-[750px] top-[240px]' : 'left-[425px] top-6')}>
                          <FrameRecipeNode
                            eyebrow="01 · lens branch A"
                            title="Cooke S4 · 40 mm"
                            note="Warm dimensional glass; the full workshop geography stays readable."
                            image="/frame-stack/cooke-40mm.jpg"
                            selected={selectedRecipeNode === 'cooke'}
                            onSelect={() => selectRecipeNode('cooke')}
                            compact={frameCanvasCompact}
                            layers={[
                              { type: 'base', label: 'Scene', value: 'Clockmaker at work', inherited: true },
                              { type: 'camera', label: 'Camera', value: 'Locked medium bench', inherited: true },
                              { type: 'lens', label: 'Lens', value: 'Cooke S4 · 40 mm' },
                            ]}
                          />
                        </div>
                      )}

                      {showFullBranching && (
                        <>
                          <div className="absolute left-[825px] top-6 w-[310px]">
                            <FrameRecipeNode
                              eyebrow="02 · light iteration"
                              title="Tungsten practical"
                              note="Same Cooke path, now with stronger motivated amber light and negative fill."
                              image="/frame-stack/cooke-tungsten.jpg"
                              selected={selectedRecipeNode === 'cooke-light'}
                              onSelect={() => selectRecipeNode('cooke-light')}
                              compact={frameCanvasCompact}
                              layers={[
                                { type: 'base', label: 'Scene', value: 'Clockmaker at work', inherited: true },
                                { type: 'lens', label: 'Lens', value: 'Cooke S4 · 40 mm', inherited: true },
                                { type: 'light', label: 'Light', value: 'Tungsten practical' },
                                { type: 'color', label: 'Color', value: 'Warm mineral' },
                              ]}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => selectRecipeNode('cooke-light')}
                            className="absolute left-[1210px] top-[148px] grid size-12 place-items-center rounded-xl border border-dashed bg-background/75 text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground"
                            aria-label="Continue Cooke branch"
                          >
                            <Plus className="size-4" />
                          </button>
                          <div className="absolute left-[425px] top-[465px] w-[310px]">
                            <FrameRecipeNode
                              eyebrow="01 · lens branch B"
                              title="Zeiss Super Speed · 85 mm"
                              note="A tighter portrait path with compressed depth and precise focus on the gear."
                              image="/frame-stack/zeiss-85mm.jpg"
                              selected={selectedRecipeNode === 'zeiss'}
                              onSelect={() => selectRecipeNode('zeiss')}
                              compact={frameCanvasCompact}
                              layers={[
                                { type: 'base', label: 'Scene', value: 'Clockmaker at work', inherited: true },
                                { type: 'camera', label: 'Camera', value: 'Intimate bench portrait', inherited: true },
                                { type: 'lens', label: 'Lens', value: 'Zeiss Super Speed · 85 mm' },
                              ]}
                            />
                          </div>
                          <div className="absolute left-[825px] top-[465px] w-[310px]">
                            <FrameRecipeNode
                              eyebrow="02 · light iteration"
                              title="Blue-hour ambient"
                              note="The Zeiss path gains cool environmental wrap while the candle stays motivated."
                              image="/frame-stack/zeiss-blue-hour.jpg"
                              selected={selectedRecipeNode === 'zeiss-light'}
                              onSelect={() => selectRecipeNode('zeiss-light')}
                              compact={frameCanvasCompact}
                              layers={[
                                { type: 'base', label: 'Scene', value: 'Clockmaker at work', inherited: true },
                                { type: 'lens', label: 'Lens', value: 'Zeiss Super Speed · 85 mm', inherited: true },
                                { type: 'light', label: 'Light', value: 'Blue-hour ambient' },
                                { type: 'color', label: 'Color', value: 'Cyan / amber split' },
                              ]}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => selectRecipeNode('zeiss-light')}
                            className="absolute left-[1210px] top-[588px] grid size-12 place-items-center rounded-xl border border-dashed bg-background/75 text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground"
                            aria-label="Continue Zeiss branch"
                          >
                            <Plus className="size-4" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="relative z-40 shrink-0 border-t bg-background/96 px-3 py-2.5 shadow-[0_-12px_32px_rgba(0,0,0,0.05)] backdrop-blur-md">
              <div className="mx-auto flex max-w-[1600px] items-end gap-2">
                <div className="min-w-44 max-w-56 flex-1">
                  <SystemLabel>{selectedRecipeContext ? selectedRecipeContext.eyebrow : 'Canvas is empty'}</SystemLabel>
                  <p className="mt-1 truncate text-[12px] font-medium">
                    {selectedRecipeContext ? selectedRecipeContext.label : 'Define the root frame'}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                    {selectedRecipeContext
                      ? selectedRecipeNode === 'base' && selectedDescendantCount > 0
                        ? `Root locked by ${selectedDescendantCount} descendant${selectedDescendantCount === 1 ? '' : 's'}`
                        : `${selectedDescendantCount} descendant${selectedDescendantCount === 1 ? '' : 's'} · next action is contextual`
                      : 'Prompt and render settings create node 00'}
                  </p>
                </div>

                {selectedRecipeContext ? (
                  <>
                    <div className="w-32">
                      <SystemLabel>Next layer</SystemLabel>
                      <Select
                        value={frameLayerType}
                        onValueChange={(value) => value && chooseFrameLayerType(value as FrameLayerType)}
                      >
                        <SelectTrigger className="mt-1 h-8! w-full bg-background text-[10px]">
                          <SelectValue>{FRAME_LAYER_META[frameLayerType].label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start" side="top">
                          {(Object.keys(FRAME_LAYER_META) as FrameLayerType[]).map((type) => (
                            <SelectItem key={type} value={type}>
                              {FRAME_LAYER_META[type].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-48">
                      <SystemLabel>{FRAME_LAYER_META[frameLayerType].label} preset</SystemLabel>
                      <Select value={frameLayerLabel} onValueChange={(value) => value && chooseFrameLayerPreset(value)}>
                        <SelectTrigger className="mt-1 h-8! w-full bg-background text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start" side="top">
                          {FRAME_LAYER_PRESETS[frameLayerType].map((preset) => (
                            <SelectItem key={preset.label} value={preset.label}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Popover>
                      <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8"><WandSparkles /> Direction</Button>} />
                      <PopoverContent align="start" side="top" className="w-[360px] p-3">
                        <SystemLabel>{FRAME_LAYER_META[frameLayerType].label} direction</SystemLabel>
                        <Input
                          value={frameLayerLabel}
                          onChange={(event) => setFrameLayerLabel(event.target.value)}
                          className="mt-2 h-8 bg-background text-[11px]"
                        />
                        <Textarea
                          value={frameLayerPrompt}
                          onChange={(event) => setFrameLayerPrompt(event.target.value)}
                          className="mt-2 min-h-28 resize-none bg-background text-[11px] leading-4"
                        />
                        <p className="mt-2 text-[9px] leading-3.5 text-muted-foreground">
                          Everything above this node is inherited. This field describes only the new decision.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </>
                ) : (
                  <Popover>
                    <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8"><WandSparkles /> Base prompt</Button>} />
                    <PopoverContent align="start" side="top" className="w-[380px] p-3">
                      <SystemLabel>Root frame prompt</SystemLabel>
                      <Textarea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        className="mt-2 min-h-32 resize-none bg-background text-[11px] leading-4"
                      />
                    </PopoverContent>
                  </Popover>
                )}

                <div className="w-36">
                  <SystemLabel>Model</SystemLabel>
                  <Select value={model} onValueChange={(value) => value && isKnownModel(value) && setModel(value)}>
                    <SelectTrigger className="mt-1 h-8! w-full bg-background text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" side="top">
                      {modelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <AspectParameter label="Aspect" value={aspect} onValueChange={(value) => setAspect(value as typeof aspect)} />
                <ParameterSelect label="Outputs" value={outputs} options={['1', '2', '3', '4']} onValueChange={setOutputs} />

                <Popover>
                  <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8"><SlidersHorizontal /> Params</Button>} />
                  <PopoverContent align="end" side="top" className="w-72 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium">Prompt upsampling</p>
                        <p className="text-[9px] text-muted-foreground">Expand intent before inference</p>
                      </div>
                      <Switch size="sm" checked={promptUpsampling} onCheckedChange={setPromptUpsampling} />
                    </div>
                    <Separator className="my-3" />
                    <div className="grid grid-cols-2 gap-2">
                      <ParameterSelect label="Safety" value={safety} options={['0', '1', '2', '3', '4', '5', '6']} onValueChange={setSafety} />
                      <ParameterSelect
                        label="Format"
                        value={outputFormat.toUpperCase()}
                        options={['PNG', 'JPEG', 'WEBP']}
                        onValueChange={(value) => setOutputFormat(value.toLowerCase() as typeof outputFormat)}
                      />
                    </div>
                    <SystemLabel className="mt-3">Seed</SystemLabel>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Input
                        value={seed == null ? '' : String(seed)}
                        onChange={(event) => {
                          const raw = event.target.value.replace(/[^0-9]/g, '');
                          setSeed(raw ? Math.min(Number(raw), 2 ** 32 - 1) : null);
                        }}
                        inputMode="numeric"
                        placeholder="Random"
                        className="h-8 bg-background font-mono text-[10px]"
                      />
                      <Button variant="outline" size="icon-sm" onClick={() => setSeed(randomSeed())}><Dices /></Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {selectedRecipeNode === 'base' && selectedDescendantCount > 0 && (
                  <div className="flex h-8 items-center gap-1.5 rounded-md border border-dashed bg-muted/40 px-2 text-[9px] text-muted-foreground" title="Replacing the root would invalidate every descendant">
                    <CircleX className="size-3" /> Root locked
                  </div>
                )}
                {selectedRecipeNode === 'base' && selectedDescendantCount === 0 && frameCanvasState === 'base' && (
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => void runWorkflow()} disabled={isRunning}>
                    <RefreshCw /> Replace root
                  </Button>
                )}

                <Button
                  size="sm"
                  className="h-8 min-w-36"
                  onClick={() => {
                    if (!selectedRecipeContext) {
                      void runWorkflow();
                      return;
                    }
                    createFrameVariation(
                      activeFrame,
                      frameLayerType,
                      frameLayerLabel.trim() || FRAME_LAYER_META[frameLayerType].label,
                      frameLayerPrompt.trim(),
                    );
                  }}
                  disabled={isRunning || (!selectedRecipeContext ? prompt.trim().length < 3 : frameLayerPrompt.trim().length < 3)}
                >
                  {isRunning ? <Loader2 className="animate-spin" /> : selectedRecipeContext ? <GitBranch /> : <Play />}
                  {selectedRecipeContext
                    ? selectedRecipeNode === 'base'
                      ? `Add ${FRAME_LAYER_META[frameLayerType].label.toLowerCase()} branch`
                      : 'Generate child'
                    : 'Generate base'}
                </Button>
              </div>
            </div>
          </section>

          <section className="hidden min-w-0 overflow-hidden bg-[var(--canvas)]">
            <div className="absolute inset-0 graph-grid opacity-60" />
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-background/90 font-mono text-[10px] backdrop-blur"
              >
                FRAME STACK
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

            {/* Centered node field: keeps the composition tight on wide screens. */}
            <div
              ref={fieldRef}
              className="absolute inset-y-0 left-1/2 h-full w-full max-w-[1120px] -translate-x-1/2"
            >
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
            </div>

            <div className="absolute inset-x-4 bottom-4 top-[32%] z-10 overflow-auto rounded-xl border bg-background/92 p-3 shadow-[var(--floating-shadow)] backdrop-blur-md">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2.5">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Layers3 className="size-3.5" />
                    <SystemLabel>Frame stack</SystemLabel>
                  </div>
                  <p className="mt-1 max-w-2xl text-[11px] text-muted-foreground">
                    Start from one approved image. Add one camera, lens, light or polish layer at a
                    time; every generated frame can become the parent of the next decision.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-[8px] uppercase">
                    {frameLayerRuns.length} saved layers
                  </Badge>
                  <Button variant="outline" size="xs" onClick={() => setApiPayloadOpen(true)}>
                    <Code2 /> API payload
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[0.72fr_1.05fr_1.45fr] items-stretch gap-3">
                <div className="flex flex-col">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="grid size-4 place-items-center rounded-full bg-foreground font-mono text-[8px] text-background">1</span>
                    <SystemLabel>Base image</SystemLabel>
                  </div>
                  <FrameBranchCard
                    eyebrow="Locked story beat"
                    label={branchRoot ? branchRoot.prompt.slice(0, 52) : 'Establish the source frame'}
                    note="This image anchors subjects, geography and production design. It remains untouched while modifiers branch from it."
                    image="/scenes/ads-art/scene-01.webp"
                    run={branchRoot}
                    icon={ImageIcon}
                    actionLabel="Generate base image"
                    onAction={() => void runWorkflow()}
                    onOpen={() => branchRoot && setDetailRunId(branchRoot.id)}
                  />
                  {branchRoot && (
                    <Button
                      variant={activeFrame?.id === branchRoot.id ? 'default' : 'outline'}
                      size="xs"
                      className="mt-2 w-full"
                      onClick={() => setActiveFrameRunId(branchRoot.id)}
                    >
                      <GitBranch />
                      {activeFrame?.id === branchRoot.id ? 'Current source' : 'Continue from base'}
                    </Button>
                  )}
                </div>

                <div className="flex flex-col border-l pl-3">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="grid size-4 place-items-center rounded-full bg-foreground font-mono text-[8px] text-background">2</span>
                    <SystemLabel>Add prompt layer</SystemLabel>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(Object.keys(FRAME_LAYER_META) as FrameLayerType[]).map((type) => {
                      const meta = FRAME_LAYER_META[type];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => chooseFrameLayerType(type)}
                          className={cn(
                            'flex min-w-0 flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-[9px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
                            frameLayerType === type && 'border-[var(--brand)] bg-[var(--brand-soft)]',
                          )}
                        >
                          <Icon className="size-3.5" />
                          <span className="truncate">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Select
                    value={frameLayerLabel}
                    onValueChange={(value) => {
                      const preset = FRAME_LAYER_PRESETS[frameLayerType].find(
                        (entry) => entry.label === value,
                      );
                      if (!preset) return;
                      setFrameLayerLabel(preset.label);
                      setFrameLayerPrompt(preset.prompt);
                    }}
                  >
                    <SelectTrigger className="mt-2 h-8! w-full bg-background text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      {FRAME_LAYER_PRESETS[frameLayerType].map((preset) => (
                        <SelectItem key={preset.label} value={preset.label}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={frameLayerLabel}
                    onChange={(event) => setFrameLayerLabel(event.target.value)}
                    maxLength={80}
                    aria-label="Prompt layer name"
                    className="mt-2 h-8 bg-background text-[11px]"
                    placeholder="Layer name"
                  />
                  <Textarea
                    value={frameLayerPrompt}
                    onChange={(event) => setFrameLayerPrompt(event.target.value)}
                    maxLength={800}
                    className="mt-2 min-h-20 resize-none bg-background text-[11px] leading-4"
                    placeholder="Describe only the camera, lens, light or finishing decision…"
                  />
                  <div className="mt-2 rounded-md bg-muted/55 px-2 py-1.5 text-[9px] leading-3.5 text-muted-foreground">
                    Source:{' '}
                    <span className="font-medium text-foreground">
                      {activeFrame ? activeFrameLabel : 'Generate a base image first'}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="mt-2 w-full"
                    disabled={!activeFrame?.assets[0] || isRunning || frameLayerPrompt.trim().length < 3}
                    onClick={() =>
                      createFrameVariation(
                        activeFrame,
                        frameLayerType,
                        frameLayerLabel.trim() || FRAME_LAYER_META[frameLayerType].label,
                        frameLayerPrompt.trim(),
                      )
                    }
                  >
                    {isRunning ? <Loader2 className="animate-spin" /> : <Plus />}
                    Add {FRAME_LAYER_META[frameLayerType].label.toLowerCase()} layer
                  </Button>
                </div>

                <div className="flex min-w-0 flex-col border-l pl-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="grid size-4 place-items-center rounded-full bg-foreground font-mono text-[8px] text-background">3</span>
                      <SystemLabel>Saved branches</SystemLabel>
                    </span>
                    <span className="font-mono text-[8px] uppercase text-muted-foreground">
                      select to continue
                    </span>
                  </div>
                  {frameLayerRuns.length ? (
                    <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {frameLayerRuns.slice(0, 8).map((run) => {
                        const type = String(run.parameters.variationType) as FrameLayerType;
                        const meta = FRAME_LAYER_META[type];
                        const Icon = meta?.icon ?? Lightbulb;
                        const asset = run.assets[0];
                        const selected = activeFrame?.id === run.id;
                        const layerLabel =
                          typeof run.parameters.variationLabel === 'string'
                            ? run.parameters.variationLabel
                            : meta?.label ?? 'Prompt layer';
                        const layerPrompt =
                          typeof run.parameters.variationPrompt === 'string'
                            ? run.parameters.variationPrompt
                            : run.prompt;
                        return (
                          <article
                            key={run.id}
                            className={cn(
                              'overflow-hidden rounded-lg border bg-background transition-colors',
                              selected && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setDetailRunId(run.id)}
                              className="relative block aspect-[2.4/1] w-full overflow-hidden bg-muted text-left"
                            >
                              {asset ? (
                                <NextImage src={asset.url} alt="" fill unoptimized className="object-cover" />
                              ) : (
                                <span className="grid size-full place-items-center text-muted-foreground">
                                  {['queued', 'running'].includes(run.status) ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <ImageIcon className="size-4" />
                                  )}
                                </span>
                              )}
                              <span className="absolute left-1.5 top-1.5 rounded bg-black/65 p-1 text-white backdrop-blur-sm">
                                <Icon className="size-3" />
                              </span>
                            </button>
                            <div className="p-2">
                              <p className="truncate text-[10px] font-medium">
                                {layerLabel}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-[9px] leading-3.5 text-muted-foreground">
                                {layerPrompt}
                              </p>
                              <Button
                                variant={selected ? 'default' : 'ghost'}
                                size="xs"
                                className="mt-1.5 w-full justify-start px-1.5"
                                disabled={!asset}
                                onClick={() => setActiveFrameRunId(run.id)}
                              >
                                <GitBranch /> {selected ? 'Current source' : 'Continue from here'}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid flex-1 place-items-center rounded-lg border border-dashed p-5 text-center">
                      <div>
                        <Layers3 className="mx-auto size-5 text-muted-foreground" />
                        <p className="mt-2 text-[11px] font-medium">No modifier layers yet</p>
                        <p className="mt-1 max-w-xs text-[9px] leading-4 text-muted-foreground">
                          Add a lens to the base image, then use that result as the parent for light,
                          camera or a final prompt-polish pass.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
        asset.mimeType.startsWith('video/') ? (
          <video
            src={asset.url}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          <NextImage
            src={asset.url}
            alt={`Output ${outputIndex + 1}`}
            width={160}
            height={120}
            unoptimized
            className="size-full object-cover"
          />
        )
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

// Saves one output as a Look: the run's prompt becomes the style note, the
// frame becomes the reference image a Scenes board applies in one move.
function SaveLookControl({
  run,
  assetId,
  seed,
}: {
  run: HistoryRun;
  assetId: string;
  seed: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = async () => {
    if (!name.trim() || state === 'saving') return;
    setState('saving');
    try {
      const response = await fetch('/api/looks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          styleNote: run.prompt,
          seed,
          modelId: run.modelId,
          assetId,
        }),
      });
      if (!response.ok) throw new Error();
      setState('saved');
      window.setTimeout(() => setOpen(false), 900);
    } catch {
      setState('error');
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName('');
          setState('idle');
        }
      }}
    >
      <PopoverTrigger
        render={
          <button type="button" className="flex items-center gap-1 hover:text-foreground">
            <Palette className="size-3" /> Save as Look
          </button>
        }
      />
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-[12px] font-medium">Save as Look</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          Prompt, seed and this frame become a reusable style any Scenes board applies in one
          click.
        </p>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
          placeholder="Look name — e.g. Cobalt dawn brass"
          maxLength={60}
          className="mt-2 h-8 text-[12px]"
          aria-label="Look name"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {run.modelId}
            {seed != null && ` · seed ${seed}`}
          </span>
          <Button size="xs" onClick={() => void save()} disabled={!name.trim() || state === 'saving'}>
            {state === 'saving' ? (
              <Loader2 className="animate-spin" />
            ) : state === 'saved' ? (
              <Check />
            ) : (
              <Palette />
            )}
            {state === 'saved' ? 'Saved' : 'Save look'}
          </Button>
        </div>
        {state === 'error' && (
          <p className="mt-1.5 text-[10px] text-destructive">Could not save — try again.</p>
        )}
      </PopoverContent>
    </Popover>
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
                <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                  <span>
                    #{outputIndex + 1}
                    {payload.seed != null && ` · seed ${(payload.seed + outputIndex) % 2 ** 32}`}
                  </span>
                  {asset && (
                    <span className="flex items-center gap-2.5">
                      {!asset.mimeType.startsWith('video/') && (
                        <SaveLookControl
                          run={run}
                          assetId={asset.id}
                          seed={
                            payload.seed != null ? (payload.seed + outputIndex) % 2 ** 32 : null
                          }
                        />
                      )}
                      {!asset.mimeType.startsWith('video/') && (
                        <Link
                          href={`/scenes?pin=${encodeURIComponent(asset.id)}`}
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          <Clapperboard className="size-3" /> Pin to Scenes
                        </Link>
                      )}
                      <a
                        href={asset.url}
                        download={`branchline-${run.id.slice(0, 8)}-${outputIndex + 1}`}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        <Download className="size-3" /> Download
                      </a>
                    </span>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
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
