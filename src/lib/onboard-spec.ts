/**
 * The Chere' onboarding questions, one definition for three readers.
 *
 * The page (src/pages/chere/onboard.astro) renders every part from this file,
 * the server (src/pages/api/onboard/*) checks every answer against it, and the
 * PDF Preston receives (src/lib/onboard-pdf.ts) labels every answer from it.
 * Three copies of a question list drift; one list with three readers cannot.
 *
 * THE RULE FOR A QUESTION (Preston, 2026-10-29): "No questions we don't need.
 * All the questions we do." Each one below sets something in the contractor's
 * own server or app: `sets` names it, so a question with nothing to set has no
 * place here. The setup lives in wf-seabreeze app/config_variants/<slug>
 * (client.json, brand.json, flags.json) and infra/ansible/inventory/<slug>.yml.
 */

export type Kind = 'text' | 'email' | 'tel' | 'url' | 'number' | 'textarea' | 'select' | 'radio' | 'checks' | 'check' | 'file';

export interface Option { value: string; label: string }

export interface When {
  field: string;
  /** Shown when the field's value equals this, or (for checks) includes it. Text compares without case. */
  is: string;
  /** Shown when the value does NOT match instead. */
  not?: boolean;
}

/** Oregon's 36 counties, for the home county pick-list (Preston, 2026-11-02). */
const OREGON_COUNTIES = [
  'Baker', 'Benton', 'Clackamas', 'Clatsop', 'Columbia', 'Coos', 'Crook', 'Curry', 'Deschutes',
  'Douglas', 'Gilliam', 'Grant', 'Harney', 'Hood River', 'Jackson', 'Jefferson', 'Josephine',
  'Klamath', 'Lake', 'Lane', 'Lincoln', 'Linn', 'Malheur', 'Marion', 'Morrow', 'Multnomah',
  'Polk', 'Sherman', 'Tillamook', 'Umatilla', 'Union', 'Wallowa', 'Wasco', 'Washington',
  'Wheeler', 'Yamhill',
].map((c) => ({ value: c, label: c }));

export interface Field {
  id: string;
  label: string;
  kind: Kind;
  required?: boolean;
  help?: string;
  /** Longest text answer, in characters. */
  max?: number;
  /** Numbers: inclusive range. */
  min?: number;
  maxNum?: number;
  pattern?: string;
  patternWords?: string;
  options?: Option[];
  when?: When;
  autocomplete?: string;
  inputmode?: string;
  placeholder?: string;
  initial?: string;
  /** Files. */
  accept?: string;
  maxFiles?: number;
  maxBytes?: number;
  /** What the answer sets up. Read by people, never by the code. */
  sets: string;
}

export interface Step {
  id: string;
  title: string;
  lead?: string;
  fields: Field[];
}

const YES_NO: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export const MB = 1024 * 1024;
/** All uploads together. Each file also has its own cap below. */
export const MAX_UPLOAD_BYTES = 25 * MB;

export const UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
] as const;

