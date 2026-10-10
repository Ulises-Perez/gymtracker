/**
 * Production error monitoring.
 *
 * The SDK is imported dynamically on purpose: a static import would put Sentry
 * in the initial bundle and blow the size budget the plan cares about (A8).
 * Local development never loads it, so no dev noise reaches the project and no
 * cost is paid during normal `npm run dev`.
 */
export function initMonitoring(): void {
  if (!import.meta.env.PROD) {
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    // Missing DSN is a configuration state, not a crash: the app keeps working.
    return;
  }

  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // This app stores body weight and training history. Sentry must not also
      // collect user identifiers, cookies, query params or request bodies.
      // Sentry v11 replaced the older `sendDefaultPii` flag with this granular
      // object, so the design-era option no longer exists.
      dataCollection: {
        userInfo: false,
        cookies: false,
        urlQueryParams: false,
        httpBodies: [],
      },
    });
  });
}
