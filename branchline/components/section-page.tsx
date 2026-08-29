'use client';

import NextImage from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  CheckCircle2,
  Cloud,
  Layers3,
  ListFilter,
  Loader2,
  Play,
  Plus,
  Search,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  PageHeading,
  ParameterChip,
  ProductHeader,
  ProductRail,
  Surface,
  SystemLabel,
  ThemeToggle,
  surfaceClass,
} from '@/components/product-system';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { HistoryRun } from '@/db/history';

export type WorkspaceSection =
  | 'workflows'
  | 'assets'
  | 'runs'
  | 'components'
  | 'settings';

const workflowRows = [
  [
    'Product portrait / v3',
    'Prompt → FLUX.2 [max] → Generate',
    '12 sec ago',
    'active',
  ],
  [
    'Typography stress test',
    'Brief → FLUX.2 [flex] → Compare',
    '42 min ago',
    'active',
  ],
  [
    'Campaign aspect matrix',
    'Prompt → 6 ratios → Export',
    'Yesterday',
    'draft',
  ],
  [
    'Reference style transfer',
    '3 references → FLUX.2 [pro] → Review',
    '2 days ago',
    'active',
  ],
  [
    'Klein exploration loop',
    'Seed list → FLUX.2 [klein] → Rank',
    '4 days ago',
    'paused',
  ],
  [
    'Editorial batch runner',
    'CSV prompts → FLUX.2 [pro] → Archive',
    '1 week ago',
    'draft',
  ],
] as const;

const generatedAssetImages = [
  { name: 'Mineral machine', src: '/generated/mineral-machine.png' },
  { name: 'Smoked glass', src: '/generated/smoked-glass.png' },
  { name: 'Field camera', src: '/generated/field-camera.png' },
  { name: 'Paper terrain', src: '/generated/paper-terrain.png' },
] as const;

const runRows = [
  [
    '#R-1042',
    'Soft industrial product portrait on mineral paper',
    'FLUX.2 [max]',
    'Succeeded',
    '2',
    '$0.14',
    '18 min ago',
  ],
  [
    '#R-1041',
    'Brutalist perfume bottle with smoked glass',
    'FLUX.2 [flex]',
    'Succeeded',
    '2',
    '$0.12',
    '42 min ago',
  ],
  [
    '#R-1040',
    'Alpine wayfinding icon family, 24 glyphs',
    'FLUX.2 [klein]',
    'Running',
    '4',
    '—',
    '1 hr ago',
  ],
  [
    '#R-1039',
    'Retro-futurist desktop machine, quiet studio',
    'FLUX.2 [max]',
    'Succeeded',
    '2',
    '$0.14',
    'Yesterday',
  ],
  [
    '#R-1038',
    'Folded-paper terrain with contour labels',
    'FLUX.2 [flex]',
    'Draft',
    '3',
    '—',
    'Yesterday',
  ],
] as const;

const sectionMeta: Record<
  WorkspaceSection,
  { title: string; description: string; action: string }
> = {
  workflows: {
    title: 'Workflows',
    description: 'Reusable visual generation graphs for your Studio workspace.',
    action: 'New workflow',
  },
  assets: {
    title: 'Assets',
    description: 'Generated outputs and uploaded references, stored centrally.',
    action: 'Upload assets',
  },
  runs: {
    title: 'Runs',
    description: 'Live and historical executions across every workflow.',
    action: 'Run workflow',
  },
  components: {
    title: 'Design system',
    description:
      'Tokens, controls and composition rules used across Branchline.',
    action: 'Export tokens',
  },
  settings: {
    title: 'Settings',
    description: 'Workspace identity, generation defaults and API behavior.',
    action: 'Save changes',
  },
};

