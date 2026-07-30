import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastState {
  msg: string;
  /** An optional one-tap follow-up, almost always "Undo". */
  action?: { label: string; onClick: () => void };
}

/**
 * The app's single toast: what it says, and how long it stays.
 *
 * A toast carrying an Undo lives twice as long as a plain confirmation — it's the only chance to
 * take a destructive action back, and 3 seconds isn't enough to notice, read and reach for it.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string, action?: ToastState['action']) => {
    window.clearTimeout(timer.current);
    setToast({ msg, action });
    timer.current = window.setTimeout(() => setToast(null), action ? 6000 : 3000);
  }, []);

  const dismissToast = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  // A pending timer would fire into an unmounted component on the way out.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, showToast, dismissToast };
}
