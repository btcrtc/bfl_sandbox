'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Box,
  Braces,
  CheckCircle2,
  Clock3,
  Cloud,
  Code2,
  Copy,
  Ellipsis,
  Image as ImageIcon,
  Layers3,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type WorkspaceSection = 'workflows' | 'assets' | 'runs' | 'components' | 'settings';

const navigation = [
  { id: 'workflows', label: 'Workflows', href: '/workflows', icon: Layers3 },
  { id: 'playground', label: 'Playground', href: '/playground', icon: Sparkles },
  { id: 'assets', label: 'Assets', href: '/assets', icon: ImageIcon },
  { id: 'divider', label: '', href: '', icon: Box },
  { id: 'runs', label: 'Runs', href: '/runs', icon: Clock3 },
  { id: 'components', label: 'Components', href: '/components', icon: Box },
] as const;

const workflowRows = [
  ['Product portrait / v3', 'Prompt → FLUX.2 [max] → Generate', '12 sec ago', 'active'],
  ['Typography stress test', 'Brief → FLUX.2 [flex] → Compare', '42 min ago', 'active'],
  ['Campaign aspect matrix', 'Prompt → 6 ratios → Export', 'Yesterday', 'draft'],
  ['Reference style transfer', '3 references → FLUX.2 [pro] → Review', '2 days ago', 'active'],
  ['Klein exploration loop', 'Seed list → FLUX.2 [klein] → Rank', '4 days ago', 'paused'],
  ['Editorial batch runner', 'CSV prompts → FLUX.2 [pro] → Archive', '1 week ago', 'draft'],
] as const;

const runRows = [
  ['#R-1042', 'Soft industrial product portrait on mineral paper', 'FLUX.2 [max]', 'Succeeded', '2', '$0.14', '18 min ago'],
  ['#R-1041', 'Brutalist perfume bottle with smoked glass', 'FLUX.2 [flex]', 'Succeeded', '2', '$0.12', '42 min ago'],
  ['#R-1040', 'Alpine wayfinding icon family, 24 glyphs', 'FLUX.2 [klein]', 'Running', '4', '—', '1 hr ago'],
  ['#R-1039', 'Retro-futurist desktop machine, quiet studio', 'FLUX.2 [max]', 'Succeeded', '2', '$0.14', 'Yesterday'],
  ['#R-1038', 'Folded-paper terrain with contour labels', 'FLUX.2 [flex]', 'Draft', '3', '—', 'Yesterday'],
] as const;

const sectionMeta: Record<WorkspaceSection, { title: string; description: string; action: string }> = {
  workflows: { title: 'Workflows', description: 'Reusable visual generation graphs for your Studio workspace.', action: 'New workflow' },
  assets: { title: 'Assets', description: 'Generated outputs and uploaded references, stored centrally.', action: 'Upload assets' },
  runs: { title: 'Runs', description: 'Live and historical executions across every workflow.', action: 'Run workflow' },
  components: { title: 'Components', description: 'Composable nodes, controls and presets for the graph.', action: 'New component' },
  settings: { title: 'Settings', description: 'Workspace identity, generation defaults and API behavior.', action: 'Save changes' },
};

