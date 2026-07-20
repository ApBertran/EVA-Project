/* Branding: which sub-version of EVA this head unit identifies as.
 *
 * JARVIS is Morgane's build. It is not a fork of the codebase - it is the same
 * application wearing a different name and palette, so features land once and
 * both cars get them. Everything here is presentation only.
 *
 * Loaded from <head> before first paint, alongside themeBoot.js, so the brand
 * attribute is set before any CSS is applied and the name never flickers.
 */
const BRANDS = {
  eva: {
    name: 'EVA',
    greeting: 'Welcome, Alex',
    /* Alex's car: silver over black, teal instrument cluster */
    palette: 'teal'
  },
  jarvis: {
    name: 'JARVIS',
    greeting: 'Hello, Morgane',
    /* Morgane's car: white over beige, so the UI runs warm rather than cool */
    palette: 'amber'
  }
};

/* The brand is runtime state, not a code constant: this head unit belongs to
   Alex and is only lent out, so it must fall back to EVA on its own rather
   than needing an edit to change hands. The main process reads it from
   ~/.eva-config.json and passes it on the URL, the same way the theme is
   handed over, so it is set before first paint. Absent config means EVA. */
function resolveBrand() {
  try {
    const p = new URLSearchParams(window.location.search).get('brand');
    if (p && BRANDS[p]) return p;
  } catch (e) {
    /* fall through */
  }
  return 'eva';
}

const ACTIVE_BRAND = resolveBrand();

const BRAND = BRANDS[ACTIVE_BRAND] || BRANDS.eva;

(function applyBrand() {
  document.documentElement.setAttribute('data-brand', ACTIVE_BRAND);
  /* accent is independent of brand - it retints the highlight color only */
  try {
    const a = new URLSearchParams(window.location.search).get('accent');
    if (a === 'purple' || a === 'green') document.documentElement.setAttribute('data-accent', a);
  } catch (e) {
    /* no accent override */
  }
  /* The DOM may not exist yet when this runs from <head>; fill in the text
     nodes once it does. */
  const paint = () => {
    document.querySelectorAll('[data-brand-name]').forEach((el) => {
      el.textContent = BRAND.name;
    });
    document.querySelectorAll('[data-brand-greeting]').forEach((el) => {
      el.textContent = BRAND.greeting;
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { BRANDS, ACTIVE_BRAND, BRAND };
