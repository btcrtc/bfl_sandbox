'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import {
  Box,
  Braces,
  Clapperboard,
  Clock3,
  Image as ImageIcon,
  Layers3,
  Monitor,
  Moon,
  SlidersHorizontal,
  Sparkles,
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

export type ProductSection =
  | 'workflows'
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
  { id: 'workflows', label: 'Workflows', href: '/workflows', icon: Layers3 },
  {
    id: 'playground',
    label: 'Playground',
    href: '/playground',
    icon: Sparkles,
  },
  { id: 'scenes', label: 'Scenes', href: '/scenes', icon: Clapperboard },
  { id: 'assets', label: 'Assets', href: '/assets', icon: ImageIcon },
  { id: 'divider', label: '', href: '', icon: Box },
  { id: 'runs', label: 'Runs', href: '/runs', icon: Clock3 },
  { id: 'components', label: 'Design system', href: '/components', icon: Box },
];

export const surfaceClass =
  'rounded-lg border border-border bg-playground-surface-elevated shadow-xs';

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
    <header className="grid h-[var(--app-header-height)] grid-cols-[220px_minmax(280px,1fr)_220px] items-center border-b bg-background px-3 max-lg:grid-cols-[auto_minmax(0,1fr)_auto]">
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
    <Link href="/playground" className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
        <Braces className="size-4" />
      </span>
      <span className="truncate text-sm font-semibold tracking-tight">
        Branchline
      </span>
      {concept && (
        <Badge
          variant="outline"
          className="h-5 rounded-md px-1.5 font-mono text-[9px] tracking-wider max-lg:hidden"
        >
          CONCEPT
        </Badge>
      )}
    </Link>
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
  const router = useRouter();
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={() => router.push(href)}
        className={cn(
          'mb-1 grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
          active && 'pointer-events-none bg-sidebar-accent text-foreground',
        )}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

type ThemePreference = 'system' | 'light' | 'dark';
const THEME_STORAGE_KEY = 'branchline-theme';

function applyTheme(preference: ThemePreference) {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') setPreference(stored);
      } catch {
        // Storage unavailable; stay on system.
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const cycle = () => {
    const next: ThemePreference =
      preference === 'system' ? 'dark' : preference === 'dark' ? 'light' : 'system';
    setPreference(next);
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable; theme still applies for this tab.
    }
  };

  const label =
    preference === 'system' ? 'Theme: system' : preference === 'dark' ? 'Theme: dark' : 'Theme: light';
  const Icon = preference === 'system' ? Monitor : preference === 'dark' ? Moon : Sun;

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
