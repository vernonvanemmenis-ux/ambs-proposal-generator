import { useRef, useState } from "react";
import { api, type TaskAttachment } from "../api";

type Props = {
  projectId: number;
  taskId: number;
  attachments: TaskAttachment[];
  onChanged: () => void;
};

function prettyBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AttachmentList({ projectId, taskId, attachments, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await api.projects.tasks.uploadAttachment(projectId, taskId, file);
      onChanged();
    } catch (e: any) {
      alert("Upload failed: " + (e?.message || e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) upload(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  };

  const remove = async (att: TaskAttachment) => {
    if (!confirm(`Delete attachment "${att.filename}"?`)) return;
    try {
      await api.projects.tasks.deleteAttachment(projectId, taskId, att.id);
      onChanged();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || e));
    }
  };

  return (
    <div className="border border-ui-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
          Attachments
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-[10px] border border-sai-blue text-sai-blue px-2 py-0.5 rounded font-semibold hover:bg-sai-bluepale disabled:opacity-50"
        >
          {busy ? "Uploading…" : "+ Add file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border border-dashed border-ui-border rounded p-3 mb-2 text-center text-[11px] text-slate-400"
      >
        Drop a file here, or use + Add file. Max 25 MB.
      </div>

      <div className="space-y-1">
        {attachments.map((att) => (
          <div key={att.id} className="flex items-center gap-2 text-[12px] border border-ui-border rounded px-2 py-1">
            <span className="flex-1 truncate text-slate-700" title={att.filename}>{att.filename}</span>
            <span className="text-[10px] text-slate-400 tabular-nums">{prettyBytes(att.size_bytes)}</span>
            <a
              href={api.projects.tasks.attachmentUrl(projectId, taskId, att.id)}
              className="text-[11px] text-sai-blue hover:underline"
              download
            >
              Download
            </a>
            <button
              onClick={() => remove(att)}
              title="Delete"
              className="text-slate-300 hover:text-red-500 text-[14px] leading-none"
            >
              ×
            </button>
          </div>
        ))}
        {attachments.length === 0 && (
          <div className="text-[11px] text-slate-400 italic">No attachments yet.</div>
        )}
      </div>
    </div>
  );
}
