import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, type Status } from "../api";

export default function TopNav() {
  const [status, setStatus] = useState<Status | null>(null);
  const loc = useLocation();

  useEffect(() => {
    const load = () => api.status().then(setStatus).catch(() => setStatus(null));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const module = loc.pathname.startsWith("/proposals")
    ? "Proposals"
    : loc.pathname.startsWith("/clients")
    ? "Clients"
    : loc.pathname.startsWith("/items")
    ? "Items"
    : loc.pathname.startsWith("/templates")
    ? "Templates"
    : "Home";

  return (
    <header className="bg-sai-navy text-white shadow-md">
      <div className="h-11 flex items-center px-4 gap-4 border-b border-white/5">
        <Link to="/" className="flex items-center gap-2">
          <img src="/static/logo-icon.png" alt="" className="h-6 w-6" />
          <span className="font-display font-bold text-sm tracking-tight">
            SolutionsAI
          </span>
        </Link>
        <div className="text-white/20">·</div>
        <span className="text-[13px] text-white/80 font-medium">{module}</span>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                status?.online ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <span className="text-white/60">
              {status?.online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="text-white/30">|</div>
          <span className="text-white/40">v{status?.app_version ?? "—"}</span>
        </div>
      </div>
    </header>
  );
}
