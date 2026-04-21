"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function Nav() {
  const path = usePathname()

  const links = [
    { href: "/",        label: "Outreach" },
    { href: "/profile", label: "Profile"  },
  ]

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(250,248,245,0.85)", backdropFilter: "blur(8px)", borderBottom: "1px solid #F0EDE6", padding: "0 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", height: 52, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 16, color: "#1C1917", marginRight: 20 }}>
          Commit to Career
        </span>
        {links.map(({ href, label }) => {
          const active = path === href
          return (
            <Link key={href} href={href} style={{
              fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 8,
              textDecoration: "none",
              color:      active ? "#1C1917"  : "#A8A29E",
              background: active ? "#F0EDE6"  : "transparent",
              transition: "all 0.15s",
            }}>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
