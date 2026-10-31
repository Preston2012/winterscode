/**
 * Where an onboarding submission lives, how it is checked on the way in, and
 * how Preston hears about it.
 *
 * ONE SUBMISSION, ONE FOLDER in the private LEADS bucket:
 *   onboard/<id>/answers.json   the checked answers, written first
 *   onboard/<id>/state.json     the upload key, the declared files, finished
 *   onboard/<id>/files/<n>-<name>  each upload, byte for byte
 *   onboard/<id>/onboarding.pdf the answers as Preston reads them
 *
 * THREE CALLS, BECAUSE OF THE FREE PLAN. The Workers free plan allows 10 ms of
 * CPU per request, and reading a large multipart body costs more than that.
 * So the answers go first as JSON (start), each file then goes on its own as
 * the raw request body, which the Worker hands to R2 as a stream without
 * reading it (upload), and a last call writes the PDF and sends the mail
 * (finish). Nothing in any of the three touches a file's bytes.
 *
 * THE MAIL carries the PDF. The uploads stay in the bucket: attaching them
 * would mean base64 encoding megabytes inside that 10 ms. The mail lists each
 * one with its size, and wc-onboard-pull.py on the ops host fetches them.
 */

import { STEPS, answerText, isShown, type Answers, type DeclaredFile } from './onboard-spec';
import type { Block } from './onboard-pdf';
import { headerSafe, bodySafe } from './notify';

export interface R2Object { text(): Promise<string>; body?: ReadableStream; size?: number; httpMetadata?: { contentType?: string } }
export interface R2Bucket {
  put(key: string, value: string | Uint8Array | ReadableStream | null, opts?: unknown): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  head(key: string): Promise<{ size: number } | null>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string; delimiter?: string }): Promise<{ objects: { key: string; size: number }[]; truncated?: boolean; cursor?: string; delimitedPrefixes?: string[] }>;
}

export interface OnboardEnv {
  LEADS?: R2Bucket;
  NOTIFY?: { send(message: unknown): Promise<void> };
  TURNSTILE_SECRET_KEY?: string;
  WC_AUDIT_BYPASS?: string;
  LEADS_READ_TOKEN?: string;
}

/** How long the browser has to send its files after the answers land. */
export const UPLOAD_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface State {
  token: string;
  createdAt: string;
  expiresAt: string;
  files: DeclaredFile[];
  finishedAt?: string;
  notify?: string;
}

const ID = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/;
export const validId = (s: unknown): s is string => typeof s === 'string' && ID.test(s);

export function newId(now: Date): string {
  const ts = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${ts}-${hex(6)}`;
}

export function hex(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export const keyOf = {
  answers: (id: string) => `onboard/${id}/answers.json`,
  state: (id: string) => `onboard/${id}/state.json`,
  pdf: (id: string) => `onboard/${id}/onboarding.pdf`,
  file: (id: string, n: number, name: string) => `onboard/${id}/files/${n + 1}-${fileSafe(name)}`,
};

/** A file name that is safe as part of a key and on a disk. */
export function fileSafe(name: string): string {
  const base = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').replace(/^[.-]+/, '');
  return (base || 'file').slice(-80);
}

/** Equal strings, compared without stopping at the first difference. */
export function sameToken(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  try { return JSON.parse(await obj.text()) as T; } catch { return null; }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** When it arrived, the way Preston reads a time: Pacific, to the minute. */
export function pacific(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d) + ' Pacific';
}

export interface FileLine { field: string; name: string; size: number; key: string; stored: boolean }

/** The answers in the order of the form, as the PDF lays them out. */
export function pdfBlocks(answers: Answers, files: FileLine[], meta: { id: string; received: Date }): Block[] {
  const name = String(answers.display_name || answers.legal_name || 'A new contractor');
  const blocks: Block[] = [
    { kind: 'title', text: `Chere' onboarding: ${name}` },
    { kind: 'meta', text: `Received ${pacific(meta.received)}. Submission ${meta.id}.` },
  ];
  for (const step of STEPS) {
    blocks.push({ kind: 'section', text: step.title });
    for (const f of step.fields) {
      if (!isShown(f, answers)) continue;
      if (f.kind === 'file') {
        const mine = files.filter((x) => x.field === f.id);
        const value = mine.length === 0
          ? ''
          : mine.map((x) => `${x.name} (${fmtBytes(x.size)})${x.stored ? '' : ', NOT RECEIVED'}`).join('\n');
        blocks.push({ kind: 'item', label: f.label, value });
        continue;
      }
      blocks.push({ kind: 'item', label: f.label, value: answerText(f, answers[f.id]) });
    }
  }
  return blocks;
}

