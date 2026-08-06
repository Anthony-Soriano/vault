import { useCallback, useEffect, useState } from "react";
import type { ApiResult, SnapshotInspection, SnapshotSummary } from "@orbit/vault-types";

const unwrap = <T,>(result: ApiResult<T>): T => { if (!result.ok) throw result.error; return result.value; };

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"]; let value = bytes / 1024; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(1)} ${units[unit]}`;
};

type Props = {
  onError: (reason: unknown) => void;
  beforeSnapshot: () => Promise<boolean>;
};

export default function BackupsView({ onError, beforeSnapshot }: Props) {
  const [items, setItems] = useState<SnapshotSummary[]>([]);
  const [usage, setUsage] = useState<{ totalBytes: number; count: number }>({ totalBytes: 0, count: 0 });
  const [creating, setCreating] = useState(false);
  const [inspection, setInspection] = useState<SnapshotInspection | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreName, setRestoreName] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setItems(unwrap(await window.vault.backup.list()));
      setUsage(unwrap(await window.vault.backup.diskUsage()));
    } catch (reason) { onError(reason); }
  }, [onError]);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = async () => {
    setCreating(true); setMessage("");
    try {
      await beforeSnapshot(); // flush any pending Markdown autosave before capture
      const summary = unwrap(await window.vault.backup.create());
      setMessage(`Snapshot created (${formatBytes(summary.sizeBytes)}).`);
      await refresh();
    } catch (reason) { onError(reason); } finally { setCreating(false); }
  };

  const inspect = async (id: string) => {
    try { setInspection(unwrap(await window.vault.backup.inspect(id))); setInspectedId(id); } catch (reason) { onError(reason); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this snapshot permanently? This cannot be undone.")) return;
    try { unwrap(await window.vault.backup.delete(id)); if (id === inspectedId) { setInspection(null); setInspectedId(null); } await refresh(); }
    catch (reason) { onError(reason); }
  };

  const submitRestore = async () => {
    if (!restoringId || !restoreName.trim()) return;
    try {
      const result = unwrap(await window.vault.backup.restoreToNewVault({ snapshotId: restoringId, folderName: restoreName.trim() }));
      setMessage(`Restored into ${result.targetPath}. Open it from File ▸ Open Vault.`);
      setRestoringId(null); setRestoreName("");
    } catch (reason) { onError(reason); }
  };

  return <div className="backups-view">
    <div className="backups-summary">
      <div><b>Backups</b><small>{usage.count} snapshot{usage.count === 1 ? "" : "s"} · {formatBytes(usage.totalBytes)} on disk</small></div>
      <button className="primary" disabled={creating} onClick={() => void create()}>{creating ? "Creating…" : "Create snapshot"}</button>
    </div>
    {message && <p className="backups-message">{message}</p>}
    {items.length === 0 && <p className="backups-empty">No snapshots yet. Create one to capture the current Vault (database + files).</p>}
    <ul className="backups-list">
      {items.map(item => <li className="backups-item" key={item.id}>
        <div className="backups-item-head">
          <div><b>{new Date(item.createdAt).toLocaleString()}</b><small>{item.projectCount} project{item.projectCount === 1 ? "" : "s"} · {formatBytes(item.sizeBytes)} · v{item.vaultVersion} · schema {item.schemaVersion}</small></div>
          <div className="backups-item-actions">
            <button onClick={() => void inspect(item.id)}>Inspect</button>
            <button onClick={() => { setRestoringId(item.id); setRestoreName(""); setMessage(""); }}>Restore…</button>
            <button className="danger" onClick={() => void remove(item.id)}>Delete</button>
          </div>
        </div>
        {restoringId === item.id && <div className="backups-restore">
          <label>New folder name for the restored Vault
            <input value={restoreName} onChange={e => setRestoreName(e.target.value)} placeholder="restored-vault" spellCheck={false} />
          </label>
          <div className="backups-restore-actions">
            <button className="primary" disabled={!restoreName.trim()} onClick={() => void submitRestore()}>Choose location &amp; restore</button>
            <button onClick={() => { setRestoringId(null); setRestoreName(""); }}>Cancel</button>
          </div>
          <small>Restore never changes this Vault. You choose an empty parent folder; the snapshot is copied into a new "{restoreName.trim() || "…"}" folder there.</small>
        </div>}
        {inspectedId === item.id && inspection && <div className={`backups-inspection ${inspection.integrityOk ? "ok" : "bad"}`}>
          <b>{inspection.integrityOk ? "Integrity OK" : "Integrity problems"}</b>
          <small>vault {inspection.manifest.vaultId.slice(0, 8)} · {Object.keys(inspection.manifest.checksums).length} files checked</small>
          {!inspection.integrityOk && <ul>{inspection.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        </div>}
      </li>)}
    </ul>
  </div>;
}
