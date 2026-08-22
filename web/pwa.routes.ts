// Mirrors NON_SPA_ROUTES in src/http/static.ts:14 exactly: the Express fallback and the service
// worker must agree on which prefixes are never the SPA, so edit both or neither.
//
// Paths the backend owns. Workbox tests this against url.pathname + url.search of NAVIGATION requests,
// so typing /admin/metrics or /health into the address bar never gets the SPA shell instead.
// fetch()/XHR and Twilio's POSTs are unaffected either way: the SW has no runtime caching routes.
export const NON_SPA_ROUTES = /^\/(api|webhooks|admin|internal|health)(?=[\/?#]|$)/;
