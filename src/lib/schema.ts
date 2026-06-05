/**
 * JSON-LD schema builders. Pure functions returning plain objects to be
 * JSON.stringify'd into <script type="application/ld+json" set:html=...>.
 *
 * CSP note: ld+json via set:html is a data block, not script-src, so these
 * need no hashing under the strict per-page CSP.
 *
 * Identity note: the single business entity lives at the stable @id
 * `${business.url}/#business`. Per-page Service/Breadcrumb/FAQ nodes reference
 * it by @id rather than re-declaring the business, so there is never a
 * duplicate LocalBusiness block. BaseLayout emits the business + website nodes
 * site-wide; pages add only Service/Breadcrumb/FAQ via the head slot.
 *
 * URLs: built from business.url, which mirrors astro.config `site`.
 */
import { business, sameAs, services, towns } from './business';

const SITE = business.url; // no trailing slash
export const BUSINESS_ID = `${SITE}/#business`;
export const WEBSITE_ID = `${SITE}/#website`;

/** Join a path onto the site origin. Pass '/' for the homepage. */
export function absUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Default OG/business image. */
const IMAGE = absUrl('/og-image.png?v=2');

/**
 * Primary business node: LocalBusiness + ProfessionalService.
 * Supersedes the inline object that used to live in BaseLayout. areaServed now
 * carries every target town (City) plus the two counties (AdministrativeArea).
 * Contact + sameAs are real, published values.
 */
export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'ProfessionalService'],
    '@id': BUSINESS_ID,
    name: business.name,
    description:
      'Custom React, Astro, and Flutter for Oregon coast businesses. Modern stack. Days, not weeks.',
    url: SITE,
    image: IMAGE,
    telephone: business.phone,
    email: business.email,
    priceRange: business.priceRange,
    address: {
      '@type': 'PostalAddress',
      addressLocality: business.locality,
      addressRegion: business.region,
      addressCountry: business.country,
    },
    areaServed: [
      ...business.counties.map((name) => ({ '@type': 'AdministrativeArea', name: `${name}, Oregon` })),
      ...towns.map((t) => ({ '@type': 'City', name: `${t.name}, Oregon` })),
    ],
    founder: { '@type': 'Person', name: business.founder },
    sameAs,
    makesOffer: services.map((s) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: s.name,
        serviceType: s.serviceType,
        url: absUrl(`/services/${s.slug}`),
      },
    })),
  };
}

/**
 * WebSite node. publisher references the business by @id. No SearchAction:
 * the site has no internal search endpoint (the /audit tool checks external
 * URLs, it is not a site search), so a SearchAction would be invalid.
 */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: business.name,
    url: SITE,
    publisher: { '@id': BUSINESS_ID },
    inLanguage: 'en-US',
  };
}

/** Per-page Service node. provider references the business by @id. */
export function serviceSchema(opts: {
  name: string;
  serviceType: string;
  description: string;
  path: string;
  /** Optional single place name for a location-specific service page. */
  areaName?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    serviceType: opts.serviceType,
    description: opts.description,
    url: absUrl(opts.path),
    provider: { '@id': BUSINESS_ID },
    areaServed: opts.areaName
      ? { '@type': 'City', name: `${opts.areaName}, Oregon` }
      : [
          ...business.counties.map((name) => ({ '@type': 'AdministrativeArea', name: `${name}, Oregon` })),
          ...towns.map((t) => ({ '@type': 'City', name: `${t.name}, Oregon` })),
        ],
  };
}

/** BreadcrumbList from an ordered list of {name, path} crumbs. */
export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.path),
    })),
  };
}

/** FAQPage from question/answer pairs. Drives AEO / AI-overview surfacing. */
export function faqSchema(pairs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map((p) => ({
      '@type': 'Question',
      name: p.q,
      acceptedAnswer: { '@type': 'Answer', text: p.a },
    })),
  };
}