/** btoa over a byte array, in pieces so a large array cannot overflow the call stack. */
function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s).replace(/.{1,76}/g, '$&\r\n');
}

const FROM = 'forms@winterscode.com';
const TO = 'droiddna2013@gmail.com';

/** The notice to Preston: a short summary, the file list, and the PDF attached. */
export function onboardMime(answers: Answers, files: FileLine[], pdf: Uint8Array, meta: { id: string; received: Date }): string {
  const name = headerSafe(String(answers.display_name || answers.legal_name || 'a new contractor'), 80);
  const replyTo = typeof answers.email === 'string' && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(answers.email)
    ? headerSafe(answers.email, 120) : '';
  const boundary = `wc-${hex(12)}`;
  const line = (label: string, v: unknown) => (v ? `${label}: ${bodySafe(String(v), 300)}` : null);
  const text = ([
    `${bodySafe(String(answers.owner_name || ''), 120)} filled in the Chere' onboarding form.`,
    '',
    line('Business', answers.legal_name),
    line('Phone', answers.phone),
    line('Email', answers.email),
    line('Town', [answers.city, answers.state].filter(Boolean).join(', ')),
    line('Phone type', answers.phone_type === 'iphone' ? `iPhone, Apple ID ${answers.apple_id ?? ''}` : answers.phone_type === 'android' ? 'Android' : ''),
    '',
    files.length ? 'Files (in the bucket, not attached):' : 'No files sent.',
    ...files.map((f) => `  ${f.stored ? '' : 'NOT RECEIVED '}${bodySafe(f.name, 160)} (${fmtBytes(f.size)})`),
    files.length ? `Fetch them on the ops host: python3 /root/scalpel-ik/wc-onboard-pull.py ${meta.id}` : '',
    '',
    'Every answer is in the attached PDF.',
    '',
    `Received ${pacific(meta.received)}`,
    `Stored under onboard/${meta.id}/`,
  ].filter((x): x is string => x !== null) as string[])
    .filter((x, i, a) => x !== '' || (i > 0 && a[i - 1] !== ''))
    .join('\r\n');

  const pdfName = `chere-onboarding-${fileSafe(String(answers.legal_name || 'contractor')).toLowerCase()}.pdf`;
  const headers = [
    `From: Winters Code <${FROM}>`,
    `To: ${TO}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    `Subject: ${headerSafe(`Chere' onboarding: ${name}`, 120)}`,
    `Message-ID: <${Date.now().toString(36)}.${hex(5)}@winterscode.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean);
  return [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfName}"`,
    `Content-Disposition: attachment; filename="${pdfName}"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64(pdf),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Send the notice. Never throws: the submission is already stored. */
export async function sendOnboardMail(env: OnboardEnv, raw: string): Promise<string> {
  if (!env.NOTIFY) return 'unbound';
  try {
    // @ts-ignore : virtual module from the Workers runtime, as in lib/notify
    const { EmailMessage } = await import('cloudflare:email');
    await env.NOTIFY.send(new EmailMessage(FROM, TO, raw));
    return 'sent';
  } catch (err) {
    console.error('[onboard-notify] send failed', String(err).slice(0, 300));
    return 'failed';
  }
}
