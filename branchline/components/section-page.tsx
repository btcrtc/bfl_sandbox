'use client';

import NextImage from 'next/image';
import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  Clipboard,
  Cloud,
  Database,
  ImagePlus,
  Layers3,
  ListFilter,
  Loader2,
  Play,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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

export type WorkspaceSection = 'assets' | 'runs' | 'components' | 'settings';

const sectionMeta: Record<
  WorkspaceSection,
  { eyebrow: string; title: string; description: string }
> = {
  assets: {
    eyebrow: 'Workspace library',
    title: 'Assets',
    description: 'Generated outputs and uploaded references, stored centrally.',
  },
  runs: {
    eyebrow: 'Generation activity',
    title: 'Runs',
    description: 'Live and historical executions across every workflow.',
  },
  components: {
    eyebrow: 'Product foundations',
    title: 'Design system',
    description:
      'Tokens, controls and composition rules used across Branchline.',
  },
  settings: {
    eyebrow: 'Studio configuration',
    title: 'Settings',
    description: 'Workspace identity, generation defaults and API behavior.',
  },
};

const DESIGN_TOKENS = {
  color: {
    foreground: 'hsl(147 43% 7%)',
    accent: 'hsl(150 27% 88%)',
    railActive: 'hsl(151 21% 81%)',
    surface: 'hsl(0 0% 98%)',
    border: 'hsl(0 0% 90%)',
    muted: 'hsl(0 0% 50%)',
  },
  radius: { control: 6, surface: 8 },
  size: { header: 48, rail: 48, controlSm: 28, controlMd: 36 },
  spacing: [4, 6, 8, 12, 16, 20, 24],
} as const;

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
            section === 'settings' ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <SlidersHorizontal className="size-3.5" />
                <span>Workspace settings</span>
              </div>
            ) : (
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${meta.title.toLowerCase()}…`}
                  aria-label={`Search ${meta.title.toLowerCase()}`}
                  className="h-9 border-0 bg-muted/60 pl-8 text-[13px] shadow-none"
                />
              </div>
            )
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
                eyebrow={meta.eyebrow}
                title={meta.title}
                description={meta.description}
                action={<SectionAction section={section} />}
              />
              <SectionContent
                section={section}
                query={query}
                viewer={viewer}
                signInPath={signInPath}
              />
            </div>
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}

function SectionAction({ section }: { section: WorkspaceSection }) {
  const [copied, setCopied] = useState(false);
  if (section === 'assets' || section === 'runs') {
    const assets = section === 'assets';
    return (
      <Link
        href="/playground"
        className={buttonVariants({
          size: 'sm',
          className:
            'bg-foreground px-3 text-background hover:bg-foreground/85 hover:text-background',
        })}
      >
        {assets ? <ImagePlus /> : <Play />}
        {assets ? 'Generate asset' : 'Run workflow'}
      </Link>
    );
  }
  if (section !== 'components') return null;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(
          JSON.stringify(DESIGN_TOKENS, null, 2),
        );
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check /> : <Clipboard />}
      {copied ? 'Tokens copied' : 'Copy tokens'}
    </Button>
  );
}

function SectionContent({
  section,
  query,
  viewer,
  signInPath,
}: {
  section: WorkspaceSection;
  query: string;
  viewer: { displayName: string; email: string } | null;
  signInPath: string;
}) {
  const signedIn = Boolean(viewer);
  if (section === 'assets')
    return <Assets query={query} signedIn={signedIn} signInPath={signInPath} />;
  if (section === 'runs')
    return <Runs query={query} signedIn={signedIn} signInPath={signInPath} />;
  if (section === 'components') return <Components query={query} />;
  return <Settings viewer={viewer} />;
}

// Shared history loader for the Runs and Assets sections.
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

function EmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon: ElementType;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-background/55 p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-10 place-items-center rounded-lg border bg-background text-muted-foreground shadow-[var(--surface-shadow)]">
          <Icon className="size-4" />
        </span>
        <SystemLabel className="mt-4">{eyebrow}</SystemLabel>
        <h2 className="mt-1.5 text-[15px] font-semibold tracking-[-0.015em]">
          {title}
        </h2>
        <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
          {description}
        </p>
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

function AssetSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg border bg-background"
          aria-hidden="true"
        >
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="space-y-1.5 p-2">
            <div className="h-2.5 w-3/4 animate-pulse rounded-sm bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RunSkeleton() {
  return (
    <div
      className={cn(runsGridClass, 'min-w-[820px] items-center px-3 py-2')}
      aria-label="Loading run history"
    >
      <div className="aspect-video w-16 animate-pulse rounded bg-muted" />
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="h-2.5 animate-pulse rounded-sm bg-muted" />
      ))}
    </div>
  );
}

function Assets({
  query,
  signedIn,
  signInPath,
}: {
  query: string;
  signedIn: boolean;
  signInPath: string;
}) {
  const [kind, setKind] = useState('all');
  const { runs, state } = useLiveRuns(signedIn);

  const assets = useMemo(
    () =>
      (runs ?? [])
        .flatMap((run) =>
          run.assets.map((asset) => ({
            id: asset.id,
            name: run.prompt,
            src: asset.url,
            model: run.modelId,
            video: asset.mimeType.startsWith('video/'),
            createdAt: run.createdAt,
          })),
        )
        .filter(
          (asset) =>
            (kind === 'all' || (kind === 'video') === asset.video) &&
            asset.name.toLowerCase().includes(query.toLowerCase()),
        ),
    [runs, kind, query],
  );

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
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="rounded-md font-mono text-[9px]">
          {assets.length} ITEMS
        </Badge>
        {state === 'loading' && (
          <span className="font-mono text-[9px] uppercase text-muted-foreground">
            Syncing library…
          </span>
        )}
      </div>
      {!signedIn && (
        <EmptyState
          icon={ShieldCheck}
          eyebrow="Private workspace"
          title="Sign in to open the shared library"
          description="Generated frames, references and video drafts stay isolated inside your workspace."
          action={
            <a href={signInPath} className={buttonVariants({ size: 'sm' })}>
              Sign in <ArrowRight />
            </a>
          }
        />
      )}
      {signedIn && state === 'loading' && <AssetSkeleton />}
      {signedIn && state === 'error' && (
        <EmptyState
          icon={Cloud}
          eyebrow="Sync unavailable"
          title="The asset library could not be loaded"
          description="Your files are safe. Refresh the page when the workspace connection is available again."
        />
      )}
      {signedIn && state === 'ready' && assets.length === 0 && (
        <EmptyState
          icon={ImagePlus}
          eyebrow="0 assets"
          title="Start with a frame"
          description="Generate in the Playground or render a still in Scenes; each output is indexed here automatically."
          action={
            <Link href="/playground" className={buttonVariants({ size: 'sm' })}>
              Open Playground <ArrowRight />
            </Link>
          }
        />
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className={cn(surfaceClass, 'group overflow-hidden')}
          >
            <div className="aspect-square overflow-hidden bg-muted">
              {asset.video ? (
                <video
                  src={asset.src}
                  muted
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
              ) : (
                <NextImage
                  src={asset.src}
                  alt={asset.name}
                  width={640}
                  height={640}
                  unoptimized
                  sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                />
              )}
            </div>
            <div className="p-2">
              <p
                className="truncate text-[11px] font-medium"
                title={asset.name}
              >
                {asset.name}
              </p>
              <p className="mt-0.5 truncate font-mono text-[9px] uppercase text-muted-foreground">
                {asset.video ? 'video' : 'image'} · {asset.model}
              </p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

const runsGridClass =
  'grid grid-cols-[64px_80px_minmax(220px,1fr)_130px_100px_54px_64px_92px] gap-3';

function runStatusDotClass(status: string) {
  if (['running', 'queued'].includes(status)) return 'bg-amber-500';
  if (['failed'].includes(status)) return 'bg-destructive';
  if (['partial', 'moderated'].includes(status)) return 'bg-amber-600';
  if (status === 'draft') return 'bg-muted-foreground';
  return 'bg-[var(--success)]';
}

function Runs({
  query,
  signedIn,
  signInPath,
}: {
  query: string;
  signedIn: boolean;
  signInPath: string;
}) {
  const { runs, state } = useLiveRuns(signedIn);
  const rows = (runs ?? []).filter((run) =>
    `${run.prompt} ${run.modelId} ${run.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  if (!signedIn) {
    return (
      <EmptyState
        icon={ShieldCheck}
        eyebrow="Private workspace"
        title="Sign in to inspect generation activity"
        description="Run status, cost and outputs are scoped to the active workspace."
        action={
          <a href={signInPath} className={buttonVariants({ size: 'sm' })}>
            Sign in <ArrowRight />
          </a>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        {state === 'loading' && (
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading shared runs…
          </span>
        )}
      </div>
      {state === 'error' ? (
        <EmptyState
          icon={Cloud}
          eyebrow="Sync unavailable"
          title="Run history could not be loaded"
          description="Refresh when the realtime service is available again."
        />
      ) : (
        <div className={cn(surfaceClass, 'overflow-x-auto')}>
          <div
            className={cn(
              runsGridClass,
              'min-w-[820px] border-b bg-muted/45 px-3 py-2.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground',
            )}
          >
            <span>Output</span>
            <span>Run</span>
            <span>Prompt</span>
            <span>Model</span>
            <span>Status</span>
            <span>Images</span>
            <span>Cost</span>
            <span>Created</span>
          </div>
          {rows.map((run) => {
            const thumb = run.assets[0];
            return (
              <div
                key={run.id}
                className={cn(
                  runsGridClass,
                  'min-w-[820px] items-center border-b px-3 py-2 text-[11px] last:border-0',
                )}
              >
                <span className="block aspect-video w-16 overflow-hidden rounded border bg-muted">
                  {thumb ? (
                    thumb.mimeType.startsWith('video/') ? (
                      <video
                        src={thumb.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="size-full object-cover"
                      />
                    ) : (
                      <NextImage
                        src={thumb.url}
                        alt=""
                        width={128}
                        height={72}
                        unoptimized
                        className="size-full object-cover"
                      />
                    )
                  ) : null}
                </span>
                <span className="font-mono">#{run.id.slice(0, 6)}</span>
                <span className="truncate font-medium" title={run.prompt}>
                  {run.prompt}
                </span>
                <span>{run.modelId}</span>
                <span className="flex items-center gap-1.5 capitalize">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      runStatusDotClass(run.status),
                    )}
                  />
                  {run.status}
                </span>
                <span>{run.outputCount}</span>
                <span>{formatCost(run.costCredits)}</span>
                <span className="text-muted-foreground">
                  {formatAge(run.createdAt)}
                </span>
              </div>
            );
          })}
          {state === 'loading' && <RunSkeleton />}
          {state === 'ready' && rows.length === 0 && (
            <div className="p-3">
              <EmptyState
                icon={Play}
                eyebrow="0 runs"
                title="Nothing has run yet"
                description="Start a workflow and its status, spend and outputs will appear here."
                action={
                  <Link
                    href="/playground"
                    className={buttonVariants({ size: 'sm' })}
                  >
                    Run a workflow <ArrowRight />
                  </Link>
                }
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Components({ query }: { query: string }) {
  const matches = (value: string) =>
    value.toLowerCase().includes(query.trim().toLowerCase());
  const colors = [
    ['Foreground', 'bg-foreground', '--foreground'],
    ['Accent', 'bg-accent', '--accent'],
    ['Rail active', 'bg-sidebar-accent', '--sidebar-accent'],
    ['Surface', 'bg-playground-surface', '--playground-surface'],
    ['Border', 'bg-border', '--border'],
    ['Muted copy', 'bg-muted-foreground', '--muted-foreground'],
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

function Settings({
  viewer,
}: {
  viewer: { displayName: string; email: string } | null;
}) {
  return (
    <div className="max-w-[880px] space-y-3">
      <SettingsCard
        title="Workspace context"
        description="The active workspace determines which boards, assets and runs are visible"
      >
        <SettingRow
          icon={Layers3}
          label="Active workspace"
          description="Switch workspaces and projects from the control beside the Branchline logo."
          value="Header switcher"
        />
        <SettingRow
          icon={ShieldCheck}
          label="Session owner"
          description={
            viewer?.email ?? 'Sign in to create a private workspace session.'
          }
          value={viewer?.displayName ?? 'Signed out'}
        />
      </SettingsCard>
      <SettingsCard
        title="Server behavior"
        description="Operational services are shown as status, not misleading switches"
      >
        <SettingStatus
          icon={Database}
          label="Shared server history"
          description="Generations sync across signed-in browsers via D1"
        />
        <SettingStatus
          icon={Radio}
          label="WebSocket updates"
          description="Run state and asset changes push in realtime"
        />
        <SettingStatus
          icon={Cloud}
          label="Polling fallback"
          description="Refreshes every 15 seconds if the socket disconnects"
        />
      </SettingsCard>
      <SettingsCard
        title="Access boundary"
        description="This portfolio build keeps every visitor isolated by default"
      >
        <SettingRow
          icon={ShieldCheck}
          label="Private by default"
          description="Boards, media and generation budgets never cross workspace boundaries."
          value="Isolated"
        />
      </SettingsCard>
    </div>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  value,
}: {
  icon: ElementType;
  label: string;
  description: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-t pt-3 first:border-0 first:pt-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium">{label}</p>
        <p className="truncate text-[10px] leading-4 text-muted-foreground">
          {description}
        </p>
      </div>
      <span className="max-w-44 truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {value}
      </span>
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
  icon: Icon,
  label,
  description,
}: {
  icon: ElementType;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 border-t pt-3 first:border-0 first:pt-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium">{label}</p>
        <p className="truncate text-[10px] leading-4 text-muted-foreground">
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
