import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearAllData } from '../lib/db';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Copy is inlined (not routed through the i18n context) so the fallback still renders even when the
// crash happens above or inside the language provider. Albanian-first, matching the rest of the app.
const COPY = {
  sq: {
    title: 'Diçka shkoi keq',
    body: 'Lista juaj u ruajt, por diçka pengoi shfaqjen e saj. Provoni ta ringarkoni faqen.',
    reload: 'Ringarko',
    reset: 'Fillo nga e para',
    resetConfirm: 'Kjo do të fshijë listën e ruajtur nga ky pajisje. Të vazhdohet?',
  },
  en: {
    title: 'Something went wrong',
    body: 'Your list is still saved, but something stopped it from loading. Try reloading the page.',
    reload: 'Reload',
    reset: 'Start over',
    resetConfirm: 'This will delete the saved list from this device. Continue?',
  },
};

function copy() {
  const stored = localStorage.getItem('guestseat.language');
  return stored === 'en' ? COPY.en : COPY.sq;
}

/**
 * Catches render-time crashes so a bad saved list can't leave the user staring at a blank white
 * screen with no way out. Without this, an error thrown while rendering the main UI unmounts the
 * whole React tree and — because the offending state is persisted — recurs on every reload. The
 * fallback offers a reload and a last-resort "Start over" that clears the saved list.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GuestSeat crashed while rendering:', error, info);
  }

  private handleReset = () => {
    const c = copy();
    if (window.confirm(c.resetConfirm)) {
      void clearAllData().finally(() => window.location.reload());
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const c = copy();
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="text-4xl mb-4">🪑</div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{c.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{c.body}</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
            >
              {c.reload}
            </button>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {c.reset}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
