"use client";

import { useState } from "react";
import StatesLicensedSelect from "@/components/StatesLicensedSelect";
import {
  CONTACT_TYPE_OPTIONS,
  contactRequiresLicensedStates,
  contactTypeLabel,
  type ClientContact,
  type ContactType,
} from "@/lib/client-contacts";
import { formatStatesLicensed } from "@/lib/us-states";

type PrimaryContact = {
  primary_contact_name: string | null;
  primary_contact: string | null;
  email: string | null;
  billing_email: string | null;
  phone: string | null;
  nmls: string | null;
  states_licensed: string[] | null;
};

type ContactDraft = {
  contact_type: ContactType;
  name: string;
  email: string;
  phone: string;
  nmls: string;
  states_licensed: string[];
  notes: string;
};

const EMPTY_DRAFT: ContactDraft = {
  contact_type: "loa",
  name: "",
  email: "",
  phone: "",
  nmls: "",
  states_licensed: [],
  notes: "",
};

const TYPE_STYLE: Record<ContactType, { color: string; bg: string }> = {
  loa: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  co_lo: { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  other: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

const fieldStyle = {
  background: "#050c18",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
} as const;

function contactToDraft(contact: ClientContact): ContactDraft {
  return {
    contact_type: contact.contact_type,
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    nmls: contact.nmls ?? "",
    states_licensed: contact.states_licensed ?? [],
    notes: contact.notes ?? "",
  };
}

function draftToBody(draft: ContactDraft): Record<string, unknown> {
  return {
    contact_type: draft.contact_type,
    name: draft.name,
    email: draft.email || null,
    phone: draft.phone || null,
    nmls: draft.nmls || null,
    states_licensed: contactRequiresLicensedStates(draft.contact_type) ? draft.states_licensed : null,
    notes: draft.notes || null,
  };
}

function canSaveDraft(draft: ContactDraft): boolean {
  if (!draft.name.trim()) return false;
  if (contactRequiresLicensedStates(draft.contact_type) && !draft.states_licensed.length) return false;
  return true;
}

function ContactFormFields({
  draft,
  onChange,
  disabled,
}: {
  draft: ContactDraft;
  onChange: (patch: Partial<ContactDraft>) => void;
  disabled?: boolean;
}) {
  const showStates = contactRequiresLicensedStates(draft.contact_type);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Type</span>
          <select
            value={draft.contact_type}
            disabled={disabled}
            onChange={e => {
              const contact_type = e.target.value as ContactType;
              onChange({
                contact_type,
                states_licensed: contactRequiresLicensedStates(contact_type) ? draft.states_licensed : [],
              });
            }}
            className="mt-1 cursor-pointer"
            style={fieldStyle}
          >
            {CONTACT_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Name</span>
          <input
            type="text"
            value={draft.name}
            disabled={disabled}
            onChange={e => onChange({ name: e.target.value })}
            className="mt-1"
            style={fieldStyle}
            placeholder="Full name"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Email</span>
          <input
            type="email"
            value={draft.email}
            disabled={disabled}
            onChange={e => onChange({ email: e.target.value })}
            className="mt-1"
            style={fieldStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Phone</span>
          <input
            type="tel"
            value={draft.phone}
            disabled={disabled}
            onChange={e => onChange({ phone: e.target.value })}
            className="mt-1"
            style={fieldStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>NMLS</span>
          <input
            type="text"
            value={draft.nmls}
            disabled={disabled}
            onChange={e => onChange({ nmls: e.target.value })}
            className="mt-1"
            style={fieldStyle}
          />
        </label>
      </div>
      {showStates && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Licensed in <span style={{ color: "#f59e0b" }}>*</span>
          </span>
          <div className="mt-1">
            <StatesLicensedSelect
              value={draft.states_licensed}
              disabled={disabled}
              onChange={codes => onChange({ states_licensed: codes })}
              className="w-full max-w-none"
            />
          </div>
        </label>
      )}
      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Notes</span>
        <textarea
          value={draft.notes}
          disabled={disabled}
          onChange={e => onChange({ notes: e.target.value })}
          rows={2}
          className="mt-1 resize-y"
          style={fieldStyle}
          placeholder="Optional context — role on the team, when to loop them in…"
        />
      </label>
    </div>
  );
}

function ContactCard({
  contact,
  onEdit,
  onDelete,
}: {
  contact: ClientContact;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const style = TYPE_STYLE[contact.contact_type] ?? TYPE_STYLE.other;

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
              style={{ color: style.color, background: style.bg }}
            >
              {contactTypeLabel(contact.contact_type)}
            </span>
            <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>{contact.name}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Email</p>
              <p style={{ color: contact.email ? "#cbd5e1" : "#334155" }}>{contact.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Phone</p>
              <p style={{ color: contact.phone ? "#cbd5e1" : "#334155" }}>{contact.phone || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>NMLS</p>
              <p style={{ color: contact.nmls ? "#cbd5e1" : "#334155" }}>{contact.nmls || "—"}</p>
            </div>
            {contactRequiresLicensedStates(contact.contact_type) && (
              <div className="col-span-2 md:col-span-3">
                <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Licensed in</p>
                <p style={{ color: contact.states_licensed?.length ? "#cbd5e1" : "#334155" }}>
                  {formatStatesLicensed(contact.states_licensed)}
                </p>
              </div>
            )}
            {contact.notes && (
              <div className="col-span-2 md:col-span-3">
                <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Notes</p>
                <p className="whitespace-pre-wrap" style={{ color: "#94a3b8" }}>{contact.notes}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold px-2 py-1 rounded"
            style={{ color: "#94a3b8" }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs font-semibold px-2 py-1 rounded"
            style={{ color: "#f87171" }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientContactsSection({
  clientId,
  primary,
  contacts,
  onReload,
  onEditProfile,
}: {
  clientId: string;
  primary: PrimaryContact;
  contacts: ClientContact[];
  onReload: () => void;
  onEditProfile: () => void;
}) {
  const [draft, setDraft] = useState<ContactDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ContactDraft>({ ...EMPTY_DRAFT });
  const [savingEdit, setSavingEdit] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const primaryName = primary.primary_contact_name || primary.primary_contact;

  async function fetchInviteLink(rotate = false): Promise<string | null> {
    setInviteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/team-invite`, {
        method: rotate ? "POST" : "GET",
        headers: rotate ? { "Content-Type": "application/json" } : undefined,
        body: rotate ? JSON.stringify({ rotate: true }) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get invite link");
      setInviteUrl(data.url);
      return data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get invite link");
      return null;
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInviteLink() {
    const url = inviteUrl ?? (await fetchInviteLink(false));
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      setError("Could not copy — select the link and copy manually");
    }
  }

  async function rotateInviteLink() {
    if (!window.confirm("Rotate this link? The old link will stop working.")) return;
    const url = await fetchInviteLink(true);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      /* url is shown below for manual copy */
    }
  }

  async function submitAdd() {
    if (!canSaveDraft(draft)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToBody(draft)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add contact");
      setDraft({ ...EMPTY_DRAFT });
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add contact");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(contact: ClientContact) {
    setEditingId(contact.id);
    setEditDraft(contactToDraft(contact));
    setError(null);
  }

  async function submitEdit(contactId: string) {
    if (!canSaveDraft(editDraft)) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToBody(editDraft)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update contact");
      setEditingId(null);
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update contact");
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeContact(contactId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this account?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${contactId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove contact");
      if (editingId === contactId) setEditingId(null);
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove contact");
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg px-4 py-3"
        style={{ background: "#080f1e", border: "1px solid rgba(167,139,250,0.2)" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
              style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)" }}
            >
              Primary Account Holder
            </span>
          </div>
          <button
            type="button"
            onClick={onEditProfile}
            className="text-xs font-semibold px-2 py-1 rounded"
            style={{ color: "#a78bfa" }}
          >
            Edit in profile
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Name</p>
            <p style={{ color: primaryName ? "#e2e8f0" : "#334155" }}>{primaryName || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Email</p>
            <p style={{ color: primary.email || primary.billing_email ? "#cbd5e1" : "#334155" }}>
              {primary.email || primary.billing_email || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Phone</p>
            <p style={{ color: primary.phone ? "#cbd5e1" : "#334155" }}>{primary.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>NMLS</p>
            <p style={{ color: primary.nmls ? "#cbd5e1" : "#334155" }}>{primary.nmls || "—"}</p>
          </div>
          <div className="col-span-2 md:col-span-2">
            <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Licensed in</p>
            <p style={{ color: primary.states_licensed?.length ? "#cbd5e1" : "#334155" }}>
              {formatStatesLicensed(primary.states_licensed)}
            </p>
          </div>
        </div>
      </div>

      <div
        className="rounded-lg px-4 py-3 space-y-2"
        style={{ background: "#080f1e", border: "1px solid rgba(56,189,248,0.15)" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
              Team invite link
            </p>
            <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
              Unique to this client file. Send it so LOAs / Co-LOs can add themselves.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <button
              type="button"
              onClick={copyInviteLink}
              disabled={inviteBusy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{
                color: "#38bdf8",
                background: "rgba(56,189,248,0.12)",
                border: "1px solid rgba(56,189,248,0.25)",
                opacity: inviteBusy ? 0.5 : 1,
              }}
            >
              {inviteBusy ? "…" : inviteCopied ? "Copied!" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={rotateInviteLink}
              disabled={inviteBusy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ color: "#64748b", opacity: inviteBusy ? 0.5 : 1 }}
            >
              Rotate
            </button>
          </div>
        </div>
        {inviteUrl && (
          <p
            className="text-xs font-mono break-all px-2 py-1.5 rounded"
            style={{ color: "#64748b", background: "#050c18" }}
          >
            {inviteUrl}
          </p>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm py-3 text-center rounded-lg" style={{ color: "#334155", background: "#080f1e" }}>
          No additional contacts yet. Add an LOA or Co-LO if this account has a team — or send the invite link above.
        </p>
      ) : (
        <div className="space-y-2">
          {contacts.map(contact =>
            editingId === contact.id ? (
              <div
                key={contact.id}
                className="rounded-lg px-4 py-3 space-y-3"
                style={{ background: "#080f1e", border: "1px solid rgba(56,189,248,0.2)" }}
              >
                <ContactFormFields
                  draft={editDraft}
                  disabled={savingEdit}
                  onChange={patch => setEditDraft(d => ({ ...d, ...patch }))}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => submitEdit(contact.id)}
                    disabled={savingEdit || !canSaveDraft(editDraft)}
                    className="text-xs font-semibold px-3 py-2 rounded-lg"
                    style={{
                      color: "#38bdf8",
                      background: "rgba(56,189,248,0.12)",
                      border: "1px solid rgba(56,189,248,0.25)",
                      opacity: savingEdit || !canSaveDraft(editDraft) ? 0.5 : 1,
                    }}
                  >
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    disabled={savingEdit}
                    className="text-xs font-semibold px-3 py-2 rounded-lg"
                    style={{ color: "#64748b" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <ContactCard
                key={contact.id}
                contact={contact}
                onEdit={() => startEdit(contact)}
                onDelete={() => removeContact(contact.id, contact.name)}
              />
            ),
          )}
        </div>
      )}

      <div className="rounded-lg p-4 space-y-3" style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Add contact</p>
        <ContactFormFields
          draft={draft}
          disabled={saving}
          onChange={patch => setDraft(d => ({ ...d, ...patch }))}
        />
        {error && (
          <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
        )}
        <button
          type="button"
          onClick={submitAdd}
          disabled={saving || !canSaveDraft(draft)}
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{
            color: "#38bdf8",
            background: "rgba(56,189,248,0.12)",
            border: "1px solid rgba(56,189,248,0.25)",
            opacity: saving || !canSaveDraft(draft) ? 0.5 : 1,
          }}
        >
          {saving ? "Saving…" : "Add contact"}
        </button>
      </div>
    </div>
  );
}
