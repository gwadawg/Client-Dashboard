"use client";

import { useCallback, useEffect, useState } from "react";
import {
  VIEW_PERMISSIONS,
  PERMISSION_GROUPS,
  ALL_PERMISSION_KEYS,
  type PermissionDef,
} from "@/lib/permissions";

type User = {
  id: string;
  email: string;
  is_owner: boolean;
  is_admin: boolean;
  allowed_permissions: string[] | null;
  created_at: string;
};

type Viewer = { id: string; isOwner: boolean; isAdmin: boolean };

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-5 py-4 flex items-center gap-4"
      style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      {children}
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>{label}</label>
      <input
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
        {...props}
      />
    </div>
  );
}

function PermissionSection({
  title,
  perms,
  selected,
  onToggle,
}: {
  title: string;
  perms: PermissionDef[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const groups = PERMISSION_GROUPS.filter(g => perms.some(p => p.group === g));
  if (groups.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold" style={{ color: "#94a3b8" }}>{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {groups.map(group => (
          <div key={group}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#334155" }}>
              {group}
            </p>
            <div className="space-y-1">
              {perms.filter(p => p.group === group).map(p => (
                <label key={p.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={selected.has(p.key)}
                    onChange={() => onToggle(p.key)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: "#94a3b8" }}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PermissionsEditor({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  // null allowed_permissions means "no restriction" → treat as everything granted.
  const initial = new Set<string>(user.allowed_permissions ?? ALL_PERMISSION_KEYS);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setAll(value: boolean) {
    setSelected(value ? new Set(ALL_PERMISSION_KEYS) : new Set());
  }

  async function save() {
    setSaving(true);
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, allowed_permissions: Array.from(selected) }),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="rounded-xl px-5 py-4 space-y-4"
      style={{ background: "#0a1628", border: "1px solid rgba(245,158,11,0.2)" }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
          Access for {user.email}
        </p>
        <div className="flex items-center gap-3">
          <button onClick={() => setAll(true)} className="text-xs font-medium" style={{ color: "#60a5fa" }}>
            Select all
          </button>
          <button onClick={() => setAll(false)} className="text-xs font-medium" style={{ color: "#64748b" }}>
            Clear all
          </button>
        </div>
      </div>

      <PermissionSection title="Tabs" perms={VIEW_PERMISSIONS} selected={selected} onToggle={toggle} />

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ background: "#f59e0b", color: "#fff" }}>
          {saving ? "Saving..." : "Save permissions"}
        </button>
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ color: "#475569" }}>
          Cancel
        </button>
        <span className="text-xs ml-auto" style={{ color: "#334155" }}>
          {selected.size} of {ALL_PERMISSION_KEYS.length} permissions
        </span>
      </div>
    </div>
  );
}

export default function UserManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [changingPw, setChangingPw] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [editingPerms, setEditingPerms] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Pure fetch: returns the data and never touches React state, so callers decide
  // when to apply it. This keeps the mount effect free of synchronous setState.
  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    const d = await res.json();
    return res.ok
      ? { ok: true as const, users: (d.users ?? []) as User[], viewer: (d.viewer ?? null) as Viewer | null }
      : { ok: false as const, error: (d.error ?? "Failed to load users") as string };
  }, []);

  const applyUsers = useCallback((r: Awaited<ReturnType<typeof fetchUsers>>) => {
    if (r.ok) { setUsers(r.users); setViewer(r.viewer); }
    else setError(r.error);
  }, []);

  // Manual refresh after a mutation — toggles the loading spinner.
  async function load() {
    setLoading(true);
    applyUsers(await fetchUsers());
    setLoading(false);
  }

  // Initial load. State is applied inside the async callback (not synchronously in
  // the effect body) and is skipped if the component unmounted mid-request.
  useEffect(() => {
    let active = true;
    fetchUsers().then(r => {
      if (!active) return;
      applyUsers(r);
      setLoading(false);
    });
    return () => { active = false; };
  }, [fetchUsers, applyUsers]);

  // Role tiers: the owner can manage everyone (except the owner row itself);
  // admins can manage only regular (non-owner, non-admin) users.
  const canManage = (u: User) =>
    !u.is_owner && (viewer?.isOwner === true || (viewer?.isAdmin === true && !u.is_admin));
  const canToggleAdmin = (u: User) => viewer?.isOwner === true && !u.is_owner;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (newPassword.length < 8) { setAddError("Password must be at least 8 characters"); return; }
    setAdding(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, password: newPassword, is_admin: newIsAdmin }),
    });
    const d = await res.json();
    if (!res.ok) { setAddError(d.error ?? "Failed to create user"); setAdding(false); return; }
    setNewEmail(""); setNewPassword(""); setNewIsAdmin(false);
    setAdding(false);
    load();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeletingId(null);
    load();
  }

  async function handleChangePassword(id: string) {
    if (newPw.length < 8) return;
    setSavingPw(true);
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password: newPw }),
    });
    setSavingPw(false);
    setChangingPw(null);
    setNewPw("");
  }

  async function handleToggleAdmin(user: User) {
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, is_admin: !user.is_admin }),
    });
    load();
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>User Management</h2>
        <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
          Add and manage dashboard users
        </p>
      </div>

      {/* Add User */}
      <div className="rounded-xl px-6 py-6 space-y-4"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "#94a3b8" }}>Add New User</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <Input label="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="user@company.com" />
          <Input label="Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Min 8 characters" />
          {viewer?.isOwner && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)}
                className="rounded" />
              <span className="text-sm" style={{ color: "#94a3b8" }}>Admin access</span>
            </label>
          )}
          {addError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
              {addError}
            </p>
          )}
          <button type="submit" disabled={adding}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "#f59e0b", color: "#fff" }}>
            {adding ? "Adding..." : "Add User"}
          </button>
        </form>
      </div>

      {/* User List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: "#94a3b8" }}>
          {loading ? "Loading..." : `${users.length} user${users.length !== 1 ? "s" : ""}`}
        </h3>
        {error && <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>}
        {users.map(u => (
          <div key={u.id} className="space-y-2">
            <Row>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>{u.email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs" style={{ color: "#334155" }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                  {u.is_owner ? (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                      Owner
                    </span>
                  ) : u.is_admin ? (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                      Admin
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
                      User
                    </span>
                  )}
                  {!u.is_owner && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
                      {u.allowed_permissions === null
                        ? "All access"
                        : `${u.allowed_permissions.length} of ${ALL_PERMISSION_KEYS.length}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canToggleAdmin(u) && (
                  <button
                    onClick={() => handleToggleAdmin(u)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
                    {u.is_admin ? "Remove Admin" : "Make Admin"}
                  </button>
                )}
                {canManage(u) && (
                  <button
                    onClick={() => { setEditingPerms(editingPerms === u.id ? null : u.id); }}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                    Permissions
                  </button>
                )}
                {canManage(u) && (
                  <button
                    onClick={() => { setChangingPw(changingPw === u.id ? null : u.id); setNewPw(""); }}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>
                    Change Password
                  </button>
                )}
                {canManage(u) && (
                  <button
                    onClick={() => handleDelete(u.id)}
                    disabled={deletingId === u.id}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                    {deletingId === u.id ? "..." : "Remove"}
                  </button>
                )}
              </div>
            </Row>
            {changingPw === u.id && (
              <div className="rounded-xl px-5 py-4 flex items-end gap-3"
                style={{ background: "#0a1628", border: "1px solid rgba(59,130,246,0.2)" }}>
                <div className="flex-1">
                  <Input label="New Password" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" />
                </div>
                <button
                  onClick={() => handleChangePassword(u.id)}
                  disabled={savingPw || newPw.length < 8}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex-shrink-0"
                  style={{ background: "#3b82f6", color: "#fff" }}>
                  {savingPw ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => { setChangingPw(null); setNewPw(""); }}
                  className="px-3 py-2 rounded-lg text-sm font-medium flex-shrink-0"
                  style={{ color: "#475569" }}>
                  Cancel
                </button>
              </div>
            )}
            {editingPerms === u.id && canManage(u) && (
              <PermissionsEditor
                user={u}
                onClose={() => setEditingPerms(null)}
                onSaved={load}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
