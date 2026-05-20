import { useEffect, useState } from "react";
import { type Activity } from "../api";

type Props = {
  listActivities: () => Promise<Activity[]>;
  postActivity: (body: { body: string; kind?: string }) => Promise<Activity>;
  refreshKey?: string | number;
};

export default function Chatter({ listActivities, postActivity, refreshKey }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tab, setTab] = useState<"message" | "note" | "log">("message");
  const [draft, setDraft] = useState("");

  const reload = () => {
    listActivities().then(setActivities).catch(() => {});
  };

  useEffect(reload, [refreshKey]);

  const send = async () => {
    if (!draft.trim()) return;
    try {
      await postActivity({ body: draft, kind: tab });
      setDraft("");
      reload();
    } catch (e: any) {
      alert("Could not post: " + (e?.message || e));
    }
  };

  return (
    <div className="bg-white border border-ui-border rounded-md">
      <div className="px-4 py-2 border-b border-ui-border flex gap-4 text-[11px] font-semibold uppercase tracking-wider">
        {(["message", "note", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-1 border-b-2 ${
              tab === t
                ? "border-sai-blue text-sai-blue"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {t === "message" ? "Send message" : t === "note" ? "Log note" : "Activity log"}
          </button>
        ))}
      </div>
      {tab !== "log" && (
        <div className="p-3 flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={tab === "message" ? "Write a message..." : "Log an internal note..."}
            className="flex-1 text-[13px] border border-ui-border rounded px-2 py-1.5 resize-y min-h-[60px] outline-none focus:border-sai-blue"
          />
          <button
            onClick={send}
            className="self-start bg-sai-blue text-white text-[11px] px-3 py-1.5 rounded font-semibold hover:opacity-90"
          >
            Send
          </button>
        </div>
      )}
      <div className="px-4 py-3 space-y-3 max-h-[300px] overflow-y-auto scroll-thin">
        {activities.map((a) => (
          <div key={a.id} className="flex gap-3">
            <div
              className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${
                a.kind === "log"
                  ? "bg-slate-400"
                  : a.kind === "message"
                  ? "bg-sai-blue"
                  : "bg-amber-500"
              }`}
            >
              {a.author.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-sai-navy">
                {a.author}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400 font-normal">
                  {a.kind}
                </span>
                <span className="ml-2 text-[10px] text-slate-400 font-normal">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-[12px] text-slate-700 whitespace-pre-wrap">{a.body}</div>
            </div>
          </div>
        ))}
        {activities.length === 0 && (
          <div className="text-[12px] text-slate-400 italic">No activity yet.</div>
        )}
      </div>
    </div>
  );
}
