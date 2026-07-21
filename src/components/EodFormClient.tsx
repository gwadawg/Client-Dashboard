"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  CCM_DIAL_TARGETS_MISS_REASONS,
  EOD_DEPARTMENT_LABELS,
  type EodDepartment,
} from "@/lib/eod-forms";

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

function todayLocalDate(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function DynamicStringList({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const rows = values.length > 0 ? values : [""];

  function setAt(i: number, v: string) {
    const next = [...rows];
    next[i] = v;
    onChange(next);
  }

  function addRow() {
    onChange([...rows, ""]);
  }

  function removeAt(i: number) {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      {rows.map((val, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={val}
            onChange={e => setAt(i, e.target.value)}
            placeholder={placeholder ?? `Item ${i + 1}`}
            className="flex-1 rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="text-xs px-2 py-2 rounded-lg"
              style={{ color: "#94a3b8", background: "rgba(148,163,184,0.12)" }}
              aria-label="Remove"
            >
              −
            </button>
          )}
          {i === rows.length - 1 && (
            <button
              type="button"
              onClick={addRow}
              className="text-sm font-bold px-3 py-2 rounded-lg"
              style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)" }}
              aria-label="Add another"
            >
              +
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-slate-400">{label}</legend>
      <div className="flex gap-2">
        {[true, false].map(opt => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{
              background: value === opt ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.04)",
              color: value === opt ? "#7dd3fc" : "#94a3b8",
              border: `1px solid ${value === opt ? "rgba(56,189,248,0.4)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            {opt ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function EodFormClient({ department }: { department: EodDepartment }) {
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agentId, setAgentId] = useState("");
  const [workDate, setWorkDate] = useState(todayLocalDate);
  const [accomplishments, setAccomplishments] = useState<string[]>([""]);
  const [unfinished, setUnfinished] = useState<string[]>([""]);
  const [tomorrowPriorities, setTomorrowPriorities] = useState("");
  const [productivity, setProductivity] = useState(7);

  // Media buyer / ops
  const [recentLaunchesChecked, setRecentLaunchesChecked] = useState(true);
  const [recentLaunchesNotes, setRecentLaunchesNotes] = useState("");
  const [obOnSchedule, setObOnSchedule] = useState(true);
  const [obOnScheduleNotes, setObOnScheduleNotes] = useState("");

  // CS
  const [slackCleared, setSlackCleared] = useState(true);
  const [slackNotes, setSlackNotes] = useState("");
  const [openBugs, setOpenBugs] = useState(false);
  const [openBugsNotes, setOpenBugsNotes] = useState("");
  const [freshLaunchCheck, setFreshLaunchCheck] = useState(true);
  const [freshLaunchNotes, setFreshLaunchNotes] = useState("");

  // CCM
  const [trainingRan, setTrainingRan] = useState(true);
  const [coachingFocus, setCoachingFocus] = useState("");
  const [settersOnTime, setSettersOnTime] = useState(true);
  const [attendanceNotes, setAttendanceNotes] = useState("");
  const [dialTargetsHit, setDialTargetsHit] = useState(true);
  const [dialTargetsMissReason, setDialTargetsMissReason] = useState("");
  const [underKpi, setUnderKpi] = useState(true);
  const [underKpiNotes, setUnderKpiNotes] = useState("");
  const [stackBugs, setStackBugs] = useState("None open");
  const [ccmSlackCleared, setCcmSlackCleared] = useState(true);
  const [ccmSlackNotes, setCcmSlackNotes] = useState("");

  const [loadingAgents, setLoadingAgents] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const title = useMemo(() => `${EOD_DEPARTMENT_LABELS[department]} — EOD`, [department]);

  useEffect(() => {
    setLoadingAgents(true);
    fetch(`/api/eod?list_agents=1&department=${department}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load team");
        return j as { agents: { id: string; name: string }[] };
      })
      .then(d => {
        setAgents(d.agents);
        if (d.agents.length === 1) setAgentId(d.agents[0].id);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingAgents(false));
  }, [department]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    setSuccess(false);

    const responses: Record<string, unknown> = {
      accomplishments,
      unfinished,
      tomorrow_priorities: tomorrowPriorities,
      productivity_rating: productivity,
    };

    if (department === "media_buyer") {
      Object.assign(responses, {
        recent_launches_checked: recentLaunchesChecked,
        recent_launches_notes: recentLaunchesNotes,
        ob_on_schedule: obOnSchedule,
        ob_on_schedule_notes: obOnScheduleNotes,
      });
    } else if (department === "client_success") {
      Object.assign(responses, {
        slack_channels_cleared: slackCleared,
        slack_channels_notes: slackNotes,
        open_bugs_without_update: openBugs,
        open_bugs_notes: openBugsNotes,
        fresh_launch_spot_check: freshLaunchCheck,
        fresh_launch_spot_check_notes: freshLaunchNotes,
      });
    } else {
      Object.assign(responses, {
        training_ran: trainingRan,
        coaching_focus: coachingFocus,
        setters_on_time: settersOnTime,
        attendance_notes: settersOnTime ? "" : attendanceNotes,
        dial_targets_hit: dialTargetsHit,
        dial_targets_miss_reason: dialTargetsHit ? "" : dialTargetsMissReason,
        under_kpi_coverage: underKpi,
        under_kpi_notes: underKpiNotes,
        stack_bugs_status: stackBugs,
        slack_channels_cleared: ccmSlackCleared,
        slack_channels_notes: ccmSlackCleared ? "" : ccmSlackNotes,
      });
    }

    try {
      const r = await fetch("/api/eod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department,
          agent_id: agentId,
          work_date: workDate,
          responses,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Submit failed");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAgent = agents.find(a => a.id === agentId) ?? null;
  const identityReady = Boolean(agentId);

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-4 py-12">
        <p className="text-lg font-semibold text-emerald-400">EOD submitted</p>
        <p className="text-sm text-slate-400">
          Saved for {workDate}. You can resubmit the same day to update it.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(false)}
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: "rgba(56,189,248,0.15)", color: "#7dd3fc" }}
        >
          Submit another / edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
        <p className="text-sm mt-2 text-slate-500">
          End-of-day check-in. History is saved to your team file in Mr. Waiz.
        </p>
      </div>

      {error && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "rgba(248,113,113,0.12)", color: "#fca5a5" }}>
          {error}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 1 — Who & when</h2>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">You</label>
          <select
            required
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            disabled={loadingAgents}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          >
            <option value="">{loadingAgents ? "Loading…" : "Select yourself"}</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {!loadingAgents && agents.length === 0 && (
            <p className="text-xs mt-1 text-amber-500/90">
              No active roster members for this seat yet — set their position under Admin → Team Roster.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Work date</label>
          <input
            type="date"
            required
            value={workDate}
            onChange={e => setWorkDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        {!identityReady && !loadingAgents && agents.length > 0 && (
          <p className="text-xs" style={{ color: "#64748b" }}>
            Select your name above to open today&apos;s questions.
          </p>
        )}
      </section>

      {identityReady && selectedAgent && (
        <>
          <div
            className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)" }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                Filling as {selectedAgent.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                Work date {workDate} · Step 2 — answer below, then submit
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAgentId("")}
              className="text-[11px] font-semibold shrink-0"
              style={{ color: "#7dd3fc" }}
            >
              Change
            </button>
          </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Shared</h2>
        <DynamicStringList
          label="What got done today"
          values={accomplishments}
          onChange={setAccomplishments}
          placeholder="One accomplishment…"
        />
        <DynamicStringList
          label="What you weren't able to finish"
          values={unfinished}
          onChange={setUnfinished}
          placeholder="One unfinished item…"
        />
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Tomorrow&apos;s top priorities</label>
          <textarea
            required
            rows={3}
            value={tomorrowPriorities}
            onChange={e => setTomorrowPriorities(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
            placeholder="1–3 priorities for tomorrow"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Productivity rating: {productivity}/10
          </label>
          <input
            type="range"
            min={1}
            max={10}
            value={productivity}
            onChange={e => setProductivity(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>1</span>
            <span>10</span>
          </div>
        </div>
      </section>

      {department === "media_buyer" && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Media Buyer / Ops</h2>
          <YesNo
            label="Did you check all accounts launched in the last 3 days to confirm everything is running smoothly?"
            value={recentLaunchesChecked}
            onChange={setRecentLaunchesChecked}
          />
          {!recentLaunchesChecked && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                What&apos;s off / what still needs checking?
              </label>
              <textarea
                required
                rows={2}
                value={recentLaunchesNotes}
                onChange={e => setRecentLaunchesNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="Account names + issue or next step…"
              />
            </div>
          )}
          <YesNo
            label="Are you on track to onboard clients on schedule?"
            value={obOnSchedule}
            onChange={setObOnSchedule}
          />
          {!obOnSchedule && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                What&apos;s slipping and what&apos;s the next step?
              </label>
              <textarea
                required
                rows={2}
                value={obOnScheduleNotes}
                onChange={e => setObOnScheduleNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="Which clients / dates / blocker…"
              />
            </div>
          )}
        </section>
      )}

      {department === "client_success" && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Client Success</h2>
          <YesNo
            label="Did you check all Slack channels and confirm no clients are left on read?"
            value={slackCleared}
            onChange={setSlackCleared}
          />
          {!slackCleared && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Which clients / channels still need a reply?
              </label>
              <textarea
                required
                rows={2}
                value={slackNotes}
                onChange={e => setSlackNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
          )}
          <YesNo
            label="Any bugs/problems still waiting on a team update?"
            value={openBugs}
            onChange={setOpenBugs}
          />
          {openBugs && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                What&apos;s open and who owns the next update?
              </label>
              <textarea
                required
                rows={2}
                value={openBugsNotes}
                onChange={e => setOpenBugsNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="Bug / client · owner · ETA if known…"
              />
            </div>
          )}
          <YesNo
            label="Did you spot-check freshly launched client accounts for suspicious activity (dials being made, Hot Prospector, AI functioning)?"
            value={freshLaunchCheck}
            onChange={setFreshLaunchCheck}
          />
          {!freshLaunchCheck && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                What looked off / what still needs checking?
              </label>
              <textarea
                required
                rows={2}
                value={freshLaunchNotes}
                onChange={e => setFreshLaunchNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="Client · dials / HP / AI · next step…"
              />
            </div>
          )}
        </section>
      )}

      {department === "ccm" && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Call Center Manager</h2>
          <YesNo label="Daily training ran?" value={trainingRan} onChange={setTrainingRan} />
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">One coaching focus</label>
            <input
              type="text"
              value={coachingFocus}
              onChange={e => setCoachingFocus(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
              required={trainingRan}
            />
          </div>
          <YesNo
            label="Setters on time (or late/missing handled same day)?"
            value={settersOnTime}
            onChange={v => {
              setSettersOnTime(v);
              if (v) setAttendanceNotes("");
            }}
          />
          {!settersOnTime && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Attendance notes</label>
              <input
                type="text"
                required
                value={attendanceNotes}
                onChange={e => setAttendanceNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="Who was late/missing · how it was handled…"
              />
            </div>
          )}
          <YesNo
            label="Dial / booking targets hit?"
            value={dialTargetsHit}
            onChange={v => {
              setDialTargetsHit(v);
              if (v) setDialTargetsMissReason("");
            }}
          />
          {!dialTargetsHit && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Why were targets missed?</label>
              <select
                required
                value={dialTargetsMissReason}
                onChange={e => setDialTargetsMissReason(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="">Select a reason…</option>
                {CCM_DIAL_TARGETS_MISS_REASONS.map(reason => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          )}
          <YesNo label="Under-KPI clients have dial coverage if needed?" value={underKpi} onChange={setUnderKpi} />
          {!underKpi && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Under-KPI notes</label>
              <input
                type="text"
                required
                value={underKpiNotes}
                onChange={e => setUnderKpiNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="Which accounts · coverage plan…"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Stack bugs (AI bot / HP / GHL) — fixed / owner+ETA / escalated / none
            </label>
            <input
              type="text"
              required
              value={stackBugs}
              onChange={e => setStackBugs(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>
          <YesNo
            label="Did you check all Slack channels and confirm no clients are left on read?"
            value={ccmSlackCleared}
            onChange={v => {
              setCcmSlackCleared(v);
              if (v) setCcmSlackNotes("");
            }}
          />
          {!ccmSlackCleared && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Which clients / channels still need a reply?
              </label>
              <textarea
                required
                rows={2}
                value={ccmSlackNotes}
                onChange={e => setCcmSlackNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
          )}
        </section>
      )}

      <button
        type="submit"
        disabled={submitting || !agentId}
        className="w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
        style={{ background: "#f59e0b", color: "#0a1628" }}
      >
        {submitting ? "Submitting…" : "Submit EOD"}
      </button>
        </>
      )}
    </form>
  );
}
