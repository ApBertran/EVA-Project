/* Stamps data-theme on <html> BEFORE first paint.
 *
 * theme.js can only run once the socket delivers config, so without this every
 * boot painted the night palette and then snapped to day.
 *
 * The value comes from the main process via ?theme= on the URL. That is the
 * only reliable channel here: localStorage is blocked on file:// documents
 * ("Access is denied for this document"), and the socket is far too late.
 * Each page forwards location.search when it navigates so the value survives
 * entry -> welcome -> gui.
 *
 * The daylight fallback below only matters if a page is opened without the
 * parameter; theme.js reconciles anything stale once config arrives.
 */
(function () {
  var resolved = null;

  try {
    var param = new URLSearchParams(window.location.search).get('theme');
    if (param === 'day' || param === 'night') resolved = param;
  } catch (e) {
    /* fall through to the daylight fallback */
  }

  if (!resolved) {
    if (window.DaylightClient) resolved = window.DaylightClient.resolve({ now: new Date() }).mode;
    else {
      var h = new Date().getHours();
      resolved = h >= 7 && h < 19 ? 'day' : 'night';
    }
  }

  document.documentElement.setAttribute('data-theme', resolved);
})();
