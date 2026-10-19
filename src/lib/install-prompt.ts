/**
 * The browser's install conversation, and where the answer is remembered.
 *
 * Two platforms, two completely different questions. Chromium hands the page a deferred event and
 * the page decides when to raise the native dialog; iOS raises nothing at all, and the only way in is
 * Safari's Share sheet, which no code can press. So this module answers the platform questions
 * (`isInstalled`, `isIos`) and keeps the one piece of state the app owns: that the user said "Ahora
 * no", which has to outlive the tab.
 *
 * Everything here is a question about the browser, so nothing here imports React: the hook that
 * listens for the event lives with the components, and this file can be read as the platform rules.
 */

/** What the user answered in the browser's own install dialog. */
export interface InstallChoice {
  outcome: 'accepted' | 'dismissed';
  platform: string;
}

/**
 * Chromium's deferred install event.
 *
 * `lib.dom` does not declare it — it is a Chromium extension to the platform and the spec is still a
 * draft — so the shape is stated here instead of being cast at each use. The event can be used once:
 * after `prompt()` resolves, the browser will not show the dialog for it again.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<InstallChoice>;
  prompt: () => Promise<void>;
}

/**
 * Where "Ahora no" is kept.
 *
 * `localStorage` and not IndexedDB, deliberately: this is a preference about a strip of paper, read
 * once at mount. The workout draft and the mutation queue are the things that deserve a database and
 * an async read; a dismissed banner does not.
 */
export const INSTALL_DISMISSED_KEY = 'gymtracker.install-dismissed';

/**
 * Whether the app is running as an installed app rather than in a tab.
 *
 * Both signals are read and neither is redundant: `display-mode: standalone` is the standard one and
 * Safari on iOS still exposes its own `navigator.standalone`. Reading only the media query would offer
 * the install to an app that is already on the home screen, which is the one thing the brief forbids
 * outright.
 */
export function isInstalled(): boolean {
  const standaloneFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standaloneFlag || matchesMedia('(display-mode: standalone)');
}

/**
 * Whether this is iOS, where no install event exists and the steps have to be printed.
 *
 * iPadOS 13 and later report themselves as a Macintosh, which is why the touch points are consulted:
 * a laptop running Safari has none, and an iPad has several. Without that clause the instructions
 * would be missing on every iPad since 2019.
 */
export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/** Whether the user already said "Ahora no" on this device. */
export function isInstallDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    // Storage can be denied outright (private modes, hardened browsers). A preference that cannot be
    // read is not a preference: the strip is simply offered again rather than the screen breaking.
    return false;
  }
}

/** Remembers "Ahora no" so the strip does not come back on the next load. */
export function dismissInstall(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // Same reason as the read: the strip still closes for this session, only the persistence is lost.
  }
}

/**
 * A media query, answered `false` where the API does not exist.
 *
 * `matchMedia` is missing in jsdom and in some embedded webviews, and "I cannot tell" has to read as
 * "not installed": claiming installation would hide the install offer from a real device that merely
 * runs an old engine.
 */
function matchesMedia(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}
