/**
 * The onboarding answers as a PDF, written by hand.
 *
 * WHY NOT A PDF LIBRARY: winterscode runs on the Workers free plan (Preston,
 * S311: free plans, no upgrade), which allows 10 ms of CPU per request. A
 * general PDF library spends most of that loading itself. This document is
 * text on letter pages in the two standard Helvetica faces, which every PDF
 * reader carries, so nothing is embedded and writing it is string work: well
 * under a millisecond for a few pages.
 *
 * Text is WinAnsi (Latin-1 for the letters people type). Curly quotes and
 * dashes become their plain forms, and anything else outside it becomes '?'
 * rather than a broken byte. Line breaks are measured with the faces' own
 * character widths (Adobe's Helvetica metrics), so a long answer wraps
 * inside the margin instead of running off the page.
 */

const W_REG: Record<number, number> = {};
const W_BOLD: Record<number, number> = {};
// Widths per 1000 units for codes 32 to 126, Helvetica then Helvetica-Bold.
const REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
REG.forEach((w, i) => { W_REG[32 + i] = w; });
BOLD.forEach((w, i) => { W_BOLD[32 + i] = w; });

const SWAP: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201C': '"', '\u201D': '"', '\u201E': '"',
  '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2026': '...', '\u00A0': ' ', '\u2022': '-',
  '\t': ' ',
};

/** Text a WinAnsi Helvetica can draw: Latin-1, with the common typed swaps. */
export function pdfSafe(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const swapped = SWAP[ch];
    if (swapped !== undefined) { out += swapped; continue; }
    const c = ch.codePointAt(0) ?? 63;
    out += (c >= 32 && c <= 126) || (c >= 161 && c <= 255) ? ch : '?';
  }
  return out;
}

function width(s: string, size: number, bold: boolean): number {
  const table = bold ? W_BOLD : W_REG;
  let w = 0;
  for (let i = 0; i < s.length; i++) w += table[s.charCodeAt(i)] ?? 556;
  return (w * size) / 1000;
}

/** Break text into lines no wider than max points. Words longer than a line are split. */
export function wrap(text: string, size: number, bold: boolean, max: number): string[] {
  const lines: string[] = [];
  for (const para of pdfSafe(text).split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/ +/)) {
      if (!word) continue;
      const tryLine = line ? `${line} ${word}` : word;
      if (width(tryLine, size, bold) <= max) { line = tryLine; continue; }
      if (line) lines.push(line);
      let rest = word;
      while (width(rest, size, bold) > max) {
        let cut = rest.length - 1;
        while (cut > 1 && width(rest.slice(0, cut), size, bold) > max) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'meta'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'item'; label: string; value: string };

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const TEXT_W = PAGE_W - MARGIN * 2;
const BOTTOM = MARGIN + 20;

/** Lay the blocks out on letter pages and return the PDF's bytes. */
export function buildPdf(blocks: Block[], info: { title: string; created: Date }): Uint8Array {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => { ops = []; pages.push(ops); y = PAGE_H - MARGIN; };
  newPage();

  const text = (s: string, x: number, size: number, bold: boolean, gray = 0) => {
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(s)}) Tj ET`);
  };
  const need = (h: number) => { if (y - h < BOTTOM) newPage(); };

  for (const b of blocks) {
    if (b.kind === 'title') {
      for (const line of wrap(b.text, 20, true, TEXT_W)) { need(26); y -= 22; text(line, MARGIN, 20, true); }
      y -= 4;
    } else if (b.kind === 'meta') {
      for (const line of wrap(b.text, 9.5, false, TEXT_W)) { need(14); y -= 13; text(line, MARGIN, 9.5, false, 0.35); }
    } else if (b.kind === 'section') {
      need(44);
      y -= 26;
      text(pdfSafe(b.text), MARGIN, 13, true);
      y -= 6;
      ops.push(`0.6 G 0.6 w ${MARGIN} ${y.toFixed(2)} m ${PAGE_W - MARGIN} ${y.toFixed(2)} l S`);
      y -= 2;
    } else {
      const label = wrap(b.label, 9, true, TEXT_W);
      const value = wrap(b.value || '(not answered)', 11, false, TEXT_W - 8);
      need(12 * label.length + 15 * Math.min(value.length, 3) + 8);
      y -= 8;
      for (const line of label) { need(12); y -= 11.5; text(line, MARGIN, 9, true, 0.35); }
      for (const line of value) { need(15); y -= 14.5; text(line, MARGIN + 8, 11, false, b.value ? 0 : 0.5); }
    }
  }

  // Assemble: catalog, pages, two fonts, info, then a page and a content stream per page.
  const objs: string[] = [];
  const n = pages.length;
  const pageObj = (i: number) => 6 + i * 2;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const d = info.created.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  objs[5] = `<< /Title (${esc(pdfSafe(info.title))}) /Producer (winterscode.com) /CreationDate (D:${d}Z) >>`;
  pages.forEach((p, i) => {
    const footer = `BT /F1 8.5 Tf 0.5 g ${MARGIN} ${MARGIN - 18} Td (${esc(`Page ${i + 1} of ${n}`)}) Tj ET`;
    const body = [...p, footer].join('\n');
    objs[pageObj(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObj(i) + 1} 0 R >>`;
    objs[pageObj(i) + 1] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  });

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Every character is one byte (pdfSafe kept the text to Latin-1).
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
