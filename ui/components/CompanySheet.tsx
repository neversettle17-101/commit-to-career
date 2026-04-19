"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, ChevronDown, ExternalLink, Copy, Check, Loader2 } from "lucide-react"
import { fetchRows, createRow } from "@/services/api"

// ── Types ─────────────────────────────────────────────────────────────────────

type Resource = {
  name: string
  url:  string
  type: "blog" | "article" | "github" | "linkedin"
}

type Row = {
  thread_id:        string
  company:          string
  role:             string
  status:           string
  company_overview: string
  external_links:   Resource[]
  employees:        Resource[]
  message:          string
  error:            string | null
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; bg: string; text: string; dot: string; pulse: boolean }> = {
  pending:        { label: "Pending",        bg: "#F5F4F0", text: "#9C9A8E", dot: "#C8C6BC", pulse: false },
  researching:    { label: "Researching",    bg: "#FEF3E2", text: "#B45309", dot: "#F59E0B", pulse: true  },
  finding_people: { label: "Finding people", bg: "#FDF2F8", text: "#9D174D", dot: "#EC4899", pulse: true  },
  drafting:       { label: "Drafting",       bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6", pulse: true  },
  done:           { label: "Done",           bg: "#F0FDF4", text: "#166534", dot: "#22C55E", pulse: false },
  error:          { label: "Error",          bg: "#FEF2F2", text: "#991B1B", dot: "#EF4444", pulse: false },
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

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ row }: { row: Row }) {
  const generating = ["pending","researching","finding_people","drafting"].includes(row.status)

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
                    <a key={i} href={e.url || "#"} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "#57534E", fontSize: 13 }}>
                      <Avatar name={e.name} />
                      <span style={{ fontWeight: 500 }}>{e.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
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

        {/* Drafting in progress */}
        {!row.message && !row.error && row.company_overview && generating && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <DotLoader />
            <span style={{ fontSize: 13, color: "#92400E" }}>Drafting your message…</span>
          </div>
        )}

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
                    {expandedId === row.thread_id && <DetailPanel row={row} />}
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