import React from 'react';

const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  book: <><path d="M4 5.5C4 4.1 5.1 3 7.5 3H20v17H7.5A3.5 3.5 0 0 0 4 23V5.5Z"/><path d="M4 20c0-1.7 1.5-3 3.5-3H20"/><path d="M8 8h8M8 12h5"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  arrowRight: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  arrowUpRight: <><path d="M5 19 19 5M7 5h12v12"/></>,
  chevronDown: <><path d="m6 9 6 6 6-6"/></>,
  chevronRight: <><path d="m9 6 6 6-6 6"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.3-4.1 3-6 7.5-6s7.2 1.9 7.5 6"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  file: <><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h5M8 13h8M8 17h6"/></>,
  fileQuestion: <><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h5"/><path d="M10 13a2 2 0 1 1 3.5 1.3c-.7.6-1.5 1-1.5 2.2M12 19h.01"/></>,
  checkCircle: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  shield: <><path d="m12 2 8 4v6c0 5-3.2 8.2-8 10-4.8-1.8-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  x: <><path d="M5 5 19 19M19 5 5 19"/></>,
  eye: <><path d="M2.5 12s3.7-6 9.5-6 9.5 6 9.5 6-3.7 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeOff: <><path d="m3 3 18 18M10 6.2a10.1 10.1 0 0 1 2-.2c5.8 0 9.5 6 9.5 6a15 15 0 0 1-3.2 3.6M6.8 6.8A18 18 0 0 0 2.5 12s3.7 6 9.5 6a10 10 0 0 0 4.3-.9"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  graduation: <><path d="m2 9 10-5 10 5-10 5-10-5ZM6 11v6c3.8 3 8.2 3 12 0v-6M22 9v7"/></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4V3Z"/></>,
  filter: <><path d="M4 6h16M7 12h10m-7 6h4"/><circle cx="8" cy="6" r="1" fill="currentColor" stroke="none"/></>,
  alert: <><path d="M12 3 2 21h20L12 3ZM12 9v5M12 18h.01"/></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></>,
  external: <><path d="M14 4h6v6m0-6-9 9"/><path d="M20 13v7H4V4h7"/></>,
  document: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  spark: <><path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2ZM19 18l.6 2.4L22 21l-2.4.6L19 24l-.6-2.4L16 21l2.4-.6L19 18Z"/></>,
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, className = '', ...props }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name] || paths.document}
    </svg>
  );
}
