"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, ChevronDown, ExternalLink, Copy, Check, Loader2 } from "lucide-react"
import { fetchRows, createRow, approveRow, sendEmail } from "@/services/api"

// ── Types ─────────────────────────────────────────────────────────────────────

type Resource = {
  name:     string
  url:      string
  type:     "blog" | "article" | "github" | "linkedin" | "jd"
  content?: string
}

type Employee = {
  name:         string
  title:        string
  linkedin_url: string
  warm?:        boolean
}

type TraceEvent = {
  ts:    string
  agent: string
  kind:  "start" | "tool_call" | "tool_result" | "finish" | "error"
  data:  string
}

type Row = {
  thread_id:        string
  company:          string
  role:             string
  status:           string
  company_overview: string
  external_links:   Resource[]
  job_openings:     Resource[]
  employees:        Employee[]
  message:          string
  contact_email:    string
  error:            string | null
  approved:         boolean
  send_approved:    boolean
  trace:            TraceEvent[]
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; bg: string; text: string; dot: string; pulse: boolean }> = {
  pending:                 { label: "Pending",               bg: "#F5F4F0", text: "#9C9A8E", dot: "#C8C6BC", pulse: false },
  researching:             { label: "Researching",           bg: "#FEF3E2", text: "#B45309", dot: "#F59E0B", pulse: true  },
  finding_people:          { label: "Finding people",        bg: "#FDF2F8", text: "#9D174D", dot: "#EC4899", pulse: true  },
  awaiting_review:         { label: "Awaiting review",       bg: "#F0F9FF", text: "#0369A1", dot: "#38BDF8", pulse: false },
  drafting:                { label: "Drafting",               bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6", pulse: true  },
  finding_email:           { label: "Finding email",         bg: "#FAF5FF", text: "#6D28D9", dot: "#A78BFA", pulse: true  },
  awaiting_send_approval:  { label: "Ready to send",         bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B", pulse: false },
  sending:                 { label: "Sending",               bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6", pulse: true  },
  sent:                    { label: "Sent",                  bg: "#F0FDF4", text: "#166534", dot: "#22C55E", pulse: false },
  send_failed:             { label: "Send failed",           bg: "#FEF2F2", text: "#991B1B", dot: "#EF4444", pulse: false },
  done:                    { label: "Done",                  bg: "#F0FDF4", text: "#166534", dot: "#22C55E", pulse: false },
  error:                   { label: "Error",                 bg: "#FEF2F2", text: "#991B1B", dot: "#EF4444", pulse: false },
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS[status] ?? STATUS.pending
  return (
    <span style={{ background: cfg.bg, color: cfg.text, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
      <span style={{ position: "relative", display: "flex", width: 7, height: 7 }}>
        {cfg.pulse && (
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: cfg.dot, opacity: 0.6, animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite" }} />
        )}
        <span style={{ position: "relative", width: 7, height: 7, borderRadius: "50%", background: cfg.dot }} />
      </span>
      {cfg.label}
    </span>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
  const bgs   = ["#FEE2E2","#FEF3C7","#D1FAE5","#DBEAFE","#EDE9FE","#FCE7F3"]
  const texts = ["#991B1B","#92400E","#065F46","#1E40AF","#4C1D95","#831843"]
  const idx   = (name.charCodeAt(0) || 0) % bgs.length
  return (
    <span style={{ width: 28, height: 28, borderRadius: "50%", background: bgs[idx], color: texts[idx], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
      {initials || "?"}
    </span>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handle() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handle} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", transition: "all 0.15s", background: copied ? "#F0FDF4" : "#FEF3E2", color: copied ? "#166534" : "#92400E" }}>
      {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
    </button>
  )
}

// ── Dot loader ────────────────────────────────────────────────────────────────

function DotLoader() {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0,150,300].map(d => (
        <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", display: "inline-block", animation: `bounce 1s ${d}ms ease-in-out infinite` }} />
      ))}
    </span>
  )
}

// ── Trace panel ───────────────────────────────────────────────────────────────

const TRACE_KIND: Record<string, { bg: string; color: string; label: string }> = {
  start:       { bg: "#F5F4F0", color: "#78716C", label: "start"  },
  tool_call:   { bg: "#EFF6FF", color: "#1D4ED8", label: "call"   },
  tool_result: { bg: "#F5F4F0", color: "#57534E", label: "result" },
  finish:      { bg: "#F0FDF4", color: "#166534", label: "done"   },
  error:       { bg: "#FEF2F2", color: "#991B1B", label: "error"  },
}

function TracePanel({ events }: { events: TraceEvent[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 24, borderTop: "1px solid #F0EDE6", paddingTop: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A" }}
      >
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        Agent trace ({events.length} events)
      </button>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {events.map((e, i) => {
            const cfg = TRACE_KIND[e.kind] ?? TRACE_KIND.tool_result
            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: cfg.bg, borderRadius: 8, padding: "6px 10px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", flexShrink: 0, marginTop: 1, minWidth: 44 }}>{cfg.label}</span>
                <span style={{ fontSize: 10, color: "#A8A29E", flexShrink: 0, marginTop: 1 }}>{e.agent}</span>
                <span style={{ fontSize: 12, color: "#44403C", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>{e.data}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ row, onApprove, onSend }: { row: Row; onApprove: () => void; onSend: (email: string) => void }) {
  const generating = ["pending","researching","finding_people","drafting","finding_email"].includes(row.status)
  const [emailOverride, setEmailOverride] = useState(row.contact_email || "")

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      style={{ overflow: "hidden" }}
    >
      <div style={{ background: "#FDFCF9", borderTop: "1px solid #F0EDE6", padding: "24px 32px" }}>

        {/* Error */}
        {row.error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#991B1B", marginBottom: 20 }}>
            {row.error}
          </div>
        )}

        {/* Still starting */}
        {generating && !row.company_overview && !row.error && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0" }}>
            <DotLoader />
            <span style={{ fontSize: 13, color: "#A8A29E" }}>Agents are working on this…</span>
          </div>
        )}

        {/* Overview */}
        {row.company_overview && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", marginBottom: 10 }}>Overview</p>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#44403C", margin: 0 }}>{row.company_overview}</p>
          </div>
        )}

        {/* Links + People */}
        {(row.external_links?.length > 0 || row.employees?.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 24 }}>

            {row.external_links?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", marginBottom: 10 }}>Links</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {row.external_links.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "flex-start", gap: 6, textDecoration: "none", color: "#78716C", fontSize: 13 }}>
                      <ExternalLink size={12} style={{ color: "#D97706", marginTop: 2, flexShrink: 0 }} />
                      <span style={{ lineHeight: 1.5 }}>{link.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {row.employees?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", marginBottom: 10 }}>People</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {row.employees.map((e, i) => (
                    <a key={i} href={e.linkedin_url || "#"} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "#57534E", fontSize: 13 }}>
                      <Avatar name={e.name} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, display: "block" }}>{e.name}</span>
                        {e.title && <span style={{ fontSize: 11, color: "#A8A29E" }}>{e.title}</span>}
                      </div>
                      {e.warm && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E", padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>
                          Warm
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Job openings */}
        {row.job_openings?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", marginBottom: 10 }}>
              Job openings ({row.job_openings.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {row.job_openings.map((jd, i) => (
                <a key={i} href={jd.url} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#D97706", textDecoration: "none", fontWeight: 500 }}>
                  <ExternalLink size={13} style={{ flexShrink: 0 }} />
                  <span>{jd.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Approve gate */}
        {row.status === "awaiting_review" && (
          <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#0369A1", margin: "0 0 2px" }}>Ready to draft</p>
              <p style={{ fontSize: 12, color: "#7DD3FC", margin: 0 }}>Review the research and contacts above, then approve to generate your message.</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onApprove() }}
              style={{ flexShrink: 0, height: 36, padding: "0 20px", borderRadius: 10, border: "none", background: "#0369A1", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Approve →
            </button>
          </div>
        )}

        {/* Drafted message */}
        {row.message && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", margin: 0 }}>Drafted message</p>
              <CopyButton text={row.message} />
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #E8E2D9", borderRadius: 12, padding: "16px 20px", fontSize: 14, lineHeight: 1.7, color: "#44403C", whiteSpace: "pre-wrap" }}>
              {row.message}
            </div>
          </div>
        )}

        {/* Drafting / finding email in progress */}
        {!row.message && !row.error && row.company_overview && generating && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <DotLoader />
            <span style={{ fontSize: 13, color: "#92400E" }}>
              {row.status === "finding_email" ? "Looking up email address…" : "Drafting your message…"}
            </span>
          </div>
        )}

        {/* Send panel */}
        {row.status === "awaiting_send_approval" && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "20px", marginTop: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", margin: "0 0 12px" }}>Send email</p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "#78716C", marginBottom: 6 }}>
                {row.contact_email ? "Email found by Hunter.io — confirm or edit:" : "Email not found — enter manually:"}
              </label>
              <input
                type="email"
                value={emailOverride}
                onChange={e => setEmailOverride(e.target.value)}
                placeholder="contact@company.com"
                style={{ width: "100%", height: 40, padding: "0 12px", borderRadius: 10, border: "1.5px solid #E8E2D9", background: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
                onFocus={e  => e.currentTarget.style.borderColor = "#F59E0B"}
                onBlur={e   => e.currentTarget.style.borderColor = "#E8E2D9"}
              />
            </div>

            <button
              onClick={e => { e.stopPropagation(); onSend(emailOverride) }}
              disabled={!emailOverride}
              style={{ height: 38, padding: "0 20px", borderRadius: 10, border: "none", background: emailOverride ? "#1C1917" : "#E8E2D9", color: emailOverride ? "#fff" : "#A8A29E", fontSize: 13, fontWeight: 600, cursor: emailOverride ? "pointer" : "not-allowed", transition: "all 0.15s" }}
            >
              Send →
            </button>
          </div>
        )}

        {/* Sent confirmation */}
        {row.status === "sent" && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#166534", marginTop: 8 }}>
            ✓ Email sent to {row.contact_email}
          </div>
        )}

        {/* Trace */}
        {row.trace?.length > 0 && <TracePanel events={row.trace} />}

      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CompanySheet() {
  const [rows,       setRows]       = useState<Row[]>([])
  const [company,    setCompany]    = useState("")
  const [role,       setRole]       = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [adding,     setAdding]     = useState(false)
  const [approving,  setApproving]  = useState<string | null>(null)

  async function handleApprove(threadId: string) {
    setApproving(threadId)
    try {
      await approveRow(threadId)
      await loadRows()
    } finally { setApproving(null) }
  }

  const [sending, setSending] = useState<string | null>(null)
  async function handleSend(threadId: string, email: string) {
    setSending(threadId)
    try {
      await sendEmail(threadId, email)
      await loadRows()
    } finally { setSending(null) }
  }

  useEffect(() => {
    loadRows()
    const iv = setInterval(loadRows, 3000)
    return () => clearInterval(iv)
  }, [])

  async function loadRows() {
    try { setRows(await fetchRows()) } catch {}
  }

  async function addRow() {
    if (!company.trim()) return
    setAdding(true)
    try {
      await createRow({ company: company.trim(), role: role.trim() })
      setCompany("")
      setRole("")
      await loadRows()
    } finally { setAdding(false) }
  }

  return (
    <>
      {/* Keyframe animations — injected once */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');
        @keyframes ping   { 75%,100% { transform: scale(2); opacity: 0; } }
        @keyframes bounce { 0%,100%  { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        * { box-sizing: border-box; }
        input::placeholder { color: #C4B89A; }
        input:focus { outline: none; }
        a:hover span { text-decoration: underline; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#FAF8F5", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "56px 24px" }}>

          {/* Header */}
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 42, fontWeight: 400, color: "#1C1917", margin: "0 0 8px", lineHeight: 1.1 }}>
              Outreach
            </h1>
            <p style={{ fontSize: 14, color: "#A8A29E", margin: 0 }}>
              Add a company — agents research, find people, and draft your message.
            </p>
          </div>

          {/* Inputs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
            {[
              { value: company, set: setCompany, placeholder: "Company name", flex: 1 },
              { value: role,    set: setRole,    placeholder: "Role (optional)", flex: "0 0 200px" },
            ].map(({ value, set, placeholder, flex }, i) => (
              <input key={i}
                value={value}
                onChange={e => set(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addRow()}
                placeholder={placeholder}
                style={{ flex, height: 44, padding: "0 16px", borderRadius: 12, border: "1.5px solid #E8E2D9", background: "#fff", fontSize: 14, color: "#1C1917", fontFamily: "inherit", transition: "border-color 0.15s" }}
                onFocus={e => e.currentTarget.style.borderColor = "#F59E0B"}
                onBlur={e  => e.currentTarget.style.borderColor = "#E8E2D9"}
              />
            ))}
            <button onClick={addRow} disabled={adding || !company.trim()}
              style={{ height: 44, padding: "0 20px", borderRadius: 12, border: "none", background: company.trim() ? "#1C1917" : "#E8E2D9", color: company.trim() ? "#fff" : "#A8A29E", fontSize: 14, fontWeight: 600, cursor: company.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s", fontFamily: "inherit" }}>
              {adding ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <><Plus size={15} /> Add</>}
            </button>
          </div>

          {/* Table */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #F0EDE6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden" }}>

            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 148px 2fr 36px", gap: 16, padding: "12px 24px", borderBottom: "1px solid #F5F2EC" }}>
              {["Company","Role","Status","Message preview",""].map((h, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A" }}>{h}</span>
              ))}
            </div>

            {/* Empty */}
            {rows.length === 0 && (
              <div style={{ padding: "80px 24px", textAlign: "center" }}>
                <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 22, color: "#D6D0C8", margin: "0 0 8px" }}>Nothing here yet</p>
                <p style={{ fontSize: 13, color: "#C4B89A", margin: 0 }}>Add a company above to get started</p>
              </div>
            )}

            {/* Rows */}
            <AnimatePresence initial={false}>
              {rows.map((row, idx) => (
                <motion.div key={row.thread_id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: idx * 0.03 }}
                  style={{ borderBottom: idx < rows.length - 1 ? "1px solid #F5F2EC" : "none" }}
                >
                  {/* Main row */}
                  <div
                    onClick={() => setExpandedId(p => p === row.thread_id ? null : row.thread_id)}
                    style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 148px 2fr 36px", gap: 16, padding: "16px 24px", alignItems: "center", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#FDFCFA"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1C1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                    <span style={{ fontSize: 13, color: "#78716C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.role || <span style={{ color: "#D6D0C8" }}>—</span>}</span>
                    <StatusPill status={row.status} />
                    <span style={{ fontSize: 13, color: "#A8A29E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.message
                        ? row.message.slice(0, 72) + "…"
                        : row.status === "awaiting_review"
                          ? <span style={{ fontStyle: "italic", color: "#38BDF8", fontSize: 12 }}>awaiting your approval…</span>
                          : ["researching","finding_people","drafting"].includes(row.status)
                            ? <span style={{ fontStyle: "italic", color: "#C4B89A", fontSize: 12 }}>generating…</span>
                            : <span style={{ color: "#D6D0C8" }}>—</span>
                      }
                    </span>
                    <motion.div animate={{ rotate: expandedId === row.thread_id ? 180 : 0 }} transition={{ duration: 0.18 }}
                      style={{ display: "flex", justifyContent: "center", color: "#C4B89A" }}>
                      <ChevronDown size={16} />
                    </motion.div>
                  </div>

                  {/* Expanded */}
                  <AnimatePresence>
                    {expandedId === row.thread_id && (
                      <DetailPanel row={row} onApprove={() => handleApprove(row.thread_id)} onSend={(email) => handleSend(row.thread_id, email)} />
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>

          </div>

          {/* Footer */}
          {rows.length > 0 && (
            <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#C4B89A" }}>
              {rows.length} {rows.length === 1 ? "company" : "companies"} · refreshes every 3s
            </p>
          )}

        </div>
      </div>
    </>
  )
}