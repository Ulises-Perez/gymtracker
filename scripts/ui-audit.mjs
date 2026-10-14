/**
 * Objective UI audit.
 *
 * Screenshots need eyes; these measurements do not. It checks the things a
 * visual review would otherwise guess at: contrast ratios computed from the
 * rendered colours, tap-target sizes, content hidden behind the fixed nav,
 * horizontal overflow at the narrowest supported width, and whether the two
 * self-hosted faces actually rendered.
 *
 *   node scripts/ui-audit.mjs
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

const viewports = [
  { name: '320px', width: 320, height: 640 },
  { name: '360px', width: 360, height: 740 },
  { name: '428px', width: 428, height: 900 },
  { name: '1280px', width: 1280, height: 800 },
];

// Without a session every gated route lands on the login screen, so the auth
// screens are measured here too. /reset-password bounces to /forgot-password,
// which is exactly what a visitor without a recovery link should see.
//
// That also means the numbers that belong to the shell -- the nav's height, its tap
// targets, its contrast -- are absent in a run without a session, and the report says
// so instead of leaving them as nulls for a reader to compare against a threshold.
const routes = [
  '/',
  '/workout',
  '/history',
  '/profile',
  '/ruta-inventada',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

/** WCAG relative luminance / contrast, so nothing is eyeballed. */
function srgbToLinear(channel) {
  const c = channel / 255;

  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseRgb(value) {
  const match = value.match(/rgba?\(([^)]+)\)/);

  if (!match) return null;

  const [r, g, b, a = '1'] = match[1].split(',').map((part) => Number.parseFloat(part.trim()));

  return { r, g, b, a };
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(foreground, background) {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg];

  return (lighter + 0.05) / (darker + 0.05);
}

const browser = await chromium.launch();
const findings = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: 'es-AR',
    /*
     * The browser preference the page inherits, and it is `light` because the world is a page of
     * paper: the stylesheet declares `color-scheme: light`, and a context asking for dark made the
     * native controls, the scrollbar and the caret render for a theme this app does not have. This
     * was `dark` while the app was dark.
     */
    colorScheme: 'light',
  });
  const page = await context.newPage();

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load' });
    await page.waitForSelector('h1');

    const measured = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label]');
      const main = document.querySelector('main');
      const heading = document.querySelector('h1');
      const paragraph = main?.querySelector('p');
      const links = [...(nav?.querySelectorAll('a') ?? [])];

      const style = (element, property) =>
        element ? getComputedStyle(element).getPropertyValue(property) : null;

      /*
       * The width of what is on the heading, in one named face and in the generic fallback. Off
       * screen and off the flow, so measuring it cannot move the page it is measuring.
       */
      const measureWidth = (element, family) => {
        if (!element?.textContent) return null;

        const computed = getComputedStyle(element);
        const span = document.createElement('span');

        span.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:${computed.fontSize};font-weight:${computed.fontWeight};font-family:${family}`;
        span.textContent = element.textContent;
        element.parentElement?.append(span);

        const width = Number(span.getBoundingClientRect().width.toFixed(2));

        span.remove();

        return width;
      };

      return {
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyBackground: style(document.body, 'background-color'),
        navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : null,
        mainPaddingBottom: main ? Number.parseFloat(style(main, 'padding-bottom')) : null,
        mainScrollHeight: main ? main.scrollHeight : null,
        heading: heading
          ? {
              top: Math.round(heading.getBoundingClientRect().top),
              fontFamily: style(heading, 'font-family'),
              fontSize: style(heading, 'font-size'),
              color: style(heading, 'color'),
              text: heading.textContent,
            }
          : null,
        paragraphColor: paragraph ? style(paragraph, 'color') : null,
        paragraphFamily: paragraph ? style(paragraph, 'font-family') : null,
        /*
         * Which face really rendered, and not which one the stack names first.
         *
         * `font-family` on a heading reads `"Archivo Variable", "Inter Variable", system-ui, ...`:
         * the display token carries the interface face as its own fallback, so a check that looked
         * for the substring `Inter Variable` answered `true` on a display-face heading as well. Two
         * measurements instead: the face declares itself ready, and the same string measured in that
         * face is a different width than in the generic fallback. The second is the one that cannot
         * be satisfied by a font that never loaded.
         */
        displayFaceLoaded: document.fonts.check('900 30px "Archivo Variable"'),
        displayFaceWidth: measureWidth(heading, '"Archivo Variable"'),
        fallbackWidth: measureWidth(heading, 'system-ui'),
        tapTargets: links.map((link) => {
          const box = link.getBoundingClientRect();
          const indicator = link.querySelector('span[aria-hidden="true"]');

          return {
            label: link.textContent,
            width: Math.round(box.width),
            height: Math.round(box.height),
            color: getComputedStyle(link).color,
            current: link.getAttribute('aria-current'),
            indicatorOpacity: indicator ? getComputedStyle(indicator).opacity : null,
          };
        }),
      };
    });

    const background = parseRgb(measured.bodyBackground);
    const hasSession = measured.navHeight !== null;
    const checks = {
      viewport: viewport.name,
      route,
      /* False on every gated route without a session: the shell is not on screen at all. */
      hasSession,
      overflowX: measured.overflowX,
      navHeight: measured.navHeight,
      mainPaddingBottom: measured.mainPaddingBottom,
      contentHiddenBehindNav:
        measured.navHeight !== null &&
        measured.mainPaddingBottom !== null &&
        measured.navHeight > measured.mainPaddingBottom,
      headingFontFamily: measured.heading?.fontFamily ?? null,
      /* The face declared itself ready AND measures differently from the fallback. */
      displayFaceWon:
        measured.displayFaceLoaded === true &&
        measured.displayFaceWidth !== null &&
        measured.displayFaceWidth !== measured.fallbackWidth,
      bodyFontIsInter: measured.paragraphFamily?.includes('Inter Variable') ?? null,
      headingFontSize: measured.heading?.fontSize,
      headingAboveFold: measured.heading ? measured.heading.top < viewport.height : null,
      contrast: {
        heading: background
          ? Number(contrastRatio(parseRgb(measured.heading.color), background).toFixed(2))
          : null,
        mutedText: background
          ? Number(contrastRatio(parseRgb(measured.paragraphColor), background).toFixed(2))
          : null,
      },
      navLinkContrast: measured.tapTargets.map((target) => ({
        label: target.label,
        state: target.current === 'page' ? 'active' : 'idle',
        ratio: background
          ? Number(contrastRatio(parseRgb(target.color), background).toFixed(2))
          : null,
      })),
      minTapTargetHeight: hasSession
        ? Math.min(...measured.tapTargets.map((target) => target.height))
        : null,
      /*
       * Named so the absence is readable: `null` next to a 44 px threshold looks like a failure and
       * is not one, it is a route measured without the shell.
       */
      tapTargetsNote: hasSession
        ? null
        : 'sin sesión: el shell no está en pantalla, así que no hay nav que medir',
      activeNavLabels: measured.tapTargets
        .filter((target) => target.current === 'page')
        .map((target) => target.label),
      // The active destination must also be visible without colour.
      navIndicatorVisibleOn: measured.tapTargets
        .filter((target) => target.indicatorOpacity === '1')
        .map((target) => target.label),
    };

    findings.push(checks);
  }

  await context.close();
}

await browser.close();

console.log(JSON.stringify(findings, null, 1));