export function SectionPage({ section }: { section: WorkspaceSection }) {
  const [query, setQuery] = useState('');
  const meta = sectionMeta[section];
  return (
    <TooltipProvider delay={350}>
      <main className="h-svh overflow-hidden bg-background text-foreground">
        <header className="grid h-11 grid-cols-[auto_1fr_auto] items-center border-b px-2.5">
          <Link href="/playground" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-foreground text-background"><Braces className="size-4" /></span>
            <span className="text-sm font-semibold tracking-tight">Branchline</span>
          </Link>
          <div className="relative mx-auto w-[min(360px,44vw)]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this workspace…" className="h-8 border-0 bg-muted/60 pl-8 text-xs shadow-none" />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Cloud className="size-3.5 text-[var(--success)]" />
            <span className="hidden sm:inline">Studio synced</span>
            <Button variant="ghost" size="icon-sm" aria-label="Workspace menu"><Settings2 /></Button>
            <span className="grid size-7 place-items-center rounded-full bg-[#ead9cc] font-mono">YW</span>
          </div>
        </header>

        <div className="grid h-[calc(100svh-44px)] grid-cols-[44px_minmax(0,1fr)]">
          <nav className="flex flex-col items-center border-r py-2">
            {navigation.map((item) => item.id === 'divider' ? (
              <Separator key="divider" className="my-2 w-6" />
            ) : (
              <Tooltip key={item.id}>
                <TooltipTrigger render={<Link href={item.href} aria-label={item.label} className={cn('mb-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', section === item.id && 'bg-[var(--brand-soft)] text-foreground')} />}>
                  <item.icon className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ))}
            <div className="mt-auto">
              <Tooltip>
                <TooltipTrigger render={<Link href="/settings" aria-label="Settings" className={cn('grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', section === 'settings' && 'bg-[var(--brand-soft)] text-foreground')} />}>
                  <SlidersHorizontal className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
            </div>
          </nav>

          <section className="min-w-0 overflow-y-auto bg-[var(--canvas)]">
            <div className="mx-auto w-full max-w-[1320px] px-5 py-4">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground">Studio workspace</p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight">{meta.title}</h1>
                  <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
                </div>
                <Button size="sm" className="bg-foreground text-background hover:bg-[var(--brand)]"><Plus /> {meta.action}</Button>
              </div>
              <SectionContent section={section} query={query} />
            </div>
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}

function SectionContent({ section, query }: { section: WorkspaceSection; query: string }) {
  if (section === 'workflows') return <Workflows query={query} />;
  if (section === 'assets') return <Assets query={query} />;
  if (section === 'runs') return <Runs query={query} />;
  if (section === 'components') return <Components query={query} />;
  return <Settings />;
}

function Workflows({ query }: { query: string }) {
  const items = workflowRows.filter((row) => row.join(' ').toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
      {items.map(([name, graph, age, status], index) => (
        <article key={name} className="group rounded-lg border bg-background p-3 shadow-xs transition-colors hover:border-[var(--brand)]">
          <div className="mb-3 flex items-start justify-between">
            <div className="grid size-8 place-items-center rounded-md bg-[var(--brand-soft)]"><Layers3 className="size-4" /></div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Workflow actions" />}><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem><Copy /> Duplicate</DropdownMenuItem><DropdownMenuItem><Code2 /> Export JSON</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
          <h2 className="text-xs font-semibold">{name}</h2>
          <p className="mt-1 text-[10px] text-muted-foreground">{graph}</p>
          <div className="my-3 flex items-center gap-1.5 rounded-md border bg-[var(--canvas)] p-2">
            {[WandSparkles, Box, Zap].map((Icon, node) => <span key={node} className="contents"><span className="grid size-7 place-items-center rounded border bg-background"><Icon className="size-3" /></span>{node < 2 && <span className="h-px flex-1 bg-border" />}</span>)}
          </div>
          <div className="flex items-center justify-between text-[9px] text-muted-foreground"><span>{age}</span><Badge variant="outline" className="h-5 font-mono text-[8px] uppercase">{status}</Badge></div>
        </article>
      ))}
    </div>
  );
}

function Assets({ query }: { query: string }) {
  const [kind, setKind] = useState('all');
  const assets = useMemo(() => Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: ['Mineral machine', 'Smoked glass', 'Alpine glyphs', 'Field camera'][index % 4] + ` · ${index + 1}`, kind: index % 4 === 0 ? 'reference' : 'output' })).filter((asset) => (kind === 'all' || asset.kind === kind) && asset.name.toLowerCase().includes(query.toLowerCase())), [kind, query]);
  return <><div className="mb-3 flex items-center gap-2"><Select value={kind} onValueChange={(next) => next != null && setKind(next)}><SelectTrigger className="h-7! w-32 text-[10px]"><ListFilter /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All assets</SelectItem><SelectItem value="output">Outputs</SelectItem><SelectItem value="reference">References</SelectItem></SelectContent></Select><Badge variant="outline" className="font-mono text-[8px]">{assets.length} ITEMS</Badge></div><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{assets.map((asset, index) => <article key={asset.id} className="overflow-hidden rounded-lg border bg-background"><div className={cn('aspect-square', ['bg-[radial-gradient(circle_at_65%_35%,#d9a45a_0_8%,transparent_9%),linear-gradient(135deg,#e8e2d6,#a8b8a3)]','bg-[linear-gradient(145deg,#193d2a_0_35%,#7b927b_36%_65%,#efe8dc_66%)]','bg-[radial-gradient(circle,#345c42_0_15%,#d8dfd2_16%_30%,#ede9df_31%)]'][index%3])} /><div className="p-2"><p className="truncate text-[10px] font-medium">{asset.name}</p><p className="mt-0.5 font-mono text-[8px] uppercase text-muted-foreground">{asset.kind}</p></div></article>)}</div></>;
}

