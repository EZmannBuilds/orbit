// Orbit Axis :: Symbol Atlas — server-side re-export.
//
// The implementation lives in public/symbol-atlas/ because the browser needs
// it and `lib/` is never served. Server code and tests import it from here so
// the path reads naturally beside the other lib modules, but there is exactly
// one implementation — the same arrangement as lib/charts/identity.js, for the
// same reason: two copies of "what element is Scorpio" is one copy too many.

export * from "../../public/symbol-atlas/index.js";
