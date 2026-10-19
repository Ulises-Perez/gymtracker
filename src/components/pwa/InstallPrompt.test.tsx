import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstallBanner } from './InstallBanner.tsx';
import { InstallSection } from './InstallSection.tsx';

/**
 * The browser's install conversation, both halves of it.
 *
 * Chromium announces a deferred prompt with `beforeinstallprompt`; iOS announces nothing at all, so
 * the same screen has to offer a prompt where one exists and printed steps where none does. What is
 * asserted here is the part this app owns: when the strip appears, that the native dialog is what
 * installs, that "Ahora no" survives a reload, and that an installed app is offered nothing.
 */

type Outcome = 'accepted' | 'dismissed';

/** Chromium's deferred event. TypeScript's DOM lib does not declare it, so the test states its shape. */
interface PromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: Outcome; platform: string }>;
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const REAL_UA = navigator.userAgent;

/** Announces an installable app the way Chromium does, and answers for the native dialog. */
function offerInstall(outcome: Outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as PromptEvent;
  const prompt = vi.fn(async () => undefined);

  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });

  const prevented = vi.spyOn(event, 'preventDefault');

  // The listener lives in an effect, so the event has to arrive inside `act`: React has to flush the
  // state it sets before the assertions look at the screen.
  act(() => {
    window.dispatchEvent(event);
  });

  return { prevented, prompt };
}

/**
 * `display-mode: standalone` is how an installed PWA is recognised on every platform that implements
 * the media query; jsdom does not implement `matchMedia` at all, which is why the app guards for its
 * absence and why the "not installed" case needs no stub.
 */
function stubStandaloneDisplayMode() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('standalone'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

function stubUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent });
}

beforeEach(() => {
  // "Ahora no" is persisted, so a test that dismissed would silence the next one.
  localStorage.clear();
});

afterEach(() => {
  stubUserAgent(REAL_UA);
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('the install strip on Inicio', () => {
  it('waits in silence until the browser says the app can be installed', () => {
    render(<InstallBanner />);

    expect(screen.queryByRole('button', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  /**
   * S10 asks for "instalable Android". The strip only exists because Chromium deferred the prompt,
   * and it takes the dialog over (`preventDefault`) so the browser's own mini-infobar does not
   * compete with the notebook's strip for the same decision.
   */
  it('appears when the browser offers the install, taking the dialog over', () => {
    render(<InstallBanner />);

    const { prevented } = offerInstall();

    expect(screen.getByText(/Instalá la app/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Instalar la app' })).toBeInTheDocument();
    expect(prevented).toHaveBeenCalled();
  });

  it('installs through the native dialog and stops asking once the app is installed', () => {
    render(<InstallBanner />);
    const { prompt } = offerInstall();

    fireEvent.click(screen.getByRole('button', { name: 'Instalar la app' }));

    // The install itself is the browser's dialog; the app never claims to have installed anything.
    expect(prompt).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByRole('button', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('remembers "Ahora no" so a reload does not ask again', () => {
    const first = render(<InstallBanner />);
    offerInstall();

    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));

    expect(screen.queryByRole('button', { name: 'Instalar la app' })).not.toBeInTheDocument();
    // Out of the component and into storage: a state held in memory would ask again on every load.
    expect(localStorage.length).toBe(1);

    first.unmount();
    render(<InstallBanner />);
    offerInstall();

    expect(screen.queryByRole('button', { name: 'Instalar la app' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ahora no' })).not.toBeInTheDocument();
  });

  it('offers nothing to an app that is already running installed', () => {
    stubStandaloneDisplayMode();

    render(<InstallBanner />);
    offerInstall();

    expect(screen.queryByRole('button', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });
});

describe('the install row in Perfil', () => {
  it('offers the install and hands it to the same native dialog', () => {
    render(<InstallSection />);

    const { prompt } = offerInstall();

    // The section is a place in the page, titled and described, not a bare button: it stays there
    // as long as there is something to offer.
    expect(screen.getByRole('heading', { name: 'App' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Instalar en este dispositivo' }));

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  /**
   * S10 asks for "instalable iOS", and iOS has no `beforeinstallprompt` at all: the only way in is
   * Safari's Share sheet. Printing the steps is the entire feature on that platform.
   */
  it('explains the manual steps on iOS, where there is no prompt to hand over', () => {
    stubUserAgent(IPHONE_UA);

    render(<InstallSection />);

    const row = screen.getByRole('button', { name: 'Instalar en este dispositivo' });

    // Nothing is shown until it is asked for: the steps are instructions, not a permanent paragraph.
    expect(screen.queryByText(/Añadir a pantalla de inicio/)).not.toBeInTheDocument();
    expect(row).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(row);

    expect(screen.getByText(/Añadir a pantalla de inicio/)).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows nothing where the platform offers no way to install', () => {
    stubUserAgent(DESKTOP_UA);

    render(<InstallSection />);

    // No event and no manual route: the row would be a control that cannot do anything.
    expect(screen.queryByRole('heading', { name: 'App' })).not.toBeInTheDocument();
  });

  it('shows nothing on iOS once the app runs from the home screen', () => {
    stubUserAgent(IPHONE_UA);
    // Safari's own flag, which is how a standalone iOS web app is recognised there.
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true });

    render(<InstallSection />);

    expect(
      screen.queryByRole('button', { name: 'Instalar en este dispositivo' }),
    ).not.toBeInTheDocument();

    Reflect.deleteProperty(window.navigator, 'standalone');
  });
});
