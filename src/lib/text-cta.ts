/**
 * Text-first contact links (S326 site DNA, built as a preview for Preston's ruling).
 *
 * Text is the one filled control sitewide: the header, the mobile menu, the
 * phone thumb bar, the hero and the closing contact block. Call is the quiet
 * second choice; Book and Email are plain text links. Every sms: link is built
 * here, so the number, the prefill and the page tag live in one place.
 *
 * The page tag. An sms: tap carries no referrer, so nothing else can say which
 * page a text came from. The prefill names the page in words the visitor sees
 * and can edit before sending. No tracker and no cookie are involved.
 *
 * The "?&body=" form. Android reads the body from a query string and iOS from
 * an "&body" parameter; this form is read by both. Test on a real phone after
 * any change here.
 */
import { business } from './business';

/** The path a visitor sees. Astro.url.pathname under build.format 'file'
 *  reads '/index.html' for home and '/pricing.html' for /pricing. */
export function publicPath(rawPath: string): string {
  if (!rawPath || rawPath === '/' || rawPath === '/index.html') return '/';
  const p = rawPath.replace(/\.html$/, '').replace(/\/index$/, '').replace(/\/$/, '');
  return p || '/';
}

/** sms: link whose prefill names the page the visitor was on. */
export function smsHref(rawPath: string): string {
  const path = publicPath(rawPath);
  const where = path === '/' ? 'winterscode.com' : `winterscode.com${path}`;
  const body = `Hi Preston, found you at ${where}. I'd like help with: `;
  return `sms:${business.phone}?&body=${encodeURIComponent(body)}`;
}

/** sms: link for "a build like this" on a work card or a case page. The
 *  prefill names the project and the page, so the text arrives with context. */
export function smsAboutHref(rawPath: string, project: string): string {
  const path = publicPath(rawPath);
  const where = path === '/' ? 'winterscode.com' : `winterscode.com${path}`;
  const body = `Hi Preston, saw the ${project} build at ${where}. I'd like something like it for: `;
  return `sms:${business.phone}?&body=${encodeURIComponent(body)}`;
}

/** The bare sms: prefix for client scripts that build their own prefill
 *  (the audit results). Append encodeURIComponent(body). */
export const smsBase = `sms:${business.phone}?&body=`;

export const telHref = `tel:${business.phone}`;
export const phoneDisplay = business.phoneDisplay;
export const bookHref = business.cal;
export const mailHref = `mailto:${business.email}?subject=Winters%20Code%20consult%20request`;
