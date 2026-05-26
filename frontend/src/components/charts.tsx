/**
 * M6 — lightweight SVG chart components.
 *
 * Zero new dependencies (the .exe build is frozen and we don't want
 * to swell the bundle for one chart). All three primitives accept a
 * uniform `{ label, value }` shape so the report blocks can just
 * pipe report rows in.
 */


export type DataPoint = {
  label: string;
  value: number;
  color?: string;
};


const DEFAULT_PALETTE = [
  "#2563B0", "#4A90D9", "#10b981", "#8b5cf6",
  "#f59e0b", "#06b6d4", "#ec4899", "#0ea5e9",
  "#ef4444", "#64748b",
];


function money(v: number): string {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}


// ---------------- PieChart ----------------

export function PieChart({ data, size = 180, title, formatValue }: {
  data: DataPoint[];
  size?: number;
  title?: string;
  formatValue?: (n: number) => string;
}) {
  const fmt = formatValue ?? money;
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  if (total <= 0) {
    return (
      <div className="text-[11px] text-slate-400 italic text-center py-6">
        No data yet — values are all zero.
      </div>
    );
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  let acc = 0;
  const segments = data.map((d, i) => {
    const v = Math.max(0, d.value);
    if (v <= 0) return null;
    const start = acc / total;
    acc += v;
    const end = acc / total;
    const startA = start * 2 * Math.PI - Math.PI / 2;
    const endA = end * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy + r * Math.sin(endA);
    const large = end - start > 0.5 ? 1 : 0;
    const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return (
      <path
        key={i}
        d={pathD}
        fill={d.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
        stroke="white"
        strokeWidth="1.5"
      >
        <title>{d.label}: {fmt(v)}</title>
      </path>
    );
  });
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size}>{segments}</svg>
      <div className="flex-1 space-y-1">
        {title && <div className="text-[11px] font-semibold text-sai-navy mb-1">{title}</div>}
        {data.map((d, i) => {
          const v = Math.max(0, d.value);
          const pct = total > 0 ? (v / total * 100).toFixed(0) : "0";
          return (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ background: d.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] }} />
              <span className="flex-1 text-slate-700 truncate">{d.label}</span>
              <span className="tabular-nums text-slate-500">{pct}%</span>
              <span className="tabular-nums font-semibold text-sai-navy w-20 text-right">{fmt(v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ---------------- BarChart (horizontal) ----------------

export function BarChart({ data, formatValue, maxBars = 12 }: {
  data: DataPoint[];
  formatValue?: (n: number) => string;
  maxBars?: number;
}) {
  const fmt = formatValue ?? money;
  const rows = data.slice(0, maxBars);
  const max = rows.reduce((a, d) => Math.max(a, d.value), 0);
  if (rows.length === 0 || max <= 0) {
    return (
      <div className="text-[11px] text-slate-400 italic text-center py-6">
        No data.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {rows.map((d, i) => {
        const pct = (d.value / max) * 100;
        const color = d.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
        return (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <div className="w-28 text-slate-700 truncate">{d.label}</div>
            <div className="flex-1 bg-slate-100 rounded h-4 relative overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="w-24 text-right tabular-nums font-semibold text-sai-navy">{fmt(d.value)}</div>
          </div>
        );
      })}
    </div>
  );
}


// ---------------- LineChart (single series) ----------------

export function LineChart({ data, width = 480, height = 160, formatValue }: {
  data: DataPoint[];
  width?: number;
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const fmt = formatValue ?? money;
  if (data.length === 0) {
    return (
      <div className="text-[11px] text-slate-400 italic text-center py-6">
        No data.
      </div>
    );
  }
  const padding = { top: 10, right: 10, bottom: 24, left: 50 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + innerH - (d.value / max) * innerH;
    return { x, y, d };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} L ${padding.left.toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;

  // 3 y-axis gridlines
  const gridY = [0, 0.5, 1].map((f) => ({
    y: padding.top + innerH - f * innerH,
    label: fmt(max * f),
  }));

  return (
    <svg width={width} height={height} className="overflow-visible">
      {gridY.map((g, i) => (
        <g key={i}>
          <line x1={padding.left} y1={g.y} x2={padding.left + innerW} y2={g.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
          <text x={padding.left - 4} y={g.y + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{g.label}</text>
        </g>
      ))}
      <path d={area} fill="#2563B0" fillOpacity="0.1" />
      <path d={path} fill="none" stroke="#2563B0" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#2563B0">
            <title>{p.d.label}: {fmt(p.d.value)}</title>
          </circle>
          {data.length <= 12 && (
            <text x={p.x} y={padding.top + innerH + 14} fontSize="9" textAnchor="middle" fill="#64748b">
              {p.d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