function Runs({ query }: { query: string }) {
  const rows = runRows.filter((row) => row.join(' ').toLowerCase().includes(query.toLowerCase()));
  return <div className="overflow-hidden rounded-lg border bg-background"><div className="grid grid-cols-[74px_minmax(240px,1fr)_130px_84px_54px_64px_82px_28px] gap-3 border-b bg-muted/45 px-3 py-2 font-mono text-[8px] uppercase tracking-wider text-muted-foreground"><span>Run</span><span>Prompt</span><span>Model</span><span>Status</span><span>Images</span><span>Cost</span><span>Created</span><span /></div>{rows.map(([id,prompt,model,status,images,cost,created])=><div key={id} className="grid grid-cols-[74px_minmax(240px,1fr)_130px_84px_54px_64px_82px_28px] items-center gap-3 border-b px-3 py-2.5 text-[10px] last:border-0"><span className="font-mono">{id}</span><span className="truncate font-medium">{prompt}</span><span>{model}</span><span className="flex items-center gap-1.5"><span className={cn('size-1.5 rounded-full',status==='Running'?'bg-amber-500':status==='Draft'?'bg-muted-foreground':'bg-[var(--success)]')} />{status}</span><span>{images}</span><span>{cost}</span><span className="text-muted-foreground">{created}</span><Button variant="ghost" size="icon-xs"><Ellipsis /></Button></div>)}</div>;
}

function Components({ query }: { query: string }) {
  const items = [['Prompt','Input','Long-form creative instruction with references',WandSparkles],['FLUX.2 Model','Model','Validated controls for max, pro, flex and klein',Box],['Generate','Action','Async BFL request with realtime lifecycle',Zap],['Compare','Utility','Side-by-side model and parameter evaluation',Layers3],['Transform','Utility','Resize, format and metadata pipeline',SlidersHorizontal],['Review gate','Control','Human approval before publishing outputs',CheckCircle2]].filter((item)=>item.join(' ').toLowerCase().includes(query.toLowerCase()));
  return <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">{items.map(([name,type,description,Icon])=><article key={String(name)} className="flex items-start gap-3 rounded-lg border bg-background p-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--brand-soft)]">{typeof Icon !== 'string' && <Icon className="size-4" />}</span><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="text-xs font-semibold">{String(name)}</h2><Badge variant="outline" className="h-4 font-mono text-[7px] uppercase">{String(type)}</Badge></div><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{String(description)}</p></div></article>)}</div>;
}

function Settings() {
  return <div className="grid gap-3 lg:grid-cols-[210px_minmax(0,1fr)]"><aside className="rounded-lg border bg-background p-1.5">{['General','Generation defaults','Members','API & realtime','Storage'].map((item,index)=><button key={item} className={cn('flex h-8 w-full items-center rounded-md px-2.5 text-left text-[11px] hover:bg-accent',index===0&&'bg-[var(--brand-soft)] font-medium')}>{item}</button>)}</aside><div className="space-y-3"><SettingsCard title="Workspace identity" description="Shown across workflows, runs and shared history"><label className="grid gap-1.5 text-[10px] font-medium">Workspace name<Input defaultValue="Studio" className="h-8 text-xs" /></label></SettingsCard><SettingsCard title="Server behavior" description="D1 persistence, R2 assets and realtime delivery"><SettingToggle label="Shared server history" description="Sync generations across signed-in browsers" checked /><SettingToggle label="WebSocket updates" description="Push run state and asset changes in realtime" checked /><SettingToggle label="Polling fallback" description="Refresh every 15 seconds if the socket disconnects" checked /></SettingsCard><SettingsCard title="Collaboration" description="Workspace-level access and generation permissions"><div className="flex items-center justify-between rounded-md border p-2.5"><span className="flex items-center gap-2 text-[11px]"><Users className="size-4" /> 1 workspace member</span><Button variant="outline" size="xs">Manage</Button></div></SettingsCard></div></div>;
}

function SettingsCard({title,description,children}:{title:string;description:string;children:React.ReactNode}){return <section className="rounded-lg border bg-background p-3"><h2 className="text-xs font-semibold">{title}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p><div className="mt-3 space-y-3">{children}</div></section>}
function SettingToggle({label,description,checked}:{label:string;description:string;checked?:boolean}){return <div className="flex items-center justify-between border-t pt-3 first:border-0 first:pt-0"><div><p className="text-[11px] font-medium">{label}</p><p className="text-[9px] text-muted-foreground">{description}</p></div><Switch size="sm" defaultChecked={checked} /></div>}
