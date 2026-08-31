'use client';

import Link from 'next/link';
import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import {
  Blocks,
  Braces,
  Clapperboard,
  Clock3,
  GitBranch,
  Image as ImageIcon,
  Moon,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';

export type ProductSection =
  | 'playground'
  | 'scenes'
  | 'assets'
  | 'runs'
  | 'components'
  | 'settings';

const productNavigation: Array<{
  id: ProductSection | 'divider';
  label: string;
  href: string;
  icon: ElementType;
}> = [
  {
    id: 'playground',
    label: 'Playground',
    href: '/playground',
    icon: GitBranch,
  },
  { id: 'scenes', label: 'Scenes', href: '/scenes', icon: Clapperboard },
  { id: 'assets', label: 'Assets', href: '/assets', icon: ImageIcon },
  { id: 'divider', label: '', href: '', icon: Blocks },
  { id: 'runs', label: 'Runs', href: '/runs', icon: Clock3 },
  {
    id: 'components',
    label: 'Design system',
    href: '/components',
    icon: Blocks,
  },
];

export const surfaceClass =
  'rounded-lg border border-border bg-playground-surface-elevated shadow-[var(--surface-shadow)]';

export const parameterChipClass =
  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-playground-surface-elevated px-2 text-[11px] leading-none shadow-xs transition-colors hover:border-foreground/25';

export function ProductHeader({
  center,
  end,
  concept = false,
}: {
  center: ReactNode;
  end: ReactNode;
  concept?: boolean;
}) {
  return (
    <header className="grid h-[var(--app-header-height)] grid-cols-[360px_minmax(280px,1fr)_220px] items-center border-b bg-background px-3 max-xl:grid-cols-[280px_minmax(220px,1fr)_180px] max-lg:grid-cols-[auto_minmax(0,1fr)_auto]">
      <ProductBrand concept={concept} />
      <div className="mx-auto flex w-[min(380px,48vw)] min-w-0 justify-center">
        {center}
      </div>
      <div className="flex min-w-0 items-center justify-self-end">{end}</div>
    </header>
  );
}

export function ProductBrand({ concept = false }: { concept?: boolean }) {
  return (
    <div className="flex min-w-0 items-center">
      <Link href="/playground" className="flex shrink-0 items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
          <Braces className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight max-xl:hidden">
          Branchline
        </span>
        {concept && (
          <Badge
            variant="outline"
            className="h-5 rounded-md px-1.5 font-mono text-[9px] tracking-wider max-xl:hidden"
          >
            CONCEPT
          </Badge>
        )}
      </Link>
      <WorkspaceSwitcher />
    </div>
  );
}

export function ProductRail({ active }: { active: ProductSection }) {
  return (
    <nav className="flex w-[var(--app-rail-width)] flex-col items-center border-r bg-background py-2">
      {productNavigation.map((item) =>
        item.id === 'divider' ? (
          <Separator key="divider" className="my-2 w-6" />
        ) : (
          <RailItem
            key={item.id}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={active === item.id}
          />
        ),
      )}
      <div className="mt-auto">
        <RailItem
          href="/settings"
          label="Settings"
          icon={SlidersHorizontal}
          active={active === 'settings'}
        />
      </div>
    </nav>
  );
}

function RailItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: ElementType;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link href={href} />}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'mb-1 grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
          active && 'bg-sidebar-accent text-foreground',
        )}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

type ThemePreference = 'light' | 'dark';
const THEME_STORAGE_KEY = 'branchline-theme';

function applyTheme(preference: ThemePreference) {
  document.documentElement.classList.toggle('dark', preference === 'dark');
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'dark') setPreference('dark');
      } catch {
        // Storage unavailable; keep the studio's light default.
      }
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (mounted) applyTheme(preference);
  }, [mounted, preference]);

  const cycle = () => {
    const next: ThemePreference = preference === 'dark' ? 'light' : 'dark';
    setPreference(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable; theme still applies for this tab.
    }
  };

  const label = preference === 'dark' ? 'Theme: dark' : 'Theme: light';
  const Icon = preference === 'dark' ? Moon : Sun;

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={`${label} — click to switch`}
        onClick={cycle}
        className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SystemLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn('ds-label', className)}>{children}</p>;
}

export function PageHeading({
  eyebrow = 'Studio workspace',
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-5">
      <div className="min-w-0">
        <SystemLabel>{eyebrow}</SystemLabel>
        <h1 className="mt-1.5 text-[24px] font-semibold leading-8 tracking-[-0.025em]">
          {title}
        </h1>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn(surfaceClass, className)}>{children}</section>;
}

export function ParameterChip({
  label,
  value,
  active,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        parameterChipClass,
        active && 'border-foreground/35 bg-accent/35',
        className,
      )}
      {...props}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
      {children}
    </button>
  );
}