export function SectionPage({
  section,
  viewer,
  signInPath,
}: {
  section: WorkspaceSection;
  viewer: { displayName: string; email: string } | null;
  signInPath: string;
}) {
  const [query, setQuery] = useState('');
  const meta = sectionMeta[section];
  return (
    <TooltipProvider delay={350}>
      <main className="h-svh overflow-hidden bg-background text-foreground">
        <ProductHeader
          center={
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this workspace…"
                className="h-9 border-0 bg-muted/60 pl-8 text-[13px] shadow-none"
              />
            </div>
          }
          end={
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ThemeToggle />
              {viewer ? (
                <>
                  <Cloud className="size-3.5 text-[var(--success)]" />
                  <span className="hidden sm:inline">Studio synced</span>
                  <Tooltip>
                    <TooltipTrigger className="grid size-7 place-items-center rounded-full bg-accent font-mono text-[10px] text-accent-foreground">
                      {initials(viewer.displayName)}
                    </TooltipTrigger>
                    <TooltipContent>{viewer.email}</TooltipContent>
                  </Tooltip>
                </>
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

        <div className="grid h-[calc(100svh-var(--app-header-height))] grid-cols-[var(--app-rail-width)_minmax(0,1fr)]">
          <ProductRail active={section} />

          <section className="min-w-0 overflow-y-auto bg-playground-surface">
            <div className="mx-auto w-full max-w-[1360px] px-6 py-5">
              <PageHeading
                title={meta.title}
                description={meta.description}
                action={<SectionAction section={section} action={meta.action} />}
              />
              <SectionContent section={section} query={query} signedIn={Boolean(viewer)} />
            </div>
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}

function SectionAction({ section, action }: { section: WorkspaceSection; action: string }) {
  // Runs is the only section whose primary action has a real destination today;
  // the rest stay visibly planned instead of silently dead.
  if (section === 'runs') {
    return (
      <Link
        href="/playground"
        className={buttonVariants({
          size: 'sm',
          className: 'bg-foreground px-3 text-background hover:bg-foreground/85 hover:text-background',
        })}
      >
        <Play /> {action}
      </Link>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex">
            <Button size="sm" variant="outline" disabled>
              <Plus /> {action}
            </Button>
          </span>
        }
      />
      <TooltipContent>Planned — see the roadmap in the README.</TooltipContent>
    </Tooltip>
  );
}

function SectionContent({
  section,
  query,
  signedIn,
}: {
  section: WorkspaceSection;
  query: string;
  signedIn: boolean;
}) {
  if (section === 'workflows') return <Workflows query={query} />;
  if (section === 'assets') return <Assets query={query} signedIn={signedIn} />;
  if (section === 'runs') return <Runs query={query} signedIn={signedIn} />;
  if (section === 'components') return <Components query={query} />;
  return <Settings />;
}

// Shared history loader for the Runs and Assets sections. Sample rows stay the
// fallback for signed-out viewers and load failures.
function useLiveRuns(signedIn: boolean) {
  const [runs, setRuns] = useState<HistoryRun[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    signedIn ? 'loading' : 'idle',
  );
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void fetch('/api/history', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const data = (await response.json()) as { runs: HistoryRun[] };
          if (!cancelled) {
            setRuns(data.runs);
            setState('ready');
          }
        })
        .catch(() => {
          if (!cancelled) setState('error');
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [signedIn]);
  return { runs, state };
}

function ExampleDataBadge() {
  return (
    <Badge variant="outline" className="rounded-md font-mono text-[9px] text-muted-foreground">
      EXAMPLE DATA
    </Badge>
  );
}

function Workflows({ query }: { query: string }) {
  const items = workflowRows.filter((row) =>
    row.join(' ').toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {items.map(([name, graph, age, status]) => {
        const steps = graph.split(' → ');
        return (
          <article
            key={name}
            className={cn(
              surfaceClass,
              'group p-4 transition-colors hover:border-foreground/25',
            )}
          >
            <div className="mb-3 flex items-start justify-between">
              <Badge
                variant="outline"
                className="h-5 rounded-md font-mono text-[9px] uppercase tracking-wider"
              >
                {steps.length} nodes
              </Badge>
              <ExampleDataBadge />
            </div>
            <h2 className="text-[13px] font-semibold">{name}</h2>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {graph}
            </p>
            <div className="my-4 grid grid-cols-[minmax(0,1fr)_10px_minmax(0,1fr)_10px_minmax(0,1fr)] items-center gap-1 rounded-md border bg-playground-surface p-2">
              {steps.map((step, node) => (
                <span key={`${step}-${node}`} className="contents">
                  <span className="min-w-0 rounded-md border bg-background px-2 py-1.5">
                    <span className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {node === 0
                        ? 'Input'
                        : node === steps.length - 1
                          ? 'Output'
                          : 'Model'}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[10px] font-medium"
                      title={step}
                    >
                      {step}
                    </span>
                  </span>
                  {node < steps.length - 1 && (
                    <span className="text-center font-mono text-[9px] text-muted-foreground">
                      →
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{age}</span>
              <Badge
                variant="outline"
                className="h-5 rounded-md font-mono text-[9px] uppercase"
              >
                {status}
              </Badge>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Assets({ query, signedIn }: { query: string; signedIn: boolean }) {
  const [kind, setKind] = useState('all');
  const { runs, state } = useLiveRuns(signedIn);

  const liveAssets = useMemo(
    () =>
      (runs ?? [])
        .filter((run) => run.origin !== 'sample')
        .flatMap((run) =>
          run.assets.map((asset) => ({
            id: asset.id,
            name: run.prompt,
            src: asset.url,
            kind: 'output',
            live: true,
          })),
        ),
    [runs],
  );
  const isLive = state === 'ready' && liveAssets.length > 0;

  const assets = useMemo(() => {
    const source = isLive
      ? liveAssets
      : Array.from({ length: 12 }, (_, index) => ({
          id: String(index + 1),
          name: `${generatedAssetImages[index % generatedAssetImages.length].name} · ${Math.floor(index / generatedAssetImages.length) + 1}`,
          src: generatedAssetImages[index % generatedAssetImages.length].src,
          kind: index % 4 === 0 ? 'reference' : 'output',
          live: false,
        }));
    return source.filter(
      (asset) =>
        (kind === 'all' || asset.kind === kind) &&
        asset.name.toLowerCase().includes(query.toLowerCase()),
    );
  }, [isLive, liveAssets, kind, query]);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Select value={kind} onValueChange={(next) => next && setKind(next)}>
          <SelectTrigger className="h-7! w-32 text-[10px]">
            <ListFilter />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assets</SelectItem>
            <SelectItem value="output">Outputs</SelectItem>
            <SelectItem value="reference">References</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="rounded-md font-mono text-[9px]">
          {assets.length} ITEMS
        </Badge>
        {state === 'loading' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {!isLive && state !== 'loading' && <ExampleDataBadge />}
      </div>
      {isLive && assets.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-[12px] leading-relaxed text-muted-foreground">
          No stored outputs match this filter yet — generate images in the Playground and they
          land here automatically.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className={cn(surfaceClass, 'group overflow-hidden')}
          >
            <div className="aspect-square overflow-hidden bg-muted">
              <NextImage
                src={asset.src}
                alt={asset.name}
                width={640}
                height={640}
                unoptimized={asset.live}
                sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
              />
            </div>
            <div className="p-2">
              <p className="truncate text-[11px] font-medium">{asset.name}</p>
              <p className="mt-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                {asset.kind}
              </p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

const runsGridClass = 'grid grid-cols-[80px_minmax(240px,1fr)_130px_100px_54px_64px_92px] gap-3';

function runStatusDotClass(status: string) {
  if (['running', 'queued'].includes(status)) return 'bg-amber-500';
  if (['failed'].includes(status)) return 'bg-destructive';
  if (['partial', 'moderated'].includes(status)) return 'bg-amber-600';
  if (status === 'draft') return 'bg-muted-foreground';
  return 'bg-[var(--success)]';
}

function Runs({ query, signedIn }: { query: string; signedIn: boolean }) {
  const { runs, state } = useLiveRuns(signedIn);
  const liveRuns = (runs ?? []).filter((run) => run.origin !== 'sample');
  const isLive = state === 'ready' && liveRuns.length > 0;

  const liveRows = liveRuns.filter((run) =>
    `${run.prompt} ${run.modelId} ${run.status}`.toLowerCase().includes(query.toLowerCase()),
  );
  const sampleRows = runRows.filter((row) =>
    row.join(' ').toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        {state === 'loading' && (
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading shared runs…
          </span>
        )}
        {!isLive && state !== 'loading' && <ExampleDataBadge />}
      </div>
      <div className={cn(surfaceClass, 'overflow-x-auto')}>
        <div
          className={cn(
            runsGridClass,
            'min-w-[760px] border-b bg-muted/45 px-3 py-2.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground',
          )}
        >
          <span>Run</span>
          <span>Prompt</span>
          <span>Model</span>
          <span>Status</span>
          <span>Images</span>
          <span>Cost</span>
          <span>Created</span>
        </div>
        {isLive
          ? liveRows.map((run) => (
              <div
                key={run.id}
                className={cn(
                  runsGridClass,
                  'min-w-[760px] items-center border-b px-3 py-3 text-[11px] last:border-0',
                )}
              >
                <span className="font-mono">#{run.id.slice(0, 6)}</span>
                <span className="truncate font-medium" title={run.prompt}>
                  {run.prompt}
                </span>
                <span>{run.modelId}</span>
                <span className="flex items-center gap-1.5 capitalize">
                  <span className={cn('size-1.5 rounded-full', runStatusDotClass(run.status))} />
                  {run.status}
                </span>
                <span>{run.outputCount}</span>
                <span>{formatCost(run.costCredits)}</span>
                <span className="text-muted-foreground">{formatAge(run.createdAt)}</span>
              </div>
            ))
          : sampleRows.map(([id, prompt, model, status, images, cost, created]) => (
              <div
                key={id}
                className={cn(
                  runsGridClass,
                  'min-w-[760px] items-center border-b px-3 py-3 text-[11px] last:border-0',
                )}
              >
                <span className="font-mono">{id}</span>
                <span className="truncate font-medium">{prompt}</span>
                <span>{model}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn('size-1.5 rounded-full', runStatusDotClass(status.toLowerCase()))}
                  />
                  {status}
                </span>
                <span>{images}</span>
                <span>{cost}</span>
                <span className="text-muted-foreground">{created}</span>
              </div>
            ))}
        {isLive && liveRows.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-muted-foreground">No runs match this search.</p>
        )}
      </div>
    </>
  );
}

function Components({ query }: { query: string }) {
  const matches = (value: string) =>
    value.toLowerCase().includes(query.trim().toLowerCase());
  const colors = [
    ['Foreground', 'bg-foreground', '147 · 43% · 7%'],
    ['Accent', 'bg-accent', '150 · 27% · 88%'],
    ['Rail active', 'bg-sidebar-accent', '151 · 21% · 81%'],
    ['Surface', 'bg-playground-surface', '0 · 0% · 98%'],
    ['Border', 'bg-border', '0 · 0% · 90%'],
    ['Muted copy', 'bg-muted-foreground', '0 · 0% · 50%'],
  ].filter((color) => matches(color.join(' ')));
  const componentItems = [
    [
      'Prompt',
      'Input',
      'Long-form creative instruction with references',
      WandSparkles,
    ],
    [
      'FLUX.2 Model',
      'Model',
      'Validated controls for max, pro, flex and klein',
      Box,
    ],
    ['Generate', 'Action', 'Async BFL request with realtime lifecycle', Zap],
    [
      'Compare',
      'Utility',
      'Side-by-side model and parameter evaluation',
      Layers3,
    ],
    [
      'Review gate',
      'Control',
      'Human approval before publishing outputs',
      CheckCircle2,
    ],
  ].filter((item) => matches(item.join(' ')));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface className="p-5">
          <SystemLabel>Color roles</SystemLabel>
          <h2 className="mt-1.5 text-[15px] font-semibold">
            Quiet surfaces, decisive foreground
          </h2>
          <p className="mt-1 max-w-xl text-[12px] leading-5 text-muted-foreground">
            Mint communicates selection and context. Dark green is reserved for
            primary actions, graph activity and high-confidence status.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {colors.map(([name, swatch, value]) => (
              <div
                key={name}
                className="flex items-center gap-2.5 rounded-md border p-2.5"
              >
                <span
                  className={cn('size-8 shrink-0 rounded-md border', swatch)}
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium">{name}</p>
                  <p className="truncate font-mono text-[9px] text-muted-foreground">
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="p-5">
          <SystemLabel>Type scale</SystemLabel>
          <div className="mt-4 space-y-4">
            <TypeSpec
              label="Workspace heading · 24/32"
              className="text-[24px] font-semibold leading-8 tracking-[-0.025em]"
            >
              Design system
            </TypeSpec>
            <TypeSpec
              label="Section heading · 15/20"
              className="text-[15px] font-semibold leading-5"
            >
              Shared history
            </TypeSpec>
            <TypeSpec label="Body · 13/20" className="text-[13px] leading-5">
              Compose, run and compare visual workflows.
            </TypeSpec>
            <TypeSpec
              label="Technical label · 10/14"
              className="font-mono text-[10px] uppercase leading-[14px] tracking-wider text-muted-foreground"
            >
              Aspect ratio
            </TypeSpec>
          </div>
        </Surface>
      </div>

      <Surface className="p-5">
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr_0.9fr]">
          <div>
            <SystemLabel>Controls</SystemLabel>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm">Primary action</Button>
              <Button size="sm" variant="outline">
                Secondary
              </Button>
              <Button size="sm" variant="ghost">
                Ghost
              </Button>
              <Badge
                variant="outline"
                className="rounded-md font-mono text-[9px]"
              >
                SYNCED
              </Badge>
            </div>
          </div>
          <div>
            <SystemLabel>Parameter chips</SystemLabel>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ParameterChip label="Aspect ratio" value="4:3" active />
              <ParameterChip label="Outputs" value="2" />
              <ParameterChip label="Safety" value="2" />
              <ParameterChip label="Format" value="PNG" />
            </div>
          </div>
          <div>
            <SystemLabel>Spacing</SystemLabel>
            <div className="mt-3 flex items-end gap-2">
              {[4, 6, 8, 12, 16, 20, 24].map((space) => (
                <div key={space} className="flex flex-col items-center gap-1.5">
                  <span
                    className="w-4 rounded-sm bg-sidebar-accent"
                    style={{ height: space }}
                  />
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {space}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Surface>

      <div>
        <SystemLabel className="mb-2.5">Graph components</SystemLabel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {componentItems.map(([name, type, description, Icon]) => (
            <Surface key={String(name)} className="flex items-start gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent">
                {typeof Icon !== 'string' && <Icon className="size-4" />}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold">{String(name)}</h2>
                  <Badge
                    variant="outline"
                    className="h-5 rounded-md font-mono text-[9px] uppercase"
                  >
                    {String(type)}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {String(description)}
                </p>
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypeSpec({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-baseline gap-3 border-b pb-3 last:border-0 last:pb-0">
      <span className="font-mono text-[9px] text-muted-foreground">
        {label}
      </span>
      <span className={className}>{children}</span>
    </div>
  );
}

function Settings() {
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className={cn(surfaceClass, 'h-fit p-2')}>
        {[
          'General',
          'Generation defaults',
          'Members',
          'API & realtime',
          'Storage',
        ].map((item, index) => (
          <button
            key={item}
            disabled={index !== 0}
            className={cn(
              'flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-[12px]',
              index === 0
                ? 'bg-sidebar-accent font-medium'
                : 'cursor-default text-muted-foreground',
            )}
          >
            {item}
            {index !== 0 && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                soon
              </span>
            )}
          </button>
        ))}
      </aside>
      <div className="space-y-3">
        <SettingsCard
          title="Workspace identity"
          description="Shown across workflows, runs and shared history"
        >
          <label
            htmlFor="workspace-name"
            className="grid gap-1.5 text-[12px] font-medium"
          >
            Workspace name
            <Input
              id="workspace-name"
              defaultValue="Studio"
              className="h-9 text-[13px]"
            />
          </label>
        </SettingsCard>
        <SettingsCard
          title="Server behavior"
          description="These subsystems are always on for the prototype — shown as status, not switches"
        >
          <SettingStatus
            label="Shared server history"
            description="Generations sync across signed-in browsers via D1"
          />
          <SettingStatus
            label="WebSocket updates"
            description="Run state and asset changes push in realtime"
          />
          <SettingStatus
            label="Polling fallback"
            description="Refreshes every 15 seconds if the socket disconnects"
          />
        </SettingsCard>
        <SettingsCard
          title="Collaboration"
          description="Workspace-level access and generation permissions"
        >
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="flex items-center gap-2 text-[12px]">
              <Users className="size-4" /> 1 workspace member
            </span>
            <Button variant="outline" size="xs" disabled>
              Manage
            </Button>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Surface className="p-4">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
        {description}
      </p>
      <div className="mt-4 space-y-4">{children}</div>
    </Surface>
  );
}
function SettingStatus({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-3 first:border-0 first:pt-0">
      <div>
        <p className="text-[12px] font-medium">{label}</p>
        <p className="text-[10px] leading-4 text-muted-foreground">
          {description}
        </p>
      </div>
      <Badge
        variant="outline"
        className="h-5 rounded-md border-[var(--success)]/40 font-mono text-[9px] uppercase text-[var(--success)]"
      >
        Active
      </Badge>
    </div>
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
