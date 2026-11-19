const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconWalk = () => (
  <svg {...base} aria-hidden="true"><circle cx="12" cy="4.5" r="1.8" /><path d="M10 21l1.5-6-2.5-2 1-5 4 2 2 3M9 8l-3 3M13.5 15l2.5 6" /></svg>
);
export const IconPlan = () => (
  <svg {...base} aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" /></svg>
);
export const IconHelp = () => (
  <svg {...base} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></svg>
);
export const IconExpand = () => (
  <svg {...base} aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
);
export const IconClose = () => (
  <svg {...base} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
