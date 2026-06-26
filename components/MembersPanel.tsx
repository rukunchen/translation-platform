'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJSON } from '@/lib/apiFetch'
import { type Role, roleLabel, canManage } from '@/lib/permissions'
import RoleBadge from './RoleBadge'
import InviteMemberModal from './InviteMemberModal'
import { Card } from './ui/Card'
import { Eyebrow } from './ui/Eyebrow'
import { Button } from './ui/Button'

type Member = {
  id: string
  user_id: string
  role: Role
  added_at: string
  profiles: { email: string; name: string | null; avatar_url: string | null }
}

type Props = {
  projectId: string
  currentUserId: string | null
  onRoleChanged?: (myRole: Role | null) => void
}

export default function MembersPanel({ projectId, currentUserId, onRoleChanged }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [myRole, setMyRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const canManageMembers = isAdmin || canManage(myRole)

  const load = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    const { data } = await apiJSON<{ members: Member[]; myRole: Role; isPlatformAdmin: boolean }>(`/api/projects/${projectId}/members`)
    if (data) {
      setMembers(data.members || [])
      setMyRole(data.myRole)
      setIsAdmin(Boolean(data.isPlatformAdmin))
      onRoleChanged?.(data.myRole)
    }
    setLoading(false)
  }, [onRoleChanged, projectId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const changeRole = async (memberId: string, newRole: Role) => {
    setEditingRoleFor(null)
    const { error } = await apiJSON(`/api/projects/${projectId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    })
    if (error) { alert(error); return }
    await load()
  }

  const removeMember = async (memberId: string, isSelf: boolean) => {
    const msg = isSelf ? '确定退出此项目？' : '确定移除该成员？'
    if (!confirm(msg)) return
    const { error } = await apiJSON(`/api/projects/${projectId}/members/${memberId}`, {
      method: 'DELETE',
    })
    if (error) { alert(error); return }
    if (isSelf) {
      window.location.href = '/dashboard'
    } else {
      await load()
    }
  }

  return (
    <>
      <Card padding="none" className="overflow-hidden">
        {/* 头部 — 24px padding，邀请按钮在右 */}
        <div className="flex items-center justify-between border-b border-line" style={{ padding: '20px 24px' }}>
          <div>
            <Eyebrow tone="muted" className="mb-1.5">Team</Eyebrow>
            <h3 className="font-serif text-lg text-ink-900 leading-tight">
              成员 <span className="text-xs text-ink-400 font-sans font-normal ml-1">{members.length} 人</span>
            </h3>
          </div>
          {canManage(myRole) && (
            <Button size="sm" variant="primary" onClick={() => setShowInvite(true)} leftIcon={<span className="text-base leading-none">+</span>}>
              邀请
            </Button>
          )}
        </div>

        {/* 列表 — 每行高度统一 */}
        {loading ? (
          <div className="text-center text-sm text-ink-500" style={{ padding: '40px 24px' }}>加载中…</div>
        ) : (
          <ul className="divide-y divide-line">
            {members.map(m => {
              const name = m.profiles?.name || m.profiles?.email?.split('@')[0] || '匿名'
              const isSelf = m.user_id === currentUserId
              const initial = (m.profiles?.name?.[0] || m.profiles?.email?.[0] || '?').toUpperCase()
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 hover:bg-canvas/50 transition-colors min-h-[72px]" style={{ padding: '14px 24px' }}
                >
                  <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-sm">{initial}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-ink-900 text-sm truncate">{name}</p>
                      {isSelf && <span className="text-[10px] text-ink-500 bg-canvas px-1.5 py-0.5 rounded">你</span>}
                    </div>
                    <p className="text-[11px] text-ink-400 truncate font-mono">{m.profiles?.email}</p>
                  </div>

                  {editingRoleFor === m.id && canManageMembers ? (
                    <select
                      autoFocus
                      defaultValue={m.role}
                      onBlur={() => setEditingRoleFor(null)}
                      onChange={e => changeRole(m.id, e.target.value as Role)}
                      className="text-xs border-2 border-brand rounded-lg px-2 py-1 bg-white focus:outline-none"
                    >
                      <option value="manager">{roleLabel.manager}</option>
                      <option value="translator">{roleLabel.translator}</option>
                      <option value="reviewer">{roleLabel.reviewer}</option>
                    </select>
                  ) : (
                    <button
                      disabled={!canManageMembers}
                      onClick={() => setEditingRoleFor(m.id)}
                      className={canManageMembers ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                      title={canManageMembers ? '点击修改角色' : ''}
                    >
                      <RoleBadge role={m.role} />
                    </button>
                  )}

                  {(canManageMembers || isSelf) && (
                    <button
                      onClick={() => removeMember(m.id, isSelf)}
                      title={isSelf ? '退出项目' : '移除成员'}
                      className="text-ink-300 hover:text-red-600 transition-colors p-2 ml-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d={isSelf
                            ? 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
                            : 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2'} />
                      </svg>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {showInvite && (
        <InviteMemberModal
          projectId={projectId}
          onClose={() => setShowInvite(false)}
          onInvited={load}
        />
      )}
    </>
  )
}
