"use client"

import { useEffect, useRef, useState } from "react"
import { Upload, CheckCircle, User } from "lucide-react"
import { fetchProfile, saveProfile } from "@/services/api"

type Profile = {
  name: string
  email: string
  title: string
  location: string
  previous_company: string
  university: string
  resume_filename: string
  has_resume: boolean
}

const field = (label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", marginBottom: 8 }}>
      {label}
    </label>
    <input
      {...props}
      style={{ width: "100%", height: 44, padding: "0 16px", borderRadius: 12, border: "1.5px solid #E8E2D9", background: "#fff", fontSize: 14, color: "#1C1917", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s", outline: "none" }}
      onFocus={e => e.currentTarget.style.borderColor = "#F59E0B"}
      onBlur={e  => e.currentTarget.style.borderColor = "#E8E2D9"}
    />
  </div>
)

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", title: "", location: "", previous_company: "", university: "", resume_filename: "", has_resume: false })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [saving, setSaving]   = useState(false)
  const [saved,  setSaved]    = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProfile().then(setProfile).catch(() => {})
  }, [])

  function handleFile(file: File | null) {
    if (!file) return
    if (!file.name.endsWith(".pdf")) return alert("Please upload a PDF file.")
    setResumeFile(file)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const updated = await saveProfile({ name: profile.name, email: profile.email, title: profile.title, location: profile.location, previous_company: profile.previous_company, university: profile.university, resume: resumeFile })
      setProfile(updated)
      setResumeFile(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  const resumeLabel = resumeFile
    ? resumeFile.name
    : profile.has_resume
      ? profile.resume_filename || "resume.pdf (uploaded)"
      : "No resume uploaded"

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F5", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "56px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#F0EDE6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <User size={22} color="#A8A29E" />
          </div>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, fontWeight: 400, color: "#1C1917", margin: 0 }}>
              Profile
            </h1>
            <p style={{ fontSize: 13, color: "#A8A29E", margin: 0 }}>Your details are used to personalise every outreach message.</p>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #F0EDE6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>

          {field("Full name",        { placeholder: "Ada Lovelace",           value: profile.name,             onChange: e => setProfile(p => ({ ...p, name:             e.target.value })) })}
          {field("Email",            { placeholder: "ada@example.com",        value: profile.email,            onChange: e => setProfile(p => ({ ...p, email:            e.target.value })), type: "email" })}
          {field("Current title",    { placeholder: "Software Engineer",      value: profile.title,            onChange: e => setProfile(p => ({ ...p, title:            e.target.value })) })}
          {field("Location",         { placeholder: "San Francisco, CA",      value: profile.location,         onChange: e => setProfile(p => ({ ...p, location:         e.target.value })) })}
          {field("Previous company", { placeholder: "Google, Stripe, …",      value: profile.previous_company, onChange: e => setProfile(p => ({ ...p, previous_company: e.target.value })) })}
          {field("University",       { placeholder: "MIT, Stanford, …",       value: profile.university,       onChange: e => setProfile(p => ({ ...p, university:       e.target.value })) })}

          {/* Resume upload */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#C4B89A", marginBottom: 8 }}>
              Resume (PDF)
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e  => { e.preventDefault(); setDragOver(true)  }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
              style={{
                border: `2px dashed ${dragOver ? "#F59E0B" : resumeFile || profile.has_resume ? "#86EFAC" : "#E8E2D9"}`,
                borderRadius: 12, padding: "20px 16px", cursor: "pointer", textAlign: "center",
                background: dragOver ? "#FFFBEB" : resumeFile || profile.has_resume ? "#F0FDF4" : "#FAFAF9",
                transition: "all 0.15s",
              }}
            >
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0] ?? null)} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {profile.has_resume || resumeFile
                  ? <CheckCircle size={16} color="#22C55E" />
                  : <Upload size={16} color="#A8A29E" />
                }
                <span style={{ fontSize: 13, color: profile.has_resume || resumeFile ? "#166534" : "#A8A29E", fontWeight: 500 }}>
                  {resumeLabel}
                </span>
              </div>
              {!resumeFile && !profile.has_resume && (
                <p style={{ fontSize: 11, color: "#C4B89A", margin: "6px 0 0" }}>Click or drag and drop</p>
              )}
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ height: 44, borderRadius: 12, border: "none", background: saved ? "#F0FDF4" : "#1C1917", color: saved ? "#166534" : "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s", fontFamily: "inherit" }}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save profile"}
          </button>

        </div>
      </div>
    </div>
  )
}