export const STEPS: Step[] = [
  {
    id: 'business',
    title: 'You and your business',
    lead: 'These go on your estimates, contracts and invoices.',
    fields: [
      { id: 'owner_name', label: 'Your name', kind: 'text', required: true, max: 120, autocomplete: 'name', sets: 'client.json business.owner_first_name and owner_last_name' },
      { id: 'legal_name', label: 'Business name, as it is registered', kind: 'text', required: true, max: 160, autocomplete: 'organization', sets: 'client.json business.legal_name; the name on contracts' },
      { id: 'display_name', label: 'Name customers know you by', kind: 'text', max: 80, help: 'Leave it blank if it is the same.', sets: 'brand.json business.display_name; the name in the app and on messages' },
      { id: 'phone', label: 'Phone customers call', kind: 'tel', required: true, max: 40, autocomplete: 'tel', inputmode: 'tel', sets: 'brand.json business.phone' },
      { id: 'email', label: 'Email customers write to', kind: 'email', required: true, max: 160, autocomplete: 'email', inputmode: 'email', help: 'Replies to your estimates and invoices land here.', sets: 'brand.json business.email; reply-to on mail the server sends' },
      { id: 'street', label: 'Business mailing address', kind: 'text', required: true, max: 160, autocomplete: 'street-address', sets: 'client.json contact.mailing_address' },
      { id: 'city', label: 'Town', kind: 'text', required: true, max: 80, autocomplete: 'address-level2', sets: 'client.json service_area.primary_city' },
      { id: 'state', label: 'State', kind: 'text', required: true, max: 2, initial: 'OR', pattern: '^[A-Za-z]{2}$', patternWords: 'Two letters, like OR.', autocomplete: 'address-level1', sets: 'client.json service_area.primary_state' },
      { id: 'zip', label: 'ZIP code', kind: 'text', required: true, max: 10, pattern: '^[0-9]{5}(-[0-9]{4})?$', patternWords: 'Five digits.', autocomplete: 'postal-code', inputmode: 'numeric', sets: 'client.json contact.postal_code' },
      { id: 'website', label: 'Your website, if you have one', kind: 'url', max: 200, placeholder: 'https://', help: 'The app takes its colors and wording from it.', sets: 'brand.json colors and copy, read from the site' },
    ],
  },
  {
    id: 'work',
    title: 'Your work',
    lead: 'This decides what the app offers you and how it prices.',
    fields: [
      {
        id: 'trades', label: 'What work do you do?', kind: 'checks', required: true,
        options: [
          { value: 'construction', label: 'Construction and repair' },
          { value: 'landscape', label: 'Landscape and maintenance' },
        ],
        sets: 'client.json service_categories; flags.json design.construction and design.landscape',
      },
      { id: 'other_work', label: 'Anything else you do', kind: 'text', max: 200, help: 'Fencing, roofing, decks: whatever your customers hire you for.', sets: 'the price book and the assistant\'s knowledge of your trade' },
      { id: 'ccb', label: 'Oregon CCB license number', kind: 'text', max: 12, pattern: '^[0-9]{1,8}$', patternWords: 'Digits only.', inputmode: 'numeric', help: 'Leave it blank if you are not licensed with the CCB.', sets: 'client.json licenses; printed where the law asks for it' },
      { id: 'lcb', label: 'Oregon Landscape Contractors Board license number', kind: 'text', max: 12, pattern: '^[0-9]{1,8}$', patternWords: 'Digits only.', inputmode: 'numeric', when: { field: 'trades', is: 'landscape' }, help: 'Leave it blank if you are not licensed with the LCB.', sets: 'client.json licenses; the casual-work cap is lifted for an LCB licensee' },
      { id: 'bonded', label: 'Are you bonded?', kind: 'radio', required: true, options: YES_NO, sets: 'client.json credentials.bonded' },
      { id: 'insured', label: 'Do you carry liability insurance?', kind: 'radio', required: true, options: YES_NO, sets: 'client.json credentials.insured' },
      // Preston's own test typed "7" and "Oregon" into a free-text county (2026-11-01). In
      // Oregon it is a pick-list; anywhere else it stays typed.
      { id: 'county', label: 'Your home county', kind: 'select', required: true, options: OREGON_COUNTIES, when: { field: 'state', is: 'OR' }, sets: 'client.json service_area.primary_county; the prices the app starts from' },
      { id: 'county_other', label: 'Your home county', kind: 'text', required: true, max: 60, when: { field: 'state', is: 'OR', not: true }, sets: 'client.json service_area.primary_county; the prices the app starts from' },
      { id: 'counties', label: 'Other counties you work in', kind: 'text', max: 300, help: 'Prices follow the job\'s address, so name every county you take work in.', sets: 'client.json service_area.counties_served; regional pricing' },
      { id: 'radius', label: 'How far you will drive for a job, in miles', kind: 'number', min: 0, maxNum: 500, inputmode: 'numeric', sets: 'client.json service_area.in_person_radius_miles' },
      { id: 'labor_rate', label: 'Your usual hourly labor rate, in dollars', kind: 'number', required: true, min: 1, maxNum: 1000, inputmode: 'decimal', help: 'The starting rate on new estimates. You can change it on any job.', sets: 'client.json pricing.labor.default_rate_cents' },
      { id: 'show_labor', label: 'Show customers your labor hours and rate on estimates?', kind: 'radio', required: true, options: YES_NO, help: 'No shows them the price for the work instead.', sets: 'client.json pricing.customer_sees_labor_detail' },
      {
        id: 'invoice_terms', label: 'When are your invoices due?', kind: 'select', required: true,
        options: [
          { value: '0', label: 'On receipt' },
          { value: '15', label: '15 days after the invoice' },
          { value: '30', label: '30 days after the invoice' },
          { value: '45', label: '45 days after the invoice' },
        ],
        sets: 'client.json invoicing.due_term_days',
      },
      { id: 'workday_hours', label: 'Hours in your usual workday', kind: 'number', min: 1, maxNum: 16, initial: '8', inputmode: 'numeric', help: 'The schedule turns hours of work into days with this.', sets: 'client.json schedule.workday_hours' },
    ],
  },
  {
    id: 'app',
    title: "How Chere' works for you",
    lead: 'Each of these turns a part of the app on or off for your business. You can change any of them later.',
    fields: [
      { id: 'maintenance', label: 'Do you sell recurring maintenance, like mowing or seasonal care?', kind: 'radio', required: true, options: YES_NO, when: { field: 'trades', is: 'landscape' }, help: 'Yes adds maintenance plans that bill on a schedule.', sets: 'flags.json field_service.maintenance_plans' },
      { id: 'job_plan', label: 'Do you want to plan jobs in phases, with crew and equipment?', kind: 'radio', required: true, options: YES_NO, help: 'Yes adds a Plan to each job and a Mobilization line to estimates.', sets: 'flags.json field_service.job_plan' },
      {
        id: 'assistant', label: "When Chere' helps you, should it take the lead?", kind: 'radio', required: true,
        options: [
          { value: 'point', label: 'Yes: set the order of things and move them along' },
          { value: 'wingman', label: 'No: do the work and hand me the decision' },
        ],
        help: 'Either way you have the last word.',
        sets: "the assistant's voice setting (Point or Wingman)",
      },
      { id: 'memory', label: "Should Chere' remember your business between conversations?", kind: 'radio', required: true, options: YES_NO, help: 'Your prices, how you word things, what your customers prefer. It is kept on your own server. No means every conversation starts fresh.', sets: 'inventory demiurge_enabled; a memory of your own on the engine' },
      { id: 'ai_sharing', label: "Can Chere' send your work to AI services to read photos, draft estimates and answer questions?", kind: 'radio', required: true, options: YES_NO, help: 'Requests go to OpenAI or Anthropic and can include what you type, customer and job records, and photos. Your phone asks you again before anything is sent. No keeps the AI features off.', sets: 'client.json privacy.customer_content_providers' },
      { id: 'improve', label: "Share your prices and job sizes, without names or addresses, to improve price estimates for every Chere' contractor", kind: 'check', help: 'Optional, and off unless you tick it. You can stop at any time and have what you shared deleted.', sets: 'a record of consent before any pooled pricing uses your numbers' },
    ],
  },
  {
    id: 'money',
    title: 'Payments and books',
    fields: [
      {
        id: 'payments', label: 'Take card payments through', kind: 'radio', required: true,
        options: [
          { value: 'square', label: 'Square' },
          { value: 'stripe', label: 'Stripe' },
          { value: 'none', label: 'Neither, for now' },
        ],
        help: 'You connect your own account in the app. Your customers pay you directly.',
        sets: 'flags.json integrations.square or integrations.stripe; client.json payments.card_enabled',
      },
      {
        id: 'quickbooks', label: 'Do you use QuickBooks?', kind: 'radio', required: true,
        options: [
          { value: 'online', label: 'QuickBooks Online' },
          { value: 'desktop', label: 'QuickBooks Desktop' },
          { value: 'no', label: 'No' },
        ],
        sets: 'flags.json integrations.quickbooks',
      },
    ],
  },
  {
    id: 'documents',
    title: 'Your documents',
    lead: 'Both are optional. The more Chere\' sees of how you work, the closer its first estimates come to yours.',
    fields: [
      { id: 'logo', label: 'Your logo', kind: 'file', accept: 'image/*,.pdf,.svg', maxFiles: 1, maxBytes: 5 * MB, help: 'The biggest, clearest version you have. The app\'s colors come from it.', sets: 'brand.json colors, measured from the logo' },
      { id: 'reference', label: 'Past contracts, estimates and price sheets', kind: 'file', accept: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*', maxFiles: 8, maxBytes: 10 * MB, help: 'PDF, Word, Excel, CSV or photos.', sets: 'your price book and contract wording' },
    ],
  },
  {
    id: 'phone',
    title: 'Your phone',
    fields: [
      {
        id: 'phone_type', label: 'Which phone will you use Chere\' on?', kind: 'radio', required: true,
        options: [
          { value: 'iphone', label: 'iPhone' },
          { value: 'android', label: 'Android' },
        ],
        sets: 'TestFlight invite or the Android install',
      },
      { id: 'apple_id', label: 'Your Apple ID email', kind: 'email', required: true, max: 160, inputmode: 'email', when: { field: 'phone_type', is: 'iphone' }, help: 'Apple sends the TestFlight invite to this address.', sets: 'the TestFlight tester entry' },
      { id: 'notes', label: 'Anything else I should know?', kind: 'textarea', max: 2000, sets: 'nothing by itself; Preston reads it' },
    ],
  },
];

export const ALL_FIELDS: Field[] = STEPS.flatMap((s) => s.fields);
export const FILE_FIELDS = ALL_FIELDS.filter((f) => f.kind === 'file');

export type Answers = Record<string, string | string[]>;

/** True when the field's condition holds for these answers (or it has none). */
export function isShown(f: Field, answers: Answers): boolean {
  if (!f.when) return true;
  const v = answers[f.when.field];
  const want = f.when.is.toUpperCase();
  const hit = Array.isArray(v) ? v.includes(f.when.is) : typeof v === 'string' && v.trim().toUpperCase() === want;
  return f.when.not ? !hit : hit;
}

/** The label a stored value reads as, for the review and the PDF. */
export function answerText(f: Field, v: string | string[] | undefined): string {
  if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '';
  const label = (x: string) => f.options?.find((o) => o.value === x)?.label ?? x;
  if (f.kind === 'check') return v === 'yes' ? 'Yes' : '';
  if (Array.isArray(v)) return v.map(label).join(', ');
  if (f.kind === 'number' && f.id === 'labor_rate') return `$${v} an hour`;
  return label(v);
}

export interface DeclaredFile { field: string; name: string; type: string; size: number }

export interface CheckResult {
  ok: boolean;
  /** Field id to a sentence saying what to fix. */
  errors: Record<string, string>;
  /** Only the answers to questions shown, trimmed and bounded. */
  answers: Answers;
  files: DeclaredFile[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check one submission against the spec. The browser runs the same checks
 * for each part as it is filled in; the server's run is the one that counts.
 */
export function checkSubmission(rawAnswers: unknown, rawFiles: unknown): CheckResult {
  const errors: Record<string, string> = {};
  const src = (rawAnswers && typeof rawAnswers === 'object' ? rawAnswers : {}) as Record<string, unknown>;
  const answers: Answers = {};

  // Read every non-file value first, so conditions see the whole submission.
  const read: Answers = {};
  for (const f of ALL_FIELDS) {
    if (f.kind === 'file') continue;
    const v = src[f.id];
    if (f.kind === 'checks') {
      read[f.id] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : [];
    } else if (typeof v === 'string') {
      read[f.id] = v.trim();
    }
  }

  for (const f of ALL_FIELDS) {
    if (f.kind === 'file' || !isShown(f, read)) continue;
    const v = read[f.id];
    const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (f.required) errors[f.id] = f.kind === 'radio' || f.kind === 'select' || f.kind === 'checks' ? 'Pick one.' : 'Fill this in.';
      continue;
    }
    if (Array.isArray(v)) {
      const allowed = new Set((f.options ?? []).map((o) => o.value));
      const kept = [...new Set(v.filter((x) => allowed.has(x)))];
      if (kept.length === 0) { errors[f.id] = 'Pick one.'; continue; }
      answers[f.id] = kept;
      continue;
    }
    const s = v as string;
    if (f.max && s.length > f.max) { errors[f.id] = `Keep it under ${f.max} characters.`; continue; }
    if (f.options && !f.options.some((o) => o.value === s)) { errors[f.id] = 'Pick one.'; continue; }
    if (f.kind === 'check' && s !== 'yes') continue;
    if (f.kind === 'email' && !EMAIL.test(s)) { errors[f.id] = 'That email does not look right.'; continue; }
    if (f.kind === 'url' && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(s)) { errors[f.id] = 'Start it with https://'; continue; }
    if (f.kind === 'tel') {
      // Stored the way people write it (Preston's test was kept as 15415510731).
      const digits = s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (digits.length !== 10) { errors[f.id] = 'Ten digits with the area code, like 541-555-0100.'; continue; }
      answers[f.id] = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      continue;
    }
    if (f.kind === 'number') {
      const n = Number(s);
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.maxNum !== undefined && n > f.maxNum)) {
        errors[f.id] = `A number from ${f.min ?? 0} to ${f.maxNum}.`;
        continue;
      }
      answers[f.id] = String(Math.round(n * 100) / 100);
      continue;
    }
    if (f.pattern && !new RegExp(f.pattern).test(s)) { errors[f.id] = f.patternWords ?? 'Check this one.'; continue; }
    answers[f.id] = f.id === 'state' ? s.toUpperCase() : s;
  }

  // Files: declared here, sent one by one after the answers are accepted.
  const files: DeclaredFile[] = [];
  const list = Array.isArray(rawFiles) ? rawFiles.slice(0, 20) : [];
  let total = 0;
  for (const f of FILE_FIELDS) {
    const mine = list.filter((x) => x && typeof x === 'object' && (x as DeclaredFile).field === f.id) as DeclaredFile[];
    if (mine.length > (f.maxFiles ?? 1)) { errors[f.id] = `Up to ${f.maxFiles ?? 1} file${(f.maxFiles ?? 1) === 1 ? '' : 's'}.`; continue; }
    for (const x of mine) {
      const name = typeof x.name === 'string' ? x.name.slice(0, 160) : '';
      const size = typeof x.size === 'number' && Number.isInteger(x.size) ? x.size : -1;
      const type = typeof x.type === 'string' ? x.type.toLowerCase() : '';
      if (!name || size <= 0) { errors[f.id] = 'One of these files could not be read. Pick it again.'; break; }
      if (size > (f.maxBytes ?? MB)) { errors[f.id] = `${name} is over ${Math.round((f.maxBytes ?? MB) / MB)} MB. Text it to me instead.`; break; }
      if (!(UPLOAD_TYPES as readonly string[]).includes(type)) { errors[f.id] = `${name} is a kind of file I cannot take here. PDF, Word, Excel, CSV or a photo.`; break; }
      total += size;
      files.push({ field: f.id, name, type, size });
    }
  }
  if (total > MAX_UPLOAD_BYTES) errors.reference = `All files together are over ${MAX_UPLOAD_BYTES / MB} MB. Leave a few out and text them to me.`;

  return { ok: Object.keys(errors).length === 0, errors, answers, files };
}
