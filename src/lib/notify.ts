/**
 * Lead notification over Cloudflare Email Routing, with no mail provider.
 *
 * WHY THIS AND NOT A PROVIDER: winterscode.com already runs Cloudflare Email
 * Routing, and the account holds one verified destination address. A Worker
 * with a send_email binding can deliver to a verified destination directly,
 * free, with no API key, no third party holding the lead, and nothing to
 * expire or be misfiled onto the wrong account. The binding is scoped to that
 * single destination, so a bug in this file cannot mail anyone else.
 *
 * ORDERING: the lead is already in R2 before this runs. Notification is the
 * second act, never the first, and a failure here is logged and swallowed.
 * Losing a lead because a mail hop failed is the defect this whole path exists
 * to avoid.
 *
 * HEADER INJECTION: the name and the reply address come from a public form.
 * A carriage return or newline inside a header value lets a submitter append
 * their own headers, so every interpolated value is stripped of CR and LF and
 * bounded before it goes anywhere near the message.
 */

export interface NotifyEnv {
  NOTIFY?: { send(message: unknown): Promise<void> };
}

export interface LeadNotice {
  name: string;
  email: string;
  phone?: string;
  business?: string;
  city?: string;
  industry?: string;
  projectType?: string;
  notes?: string;
  receivedAt: string;
  guard: string;
  key: string;
}

const FROM = 'forms@winterscode.com';
const FROM_NAME = 'Winters Code';
const TO = 'droiddna2013@gmail.com';

/** One line, no control characters, bounded. Safe to place in a header. */
function headerSafe(value: string, max = 160): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim().slice(0, max);
}

/** Body text is not header context, but keep CR out so the MIME stays intact. */
function bodySafe(value: string, max = 4000): string {
  return value.replace(/\r/g, '').slice(0, max);
}

function buildMime(lead: LeadNotice): { raw: string; subject: string } {
  const name = headerSafe(lead.name, 80) || 'someone';
  const replyTo = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(lead.email)
    ? headerSafe(lead.email, 120)
    : '';
  const subject = `New brief from ${name}`;
  const id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;

  const lines: string[] = [];
  const add = (label: string, v?: string) => { if (v) lines.push(`${label}: ${bodySafe(v, 500)}`); };
  add('Name', lead.name);
  add('Email', lead.email);
  add('Phone', lead.phone);
  add('Business', lead.business);
  add('City', lead.city);
  add('Industry', lead.industry);
  add('Project', lead.projectType);
  lines.push('');
  lines.push(bodySafe(lead.notes || '(no notes)'));
  lines.push('');
  lines.push(`Received ${lead.receivedAt}`);
  lines.push(`Screening ${lead.guard}`);
  lines.push(`Stored as ${lead.key}`);

  const headers = [
    `From: ${FROM_NAME} <${FROM}>`,
    `To: ${TO}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    `Subject: ${headerSafe(subject, 120)}`,
    `Message-ID: <${id}@winterscode.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ].filter(Boolean);

  return { raw: headers.join('\r\n') + '\r\n\r\n' + lines.join('\r\n') + '\r\n', subject };
}

/**
 * Send the notice. Returns a short state string for the log, never throws.
 * States: sent, unbound (no send_email binding), failed.
 */
export async function notifyLead(env: NotifyEnv, lead: LeadNotice): Promise<string> {
  if (!env.NOTIFY) return 'unbound';
  try {
    // Imported here so a build without the binding still type-checks and so
    // the module is only pulled in on the path that uses it.
    const { EmailMessage } = await import('cloudflare:email');
    const { raw } = buildMime(lead);
    await env.NOTIFY.send(new EmailMessage(FROM, TO, raw));
    return 'sent';
  } catch (err) {
    console.error('[notify] send failed', String(err).slice(0, 300));
    return 'failed';
  }
}
