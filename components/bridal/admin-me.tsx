"use client"

import * as React from "react"

// Who is signed in to the admin area (set by the dashboard layout on the
// server). Only for showing the right links: every action is still checked
// on the server.
export type AdminMe = { id: string; email: string; name: string; role: "super_admin" | "admin" }

const Ctx = React.createContext<AdminMe | null>(null)

export function AdminMeProvider({ me, children }: { me: AdminMe; children: React.ReactNode }) {
  return <Ctx.Provider value={me}>{children}</Ctx.Provider>
}

export const useAdminMe = () => React.useContext(Ctx)

export const ACCOUNT_URL = "/admin/dashboard/admins"
export const accountTitle = (me: AdminMe | null) => (me?.role === "super_admin" ? "Admins" : "My account")
