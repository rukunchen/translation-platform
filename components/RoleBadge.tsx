'use client'

import { roleLabel, roleBadgeStyle, type Role } from '@/lib/permissions'

export default function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-full ${roleBadgeStyle[role]}`}>
      {roleLabel[role]}
    </span>
  )
}
