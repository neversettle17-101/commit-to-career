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