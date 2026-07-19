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
    greeting: 'Welcome, Morgane',
    /* Morgane's car: white over beige, so the UI runs warm rather than cool */
    palette: 'amber'
  }
};

/* Change this one line to reflect the car this unit is installed in. */
const ACTIVE_BRAND = 'jarvis';

const BRAND = BRANDS[ACTIVE_BRAND] || BRANDS.eva;

(function applyBrand() {
  document.documentElement.setAttribute('data-brand', ACTIVE_BRAND);
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
