# Components

Organized by what they do, not what framework renders them.

## `layout/`
Sitewide chrome: Header, Footer, MenuPanel, scroll-progress integration.
Imported by every page via the layout.

## `sections/`
Homepage sections. One file per section of v5.1:
- `Hero.astro`, morphing-phrase hero + phone mockup
- `Instruments.astro`, chat demo + Baseline score widget
- `Apps.astro`, app portfolio (StainSlayer AI, ChopLight)
- `Sites.astro`, site portfolio (sogncontracting.com, baseline.marketing)
- `Process.astro`, three-step workflow
- `Faq.astro`, accordion of common questions
- `Contact.astro`, final CTA + consult form

## `ui/`
Atomic primitives reused across sections. Buttons, cards, dividers, badges.
Astro-only (no React). Pure markup + classes from `global.css` tokens.

## `islands/`
React components requiring client-side hydration:
- `MorphPhrase.tsx`, cycles through "apps for fishing charters" / "sites for contractors" / etc.
- `ChatDemo.tsx`, interactive demo in the Instruments section
- `MobileMenu.tsx`, slide-out menu panel with state

Each island uses `client:load`, `client:idle`, or `client:visible` based on
how prominent / above-the-fold the component is. Anything below the fold
ships as `client:visible` to keep initial JS payload near zero.
