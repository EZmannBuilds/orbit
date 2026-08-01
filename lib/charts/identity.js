// Orbit Axis :: saved-chart identity — re-export.
//
// The implementation lives in public/chart-identity.js because the browser
// needs it and `lib/` is never served. Server code imports it from here so the
// import path reads naturally alongside the other chart modules, but there is
// exactly one implementation. public/moon-phase.js is arranged the same way,
// for the same reason.
//
// Keeping a second copy here would have meant two sources of truth for the
// relationship rules — which is the specific mistake this update exists to
// avoid in the schema, and no better in the code.

export * from "../../public/chart-identity.js";
