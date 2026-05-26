import type { BlockProps } from "../components/PageRenderer";
import type { WorkCenter } from "../api";


export type WorkCentersCtx = {
  workCenters: WorkCenter[];
  onEdit: (w: WorkCenter | null) => void;
};


export function WorkCenterListBlock({ ctx }: BlockProps<WorkCentersCtx>) {
  return (
    <div className="px-4 py-4">
      <div className="bg-white border border-ui-border rounded-md overflow-hidden">
        <div className="px-3 py-2 border-b border-ui-border text-[13px] font-semibold text-sai-navy">
          Work centers <span className="text-[11px] text-slate-500 ml-2">{ctx.workCenters.length}</span>
        </div>
        {ctx.workCenters.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400 italic">
            No work centers. Click + New to add a station.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-ui-border text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Name</th>
                <th className="px-3 py-1.5 font-semibold">Code</th>
                <th className="px-3 py-1.5 font-semibold text-right">Capacity (units/hr)</th>
                <th className="px-3 py-1.5 font-semibold text-right">Cost (R/hr)</th>
                <th className="px-3 py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {ctx.workCenters.map((w) => (
                <tr key={w.id} onClick={() => ctx.onEdit(w)}
                  className={`border-b border-ui-border last:border-0 hover:bg-ui-rowhover cursor-pointer ${w.active ? "" : "opacity-60"}`}>
                  <td className="px-3 py-1.5 font-semibold text-sai-navy">{w.name}</td>
                  <td className="px-3 py-1.5 text-slate-500 font-mono text-[10px]">{w.code || "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{w.capacity_units_per_hour}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{w.cost_per_hour.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-1.5">
                    {w.active ? (
                      <span className="text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Active</span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">Inactive</span>
                    )}
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


export const workCentersRegistry = {
  work_center_list: WorkCenterListBlock,
} as const;
