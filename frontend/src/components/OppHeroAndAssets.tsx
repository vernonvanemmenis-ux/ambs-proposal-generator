import { useEffect, useRef, useState } from "react";
import { api, type Opportunity, type OpportunityAsset } from "../api";

type Props = {
  opp: Opportunity;
  onChanged: (opp: Opportunity) => void;
};

// Two-panel block for the OpportunityForm: per-opp hero image override and
// per-opp file uploads used by the Appendix section in the .docx.
export default function OppHeroAndAssets({ opp, onChanged }: Props) {
  const [assets, setAssets] = useState<OpportunityAsset[]>(opp.assets || []);
  const [heroBusy, setHeroBusy] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const heroRef = useRef<HTMLInputElement | null>(null);
  const assetRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAssets(opp.assets || []);
  }, [opp.assets]);

  const refreshAssets = () => api.opportunities.assets.list(opp.id).then(setAssets).catch(() => {});

  const uploadHero = async (file: File) => {
    setHeroBusy(true);
    try {
      const fresh = await api.opportunities.uploadHero(opp.id, file);
      onChanged(fresh);
    } catch (e: any) {
      alert("Hero upload failed: " + (e?.message || e));
    } finally {
      setHeroBusy(false);
    }
  };

  const clearHero = async () => {
    if (!confirm("Remove this hero image override? The template hero will be used instead.")) return;
    const fresh = await api.opportunities.clearHero(opp.id);
    onChanged(fresh);
  };

  const uploadAsset = async (file: File) => {
    setAssetBusy(true);
    try {
      await api.opportunities.assets.upload(opp.id, file, "");
      await refreshAssets();
    } catch (e: any) {
      alert("Upload failed: " + (e?.message || e));
    } finally {
      setAssetBusy(false);
    }
  };

  const updateAsset = async (a: OpportunityAsset, patch: Partial<Pick<OpportunityAsset, "caption" | "sequence">>) => {
    try {
      await api.opportunities.assets.update(opp.id, a.id, patch);
      await refreshAssets();
    } catch (e: any) {
      alert("Update failed: " + (e?.message || e));
    }
  };

  const removeAsset = async (a: OpportunityAsset) => {
    if (!confirm(`Remove “${a.filename}” from this opportunity?`)) return;
    try {
      await api.opportunities.assets.delete(opp.id, a.id);
      await refreshAssets();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    }
  };

  const move = async (idx: number, delta: number) => {
    const j = idx + delta;
    if (j < 0 || j >= assets.length) return;
    const reordered = assets.slice();
    [reordered[idx], reordered[j]] = [reordered[j], reordered[idx]];
    setAssets(reordered);
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sequence !== i) {
        await api.opportunities.assets.update(opp.id, reordered[i].id, { sequence: i });
      }
    }
    await refreshAssets();
  };

  return (
    <div className="space-y-4">
      {/* Hero override */}
      <div className="bg-white border border-ui-border rounded-md p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-display font-bold text-sai-navy text-[14px]">Hero Image (per-opportunity)</div>
            <div className="text-[11px] text-slate-500">
              Overrides the template hero. Blank uses the template default. PNG/JPG · max 8 MB.
            </div>
          </div>
        </div>
        <div className="flex items-start gap-4">
          {opp.hero_filename ? (
            <img
              src={api.opportunities.heroUrl(opp.id)}
              alt="Opportunity hero"
              className="h-32 w-auto max-w-[300px] object-contain border border-ui-border rounded bg-white p-1"
            />
          ) : (
            <div className="h-32 w-[300px] border border-dashed border-ui-border rounded text-[11px] text-slate-400 flex items-center justify-center italic bg-slate-50">
              using template hero
            </div>
          )}
          <div className="flex flex-col gap-1">
            <button
              onClick={() => heroRef.current?.click()}
              disabled={heroBusy}
              className="text-[11px] bg-sai-blue text-white px-2 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {heroBusy ? "Uploading…" : opp.hero_filename ? "Replace…" : "Upload…"}
            </button>
            {opp.hero_filename && (
              <button
                onClick={clearHero}
                className="text-[11px] border border-ui-border text-slate-600 px-2 py-1 rounded font-semibold hover:bg-slate-50"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={heroRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadHero(f);
              if (heroRef.current) heroRef.current.value = "";
            }}
          />
        </div>
      </div>

      {/* Appendix uploads */}
      <div className="bg-white border border-ui-border rounded-md p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-display font-bold text-sai-navy text-[14px]">Appendix — Drawings & Supporting Documents</div>
            <div className="text-[11px] text-slate-500">
              Images embed inline in the .docx. Other formats (PDF, DWG, DOCX…) are listed by filename.
              Max 25 MB per file.
            </div>
          </div>
          <div>
            <button
              onClick={() => assetRef.current?.click()}
              disabled={assetBusy}
              className="text-[11px] bg-sai-blue text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {assetBusy ? "Uploading…" : "+ Upload file"}
            </button>
            <input
              ref={assetRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAsset(f);
                if (assetRef.current) assetRef.current.value = "";
              }}
            />
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="text-[12px] text-slate-400 italic py-6 text-center border border-dashed border-ui-border rounded">
            No files attached yet.
          </div>
        ) : (
          <div className="space-y-2">
            {assets.map((a, i) => {
              const isImage = (a.content_type || "").toLowerCase().startsWith("image/");
              return (
                <div key={a.id} className="border border-ui-border rounded px-3 py-2 flex items-start gap-3 bg-slate-50">
                  <div className="text-[18px] leading-none mt-1">{isImage ? "🖼️" : "📎"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={api.opportunities.assets.downloadUrl(opp.id, a.id)}
                        className="text-[12px] font-semibold text-sai-navy hover:underline truncate"
                      >
                        {a.filename}
                      </a>
                      <span className="text-[10px] text-slate-400">{Math.max(1, Math.round(a.size_bytes / 1024))} KB</span>
                    </div>
                    <input
                      className="field-value w-full mt-1 text-[12px] bg-white"
                      placeholder="Caption (optional — shown next to the file in the docx)"
                      defaultValue={a.caption}
                      onBlur={(e) => {
                        if (e.target.value !== a.caption) {
                          updateAsset(a, { caption: e.target.value });
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0}
                            className="text-slate-400 hover:text-sai-navy disabled:opacity-30 text-[12px] leading-none px-1">↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === assets.length - 1}
                            className="text-slate-400 hover:text-sai-navy disabled:opacity-30 text-[12px] leading-none px-1">↓</button>
                  </div>
                  <button onClick={() => removeAsset(a)} title="Remove"
                          className="text-slate-300 hover:text-red-500 text-[14px] leading-none">×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
