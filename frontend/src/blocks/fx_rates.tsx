import type { BlockProps } from "../components/PageRenderer";
import type { FxRate } from "../api";


export type FxRatesCtx = {
  rates: FxRate[];
  onEdit: (r: FxRate | null) => void;
};


export function FxRateListBlock({ ctx }: BlockProps<FxRatesCtx>) {
  return (
    <div className="px-4 py-4">
      <div className="bg-white border border-ui-border rounded-md overflow-hidden">
        <div className="px-3 py-2 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
          FX rates <span className="text-[11px] text-slate-500 ml-2">{ctx.rates.length}</span>
        </div>
        {ctx.rates.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            No FX rates yet. Click + New to add a directional pair (e.g. USD → ZAR).
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">From</th>
                <th className="px-3 py-1.5 font-semibold">To</th>
                <th className="px-3 py-1.5 font-semibold text-right">Rate</th>
                <th className="px-3 py-1.5 font-semibold">Effective</th>
                <th className="px-3 py-1.5 font-semibold">Notes</th>
                <th className="px-3 py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {ctx.rates.map((r) => (
                <tr key={r.id} onClick={() => ctx.onEdit(r)}
                  className={`border-b border-ui-border last:border-0 hover:bg-ui-rowhover cursor-pointer ${r.active ? "" : "opacity-60"}`}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-sai-navy">{r.from_currency}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold text-sai-navy">{r.to_currency}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.rate.toLocaleString("en-ZA", { maximumFractionDigits: 6 })}</td>
                  <td className="px-3 py-1.5 text-slate-500">{r.effective_date ?? "—"}</td>
                  <td className="px-3 py-1.5 text-slate-600 truncate max-w-[300px]">{r.notes}</td>
                  <td className="px-3 py-1.5">
                    {r.active
                      ? <span className="text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Active</span>
                      : <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">Inactive</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


export const fxRatesRegistry = {
  fx_rate_list: FxRateListBlock,
} as const;
