/**
 * Objective UI audit.
 *
 * Screenshots need eyes; these measurements do not. It checks the things a
 * visual review would otherwise guess at: contrast ratios computed from the
 * rendered colours, tap-target sizes, content hidden behind the fixed nav,
 * horizontal overflow at the narrowest supported width, whether the two
 * self-hosted faces actually rendered, and the form controls: how tall a field
 * and a button are, and how much contrast their label has.
 *
 *   node scripts/ui-audit.mjs
 *
 * With AUDIT_EMAIL and AUDIT_PASSWORD it measures a second time with a session,
 * because the forms of the product live behind the login and a measurement of
 * the login form alone would say nothing about them. The account belongs to a
 * throwaway on a local stack, never to the hosted project: the audit only
 * reads, but it does register once if the account is not there yet.
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

/** The routes a visitor reaches without an account. */
const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];

/** The routes the shell owns, and the ones that only a session can reach. */
const appRoutes = ['/', '/workout', '/history', '/profile', '/ruta-inventada'];

/**
 * The account the session pass signs in with.
 *
 * Optional on purpose: without it the audit still runs, and says plainly that the shell was never
 * on screen. The caller owns the choice of stack, and the audit only reads -- apart from registering
 * the account once if it does not exist.
 */
const AUDIT_EMAIL = process.env.AUDIT_EMAIL ?? null;
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD ?? null;

/**
 * The two passes.
 *
 * With an account, each route is measured in the context it belongs to: the auth screens without a
 * session and the app with one. Without an account, every route is measured without a session, which
 * is what the audit used to do -- and which measured the login screen five times over, once for each
 * gated route it lands on.
 */
const passes =
  AUDIT_EMAIL !== null && AUDIT_PASSWORD !== null
    ? [
        { name: 'sin sesión', routes: authRoutes, signIn: false },
        { name: 'con sesión', routes: appRoutes, signIn: true },
      ]
    : [{ name: 'sin sesión', routes, signIn: false }];

