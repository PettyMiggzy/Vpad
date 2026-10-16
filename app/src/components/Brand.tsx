// WARHEADZ's logo and the glyph for the VYRE chain (the component names still say Minta: this front end is WARHEADZ's, reskinned).
import { useId } from 'react';

const BASE = import.meta.env.BASE_URL;

/** The WARHEADZ logo (cut from the owner's chosen draft, public/brand/warheadz-logo.png); `size` is its height */
const LOGO_RATIO = 640 / 233;
export function MintaMark({ size = 34 }: { size?: number }) {
  return <img className="mark" src={`${BASE}brand/warheadz-logo.png`} width={Math.round(size * LOGO_RATIO)} height={size} alt="WARHEADZ" draggable={false} />;
}

/** The warhead icon: the stand-in picture for a launch that has none of its own (round-friendly, unlike the wide logo) */
export function WarheadMark({ size = 78 }: { size?: number }) {
  return <img className="mark warhead" src={`${BASE}icon-192.png`} width={size} height={size} alt="" draggable={false} style={{ borderRadius: '22%' }} />;
}

/** kept for the places that name it; the logo already carries the word */
export function MintaWordmark(_: { height?: number }) {
  return null;
}

/** The logo */
export function MintaLogo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo">
      <MintaMark size={size} />
    </span>
  );
}

/** The VYRE chain's glyph: a faceted V, for the chain selector and the cards that name the chain */
export function VyreGlyph({ size = 18 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="vglyph" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b6ff00" /><stop offset="1" stopColor="#6fb800" /></linearGradient>
        <linearGradient id={`${id}b`} x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6ff9a" /><stop offset="1" stopColor="#9fe000" /></linearGradient>
      </defs>
      <path d="M2 4h8.5l5.5 14v10Z" fill={`url(#${id}a)`} />
      <path d="M30 4h-8.5L16 18v10Z" fill={`url(#${id}b)`} />
      <path d="M10.5 4h11L16 18Z" fill="#2a4a00" opacity="0.8" />
    </svg>
  );
}
