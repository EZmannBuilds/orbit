// Orbit Axis :: startup view decision (pure, shared by the app and its tests).
//
// This is the single rule that decides what a user sees when Orbit Axis starts.
// It is deliberately pure and dependency-free so the returning-user guarantee is
// unit-tested rather than only observable in a browser.
//
// The bug this exists to prevent: an empty `charts` array is ambiguous — it can
// mean "this account has no charts" OR "the request failed / hasn't finished".
// Onboarding is only ever correct for the first of those. So the decision keys
// off the *status* of the saved-chart request, never off the array alone.

export const STARTUP_VIEW = Object.freeze({
  LOADING: "loading",         // auth and/or charts still resolving — show the startup gate
  SIGNED_OUT: "signed_out",   // signed-out local preview
  ERROR: "error",             // saved-chart request failed — recoverable, offer retry
  ONBOARDING: "onboarding",   // signed in, request succeeded, genuinely zero charts
  READY: "ready",             // returning user — load their charts, no popup
});

/**
 * Decide which startup view to show.
 *
 * @param {object} input
 * @param {boolean} input.authResolved      auth request has finished (success or failure)
 * @param {boolean} input.signedIn          user has an authenticated session
 * @param {string}  input.chartsStatus      idle | loading | ready | error
 * @param {number}  input.chartCount        number of saved charts the server returned
 * @param {boolean} input.onboardingDismissed  user closed onboarding this session
 */
export function decideStartupView({
  authResolved = false,
  signedIn = false,
  chartsStatus = "idle",
  chartCount = 0,
  onboardingDismissed = false,
} = {}) {
  // 1. Never decide anything before auth resolves. This is what stops the setup
  //    form appearing while we still don't know who the user is.
  if (!authResolved) return STARTUP_VIEW.LOADING;

  // 2. Signed-out local preview is untouched by the saved-chart system.
  if (!signedIn) return STARTUP_VIEW.SIGNED_OUT;

  // 3. Signed in, but the saved-chart request hasn't finished. Still loading —
  //    emphatically NOT onboarding.
  if (chartsStatus === "idle" || chartsStatus === "loading") return STARTUP_VIEW.LOADING;

  // 4. The request failed. Recoverable: offer a retry. We do not know whether
  //    the user has charts, so we must not claim they have none.
  if (chartsStatus === "error") return STARTUP_VIEW.ERROR;

  // 5. The request succeeded. Only now is an empty list meaningful.
  if (chartsStatus === "ready" && chartCount === 0) {
    // Closing onboarding shouldn't make it reappear for the rest of the session;
    // the Home "+" action reopens chart creation on demand.
    return onboardingDismissed ? STARTUP_VIEW.READY : STARTUP_VIEW.ONBOARDING;
  }

  // 6. Returning user with at least one saved chart. Load it. No popup, ever.
  return STARTUP_VIEW.READY;
}