/** WCAG relative luminance / contrast, so nothing is eyeballed. */
function srgbToLinear(channel) {
  const c = channel / 255;

  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseRgb(value) {
  const match = value?.match(/rgba?\(([^)]+)\)/);

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

/**
 * The contrast between two parsed colours, or `null` when one of them is not there.
 *
 * A missing colour is not a colour: a screen whose main has no paragraph has no muted text to
 * measure, and asking for the ratio anyway crashed the audit on the route that had nothing to say.
 */
function ratio(foreground, background) {
  if (foreground === null || background === null) {
    return null;
  }

  return Number(contrastRatio(foreground, background).toFixed(2));
}

/**
 * Signs in with the app's own screens.
 *
 * The audit drives the same doors a person does, on purpose: the forms it measures afterwards are the
 * ones the app really has, and a session injected into storage would be a different program. The
 * account is registered if it is not there yet -- the local stack confirms the email by itself -- and
 * otherwise the sign-in is the other door.
 */
async function signIn(page) {
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'load' });
  await page.getByLabel('Nombre').fill('Auditoría');
  await page.getByLabel('Email').fill(AUDIT_EMAIL);
  // Anchored: `Contraseña` is a substring of `Repetí la contraseña`.
  await page.getByLabel('Contraseña', { exact: true }).fill(AUDIT_PASSWORD);
  await page.getByLabel('Repetí la contraseña').fill(AUDIT_PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  /*
   * Either the shell takes over -- the account was new -- or the screen says the address is taken,
   * and then the sign-in is the other door. Both waits settle, so the race cannot leave one of them
   * rejected in the background.
   */
  const signedIn = await Promise.race([
    page.waitForSelector('nav[aria-label]', { timeout: 15_000 }).then(
      () => true,
      () => false,
    ),
    page.waitForSelector('[role="alert"]', { timeout: 15_000 }).then(
      () => false,
      () => false,
    ),
  ]);

  if (signedIn) {
    return;
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await page.getByLabel('Email').fill(AUDIT_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(AUDIT_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForSelector('nav[aria-label]', { timeout: 15_000 });
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

  for (const pass of passes) {
    if (pass.signIn) {
      await signIn(page);
    }

    for (const route of pass.routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load' });
      await page.waitForSelector('h1');

      const measured = await page.evaluate(async () => {
        /*
         * The faces are asked to be ready before anything is measured.
         *
         * A font that has not loaded yet measures as the fallback, and the audit would then report
         * that the display face did not render -- which is true of the moment and false of the
         * build. The check waits instead of guessing.
         */
        await document.fonts.ready;

        /*
         * Whether a control is on screen for the person.
         *
         * A control that is not perceivable cannot be a tap target, so judging its height would be
         * judging a design decision instead of the design. The pattern the app uses is `sr-only`:
         * the field stays in the accessibility tree and out of sight, and the control the person
         * actually presses is a real button next to it. That field measures one pixel, and one
         * pixel is not a defect -- it is the field doing its job.
         */
        function isHidden(computed, box) {
          return (
            computed.display === 'none' ||
            computed.visibility === 'hidden' ||
            (box.width <= 1 && box.height <= 1)
          );
        }

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
          /*
           * Form controls: the height a thumb needs and the contrast a label needs.
           *
           * The audit measured the nav and the headings, and the form controls were the one
           * thing it never looked at -- the gap the plan itself records for this phase. A field
           * that is 32 px tall and a button whose label sits at 3.9:1 both pass every other
           * check in this file, because neither of them is a nav link.
           *
           * The label of a field is measured against the paper it sits on, and the alert text
           * against the same: an error the person cannot read is an error the person does not
           * get. A button with a transparent background is measured against the page, because
           * that is what it is painted on.
           */
          formControls: {
            buttons: [...document.querySelectorAll('button')].map((button) => {
              const computed = getComputedStyle(button);
              const box = button.getBoundingClientRect();

              return {
                label: button.textContent?.trim() ?? '',
                height: Math.round(box.height),
                hidden: isHidden(computed, box),
                color: computed.color,
                background: computed.backgroundColor,
                border: computed.borderBottomColor,
              };
            }),
            fields: [...document.querySelectorAll('input, textarea, select')].map((field) => {
              const label = field.id ? document.querySelector(`label[for="${field.id}"]`) : null;
              const computed = getComputedStyle(field);
              const box = field.getBoundingClientRect();

              return {
                name: field.getAttribute('name') ?? field.getAttribute('type') ?? 'campo',
                label: label?.textContent?.trim() ?? null,
                height: Math.round(box.height),
                hidden: isHidden(computed, box),
                color: computed.color,
                labelColor: label ? getComputedStyle(label).color : null,
              };
            }),
            alerts: [...document.querySelectorAll('[role="alert"]')].map((alert) => ({
              text: alert.textContent?.trim() ?? '',
              color: getComputedStyle(alert).color,
            })),
          },
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
          heading: ratio(parseRgb(measured.heading.color), background),
          mutedText: ratio(parseRgb(measured.paragraphColor), background),
        },
        navLinkContrast: measured.tapTargets.map((target) => ({
          label: target.label,
          state: target.current === 'page' ? 'active' : 'idle',
          ratio: ratio(parseRgb(target.color), background),
        })),
        /*
         * The controls, with the verdict next to the number. The thresholds are the project's
         * own: 48 px is the height of the primary button in the design tokens, and 4.5:1 is
         * WCAG AA for normal text. A transparent background falls back to the paper, which is
         * what the control is painted on.
         */
        formControls: {
          buttons: measured.formControls.buttons.map((button) => ({
            label: button.label,
            height: button.height,
            hidden: button.hidden,
            meetsTapHeight: button.height >= 48,
            contrast: ratio(
              parseRgb(button.color),
              parseRgb(button.background)?.a ? parseRgb(button.background) : background,
            ),
          })),
          fields: measured.formControls.fields.map((field) => ({
            name: field.name,
            label: field.label,
            height: field.height,
            hidden: field.hidden,
            meetsTapHeight: field.height >= 44,
            labelContrast: ratio(parseRgb(field.labelColor ?? field.color), background),
          })),
          alerts: measured.formControls.alerts.map((alert) => ({
            text: alert.text,
            contrast: ratio(parseRgb(alert.color), background),
          })),
        },
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

      findings.push({ phase: pass.name, ...checks });
    }
  }

  await context.close();
}

await browser.close();

/*
 * The verdict, not only the data.
 *
 * A report that prints numbers leaves the reader to guess which of them are a
 * problem, and that is the part that gets skipped. The thresholds are the
 * project's own: 48 px is the height of the primary button in the design
 * tokens, 4.5:1 is WCAG AA for normal text. The exit code is what lets this
 * script answer instead of only describing.
 */
const problems = [];

for (const finding of findings) {
  const where = `${finding.phase} · ${finding.viewport} ${finding.route}`;

  if (finding.overflowX > 0) {
    problems.push(`${where}: desborde horizontal de ${finding.overflowX}px`);
  }

  if (finding.contentHiddenBehindNav) {
    problems.push(`${where}: contenido tapado por la nav`);
  }

  if (finding.displayFaceWon === false) {
    problems.push(`${where}: la tipografía de display no llegó a renderizarse`);
  }

  for (const button of finding.formControls.buttons) {
    if (button.hidden) {
      continue;
    }

    if (!button.meetsTapHeight) {
      problems.push(`${where}: el botón "${button.label}" mide ${button.height}px`);
    }

    if (button.contrast !== null && button.contrast < 4.5) {
      problems.push(`${where}: el botón "${button.label}" contrasta ${button.contrast}:1`);
    }
  }

  for (const field of finding.formControls.fields) {
    if (field.hidden) {
      continue;
    }

    const name = field.label ?? field.name;

    if (!field.meetsTapHeight) {
      problems.push(`${where}: el campo "${name}" mide ${field.height}px`);
    }

    if (field.labelContrast !== null && field.labelContrast < 4.5) {
      problems.push(`${where}: la etiqueta "${name}" contrasta ${field.labelContrast}:1`);
    }
  }

  for (const alert of finding.formControls.alerts) {
    if (alert.contrast !== null && alert.contrast < 4.5) {
      problems.push(`${where}: la alerta "${alert.text}" contrasta ${alert.contrast}:1`);
    }
  }
}

console.log(JSON.stringify(findings, null, 1));
console.log(`\n${findings.length} mediciones · ${problems.length} hallazgos`);

/*
 * The controls that were not judged, said out loud.
 *
 * A control that is not on screen is skipped by the verdict, and a skipped control that is not
 * counted is a silent hole in the report: the reader cannot tell whether there were none or whether
 * they went unnoticed.
 */
const hiddenControls = findings.reduce(
  (total, finding) =>
    total +
    finding.formControls.buttons.filter((button) => button.hidden).length +
    finding.formControls.fields.filter((field) => field.hidden).length,
  0,
);

if (hiddenControls > 0) {
  console.log(`  · ${hiddenControls} controles ocultos: no se miden (no hay dedo que los alcance)`);
}

for (const problem of problems) {
  console.log(`  · ${problem}`);
}

if (problems.length > 0) {
  process.exitCode = 1;
}
