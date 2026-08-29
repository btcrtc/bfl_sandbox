'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  Ellipsis,
  Layers3,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PageHeading,
  ParameterChip,
  ProductHeader,
  ProductRail,
  Surface,
  SystemLabel,
  surfaceClass,
} from '@/components/product-system';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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

export function SectionPage({ section }: { section: WorkspaceSection }) {
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
              <Cloud className="size-3.5 text-[var(--success)]" />
              <span className="hidden sm:inline">Studio synced</span>
              <span className="grid size-7 place-items-center rounded-full bg-[#ead9cc] font-mono text-[10px]">
                YW
              </span>
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
                action={
                  <Button
                    size="sm"
                    className="bg-foreground px-3 text-background hover:bg-foreground/85 hover:text-background"
                  >
                    <Plus /> {meta.action}
                  </Button>
                }
              />
              <SectionContent section={section} query={query} />
            </div>
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}

function SectionContent({
  section,
  query,
}: {
  section: WorkspaceSection;
  query: string;
}) {
  if (section === 'workflows') return <Workflows query={query} />;
  if (section === 'assets') return <Assets query={query} />;
  if (section === 'runs') return <Runs query={query} />;
  if (section === 'components') return <Components query={query} />;
  return <Settings />;
}

function Workflows({ query }: { query: string }) {
  const items = workflowRows.filter((row) =>
    row.join(' ').toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {items.map(([name, graph, age, status]) => (
        <article
          key={name}
          className={cn(
            surfaceClass,
            'group p-4 transition-colors hover:border-foreground/25',
          )}
        >
          <div className="mb-3 flex items-start justify-between">
            <div className="grid size-8 place-items-center rounded-md bg-[var(--brand-soft)]">
              <Layers3 className="size-4" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Workflow actions"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Code2 /> Export JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <h2 className="text-[13px] font-semibold">{name}</h2>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {graph}
          </p>
          <div className="my-4 flex items-center gap-1.5 rounded-md border bg-playground-surface p-2.5">
            {[WandSparkles, Box, Zap].map((Icon, node) => (
              <span key={node} className="contents">
                <span className="grid size-7 place-items-center rounded border bg-background">
                  <Icon className="size-3" />
                </span>
                {node < 2 && <span className="h-px flex-1 bg-border" />}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{age}</span>
            <Badge
              variant="outline"
              className="h-5 rounded-md font-mono text-[8px] uppercase"
            >
              {status}
            </Badge>
          </div>
        </article>
      ))}
    </div>
  );
}

function Assets({ query }: { query: string }) {
  const [kind, setKind] = useState('all');
  const assets = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        id: index + 1,
        name:
          ['Mineral machine', 'Smoked glass', 'Alpine glyphs', 'Field camera'][
            index % 4
          ] + ` · ${index + 1}`,
        kind: index % 4 === 0 ? 'reference' : 'output',
      })).filter(
        (asset) =>
          (kind === 'all' || asset.kind === kind) &&
          asset.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [kind, query],
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
            <SelectItem value="output">Outputs</SelectItem>
            <SelectItem value="reference">References</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="rounded-md font-mono text-[9px]">
          {assets.length} ITEMS
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {assets.map((asset, index) => (
          <article
            key={asset.id}
            className={cn(surfaceClass, 'overflow-hidden')}
          >
            <div
              className={cn(
                'aspect-square',
                [
                  'bg-[radial-gradient(circle_at_65%_35%,#d9a45a_0_8%,transparent_9%),linear-gradient(135deg,#e8e2d6,#a8b8a3)]',
                  'bg-[linear-gradient(145deg,#193d2a_0_35%,#7b927b_36%_65%,#efe8dc_66%)]',
                  'bg-[radial-gradient(circle,#345c42_0_15%,#d8dfd2_16%_30%,#ede9df_31%)]',
                ][index % 3],
              )}
            />
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

function Runs({ query }: { query: string }) {
  const rows = runRows.filter((row) =>
    row.join(' ').toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={cn(surfaceClass, 'overflow-hidden')}>
      <div className="grid grid-cols-[74px_minmax(240px,1fr)_130px_84px_54px_64px_82px_28px] gap-3 border-b bg-muted/45 px-3 py-2.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>Run</span>
        <span>Prompt</span>
        <span>Model</span>
        <span>Status</span>
        <span>Images</span>
        <span>Cost</span>
        <span>Created</span>
        <span />
      </div>
      {rows.map(([id, prompt, model, status, images, cost, created]) => (
        <div
          key={id}
          className="grid grid-cols-[74px_minmax(240px,1fr)_130px_84px_54px_64px_82px_28px] items-center gap-3 border-b px-3 py-3 text-[11px] last:border-0"
        >
          <span className="font-mono">{id}</span>
          <span className="truncate font-medium">{prompt}</span>
          <span>{model}</span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'size-1.5 rounded-full',
                status === 'Running'
                  ? 'bg-amber-500'
                  : status === 'Draft'
                    ? 'bg-muted-foreground'
                    : 'bg-[var(--success)]',
              )}
            />
            {status}
          </span>
          <span>{images}</span>
          <span>{cost}</span>
          <span className="text-muted-foreground">{created}</span>
          <Button variant="ghost" size="icon-xs">
            <Ellipsis />
          </Button>
        </div>
      ))}
    </div>
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
                  <span className="font-mono text-[8px] text-muted-foreground">
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
                    className="h-5 rounded-md font-mono text-[8px] uppercase"
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
            className={cn(
              'flex h-8 w-full items-center rounded-md px-2.5 text-left text-[12px] hover:bg-accent',
              index === 0 && 'bg-sidebar-accent font-medium',
            )}
          >
            {item}
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
          description="D1 persistence, R2 assets and realtime delivery"
        >
          <SettingToggle
            label="Shared server history"
            description="Sync generations across signed-in browsers"
            checked
          />
          <SettingToggle
            label="WebSocket updates"
            description="Push run state and asset changes in realtime"
            checked
          />
          <SettingToggle
            label="Polling fallback"
            description="Refresh every 15 seconds if the socket disconnects"
            checked
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
            <Button variant="outline" size="xs">
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
function SettingToggle({
  label,
  description,
  checked,
}: {
  label: string;
  description: string;
  checked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-3 first:border-0 first:pt-0">
      <div>
        <p className="text-[12px] font-medium">{label}</p>
        <p className="text-[10px] leading-4 text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch size="sm" defaultChecked={checked} />
    </div>
  );
}
