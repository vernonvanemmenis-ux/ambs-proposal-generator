import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type CustomTile, type DatabaseInfo, type Status } from "../api";

type Tile = {
  id: string;
  label: string;
  color: string;
  icon: string;
  href?: string;
  disabled?: boolean;
  requiresOnline?: boolean;
};

const TILES: Tile[] = [
  { id: "proposals", label: "Proposals", color: "#2563B0", icon: "📄", href: "/proposals" },
  { id: "projects",  label: "Projects",  color: "#f59e0b", icon: "🏗️", href: "/projects" },
  { id: "clients",   label: "Clients",   color: "#4A90D9", icon: "🏢", href: "/clients" },
  { id: "items",     label: "Items",     color: "#10b981", icon: "📦", href: "/items" },
  { id: "templates", label: "Doc Templates", color: "#8b5cf6", icon: "🧩", href: "/templates" },
  { id: "opp-templates", label: "Project Templates", color: "#06b6d4", icon: "⚡", href: "/opportunity-templates" },
  { id: "sales",     label: "Sales",     color: "#ec4899", icon: "💰", href: "/sales" },
  { id: "hr",        label: "HR",        color: "#0ea5e9", icon: "👥", href: "/hr" },
  { id: "suppliers", label: "Suppliers", color: "#6366f1", icon: "🚚", href: "/suppliers" },
  { id: "purchase",  label: "Purchase Orders", color: "#a16207", icon: "🧾", href: "/purchase-orders" },
];

const PALETTE = [
  "#2563B0", "#4A90D9", "#10b981", "#8b5cf6",
  "#f59e0b", "#06b6d4", "#ec4899", "#0ea5e9",
  "#ef4444", "#64748b",
];

const ICON_SUGGESTIONS = ["🧩", "📋", "🗂️", "🛠️", "📊", "📁", "💡", "🚚", "🏭", "🔧"];

function prettyBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Launcher() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [tiles, setTiles] = useState<CustomTile[]>([]);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    api.database.info().then(setDbInfo).catch(() => {});
    api.tiles.list().then(setTiles).catch(() => {});
  }, []);

  const copyPath = async () => {
    if (!dbInfo) return;
    try {
      await navigator.clipboard.writeText(dbInfo.db_path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const openFolder = async () => {
    try { await api.database.openFolder(); }
    catch (e: any) { alert("Could not open folder: " + (e?.message || e)); }
  };

  const handleCreated = (tile: CustomTile) => {
    setTiles((ts) => [...ts, tile]);
    setAdding(false);
    navigate(`/p/${tile.slug}`);
  };

  return (
    <div className="min-h-[calc(100vh-44px)] bg-gradient-to-b from-[#f7f7f7] to-[#ebeef4]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="flex items-center gap-5 mb-8">
          <img
            src="/static/logo-primary.png"
            alt="SolutionsAI"
            className="h-14 w-auto object-contain"
          />
          <div className="border-l border-slate-300 pl-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-sai-blue font-semibold">
              SolutionsAI Business Suite
            </div>
            <h1 className="font-display text-2xl font-bold text-sai-navy">
              AMBS Proposal Generator
            </h1>
            <div className="text-[12px] text-slate-500">
              Built for African Modular Building Solutions · Offline-first · Powered by SolutionsAI
            </div>
          </div>
        </div>

        {/* Tile grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {TILES.map((t) => {
            const online = status?.online ?? false;
            const isBlocked = t.disabled || (t.requiresOnline && !online);
            const inner = (
              <div
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center gap-2 text-white shadow-card transition ${
                  isBlocked ? "cursor-not-allowed opacity-60 saturate-50" : "hover:-translate-y-0.5 hover:shadow-kanban"
                }`}
                style={{ background: isBlocked ? "#94a3b8" : t.color }}
              >
                <div className="text-3xl">{t.icon}</div>
                <div className="text-[13px] font-semibold font-display tracking-wide">{t.label}</div>
                {t.disabled && (
                  <div className="absolute top-1.5 right-2 text-[9px] uppercase tracking-wider bg-black/30 px-1.5 py-0.5 rounded">
                    Soon
                  </div>
                )}
                {t.requiresOnline && !online && (
                  <div className="absolute top-1.5 right-2 text-[9px] uppercase tracking-wider bg-black/30 px-1.5 py-0.5 rounded">
                    Online only
                  </div>
                )}
              </div>
            );
            if (isBlocked || !t.href) return <div key={t.id}>{inner}</div>;
            return <Link key={t.id} to={t.href}>{inner}</Link>;
          })}

          {tiles.map((t) => (
            <Link key={`custom-${t.id}`} to={`/p/${t.slug}`}>
              <div
                className="relative aspect-square rounded-xl flex flex-col items-center justify-center gap-2 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-kanban"
                style={{ background: t.color }}
              >
                <div className="text-3xl">{t.icon}</div>
                <div className="text-[13px] font-semibold font-display tracking-wide text-center px-2 truncate max-w-full">
                  {t.label}
                </div>
                <div className="absolute top-1.5 right-2 text-[9px] uppercase tracking-wider bg-black/30 px-1.5 py-0.5 rounded">
                  Custom
                </div>
              </div>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="relative aspect-square rounded-xl border-2 border-dashed border-slate-300 bg-white/50 text-slate-500 flex flex-col items-center justify-center gap-2 transition hover:border-sai-blue hover:text-sai-blue hover:bg-white"
            aria-label="Add a custom tile"
          >
            <div className="text-3xl leading-none">+</div>
            <div className="text-[12px] font-semibold tracking-wide">Add tile</div>
          </button>
        </div>

        {/* Status summary */}
        <div className="mt-10 grid grid-cols-3 gap-4 text-sm">
          <div className="bg-white rounded-lg p-4 shadow-card">
            <div className="text-[11px] uppercase text-slate-400 tracking-wider font-semibold">Mode</div>
            <div className="font-display font-bold text-sai-navy mt-1">
              {status?.online ? "Online" : "Offline"}
            </div>
            <div className="text-[11px] text-slate-500">
              {status?.online ? "Cloud features enabled" : "Local DB only"}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-card">
            <div className="text-[11px] uppercase text-slate-400 tracking-wider font-semibold">Templates</div>
            <div className="font-display font-bold text-sai-navy mt-1">Editable</div>
            <div className="text-[11px] text-slate-500">Fully offline .docx generation</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-card">
            <div className="text-[11px] uppercase text-slate-400 tracking-wider font-semibold">Version</div>
            <div className="font-display font-bold text-sai-navy mt-1">
              {status?.app_version ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500">Auto-updater active</div>
          </div>
        </div>

        {/* Database info card */}
        <div className="mt-4 bg-white rounded-lg p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase text-slate-400 tracking-wider font-semibold">Database</div>
              <div className="font-display font-bold text-sai-navy text-[15px] mt-1">
                Local SQLite {dbInfo && <span className="text-[11px] text-slate-400 font-normal">· {prettyBytes(dbInfo.db_size_bytes)}</span>}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Your data is stored on this machine. Survives app updates. Nothing is sent to the cloud unless you explicitly use an online feature.
              </div>
              <div className="mt-2 bg-slate-50 border border-ui-border rounded px-2 py-1.5 font-mono text-[11px] text-slate-700 break-all">
                {dbInfo?.db_path ?? "…"}
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={openFolder}
                className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 whitespace-nowrap"
              >
                Open folder
              </button>
              <button
                onClick={copyPath}
                className="text-[11px] border border-ui-border text-slate-600 px-3 py-1.5 rounded font-semibold hover:bg-slate-50 whitespace-nowrap"
              >
                {copied ? "Copied ✓" : "Copy path"}
              </button>
            </div>
          </div>
          {dbInfo && (
            <div className="mt-3 pt-3 border-t border-ui-border grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-[11px]">
              {dbInfo.tables.map((t) => (
                <div key={t.name} className="bg-slate-50 border border-ui-border rounded px-2 py-1 flex items-center justify-between">
                  <span className="text-slate-600 truncate">{t.name}</span>
                  <span className="font-semibold text-sai-navy tabular-nums">{t.rows}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {adding && (
        <AddTileModal
          onClose={() => setAdding(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}


type AddTileModalProps = {
  onClose: () => void;
  onCreated: (tile: CustomTile) => void;
};

function AddTileModal({ onClose, onCreated }: AddTileModalProps) {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("🧩");
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      const tile = await api.tiles.create({ label: trimmed, icon, color });
      onCreated(tile);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={submit}
        className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-ui-border flex items-center justify-between">
          <div className="text-[14px] font-display font-bold text-sai-navy">Add a custom tile</div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-[18px] leading-none"
            aria-label="Close"
          >×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Label
            </label>
            <input
              autoFocus
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Vendors"
              className="w-full border border-ui-border rounded px-3 py-1.5 text-[13px] focus:outline-none focus:border-sai-blue"
            />
            <div className="text-[10px] text-slate-400 mt-1">
              We'll derive a URL slug from this — collisions get a numeric suffix.
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Icon
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value.slice(0, 4))}
                className="w-16 border border-ui-border rounded px-2 py-1.5 text-[18px] text-center focus:outline-none focus:border-sai-blue"
              />
              <div className="flex flex-wrap gap-1">
                {ICON_SUGGESTIONS.map((i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`w-8 h-8 rounded text-[16px] border transition ${
                      icon === i ? "border-sai-blue bg-blue-50" : "border-ui-border hover:bg-slate-50"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Colour
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition ${
                    color === c ? "ring-2 ring-offset-2 ring-sai-navy" : "hover:scale-110"
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-ui-border"
                title="Custom colour"
              />
            </div>
          </div>
          <div className="bg-slate-50 border border-ui-border rounded px-3 py-2 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-md flex items-center justify-center text-white text-[20px] flex-shrink-0"
              style={{ background: color }}
            >
              {icon}
            </div>
            <div className="text-[12px] text-slate-600">
              <div className="font-semibold text-sai-navy">{label.trim() || "Preview"}</div>
              <div className="text-[10px] text-slate-400">Tile preview</div>
            </div>
          </div>
          {err && <div className="text-[11px] text-red-600">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-ui-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-[12px] px-3 py-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!label.trim() || busy}
            className="text-[12px] bg-sai-blue text-white px-4 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
