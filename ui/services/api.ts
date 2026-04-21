// services/api.ts
const BASE = "http://localhost:8000"

export async function fetchRows() {
  const res = await fetch(`${BASE}/rows`)
  if (!res.ok) throw new Error("Failed to fetch rows")
  return res.json()
}

export async function createRow(payload: { company: string; role: string }) {
  const res = await fetch(`${BASE}/rows`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) throw new Error("Failed to create row")
  return res.json()
}

export async function approveRow(threadId: string) {
  const res = await fetch(`${BASE}/rows/${threadId}/approve`, { method: "POST" })
  if (!res.ok) throw new Error("Failed to approve row")
  return res.json()
}

export async function fetchProfile() {
  const res = await fetch(`${BASE}/profile`)
  if (!res.ok) throw new Error("Failed to fetch profile")
  return res.json()
}

export async function saveProfile(data: { name: string; email: string; title: string; location: string; previous_company: string; university: string; resume?: File | null }) {
  const form = new FormData()
  form.append("name",             data.name)
  form.append("email",            data.email)
  form.append("title",            data.title)
  form.append("location",         data.location)
  form.append("previous_company", data.previous_company)
  form.append("university",       data.university)
  if (data.resume) form.append("resume", data.resume)
  const res = await fetch(`${BASE}/profile`, { method: "POST", body: form })
  if (!res.ok) throw new Error("Failed to save profile")
  return res.json()
}