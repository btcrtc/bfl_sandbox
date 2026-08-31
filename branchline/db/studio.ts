import { env } from 'cloudflare:workers';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { headers } from 'next/headers';

import { ensureDatabase } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  studioProjects,
  studioWorkspaceMembers,
  studioWorkspaces,
  storyboards,
  users,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import { createExampleStoryboard } from '@/lib/example-storyboard';

export const ACTIVE_WORKSPACE_COOKIE = 'branchline_workspace';
export const ACTIVE_PROJECT_COOKIE = 'branchline_project';

export type StudioIdentity = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: 'chatgpt' | 'demo' | 'legacy';
};

export function toStudioIdentity(user: {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: 'chatgpt' | 'demo';
}): StudioIdentity {
  return user;
}

export type StudioProjectDto = {
  id: string;
  workspaceId: string;
  name: string;
  kind: 'demo' | 'standard';
  dataWorkspaceId: string;
  createdAt: number;
};

export type StudioWorkspaceDto = {
  id: string;
  name: string;
  kind: 'demo' | 'personal' | 'team';
  role: 'owner' | 'editor' | 'viewer';
  projects: StudioProjectDto[];
};

export type StudioContextDto = {
  viewer: {
    displayName: string;
    email: string;
    provider: 'chatgpt' | 'demo' | 'legacy';
  };
  workspaces: StudioWorkspaceDto[];
  activeWorkspace: StudioWorkspaceDto;
  activeProject: StudioProjectDto;
};

type PreferredContext = {
  workspaceId?: string | null;
  projectId?: string | null;
};

export async function resolveStudioContext(
  identity: StudioIdentity,
  preferred?: PreferredContext,
): Promise<StudioContextDto> {
  await ensureDatabase();
  await provisionDefaultStudio(identity);

  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get('cookie');
  const selectedWorkspaceId =
    preferred?.workspaceId ?? readCookie(cookieHeader, ACTIVE_WORKSPACE_COOKIE);
  const selectedProjectId =
    preferred?.projectId ?? readCookie(cookieHeader, ACTIVE_PROJECT_COOKIE);
  const context = await readStudioContext(
    identity,
    selectedWorkspaceId,
    selectedProjectId,
  );
  await ensureDemoSeed(context.activeProject, identity.userId);
  return context;
}

