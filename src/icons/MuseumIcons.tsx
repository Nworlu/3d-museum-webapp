// A small, cohesive set of flat vector line icons shared by the landing page
// and the admin dashboard — same stroke weight/joins as the museum wordmark
// (index.html's inline SVG, AdminPage's login mark) so both surfaces read as
// one visual system instead of two separately-designed UIs.
import type { SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

/** Museum pediment + columns — same glyph as the wordmark, used for "Galleries". */
export function ColumnsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2 22 8v1.5H2V8L12 2Z" strokeLinejoin="round" />
      <path d="M4 11v9M9 11v9M12 11v9M15 11v9M20 11v9" />
      <path d="M2 22h20" />
    </svg>
  );
}

/** Four asymmetric blocks — "Dashboard" overview. */
export function LayoutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="10" rx="1" />
      <rect x="14" y="3" width="7" height="6" rx="1" />
      <rect x="14" y="13" width="7" height="8" rx="1" />
      <rect x="3" y="17" width="7" height="4" rx="1" />
    </svg>
  );
}

/** A framed landscape — "Exhibits". */
export function FrameIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
    </svg>
  );
}

/** A plus inside a frame — "Add Exhibit". */
export function PlusFrameIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

/** An open archway — used for the "empty galleries" stat. */
export function ArchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 21V11a7 7 0 0 1 14 0v10" />
      <path d="M3 21h18" />
    </svg>
  );
}

/** A monitor — "On Desktop". */
export function DesktopIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** A handheld device — "On Tablet & Phone". */
export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

/** Goggle-style headset — "In VR". */
export function VRIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="8" width="20" height="9" rx="4" />
      <circle cx="8.5" cy="12.5" r="1.8" />
      <circle cx="15.5" cy="12.5" r="1.8" />
      <path d="M8.5 8V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** A compass with a needle — "Walk & Look Around". */
export function CompassIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-2 5-5 2 2-5 5-2Z" strokeLinejoin="round" />
    </svg>
  );
}

/** A mouse pointer — "Click to Inspect". */
export function CursorIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 3l6.5 16 2-6.5L20 10.5 5 3Z" strokeLinejoin="round" />
    </svg>
  );
}

/** Three stacked planes — "Room-Based Streaming". */
export function LayersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" strokeLinejoin="round" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16l9 5 9-5" />
    </svg>
  );
}

/** A shield — "A Real Curator Dashboard" (admin authority). */
export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 20 6.5V11c0 5-3.5 8.6-8 10-4.5-1.4-8-5-8-10V6.5L12 3Z" strokeLinejoin="round" />
    </svg>
  );
}

/** A checkmark in a circle — "Public Domain". */
export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  );
}
