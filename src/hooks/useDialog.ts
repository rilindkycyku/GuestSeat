import { useEffect, useRef } from 'react';

/**
 * The behaviour a modal dialog owes its user, in one place: focus goes into the panel when it
 * opens and back to whatever opened it when it closes, Tab cycles inside instead of wandering into
 * the page behind, and Escape closes the *topmost* dialog only — so a confirmation opened over
 * Settings doesn't take Settings down with it.
 *
 * Returns the ref to put on the dialog panel. Most dialogs get this through {@link ModalShell};
 * use the hook directly only for an overlay with its own layout, like the check-in screen.
 */

/** Open dialogs, innermost last. Only the last one reacts to Escape. */
const openDialogs: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const panelRef = useRef<T>(null);
  // Kept in a ref so the effect never re-subscribes just because a parent re-rendered with a fresh
  // callback identity — re-running it would steal focus back to the top of the dialog mid-edit.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Whatever had focus when the dialog opened, captured during the *first render* rather than in the
  // effect below. React applies `autoFocus` while committing the dialog's children, which happens
  // before passive effects run — so by effect time the "previously focused" element is already a
  // field inside the dialog, and remembering that would restore focus to a node about to be removed.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  if (openerRef.current === undefined) {
    const active = document.activeElement as HTMLElement | null;
    openerRef.current = active && active !== document.body ? active : null;
  }

  useEffect(() => {
    const token = Symbol('dialog');
    openDialogs.push(token);
    const opener = openerRef.current;

    // Move focus in, unless the panel already has it — a field with `autoFocus` inside has been
    // focused by React by now, and stealing that back would undo it.
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Hidden controls (a collapsed section, a closed picker) must not be Tab stops.
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      const active = document.activeElement;
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Wrap at the ends, and pull focus back in if it somehow got outside the panel.
      if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const at = openDialogs.indexOf(token);
      if (at !== -1) openDialogs.splice(at, 1);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return panelRef;
}
