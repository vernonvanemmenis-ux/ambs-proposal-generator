import { useEffect, useState } from "react";

type UpdateInfo = {
  available: boolean;
  current_version: string;
  latest_version?: string;
  notes?: string;
  ready_to_apply?: boolean;
};

export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = () =>
      fetch("/api/update/check")
        .then((r) => (r.ok ? r.json() : null))
        .then(setInfo)
        .catch(() => setInfo(null));
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!info?.available || dismissed) return null;

  const apply = async () => {
    if (!confirm(`Apply update ${info.latest_version} and restart?`)) return;
    setBusy(true);
    try {
      await fetch("/api/update/apply", { method: "POST" });
      alert("Update applied. The app will restart — close this tab and relaunch from the Start Menu.");
    } catch (e: any) {
      alert("Update failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-sai-blue text-white px-4 py-2 flex items-center gap-3 text-[12px]">
      <span className="font-semibold">Update available:</span>
      <span className="text-white/90">
        v{info.current_version} → v{info.latest_version}
      </span>
      {info.notes && (
        <span className="text-white/70 truncate max-w-[40ch]">· {info.notes}</span>
      )}
      <div className="flex-1" />
      <button
        onClick={apply}
        disabled={busy}
        className="bg-white/15 hover:bg-white/25 px-3 py-1 rounded text-[11px] font-semibold disabled:opacity-50"
      >
        {busy ? "Applying…" : info.ready_to_apply ? "Apply & restart" : "Download & apply"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/60 hover:text-white text-[14px] leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}
