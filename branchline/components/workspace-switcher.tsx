'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  Check,
  ChevronsUpDown,
  FolderKanban,
  Layers3,
  Loader2,
  LogOut,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { StudioContextDto } from '@/db/studio';

type CreateMode = 'project' | 'workspace' | null;

export function WorkspaceSwitcher() {
  const [context, setContext] = useState<StudioContextDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/studio/context', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) return null;
        const data = (await response.json()) as {
          context?: StudioContextDto;
          error?: string;
        };
        if (!response.ok || !data.context)
          throw new Error(data.error || 'Context unavailable.');
        return data.context;
      })
      .then((next) => {
        if (!cancelled && next) setContext(next);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : 'Context unavailable.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchProject = async (workspaceId: string, projectId: string) => {
    if (switching || context?.activeProject.id === projectId) return;
    setSwitching(true);
    setError(null);
    try {
      const response = await fetch('/api/studio/context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, projectId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || 'Could not switch project.');
      window.location.reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not switch project.',
      );
      setSwitching(false);
    }
  };

  const create = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!context || !createMode) return;
    setSwitching(true);
    setError(null);
    try {
      const endpoint =
        createMode === 'workspace'
          ? '/api/studio/workspaces'
          : '/api/studio/projects';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          ...(createMode === 'project'
            ? { workspaceId: context.activeWorkspace.id }
            : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || 'Could not create the context.');
      window.location.reload();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not create the context.',
      );
      setSwitching(false);
    }
  };

  const openCreate = (mode: Exclude<CreateMode, null>) => {
    setName(mode === 'workspace' ? 'New workspace' : 'Untitled project');
    setError(null);
    setCreateMode(mode);
  };

  const signOut = async () => {
    setSwitching(true);
    await fetch('/api/auth/session', { method: 'DELETE' });
    window.location.assign('/signin');
  };

  if (loading) {
    return (
      <Loader2 className="ml-1 size-3 animate-spin text-muted-foreground" />
    );
  }
  if (!context) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="ml-1 flex h-8 min-w-0 max-w-[210px] items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Switch workspace or project"
              disabled={switching}
            />
          }
        >
          {context.activeWorkspace.kind === 'demo' ? (
            <Sparkles className="size-3.5 shrink-0 text-[var(--brand)]" />
          ) : (
            <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] leading-3 text-muted-foreground">
              {context.activeWorkspace.name}
            </span>
            <span className="block truncate text-[12px] font-medium leading-4">
              {context.activeProject.name}
            </span>
          </span>
          {switching ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ChevronsUpDown className="size-3 text-muted-foreground" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[310px]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces and projects</DropdownMenuLabel>
          </DropdownMenuGroup>
          {context.workspaces.map((workspace, workspaceIndex) => (
            <DropdownMenuGroup key={workspace.id}>
              {workspaceIndex > 0 && <DropdownMenuSeparator />}
              <div className="flex items-center gap-2 px-1.5 py-1.5">
                <span className="grid size-6 place-items-center rounded-md border bg-muted/40">
                  {workspace.kind === 'demo' ? (
                    <Sparkles className="size-3" />
                  ) : (
                    <Users className="size-3" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                  {workspace.name}
                </span>
                <span className="font-mono text-[8px] uppercase text-muted-foreground">
                  {workspace.kind}
                </span>
              </div>
              {workspace.projects.map((project) => {
                const active = project.id === context.activeProject.id;
                return (
                  <DropdownMenuItem
                    key={project.id}
                    inset
                    disabled={switching}
                    onClick={() => void switchProject(workspace.id, project.id)}
                    className="py-2"
                  >
                    <Layers3 className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">
                      {project.name}
                    </span>
                    {project.kind === 'demo' && (
                      <span className="rounded border px-1 font-mono text-[8px] uppercase text-muted-foreground">
                        demo
                      </span>
                    )}
                    {active && (
                      <Check className="size-3.5 text-[var(--success)]" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openCreate('project')}>
            <Plus /> New project in {context.activeWorkspace.name}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openCreate('workspace')}>
            <Users /> New workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <span className="grid size-6 place-items-center rounded-full bg-accent font-mono text-[9px]">
              {context.viewer.displayName.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-medium">
                {context.viewer.displayName}
              </span>
              <span className="block truncate text-[9px] text-muted-foreground">
                {context.viewer.email}
              </span>
            </span>
            {context.viewer.provider === 'demo' && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Sign out"
                onClick={() => void signOut()}
              >
                <LogOut />
              </Button>
            )}
          </div>
          {error && (
            <p className="px-1.5 py-1 text-[10px] text-destructive">{error}</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={createMode !== null}
        onOpenChange={(open) => {
          if (!open && !switching) setCreateMode(null);
        }}
      >
        <DialogContent>
          <form onSubmit={create} className="contents">
            <DialogHeader>
              <DialogTitle>
                {createMode === 'workspace'
                  ? 'Create workspace'
                  : 'Create project'}
              </DialogTitle>
              <DialogDescription>
                {createMode === 'workspace'
                  ? 'A workspace starts with one private, empty project.'
                  : `This project will be empty and isolated inside ${context.activeWorkspace.name}.`}
              </DialogDescription>
            </DialogHeader>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              aria-label={
                createMode === 'workspace' ? 'Workspace name' : 'Project name'
              }
            />
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateMode(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={switching || name.trim().length < 2}
              >
                {switching && <Loader2 className="animate-spin" />}
                Create {createMode}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
