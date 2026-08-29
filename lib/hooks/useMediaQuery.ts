import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches, as React state.
 *
 * useSyncExternalStore, NOT useState + useEffect: matchMedia is external state
 * that changes without React's knowledge, and this is the API built for exactly
 * that. It also sidesteps the two bugs the useEffect version ships with — a
 * first paint at the wrong breakpoint before the effect runs, and a setState in
 * an effect body, which this repo's lint rule rejects.
 *
 * The server snapshot is `false` — the page is rendered on the server where no
 * window exists, so it has to assume the wide layout and correct itself on the
 * client. Rendering the narrow layout first would flash the wrong one on every
 * desktop load, which is the more common case.
 *
 * A UI hook, not a data one: it owns no Firestore subscription, so it does not
 * follow the *Data.ts naming in CLAUDE.md.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
