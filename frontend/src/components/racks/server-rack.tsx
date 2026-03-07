// EIA-310: 1U = 1.75", 19" or 10" mounting width
// Scale: 1 grid cell = 1U = 16px
const INCHES_PER_U = 1.75;
const PX_PER_U = 16;

// EIA mounting width in px (19" or 10" between rails)
const RACK_INNER_WIDTHS = {
  19: Math.round((19 / INCHES_PER_U) * PX_PER_U), // 174px
  10: Math.round((10 / INCHES_PER_U) * PX_PER_U), // 91px
} as const;

export type RackWidth = keyof typeof RACK_INNER_WIDTHS;

export function ServerRack({
  units = 8,
  rackWidth = 19,
  className,
}: {
  units?: number;
  rackWidth?: RackWidth;
  className?: string;
}) {
  const uHeight = PX_PER_U; // 1U = 16px (matches sketch paper grid)
  const railWidth = Math.round(PX_PER_U * 0.5); // ~0.5U per rail
  const innerWidth = RACK_INNER_WIDTHS[rackWidth];
  const width = innerWidth + railWidth * 2;
  const totalHeight = units * uHeight;

  return (
    <svg
      viewBox={`0 0 ${width + 24} ${totalHeight + 32}`}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left rail */}
      <rect
        x="12"
        y="16"
        width={railWidth}
        height={totalHeight}
        className="fill-muted/30 stroke-muted-foreground/40"
        strokeWidth="1.5"
      />
      {/* Right rail */}
      <rect
        x={12 + width - railWidth}
        y="16"
        width={railWidth}
        height={totalHeight}
        className="fill-muted/30 stroke-muted-foreground/40"
        strokeWidth="1.5"
      />

      {/* Mounting holes - left rail */}
      {Array.from({ length: units }).map((_, i) => (
        <g key={`left-${i}`}>
          <circle
            cx={12 + railWidth / 2}
            cy={16 + uHeight / 2 + i * uHeight}
            r="1.5"
            className="fill-muted-foreground/30 stroke-muted-foreground/50"
          />
        </g>
      ))}
      {/* Mounting holes - right rail */}
      {Array.from({ length: units }).map((_, i) => (
        <g key={`right-${i}`}>
          <circle
            cx={12 + width - railWidth / 2}
            cy={16 + uHeight / 2 + i * uHeight}
            r="1.5"
            className="fill-muted-foreground/30 stroke-muted-foreground/50"
          />
        </g>
      ))}

      {/* Inner bay area */}
      <rect
        x={12 + railWidth}
        y="16"
        width={innerWidth}
        height={totalHeight}
        className="fill-transparent stroke-muted-foreground/40"
        strokeWidth="1.5"
      />

      {/* Horizontal dividers (U boundaries) */}
      {Array.from({ length: units - 1 }).map((_, i) => (
        <line
          key={i}
          x1={12 + railWidth}
          y1={16 + (i + 1) * uHeight}
          x2={12 + width - railWidth}
          y2={16 + (i + 1) * uHeight}
          className="stroke-muted-foreground/35"
          strokeWidth="1"
        />
      ))}

      {/* U labels */}
      {Array.from({ length: units }).map((_, i) => (
        <text
          key={i}
          x={12 + railWidth - 4}
          y={16 + uHeight / 2 + i * uHeight + 1}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-muted-foreground font-medium"
          style={{ fontFamily: "inherit", fontSize: 6 }}
        >
          {units - i}U
        </text>
      ))}
    </svg>
  );
}
