import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: 'chatgpt' | 'demo';
};

const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER =
  'oai-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';
const SIGN_IN_PATH = '/signin-with-chatgpt';
const SIGN_OUT_PATH = '/signout-with-chatgpt';
const CALLBACK_PATH = '/callback';
const DEMO_SIGN_IN_PATH = '/signin';
export const DEMO_SESSION_COOKIE = 'branchline_session';
const DEMO_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

type DemoSession = {
  sub: string;
  name: string;
  email: string;
  iat: number;
  exp: number;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) {
    if (env.DEMO_MODE === 'true') {
      const token = readCookie(
        requestHeaders.get('cookie'),
        DEMO_SESSION_COOKIE,
      );
      const session = token ? await verifyDemoSession(token) : null;
      if (session) {
        return {
          userId: session.sub,
          displayName: session.name,
          email: session.email,
          fullName: session.name,
          provider: 'demo',
        };
      }
    }
    return null;
  }

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
    provider: 'chatgpt',
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  if (env.DEMO_MODE === 'true') {
    return `${DEMO_SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
  }
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  if (env.DEMO_MODE === 'true') {
    return `${DEMO_SIGN_IN_PATH}?signed_out=1&return_to=${encodeURIComponent(safeReturnTo)}`;
  }
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export async function createDemoSession(displayName: string): Promise<string> {
  if (env.DEMO_MODE !== 'true') throw new Error('Demo sign-in is disabled.');
  const now = Math.floor(Date.now() / 1_000);
  const userId = `demo:${crypto.randomUUID()}`;
  const payload: DemoSession = {
    sub: userId,
    name: displayName,
    email: `visitor-${userId.slice(-8)}@demo.branchline`,
    iat: now,
    exp: now + DEMO_SESSION_TTL_SECONDS,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = await sign(encoded);
  return `${encoded}.${signature}`;
}

export function demoSessionCookie(token: string): string {
  return serializeCookie(DEMO_SESSION_COOKIE, token, DEMO_SESSION_TTL_SECONDS);
}

export function clearDemoSessionCookie(): string {
  return serializeCookie(DEMO_SESSION_COOKIE, '', 0);
}

async function verifyDemoSession(token: string): Promise<DemoSession | null> {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const key = await signingKey();
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    decodeBase64Url(signature),
    new TextEncoder().encode(payload),
  );
  if (!verified) return null;
  try {
    const session = JSON.parse(
      decodeBase64UrlText(payload),
    ) as Partial<DemoSession>;
    const now = Math.floor(Date.now() / 1_000);
    if (
      typeof session.sub !== 'string' ||
      !session.sub.startsWith('demo:') ||
      typeof session.name !== 'string' ||
      typeof session.email !== 'string' ||
      typeof session.iat !== 'number' ||
      typeof session.exp !== 'number' ||
      session.iat > now + 60 ||
      session.exp <= now
    ) {
      return null;
    }
    return session as DemoSession;
  } catch {
    return null;
  }
}

async function sign(value: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(),
    new TextEncoder().encode(value),
  );
  return encodeBase64UrlBytes(new Uint8Array(signature));
}

async function signingKey(): Promise<CryptoKey> {
  const secret = env.AUTH_SECRET?.trim();
  if (
    !secret &&
    env.DEMO_MODE === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    // This fallback exists only for local preview. The production start script
    // refuses to boot demo auth without AUTH_SECRET.
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('branchline-local-preview-only'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }
  if (!secret) throw new Error('AUTH_SECRET is required for demo sessions.');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function serializeCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function encodeBase64Url(value: string): string {
  return encodeBase64UrlBytes(new TextEncoder().encode(value));
}

function encodeBase64UrlBytes(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(decodeBase64Url(value));
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH ||
    pathname === DEMO_SIGN_IN_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
