import { WEB_VITALS_ATTRIBUTION_SRC } from "../generated/web-vitals-attribution.js";

const HARNESS = `
(() => {
  if (window.__ohmyperfCwv) return;
  const state = {
    lcp: undefined, cls: 0, inp: undefined, fcp: undefined, ttfb: undefined,
    attribution: { lcp: undefined, cls: undefined, inp: undefined, fcp: undefined, ttfb: undefined },
    schema: 'web-vitals-attribution-v1',
  };
  window.__ohmyperfCwv = state;
  if (typeof webVitals === 'undefined') return;
  const opts = { reportAllChanges: true };
  function set(name, m) {
    if (name === 'cls') {
      state.cls = m.value;
    } else {
      state[name] = m.value;
    }
    state.attribution[name] = m.attribution || undefined;
  }
  try { webVitals.onLCP(m => set('lcp', m), opts); } catch (_) {}
  try { webVitals.onCLS(m => set('cls', m), opts); } catch (_) {}
  try { webVitals.onINP(m => set('inp', m), opts); } catch (_) {}
  try { webVitals.onFCP(m => set('fcp', m), opts); } catch (_) {}
  try { webVitals.onTTFB(m => set('ttfb', m), opts); } catch (_) {}
})();
`;

export const CWV_INLINE_SCRIPT = `${WEB_VITALS_ATTRIBUTION_SRC}\n${HARNESS}` as const;
