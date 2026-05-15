'use client'

import { roleLabel, roleBadgeStyle, type Role } from '@/lib/permissions'

export default function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wider rounded-full ${roleBadgeStyle[role]}`}
      style={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}
    >
      {roleLabel[role]}
    </span>
  )
}