export async function createStudioWorkspace(
  identity: StudioIdentity,
  name: string,
): Promise<StudioContextDto> {
  await ensureDatabase();
  const cleanName = validateName(name, 'Workspace');
  const workspaceId = `studio:${crypto.randomUUID()}`;
  const projectId = `project:${crypto.randomUUID()}`;
  const dataWorkspaceId = `project-data:${crypto.randomUUID()}`;
  const now = Date.now();
  const db = getDb();
  await db.batch([
    db.insert(workspaces).values({
      id: dataWorkspaceId,
      name: `${cleanName} / First project`,
      createdAt: now,
    }),
    db.insert(workspaceMembers).values({
      workspaceId: dataWorkspaceId,
      userId: identity.userId,
      role: 'owner',
      joinedAt: now,
    }),
    db.insert(studioWorkspaces).values({
      id: workspaceId,
      name: cleanName,
      kind: 'team',
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(studioWorkspaceMembers).values({
      workspaceId,
      userId: identity.userId,
      role: 'owner',
      joinedAt: now,
    }),
    db.insert(studioProjects).values({
      id: projectId,
      workspaceId,
      dataWorkspaceId,
      name: 'First project',
      kind: 'standard',
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return readStudioContext(identity, workspaceId, projectId);
}

export async function createStudioProject(
  identity: StudioIdentity,
  workspaceId: string,
  name: string,
): Promise<StudioContextDto> {
  await ensureDatabase();
  const cleanName = validateName(name, 'Project');
  const db = getDb();
  const [membership] = await db
    .select({ role: studioWorkspaceMembers.role })
    .from(studioWorkspaceMembers)
    .where(
      and(
        eq(studioWorkspaceMembers.workspaceId, workspaceId),
        eq(studioWorkspaceMembers.userId, identity.userId),
      ),
    )
    .limit(1);
  if (!membership || !['owner', 'editor'].includes(membership.role)) {
    throw new StudioAccessError('Workspace not found.', 404);
  }

  const projectId = `project:${crypto.randomUUID()}`;
  const dataWorkspaceId = `project-data:${crypto.randomUUID()}`;
  const now = Date.now();
  await db.batch([
    db.insert(workspaces).values({
      id: dataWorkspaceId,
      name: cleanName,
      createdAt: now,
    }),
    db.insert(workspaceMembers).values({
      workspaceId: dataWorkspaceId,
      userId: identity.userId,
      role: membership.role,
      joinedAt: now,
    }),
    db.insert(studioProjects).values({
      id: projectId,
      workspaceId,
      dataWorkspaceId,
      name: cleanName,
      kind: 'standard',
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return readStudioContext(identity, workspaceId, projectId);
}

export function studioSelectionCookies(context: StudioContextDto): string[] {
  return [
    serializeSelectionCookie(
      ACTIVE_WORKSPACE_COOKIE,
      context.activeWorkspace.id,
    ),
    serializeSelectionCookie(ACTIVE_PROJECT_COOKIE, context.activeProject.id),
  ];
}

export class StudioAccessError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

async function provisionDefaultStudio(identity: StudioIdentity) {
  const db = getDb();
  const [existingStudio] = await db
    .select({ workspaceId: studioWorkspaceMembers.workspaceId })
    .from(studioWorkspaceMembers)
    .where(eq(studioWorkspaceMembers.userId, identity.userId))
    .limit(1);
  if (existingStudio) {
    // Some legacy API routes only know the opaque user id. As soon as a real
    // ChatGPT/demo identity is available, promote the stored profile instead
    // of leaving the placeholder address as permanent account data.
    if (identity.provider !== 'legacy') {
      await db
        .update(users)
        .set({
          email: identity.email,
          displayName: identity.displayName,
          provider: identity.provider,
          updatedAt: Date.now(),
        })
        .where(eq(users.id, identity.userId));
    }
    return;
  }

  const key = await identityKey(identity.userId);
  const now = Date.now();
  const demoWorkspaceId = `studio-demo:${key}`;
  const personalWorkspaceId = `studio-personal:${key}`;
  const demoProjectId = `project-demo:${key}`;
  const personalProjectId = `project-personal:${key}`;
  // Reuse the legacy personal namespace as the demo project so an existing
  // signed-in user keeps the cinematic board they already saw before this
  // migration. New users receive the same content through one-time seeding.
  const demoDataWorkspaceId = `personal:${identity.userId}`;
  const personalDataWorkspaceId = `project-data:personal:${key}`;
  const personalName = firstName(identity.displayName);

  await db
    .insert(users)
    .values({
      id: identity.userId,
      email: identity.email,
      displayName: identity.displayName,
      provider: identity.provider,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  if (identity.provider !== 'legacy') {
    await db
      .update(users)
      .set({
        email: identity.email,
        displayName: identity.displayName,
        provider: identity.provider,
        updatedAt: now,
      })
      .where(eq(users.id, identity.userId));
  }

  await db.batch([
    db
      .insert(workspaces)
      .values({
        id: demoDataWorkspaceId,
        name: 'Branchline demo data',
        createdAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(workspaces)
      .values({
        id: personalDataWorkspaceId,
        name: `${personalName}'s first project`,
        createdAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(workspaceMembers)
      .values({
        workspaceId: demoDataWorkspaceId,
        userId: identity.userId,
        role: 'owner',
        joinedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(workspaceMembers)
      .values({
        workspaceId: personalDataWorkspaceId,
        userId: identity.userId,
        role: 'owner',
        joinedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(studioWorkspaces)
      .values({
        id: demoWorkspaceId,
        name: 'Branchline Demo',
        kind: 'demo',
        createdBy: identity.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(studioWorkspaces)
      .values({
        id: personalWorkspaceId,
        name: `${personalName}'s Studio`,
        kind: 'personal',
        createdBy: identity.userId,
        createdAt: now + 1,
        updatedAt: now + 1,
      })
      .onConflictDoNothing(),
    db
      .insert(studioWorkspaceMembers)
      .values({
        workspaceId: demoWorkspaceId,
        userId: identity.userId,
        role: 'owner',
        joinedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(studioWorkspaceMembers)
      .values({
        workspaceId: personalWorkspaceId,
        userId: identity.userId,
        role: 'owner',
        joinedAt: now + 1,
      })
      .onConflictDoNothing(),
    db
      .insert(studioProjects)
      .values({
        id: demoProjectId,
        workspaceId: demoWorkspaceId,
        dataWorkspaceId: demoDataWorkspaceId,
        name: 'The Work That Keeps Time',
        kind: 'demo',
        createdBy: identity.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(studioProjects)
      .values({
        id: personalProjectId,
        workspaceId: personalWorkspaceId,
        dataWorkspaceId: personalDataWorkspaceId,
        name: 'First project',
        kind: 'standard',
        createdBy: identity.userId,
        createdAt: now + 1,
        updatedAt: now + 1,
      })
      .onConflictDoNothing(),
  ]);
}

async function readStudioContext(
  identity: StudioIdentity,
  selectedWorkspaceId: string | null,
  selectedProjectId: string | null,
): Promise<StudioContextDto> {
  const db = getDb();
  const workspaceRows = await db
    .select({
      id: studioWorkspaces.id,
      name: studioWorkspaces.name,
      kind: studioWorkspaces.kind,
      role: studioWorkspaceMembers.role,
      createdAt: studioWorkspaces.createdAt,
    })
    .from(studioWorkspaceMembers)
    .innerJoin(
      studioWorkspaces,
      eq(studioWorkspaces.id, studioWorkspaceMembers.workspaceId),
    )
    .where(eq(studioWorkspaceMembers.userId, identity.userId))
    .orderBy(asc(studioWorkspaces.createdAt));
  if (!workspaceRows.length) throw new Error('Studio provisioning failed.');

  const projectRows = await db
    .select()
    .from(studioProjects)
    .where(
      inArray(
        studioProjects.workspaceId,
        workspaceRows.map((workspace) => workspace.id),
      ),
    )
    .orderBy(asc(studioProjects.createdAt));
  const workspacesDto: StudioWorkspaceDto[] = workspaceRows.map(
    (workspace) => ({
      id: workspace.id,
      name: workspace.name,
      kind: normalizeWorkspaceKind(workspace.kind),
      role: normalizeRole(workspace.role),
      projects: projectRows
        .filter((project) => project.workspaceId === workspace.id)
        .map((project) => ({
          id: project.id,
          workspaceId: project.workspaceId,
          name: project.name,
          kind: project.kind === 'demo' ? 'demo' : 'standard',
          dataWorkspaceId: project.dataWorkspaceId,
          createdAt: project.createdAt,
        })),
    }),
  );
  const activeWorkspace =
    workspacesDto.find((workspace) => workspace.id === selectedWorkspaceId) ??
    workspacesDto.find((workspace) => workspace.kind === 'demo') ??
    workspacesDto[0];
  const activeProject =
    activeWorkspace.projects.find(
      (project) => project.id === selectedProjectId,
    ) ?? activeWorkspace.projects[0];
  if (!activeProject) throw new Error('Workspace has no projects.');

  return {
    viewer: {
      displayName: identity.displayName,
      email: identity.email,
      provider: identity.provider,
    },
    workspaces: workspacesDto,
    activeWorkspace,
    activeProject,
  };
}

async function ensureDemoSeed(project: StudioProjectDto, userId: string) {
  if (project.kind !== 'demo') return;
  const db = getDb();
  const [projectRow] = await db
    .select({ seededAt: studioProjects.seededAt })
    .from(studioProjects)
    .where(eq(studioProjects.id, project.id))
    .limit(1);
  if (projectRow?.seededAt) return;

  const [existing] = await db
    .select({ count: count() })
    .from(storyboards)
    .where(eq(storyboards.workspaceId, project.dataWorkspaceId));
  const now = Date.now();
  if ((existing?.count ?? 0) > 0) {
    await db
      .update(studioProjects)
      .set({ seededAt: now, updatedAt: now })
      .where(eq(studioProjects.id, project.id));
    return;
  }

  // Claim the one-time seed before issuing the larger example write batch.
  // Concurrent bootstrap requests then observe a non-null marker and do not
  // duplicate the mock project.
  const claim = await env.DB.prepare(
    'UPDATE studio_projects SET seeded_at = ?, updated_at = ? WHERE id = ? AND seeded_at IS NULL RETURNING id',
  )
    .bind(now, now, project.id)
    .all<{ id: string }>();
  if (!claim.results.length) return;
  try {
    await createExampleStoryboard({
      workspaceId: project.dataWorkspaceId,
      userId,
    });
  } catch (error) {
    await db
      .update(studioProjects)
      .set({ seededAt: null, updatedAt: Date.now() })
      .where(eq(studioProjects.id, project.id));
    throw error;
  }
}

async function identityKey(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(userId),
  );
  const bytes = new Uint8Array(digest).slice(0, 15);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function validateName(value: string, label: string): string {
  const clean = value.trim().replace(/\s+/gu, ' ').slice(0, 80);
  if (clean.length < 2)
    throw new StudioAccessError(`${label} name is too short.`);
  return clean;
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0]?.slice(0, 36) || 'My';
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function serializeSelectionCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function normalizeWorkspaceKind(value: string): StudioWorkspaceDto['kind'] {
  return value === 'demo' || value === 'team' ? value : 'personal';
}

function normalizeRole(value: string): StudioWorkspaceDto['role'] {
  return value === 'editor' || value === 'viewer' ? value : 'owner';
}
