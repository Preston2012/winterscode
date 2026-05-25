// PostCSS config wiring Tailwind v4.
// Why PostCSS (not @tailwindcss/vite): Astro 6 ships rolldown-vite which
// has a known incompatibility with @tailwindcss/vite - build fails on any
// Tailwind-using stylesheet. The PostCSS path works correctly until the
// Vite plugin gains rolldown support.
// Tracking: https://github.com/withastro/astro/issues/16542
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
