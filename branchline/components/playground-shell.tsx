'use client';

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Box,
  Braces,
  Check,
  ChevronDown,
  Clock3,
  Cloud,
  Code2,
  Command,
  Copy,
  Download,
  Ellipsis,
  History,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Play,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  RefreshCw,
  Save,
  Share2,
  Shuffle,
  Sliders,
  SquareStack,
  Star,
  WandSparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  const [historyOpen, setHistoryOpen] = useState(true);
  const [prompt, setPrompt] = useState(
    'A precise product portrait of a compact creative machine, warm mineral background, soft studio light, tactile controls.',
  );
  const [historyItems, setHistoryItems] = useState<HistoryRun[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'synced' | 'error'>('loading');
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [model, setModel] = useState<(typeof modelOptions)[number]['value']>('FLUX.2 [max]');
  const [aspect, setAspect] = useState<(typeof aspectOptions)[number]['value']>('4:3');
  const [outputs, setOutputs] = useState('2');
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [safety, setSafety] = useState('2');
  const [promptUpsampling, setPromptUpsampling] = useState(true);
  const [seedMode, setSeedMode] = useState<'random' | 'fixed'>('random');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const dimensions = aspectOptions.find((option) => option.value === aspect) ?? aspectOptions[1];
  const selected = inspectorCopy[selectedNode];

  const refreshHistory = useCallback(async () => {
    if (!viewer) {
      setHistoryItems(fallbackHistory);
      setHistoryState('error');
      return;
    }
    try {
      const response = await fetch('/api/history', { cache: 'no-store' });
      if (!response.ok) throw new Error('History is unavailable');
      const data = (await response.json()) as { runs: HistoryRun[] };
      setHistoryItems(data.runs);
      setHistoryState('synced');
    } catch {
      setHistoryItems((current) => (current.length ? current : fallbackHistory));
      setHistoryState('error');
    }
  }, [viewer]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!viewer) {
      setRealtimeState('fallback');
      return;
    }
    let socket: WebSocket | null = null;
    let retry: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setRealtimeState('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
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
    const fallbackRefresh = window.setInterval(() => void refreshHistory(), 15_000);
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

  const pollRun = useCallback(
    (id: string) => {
      let attempts = 0;
      const tick = async () => {
        attempts += 1;
        const response = await fetch(`/api/generations/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { run: HistoryRun | null };
        await refreshHistory();
        if (data.run && ['queued', 'running'].includes(data.run.status) && attempts < 120) {
          window.setTimeout(tick, 2_500);
        }
      };
      window.setTimeout(tick, 1_200);
    },
    [refreshHistory],
  );

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
      const data = (await response.json()) as { id?: string; mode?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || 'Could not create the run.');
      await refreshHistory();
      setRunMessage(
        data.mode === 'preview'
          ? 'Shared draft saved. Add BFL_API_KEY to enable live output.'
          : 'Live generation started. Results will appear here automatically.',
      );
      if (data.mode === 'live') pollRun(data.id);
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : 'Could not create the run.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <TooltipProvider delay={350}>
    <main className="h-svh overflow-hidden bg-background text-foreground">
      <header className="grid h-11 grid-cols-[auto_1fr_auto] items-center border-b bg-background px-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-md bg-foreground text-background">
            <Braces className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Branchline</span>
          <Badge variant="outline" className="font-mono text-[9px] tracking-wider">
            CONCEPT
          </Badge>
        </div>

        <button
          className="mx-auto flex h-8 w-[min(360px,46vw)] items-center gap-2 rounded-md px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setCommandOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="flex-1">Type command or search…</span>
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px]">⌘ K</kbd>
        </button>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <Cloud className={cn('size-3.5', realtimeState === 'fallback' ? 'text-amber-600' : 'text-[var(--success)]')} />
            <span>{realtimeState === 'live' ? 'Realtime connected' : realtimeState === 'fallback' ? 'Polling fallback' : 'Connecting realtime…'}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Workspace settings" />}
            >
              <Settings2 />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Studio workspace</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked>Shared history</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={promptUpsampling} onCheckedChange={setPromptUpsampling}>
                Prompt upsampling
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem><Share2 /> Share workflow</DropdownMenuItem>
              <DropdownMenuItem><Download /> Export JSON</DropdownMenuItem>
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
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              nativeButton={false}
              render={<a href={signInPath} />}
            >
              Sign in to sync
            </Button>
          )}
        </div>
      </header>

      <div className="grid h-[calc(100svh-44px)] grid-cols-[44px_288px_minmax(0,1fr)_var(--history-width)] [--history-width:304px] max-xl:grid-cols-[44px_288px_minmax(0,1fr)]">
        <nav className="flex flex-col items-center border-r bg-background py-2">
          <RailButton label="Workflows" href="/workflows" icon={Layers3} />
          <RailButton label="Playground" href="/playground" active icon={Sparkles} />
          <RailButton label="Assets" href="/assets" icon={ImageIcon} />
          <Separator className="my-2 w-6" />
          <RailButton label="Runs" href="/runs" icon={Clock3} />
          <RailButton label="Components" href="/components" icon={Box} />
          <div className="mt-auto">
            <RailButton label="Settings" href="/settings" icon={SlidersHorizontal} />
          </div>
        </nav>

        <aside className="flex min-h-0 flex-col border-r bg-[var(--surface)]">
          <div className="flex h-11 items-center justify-between border-b px-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Inspector
              </p>
              <p className="text-xs font-medium">{selected.title}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="More node settings">
              <SlidersHorizontal />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <InspectorLabel>{selected.label}</InspectorLabel>
            <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
              {selected.description}
            </p>

            <InspectorLabel>Model</InspectorLabel>
            <Select value={model} onValueChange={(value) => setModel(value as typeof model)}>
              <SelectTrigger className="mb-3 h-8! w-full rounded-md bg-background text-[11px] shadow-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  <SelectLabel>Image generation</SelectLabel>
                  {modelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="py-2">
                      <span className="flex flex-col">
                        <span className="font-medium">{option.value}</span>
                        <span className="text-[10px] text-muted-foreground">{option.description}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <InspectorLabel>Prompt</InspectorLabel>
            <div className="relative mb-4">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-24 resize-none bg-background pb-7 text-[11px] leading-relaxed shadow-xs"
              />
              <span className="absolute bottom-2 right-2 font-mono text-[9px] text-muted-foreground">
                {prompt.length.toLocaleString()} / 10,000
              </span>
            </div>

            <InspectorLabel>Parameters</InspectorLabel>
            <div className="grid grid-cols-2 gap-2">
              <AspectParameter
                label="Aspect"
                value={aspect}
                onValueChange={(value) => setAspect(value as typeof aspect)}
              />
              <ParameterSelect label="Outputs" value={outputs} options={['1', '2', '3', '4']} onValueChange={setOutputs} />
              <ParameterSelect label="Safety" value={safety} options={['0', '1', '2', '3', '4', '5', '6']} onValueChange={setSafety} />
              <ParameterSelect
                label="Format"
                value={outputFormat.toUpperCase()}
                options={['PNG', 'JPEG', 'WEBP']}
                onValueChange={(value) => setOutputFormat(value.toLowerCase() as typeof outputFormat)}
              />
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-3">
              <CollapsibleTrigger className="flex h-8 w-full items-center justify-between rounded-md border border-dashed bg-background px-2.5 text-[10px] font-medium hover:border-[var(--brand)] hover:bg-accent">
                <span>{advancedOpen ? 'Hide advanced' : '+3 advanced'}</span>
                <ChevronDown className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
            <div className="space-y-2.5 rounded-lg border bg-background p-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium">Prompt upsampling</p>
                  <p className="text-[9px] text-muted-foreground">Expand intent before inference</p>
                </div>
                <Switch size="sm" checked={promptUpsampling} onCheckedChange={setPromptUpsampling} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium">Seed</p>
                  <p className="text-[9px] text-muted-foreground">{seedMode === 'random' ? 'Random on every run' : 'Fixed · 112358'}</p>
                </div>
                <button
                  onClick={() => setSeedMode((value) => (value === 'random' ? 'fixed' : 'random'))}
                  className="flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[9px] hover:bg-accent"
                >
                  <Shuffle className="size-3" /> {seedMode}
                </button>
              </div>
              <Separator />
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium">Guidance</span>
                  <span className="font-mono text-[9px] text-muted-foreground">3.5</span>
                </div>
                <Slider defaultValue={[3.5]} min={1.5} max={5} step={0.1} />
              </div>
            </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="border-t bg-background p-2.5">
            <div className="mb-2 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <span>Estimated run</span>
              <span>{model.includes('max') ? '$0.14+' : '$0.06+'} · {outputs} outputs</span>
            </div>
            {runMessage && <p className="mb-2 px-1 text-[10px] leading-relaxed text-muted-foreground">{runMessage}</p>}
            <Button
              className="w-full justify-between bg-foreground text-background hover:bg-[var(--brand)] hover:text-white"
              onClick={runWorkflow}
              disabled={isRunning || prompt.trim().length < 3}
            >
              <span className="flex items-center gap-2">
                {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                {isRunning ? 'Creating run…' : 'Run workflow'}
              </span>
              <span className="font-mono text-[10px]">⌘ ↵</span>
            </Button>
          </div>
        </aside>

        <section className="relative min-w-0 overflow-hidden bg-[var(--canvas)]">
          <div className="absolute inset-0 graph-grid opacity-60" />
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
            <Badge variant="outline" className="bg-background/90 font-mono text-[9px] backdrop-blur">
              PRODUCT PORTRAIT / V3
            </Badge>
            <span className="text-[10px] text-muted-foreground">Saved 12 sec ago</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="absolute right-4 top-4 z-10 bg-background/90 text-xs backdrop-blur xl:hidden"
            onClick={() => setHistoryOpen((value) => !value)}
          >
            <History /> History
          </Button>

          <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            <path d="M 250 260 C 360 260, 350 410, 485 410" className="graph-edge" />
            <path d="M 650 410 C 760 410, 760 270, 900 270" className="graph-edge graph-edge-active" />
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
                  'absolute z-10 w-48 rounded-xl border bg-background p-3 text-left shadow-[0_12px_30px_-22px_rgba(0,0,0,.35)] transition-all hover:-translate-y-0.5 hover:shadow-lg',
                  node.position,
                  active && 'border-[var(--brand)] ring-2 ring-[var(--brand-soft)]',
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground">
                    {node.eyebrow}
                  </span>
                  <span className="grid size-6 place-items-center rounded-md bg-muted">
                    <Icon className="size-3.5" />
                  </span>
                </div>
                <p className="text-sm font-medium">{nodeTitle}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{nodeMeta}</p>
                <span className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-[var(--brand)]" />
              </button>
            );
          })}

          <div className="absolute bottom-4 left-4 z-10 flex items-center rounded-md border bg-background/90 p-1 shadow-xs backdrop-blur">
            <IconTooltip label="Add node"><Button variant="ghost" size="icon-xs" aria-label="Add node"><Plus /></Button></IconTooltip>
            <IconTooltip label="Fit workflow"><Button variant="ghost" size="icon-xs" aria-label="Fit workflow"><Command /></Button></IconTooltip>
            <IconTooltip label="View API payload"><Button variant="ghost" size="icon-xs" aria-label="View API payload"><Code2 /></Button></IconTooltip>
          </div>
        </section>

        <HistoryPanel
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          items={historyItems}
          state={historyState}
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
            <CommandItem onSelect={() => { setSelectedNode('prompt'); setCommandOpen(false); }}>
              <WandSparkles /> Edit prompt <CommandShortcut>G P</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => { setSelectedNode('model'); setCommandOpen(false); }}>
              <Box /> Configure model <CommandShortcut>G M</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => { void runWorkflow(); setCommandOpen(false); }}>
              <Play /> Run workflow <CommandShortcut>⌘ ↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Workspace">
            <CommandItem onSelect={() => { setHistoryOpen(true); setCommandOpen(false); }}>
              <History /> Open shared history
            </CommandItem>
            <CommandItem><Save /> Save as preset</CommandItem>
            <CommandItem><Copy /> Duplicate workflow</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandMenu>
    </CommandDialog>
    </TooltipProvider>
  );
}

function RailButton({
  label,
  href,
  icon: Icon,
  active = false,
}: {
  label: string;
  href: string;
  icon: typeof Layers3;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            className={cn(
              'mb-1 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              active && 'bg-[var(--brand-soft)] text-foreground',
            )}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
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
  return (
    <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
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
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-11! w-full flex-col items-start gap-0 rounded-md bg-background px-2.5 shadow-xs hover:border-[var(--brand)] [&>svg]:absolute [&>svg]:right-2">
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <SelectValue className="mt-0.5 text-xs font-medium" />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
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
  const selected = aspectOptions.find((option) => option.value === value) ?? aspectOptions[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-11 w-full flex-col items-start justify-center rounded-md border bg-background px-2.5 text-left shadow-xs outline-none hover:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-ring/40">
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="mt-0.5 flex w-full items-center text-xs font-medium">
          {value}
          <span
            className="ml-auto h-3.5 max-w-5 rounded-[2px] border border-foreground/40 bg-muted"
            style={{ aspectRatio: value.replace(':', ' / ') }}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={7} className="w-64 gap-3 p-3">
        <PopoverHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <PopoverTitle className="text-xs">Aspect ratio</PopoverTitle>
              <span className="font-mono text-[8px] text-muted-foreground">aspect_ratio</span>
            </div>
            <Badge variant="outline" className="h-5 font-mono text-[8px]">~1 MP</Badge>
          </div>
          <PopoverDescription className="mt-2 text-[10px] leading-relaxed">
            Sets width and height to matching ~1MP dimensions; fine-tune under Advanced.
          </PopoverDescription>
        </PopoverHeader>
        <Select
          value={value}
          onValueChange={(next) => {
            onValueChange(next);
            setOpen(false);
          }}
        >
          <SelectTrigger className="h-9! w-full rounded-md bg-background text-[11px]">
            <SelectValue>{selected.value} · {selected.width}×{selected.height}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" className="min-w-60">
            <SelectGroup>
              <SelectLabel>Preset ratios</SelectLabel>
              {aspectOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="py-1.5">
                  <span
                    className="h-4 w-5 max-w-6 rounded-[2px] border border-foreground/30 bg-muted"
                    style={{ aspectRatio: option.value.replace(':', ' / ') }}
                  />
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

function HistoryPanel({
  open,
  onClose,
  items,
  state,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  items: HistoryRun[];
  state: 'loading' | 'synced' | 'error';
  onRefresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState('all');
  const visibleItems = filter === 'all' ? items : items.filter((item) => item.status === filter || item.origin === filter);
  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col border-l bg-background max-xl:absolute max-xl:inset-y-11 max-xl:right-0 max-xl:z-30 max-xl:w-[304px] max-xl:shadow-2xl',
        open ? 'max-xl:flex' : 'max-xl:hidden',
        'xl:flex',
      )}
    >
      <div className="flex h-11 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <History className="size-3.5" />
          <span className="text-xs font-medium">Shared history</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-1 font-mono text-[9px]',
              state === 'error' ? 'text-destructive' : 'text-[var(--success)]',
            )}
          >
            <Cloud className="size-3" /> {state === 'synced' ? 'LIVE' : state === 'error' ? 'OFFLINE' : 'SYNCING'}
          </span>
          <Button className="xl:hidden" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close history">
            <ArrowRight />
          </Button>
        </div>
      </div>

      <div className="border-b px-3 py-2">
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
          <Cloud className="size-3.5" />
          Synced to Studio workspace · WebSocket
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Recent runs</span>
          <div className="flex items-center gap-1">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger size="sm" className="h-6! w-[86px] border-0 bg-transparent px-1.5 text-[10px] shadow-none">
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
              <Button variant="ghost" size="icon-xs" onClick={() => void onRefresh()} aria-label="Refresh history">
                <RefreshCw className={cn(state === 'loading' && 'animate-spin')} />
              </Button>
            </IconTooltip>
          </div>
        </div>
        <div className="space-y-2.5">
          {items.length === 0 && state === 'loading' && (
            <div className="grid min-h-36 place-items-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Loading shared runs…</span>
            </div>
          )}
          {items.length === 0 && state === 'error' && (
            <div className="rounded-lg border border-dashed p-4 text-[11px] leading-relaxed text-muted-foreground">
              Shared history could not connect. The canvas still works locally; retry when the server is available.
            </div>
          )}
          {visibleItems.map((item, itemIndex) => (
            <article key={item.id} className="rounded-lg border bg-[var(--surface)] p-2.5 transition-colors hover:border-[var(--brand)]">
              <div className="flex gap-2.5">
              <div className="flex shrink-0 gap-1">
                {Array.from({ length: Math.min(2, item.outputCount) }, (_, preview) => (
                  <div
                    key={preview}
                    className={cn(
                      'grid h-10 w-12 place-items-center overflow-hidden rounded border',
                      ['bg-[#ebe7dd]', 'bg-[#e1e9e5]', 'bg-[#e5e4ec]'][itemIndex % 3],
                    )}
                  >
                    {item.assets[preview] ? (
                      <img src={item.assets[preview].url} alt="Generated output" className="size-full object-cover" />
                    ) : item.status === 'running' || item.status === 'queued' ? (
                      <Loader2 className="size-4 animate-spin text-foreground/35" />
                    ) : (
                      <ImageIcon className="size-4 text-foreground/35" />
                    )}
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[11px] font-medium leading-relaxed">{item.prompt}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[7px] uppercase tracking-wider text-muted-foreground">
                <span>{item.modelId}</span><span>·</span><span>{item.outputCount} outputs</span><span>·</span><span>{formatCost(item.costCredits)}</span>
              </div>
              </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground">{formatAge(item.createdAt)}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="h-5 px-1.5 font-mono text-[8px] uppercase">
                    {item.origin === 'sample' ? 'example' : item.status}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Run actions" />}>
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem><Star /> Favorite</DropdownMenuItem>
                      <DropdownMenuItem><Copy /> Copy prompt</DropdownMenuItem>
                      <DropdownMenuItem><SquareStack /> Duplicate run</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem><Download /> Download outputs</DropdownMenuItem>
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
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}
