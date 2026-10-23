/**
 * Byte-range video (S339, 2026-10-23), first used for the Chere' demo.
 *
 * Workers Static Assets answer a Range request with 200 and the whole file.
 * Measured on the preview: Range bytes=0-1023 on /work/chere-demo.mp4 came back
 * 200 with all 6,784,586 bytes, with and without the ?v= hash. iPhone Safari
 * probes a video with a Range request and will not play one whose server does
 * not answer 206, so the page points its <video> here instead.
 *
 * Only the files in MEDIA are served; any other name is a 404, so this route
 * can never be pointed at an arbitrary asset or path.
 *
 * This reads the public asset through the ASSETS binding and answers the byte
 * range asked for. The file stays a plain public asset under /work, and this
 * route has no static file of its own, so the worker is what serves it. One
 * source of truth for the bytes; the hash on the URL still comes from
 * asset-versions.json for that public path.
 */
import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const MEDIA: Record<string, { path: string; type: string }> = {
  'chere-demo.mp4': { path: '/work/chere-demo.mp4', type: 'video/mp4' },
  'chere-demo.webm': { path: '/work/chere-demo.webm', type: 'video/webm' },
};

function headers(type: string, size: number, etag: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(size),
  };
  if (etag) h.ETag = etag;
  return h;
}

export const GET: APIRoute = async ({ request, params }) => {
  const media = MEDIA[String(params.file ?? '')];
  if (!media) return new Response('Not found', { status: 404 });
  const env: any = cfEnv ?? {};
  const assets = env.ASSETS as { fetch: (input: URL | Request) => Promise<Response> } | undefined;
  const src = new URL(media.path, request.url);
  const upstream = assets ? await assets.fetch(src) : await fetch(src);
  if (!upstream.ok) return new Response('Not found', { status: 404 });

  const etag = upstream.headers.get('ETag');
  const body = new Uint8Array(await upstream.arrayBuffer());
  const size = body.byteLength;
  const range = request.headers.get('Range');

  // No range, or one this route does not parse (a multi-range list, say):
  // the whole file with a 200, which RFC 9110 allows for any Range request.
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    return new Response(body, { status: 200, headers: headers(media.type, size, etag) });
  }

  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix form, bytes=-N: the last N bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
    });
  }

  return new Response(body.subarray(start, end + 1), {
    status: 206,
    headers: { ...headers(media.type, end - start + 1, etag), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
};

export const HEAD: APIRoute = async (ctx) => {
  const res = await GET(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};
