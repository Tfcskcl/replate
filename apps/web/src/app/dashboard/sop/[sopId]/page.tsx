"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

interface SOPStep {
  id?: string;
  step_number: number;
  name: string;
  start_timestamp_sec: number;
  end_timestamp_sec: number;
  allowed_duration_min_sec: number;
  allowed_duration_max_sec: number;
  required_ingredients: { name: string; quantity_grams?: number; quantity_ml?: number; tolerance_percent: number }[];
  visual_checkpoint: string;
  is_critical: boolean;
  can_be_skipped: boolean;
}

interface SOPRecord {
  id: string;
  dish_name: string;
  recorded_by: string;
  video_url: string;
  status: string;
  is_locked: boolean;
  lock_hash?: string;
  steps: SOPStep[];
}

const STEP_COLORS: Record<string, string> = {
  locked: "#16A34A",
  annotating: "#D97706",
  review: "#2563EB",
  draft: "#9CA3AF",
};

export default function SOPAnnotationPage() {
  const params = useParams();
  const router = useRouter();
  const sopId = params?.sopId as string;
  const videoRef = useRef<HTMLVideoElement>(null);

  const [sop, setSop] = useState<SOPRecord | null>(null);
  const [steps, setSteps] = useState<SOPStep[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [editingStep, setEditingStep] = useState<SOPStep | null>(null);

  useEffect(() => {
    if (sopId) fetchSOP();
  }, [sopId]);

  async function fetchSOP() {
    try {
      const res = await fetch(`/api/sops/${sopId}`);
      if (res.ok) {
        const data = await res.json();
        setSop(data);
        setSteps(data.steps || []);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleTimeUpdate() {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }

  function handleLoadedMetadata() {
    if (videoRef.current) setDuration(videoRef.current.duration);
  }

  function seekTo(sec: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.pause();
    }
  }

  function tagStepHere() {
    const newStep: SOPStep = {
      step_number: steps.length + 1,
      name: `Step ${steps.length + 1}`,
      start_timestamp_sec: currentTime,
      end_timestamp_sec: currentTime + 60,
      allowed_duration_min_sec: 10,
      allowed_duration_max_sec: 120,
      required_ingredients: [],
      visual_checkpoint: "",
      is_critical: true,
      can_be_skipped: false,
    };
    setEditingStep(newStep);
  }

  async function saveStep(step: SOPStep) {
    setSaving(true);
    try {
      const url = step.id ? `/api/sops/${sopId}/steps/${step.id}` : `/api/sops/${sopId}/steps`;
      const method = step.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step),
      });
      if (res.ok) {
        await fetchSOP();
        setEditingStep(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function lockSOP() {
    if (!confirm("Lock this SOP? Once locked it cannot be modified.")) return;
    setLocking(true);
    try {
      const res = await fetch(`/api/sops/${sopId}/lock?approved_by=admin`, { method: "POST" });
      if (res.ok) {
        await fetchSOP();
        alert("SOP locked successfully! SHA-256 hash computed and stored.");
      }
    } finally {
      setLocking(false);
    }
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) return <p style={{ color: "#888", padding: 40 }}>Loading SOP...</p>;
  if (!sop) return <p style={{ color: "#888", padding: 40 }}>SOP not found.</p>;

  const statusColor = STEP_COLORS[sop.status] ?? "#9CA3AF";

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111", margin: 0 }}>
            {sop.dish_name}
          </h1>
          <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
            Recorded by {sop.recorded_by} ·{" "}
            <span style={{ color: statusColor, fontWeight: 500 }}>{sop.status}</span>
            {sop.is_locked && (
              <span style={{ marginLeft: 8, color: "#16A34A" }}>
                🔒 Locked · {sop.lock_hash?.slice(0, 12)}…
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.back()}
            style={{ padding: "8px 16px", border: "0.5px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}>
            ← Back
          </button>
          {!sop.is_locked && steps.length > 0 && (
            <button onClick={lockSOP} disabled={locking}
              style={{ padding: "8px 16px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: locking ? 0.6 : 1 }}>
              {locking ? "Locking..." : "🔒 Lock SOP"}
            </button>
          )}
        </div>
      </div>

      {/* Main two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>

        {/* Left: video + timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Video */}
          <div style={{ background: "#111", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9" }}>
            {sop.video_url ? (
              <video
                ref={videoRef}
                src={sop.video_url}
                controls
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#666", fontSize: 14 }}>
                No video uploaded yet
              </div>
            )}
          </div>

          {/* Timeline */}
          {duration > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e5e5e5", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 6 }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Timeline bar */}
              <div
                style={{ position: "relative", height: 40, background: "#f0f0f0", borderRadius: 6, cursor: "pointer", overflow: "hidden" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  seekTo(pct * duration);
                }}
              >
                {/* Progress */}
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: `${(currentTime / duration) * 100}%`,
                  height: "100%", background: "rgba(255,107,43,0.2)",
                  pointerEvents: "none",
                }} />

                {/* Step markers */}
                {steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: `${(step.start_timestamp_sec / duration) * 100}%`,
                      top: 0, width: 3, height: "100%",
                      background: step.is_critical ? "#E24B4A" : "#16A34A",
                      cursor: "pointer",
                    }}
                    onClick={(e) => { e.stopPropagation(); seekTo(step.start_timestamp_sec); setActiveStep(i); }}
                    title={step.name}
                  />
                ))}

                {/* Playhead */}
                <div style={{
                  position: "absolute",
                  left: `${(currentTime / duration) * 100}%`,
                  top: 0, width: 2, height: "100%",
                  background: "#FF6B2B", pointerEvents: "none",
                }} />
              </div>

              {/* Action buttons */}
              {!sop.is_locked && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={tagStepHere}
                    style={{ padding: "7px 14px", background: "#FF6B2B", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    + Tag step at {formatTime(currentTime)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step editor modal */}
          {editingStep && (
            <StepEditor
              step={editingStep}
              onSave={saveStep}
              onCancel={() => setEditingStep(null)}
              saving={saving}
              currentTime={currentTime}
            />
          )}
        </div>

        {/* Right: step list */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e5e5e5", padding: 14, maxHeight: 700, overflowY: "auto" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: "0 0 12px" }}>
            Steps tagged ({steps.length})
          </p>

          {steps.length === 0 && (
            <p style={{ fontSize: 13, color: "#ccc", textAlign: "center", padding: 20 }}>
              No steps yet. Play the video and click "Tag step" to annotate.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {steps.map((step, i) => (
              <div
                key={step.id ?? i}
                onClick={() => { seekTo(step.start_timestamp_sec); setActiveStep(i); }}
                style={{
                  border: `1px solid ${activeStep === i ? "#FF6B2B" : "#e5e5e5"}`,
                  borderRadius: 8, padding: 10, cursor: "pointer",
                  background: activeStep === i ? "#FFF7F4" : "#fff",
                  borderLeft: `4px solid ${step.is_critical ? "#E24B4A" : "#16A34A"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
                    {step.step_number}. {step.name}
                  </span>
                  <span style={{ fontSize: 11, color: "#aaa" }}>
                    {formatTime(step.start_timestamp_sec)} – {formatTime(step.end_timestamp_sec)}
                  </span>
                </div>
                {step.visual_checkpoint && (
                  <p style={{ fontSize: 11, color: "#888", margin: "0 0 4px" }}>{step.visual_checkpoint}</p>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {step.is_critical && (
                    <span style={{ fontSize: 10, background: "#FEE2E2", color: "#DC2626", padding: "1px 6px", borderRadius: 3 }}>critical</span>
                  )}
                  {step.required_ingredients.map((ing, j) => (
                    <span key={j} style={{ fontSize: 10, background: "#F0F9FF", color: "#0369A1", padding: "1px 6px", borderRadius: 3 }}>
                      {ing.name}
                    </span>
                  ))}
                </div>
                {!sop.is_locked && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingStep(step); }}
                    style={{ marginTop: 6, background: "none", border: "0.5px solid #ddd", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer", color: "#555" }}
                  >
                    Edit
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepEditor({ step, onSave, onCancel, saving, currentTime }: {
  step: SOPStep;
  onSave: (s: SOPStep) => void;
  onCancel: () => void;
  saving: boolean;
  currentTime: number;
}) {
  const [form, setForm] = useState<SOPStep>({ ...step });
  const [ingText, setIngText] = useState(
    step.required_ingredients.map(i => `${i.name}:${i.quantity_grams ?? i.quantity_ml ?? ""}`).join(", ")
  );

  function parseIngredients(text: string) {
    return text.split(",").map(s => s.trim()).filter(Boolean).map(s => {
      const [name, qty] = s.split(":").map(t => t.trim());
      const quantity_grams = qty && !isNaN(Number(qty)) ? Number(qty) : undefined;
      return { name: name || s, quantity_grams, tolerance_percent: 0.15 };
    });
  }

  function handleSave() {
    onSave({ ...form, required_ingredients: parseIngredients(ingText) });
  }

  const inputStyle = {
    width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0",
    borderRadius: 6, fontSize: 13, boxSizing: "border-box" as const,
    outline: "none", background: "#fff",
  };

  const labelStyle = { fontSize: 11, color: "#888", marginBottom: 4, display: "block" as const };

  return (
    <div style={{ background: "#fff", border: "1.5px solid #FF6B2B", borderRadius: 12, padding: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>
        {form.id ? "Edit step" : "New step"} — at {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Step name *</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Add spice mix" />
        </div>
        <div>
          <label style={labelStyle}>Visual checkpoint *</label>
          <input style={inputStyle} value={form.visual_checkpoint} onChange={e => setForm(f => ({ ...f, visual_checkpoint: e.target.value }))} placeholder="e.g. Colour turns deep red" />
        </div>
        <div>
          <label style={labelStyle}>Min duration (seconds)</label>
          <input style={inputStyle} type="number" value={form.allowed_duration_min_sec} onChange={e => setForm(f => ({ ...f, allowed_duration_min_sec: Number(e.target.value) }))} />
        </div>
        <div>
          <label style={labelStyle}>Max duration (seconds)</label>
          <input style={inputStyle} type="number" value={form.allowed_duration_max_sec} onChange={e => setForm(f => ({ ...f, allowed_duration_max_sec: Number(e.target.value) }))} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={labelStyle}>Required ingredients (name:grams, e.g. "cumin:5, butter:50")</label>
          <input style={inputStyle} value={ingText} onChange={e => setIngText(e.target.value)} placeholder="cumin:5, butter:50, tomato puree:200" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "#555" }}>
          <input type="checkbox" checked={form.is_critical} onChange={e => setForm(f => ({ ...f, is_critical: e.target.checked }))} />
          Critical step
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "#555" }}>
          <input type="checkbox" checked={form.can_be_skipped} onChange={e => setForm(f => ({ ...f, can_be_skipped: e.target.checked }))} />
          Can be skipped
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ padding: "8px 14px", border: "0.5px solid #ddd", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 13 }}>Cancel</button>
        <button onClick={handleSave} disabled={saving || !form.name}
          style={{ padding: "8px 16px", background: "#FF6B2B", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save step"}
        </button>
      </div>
    </div>
  );
}
