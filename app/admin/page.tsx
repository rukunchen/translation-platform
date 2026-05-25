'use client'

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { apiJSON } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'

type CreatedUser = {
  id: string
  email: string
  name: string
}

type DirectoryMember = {
  id: string
  email: string | null
  name: string | null
  avatar_url: string | null
  created_at: string | null
  updated_at: string | null
  isPlatformAdmin: boolean
  platformAdminRole: 'owner' | 'admin' | null
  isDisabled: boolean
  bannedUntil: string | null
  authExists: boolean
}

type AdminOverview = {
  members: number
  projects: number
  documents: number
  pendingInvitations: number
}

type AdminProject = {
  id: string
  name: string
  description: string | null
  creator: { email: string | null; name: string | null } | null
  createdAt: string
  latestActivityAt: string | null
  memberCount: number
  managerCount: number
  documentCount: number
  members: AdminProjectMember[]
}

type AdminProjectMember = {
  id: string
  userId: string
  role: 'manager' | 'translator' | 'reviewer'
  email: string | null
  name: string | null
}

type AdminDocumentActivity = {
  id: string
  title: string
  projectName: string
  createdAt: string
  updatedAt: string
}

type AdminInvitationActivity = {
  id: string
  inviteeEmail: string
  role: 'translator' | 'reviewer'
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  projectName: string
  inviter: { email: string | null; name: string | null } | null
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
}

type AdminAuditLog = {
  id: string
  actorId: string | null
  actorEmail: string | null
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  projectId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

const overviewMetrics = [
  {
    key: 'members',
    eyebrow: 'Members',
    label: '平台成员',
    detail: '可登录的平台账号',
  },
  {
    key: 'projects',
    eyebrow: 'Projects',
    label: '项目',
    detail: '平台内翻译项目',
  },
  {
    key: 'documents',
    eyebrow: 'Documents',
    label: '文档',
    detail: '项目中的翻译文档',
  },
  {
    key: 'pendingInvitations',
    eyebrow: 'Invites',
    label: '待接受邀请',
    detail: '仍在有效期内',
  },
] as const

const adminContentStyle: CSSProperties = {
  padding: '56px clamp(32px, 5vw, 80px)',
}

const adminPanelHeaderStyle: CSSProperties = {
  padding: '24px 40px',
}

const adminTableScrollerStyle: CSSProperties = {
  paddingLeft: 28,
  paddingRight: 28,
}

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberPassword, setMemberPassword] = useState('')
  const [creatingMember, setCreatingMember] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null)
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberNotice, setMemberNotice] = useState('')
  const [memberActionId, setMemberActionId] = useState<string | null>(null)
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<DirectoryMember | null>(null)
  const [editingMemberName, setEditingMemberName] = useState('')
  const [editingMemberEmail, setEditingMemberEmail] = useState('')
  const [editingMemberPassword, setEditingMemberPassword] = useState('')
  const [editingMemberSaving, setEditingMemberSaving] = useState(false)
  const [editingMemberError, setEditingMemberError] = useState('')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState('')
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [projectNotice, setProjectNotice] = useState('')
  const [projectRoleSavingId, setProjectRoleSavingId] = useState<string | null>(null)
  const [documentActivity, setDocumentActivity] = useState<AdminDocumentActivity[]>([])
  const [documentActivityLoading, setDocumentActivityLoading] = useState(false)
  const [documentActivityError, setDocumentActivityError] = useState('')
  const [invitationActivity, setInvitationActivity] = useState<AdminInvitationActivity[]>([])
  const [invitationActivityLoading, setInvitationActivityLoading] = useState(false)
  const [invitationActivityError, setInvitationActivityError] = useState('')
  const [invitationNotice, setInvitationNotice] = useState('')
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditLogsError, setAuditLogsError] = useState('')

  useEffect(() => {
    let alive = true

    supabase.auth.getUser().then(async ({ data: { user: currentUser } }) => {
      if (!alive) return
      if (!currentUser) {
        router.replace('/?next=/admin')
        return
      }

      const { data } = await apiJSON<{ isAdmin: boolean }>('/api/admin/me')
      if (!alive) return
      setIsAdmin(Boolean(data?.isAdmin))
      setLoading(false)
    })

    return () => { alive = false }
  }, [router])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    setMembersError('')

    const { data, error } = await apiJSON<{ members: DirectoryMember[] }>('/api/admin/users')
    setMembersLoading(false)
    if (error || !data) {
      setMembersError(error || '加载成员列表失败')
      return
    }

    setMembers(data.members || [])
  }, [])

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError('')

    const { data, error } = await apiJSON<{ overview: AdminOverview }>('/api/admin/overview')
    setOverviewLoading(false)
    if (error || !data) {
      setOverviewError(error || '加载管理概览失败')
      return
    }

    setOverview(data.overview)
  }, [])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    setProjectsError('')

    const { data, error } = await apiJSON<{ projects: AdminProject[] }>('/api/admin/projects')
    setProjectsLoading(false)
    if (error || !data) {
      setProjectsError(error || '加载项目参与情况失败')
      return
    }

    setProjects(data.projects || [])
  }, [])

  const loadDocumentActivity = useCallback(async () => {
    setDocumentActivityLoading(true)
    setDocumentActivityError('')

    const { data, error } = await apiJSON<{ documents: AdminDocumentActivity[] }>('/api/admin/activity/documents')
    setDocumentActivityLoading(false)
    if (error || !data) {
      setDocumentActivityError(error || '加载最近文档更新失败')
      return
    }

    setDocumentActivity(data.documents || [])
  }, [])

  const loadInvitationActivity = useCallback(async () => {
    setInvitationActivityLoading(true)
    setInvitationActivityError('')

    const { data, error } = await apiJSON<{ invitations: AdminInvitationActivity[] }>('/api/admin/activity/invitations')
    setInvitationActivityLoading(false)
    if (error || !data) {
      setInvitationActivityError(error || '加载邀请动态失败')
      return
    }

    setInvitationActivity(data.invitations || [])
  }, [])

  const loadAuditLogs = useCallback(async () => {
    setAuditLogsLoading(true)
    setAuditLogsError('')

    const { data, error } = await apiJSON<{ logs: AdminAuditLog[] }>('/api/admin/audit-logs?limit=30')
    setAuditLogsLoading(false)
    if (error || !data) {
      setAuditLogsError(error || '加载操作记录失败')
      return
    }

    setAuditLogs(data.logs || [])
  }, [])

  const visibleMembers = useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase()
    if (!query) return members
    return members.filter(member => (
      member.name?.toLocaleLowerCase().includes(query)
      || member.email?.toLocaleLowerCase().includes(query)
    ))
  }, [memberSearch, members])

  useEffect(() => {
    if (!isAdmin) return
    const timer = window.setTimeout(() => {
      void loadMembers()
      void loadOverview()
      void loadProjects()
      void loadDocumentActivity()
      void loadInvitationActivity()
      void loadAuditLogs()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isAdmin, loadAuditLogs, loadDocumentActivity, loadInvitationActivity, loadMembers, loadOverview, loadProjects])

  const createMember = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCreatingMember(true)
    setCreateError('')
    setCreatedUser(null)

    const { data, error } = await apiJSON<{ user: CreatedUser }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        name: memberName,
        email: memberEmail,
        password: memberPassword,
      }),
    })

    setCreatingMember(false)
    if (error || !data) {
      setCreateError(error || '创建账号失败')
      return
    }

    setCreatedUser(data.user)
    setMemberName('')
    setMemberEmail('')
    setMemberPassword('')
    await Promise.all([loadMembers(), loadOverview(), loadAuditLogs()])
  }

  const openMemberEditor = (member: DirectoryMember) => {
    setEditingMember(member)
    setEditingMemberName(member.name || '')
    setEditingMemberEmail(member.email || '')
    setEditingMemberPassword('')
    setEditingMemberError('')
    setMemberNotice('')
  }

  const updateMemberProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingMember) return

    setEditingMemberSaving(true)
    setEditingMemberError('')
    setMembersError('')
    const payload: { name: string; email: string; password?: string } = {
      name: editingMemberName,
      email: editingMemberEmail,
    }
    if (editingMemberPassword) payload.password = editingMemberPassword

    const { data, error } = await apiJSON<{ member: DirectoryMember }>(`/api/admin/users/${editingMember.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    setEditingMemberSaving(false)

    if (error || !data) {
      setEditingMemberError(error || '保存成员资料失败')
      return
    }

    setMembers(current => current.map(member => member.id === data.member.id ? data.member : member))
    setEditingMember(null)
    setMemberNotice(`已更新 ${data.member.name || data.member.email || '成员'} 的姓名。`)
    await loadAuditLogs()
  }

  const toggleMemberDisabled = async (member: DirectoryMember) => {
    if (member.isPlatformAdmin) {
      setMemberNotice('平台管理员账号受保护，不能在成员列表中禁用。')
      return
    }
    const nextDisabled = !member.isDisabled
    const label = member.name || member.email || '该成员'
    if (!confirm(`确认${nextDisabled ? '禁用' : '启用'} ${label} 的登录账号？`)) return

    setMemberActionId(member.id)
    setMemberNotice('')
    setMembersError('')
    const { data, error } = await apiJSON<{ member: DirectoryMember }>(`/api/admin/users/${member.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: nextDisabled }),
    })
    setMemberActionId(null)
    if (error || !data) {
      setMembersError(error || '更新成员状态失败')
      return
    }
    setMembers(current => current.map(item => item.id === data.member.id ? data.member : item))
    setMemberNotice(`已${nextDisabled ? '禁用' : '启用'} ${data.member.name || data.member.email || '成员'}。`)
    await loadAuditLogs()
  }

  const deleteMember = async (member: DirectoryMember) => {
    if (member.isPlatformAdmin) {
      setMemberNotice('平台管理员账号受保护，不能在成员列表中删除。')
      return
    }
    const label = member.name || member.email || '该成员'
    if (!confirm(`确认永久删除 ${label} 的账号？此操作会移除其登录账号和个人资料。`)) return

    setDeletingMemberId(member.id)
    setMemberNotice('')
    setMembersError('')
    const { error } = await apiJSON(`/api/admin/users/${member.id}`, { method: 'DELETE' })
    setDeletingMemberId(null)
    if (error) {
      setMembersError(error)
      return
    }
    setMembers(current => current.filter(item => item.id !== member.id))
    setMemberNotice(`已删除 ${label} 的账号。`)
    await Promise.all([loadOverview(), loadProjects(), loadAuditLogs()])
  }

  const updateProjectMemberRole = async (
    project: AdminProject,
    member: AdminProjectMember,
    role: AdminProjectMember['role']
  ) => {
    if (member.role === role) return
    setProjectRoleSavingId(member.id)
    setProjectsError('')
    setProjectNotice('')
    const { error } = await apiJSON(`/api/projects/${project.id}/members/${member.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    setProjectRoleSavingId(null)
    if (error) {
      setProjectsError(error)
      return
    }
    setProjectNotice(`已更新 ${member.name || member.email || '成员'} 在「${project.name}」中的角色。`)
    await Promise.all([loadProjects(), loadAuditLogs()])
  }

  const updateInvitation = async (invitation: AdminInvitationActivity, action: 'revoke' | 'resend') => {
    if (action === 'revoke' && !confirm(`确认撤销发给 ${invitation.inviteeEmail} 的邀请？`)) return

    setInvitationActionId(`${invitation.id}:${action}`)
    setInvitationActivityError('')
    setInvitationNotice('')
    const { data, error } = await apiJSON<{ emailSent?: boolean; emailError?: string | null }>(
      `/api/admin/invitations/${invitation.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      }
    )
    setInvitationActionId(null)
    if (error) {
      setInvitationActivityError(error)
      return
    }

    if (action === 'revoke') {
      setInvitationNotice(`已撤销发给 ${invitation.inviteeEmail} 的邀请。`)
    } else if (data?.emailSent === false) {
      setInvitationNotice(`已生成新的邀请链接，但邮件发送失败：${data.emailError || '未知错误'}`)
    } else {
      setInvitationNotice(`已重发发给 ${invitation.inviteeEmail} 的邀请。`)
    }
    await Promise.all([loadInvitationActivity(), loadOverview(), loadAuditLogs()])
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-sm text-ink-600">
        加载管理控制台...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <Card padding="lg" className="max-w-lg text-center">
          <Eyebrow tone="muted" className="mb-3">Admin Access</Eyebrow>
          <h1 className="font-serif text-2xl text-ink-900">你没有权限访问管理控制台。</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">管理控制台仅限平台管理员使用。</p>
          <Button className="mt-7" variant="secondary" onClick={() => router.push('/dashboard')}>
            返回工作台
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto p-3 sm:p-5">
        <div className="min-h-[calc(100vh-24px)] rounded-2xl border border-line bg-white sm:min-h-[calc(100vh-40px)]">
          <div className="mx-auto w-full max-w-7xl" style={adminContentStyle}>
            <PageHeader
              backHref="/dashboard"
              backLabel="返回工作台"
              eyebrow="Platform Admin"
              title="管理控制台"
              description="固定平台管理员用于管理成员、观察活动与查看项目参与情况。"
            />

            <section className="mb-4">
              {overviewError && (
                <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                  {overviewError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {overviewMetrics.map(metric => (
                  <Card key={metric.key} padding="lg" variant="surface">
                    <Eyebrow tone="muted" className="mb-3">{metric.eyebrow}</Eyebrow>
                    <p className="font-serif text-3xl text-ink-900">
                      {overviewLoading || !overview ? '--' : overview[metric.key].toLocaleString('zh-CN')}
                    </p>
                    <h2 className="mt-4 text-sm font-medium text-ink-900">{metric.label}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">{metric.detail}</p>
                  </Card>
                ))}
              </div>
            </section>

            <section className="mb-4">
              <Card padding="lg">
                <Eyebrow tone="muted" className="mb-3">Members</Eyebrow>
                <div className="max-w-2xl">
                  <h2 className="font-serif text-xl text-ink-900">成员创建</h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink-600">
                    创建可以直接登录的平台账号。账号邮箱会在创建时标记为已确认。
                  </p>
                </div>

                <form onSubmit={createMember} className="mt-7 max-w-2xl space-y-5">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <Input
                      label="姓名"
                      value={memberName}
                      onChange={e => setMemberName(e.target.value)}
                      placeholder="新成员姓名"
                      required
                    />
                    <Input
                      label="邮箱"
                      type="email"
                      value={memberEmail}
                      onChange={e => setMemberEmail(e.target.value)}
                      placeholder="member@example.com"
                      required
                    />
                  </div>
                  <Input
                    label="初始密码"
                    type="password"
                    value={memberPassword}
                    onChange={e => setMemberPassword(e.target.value)}
                    placeholder="至少 6 位"
                    minLength={6}
                    required
                  />

                  {createError && (
                    <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                      {createError}
                    </div>
                  )}
                  {createdUser && (
                    <div className="rounded-xl border border-green-100 bg-green-50 px-5 py-3 text-sm text-green-700">
                      已创建 {createdUser.name}（{createdUser.email}）的账号。
                    </div>
                  )}

                  <Button type="submit" loading={creatingMember}>
                    {creatingMember ? '创建中...' : '创建账号'}
                  </Button>
                </form>
              </Card>
            </section>

            <section className="mb-4">
              <Card padding="none" className="overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-line sm:flex-row sm:items-end sm:justify-between" style={adminPanelHeaderStyle}>
                  <div>
                    <Eyebrow tone="muted" className="mb-3">Directory</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">成员列表</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      平台账号基础资料与创建时间。
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[280px] sm:items-end">
                    <Input
                      label="搜索成员"
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="姓名或邮箱"
                      inputClassName="text-sm"
                    />
                    <span className="text-sm text-ink-500">
                      {memberSearch.trim() ? `${visibleMembers.length} / ${members.length}` : members.length} 位成员
                    </span>
                  </div>
                </div>

                {memberNotice && (
                  <div className="border-b border-line px-7 py-4">
                    <div className="rounded-xl border border-green-100 bg-green-50 px-5 py-3 text-sm text-green-700">
                      {memberNotice}
                    </div>
                  </div>
                )}

                {membersError ? (
                  <div className="px-7 py-6">
                    <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                      {membersError}
                    </div>
                  </div>
                ) : membersLoading ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">加载成员列表...</div>
                ) : members.length === 0 ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">还没有可显示的成员。</div>
                ) : visibleMembers.length === 0 ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">没有匹配的成员。</div>
                ) : (
                  <div className="overflow-x-auto" style={adminTableScrollerStyle}>
                    <div className="grid min-w-[980px] grid-cols-[minmax(280px,1fr)_150px_110px_100px_220px] gap-5 border-b border-line bg-canvas/60 px-7 py-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
                      <div>成员</div>
                      <div>创建时间</div>
                      <div>身份</div>
                      <div>状态</div>
                      <div>操作</div>
                    </div>
                    {visibleMembers.map((member, index) => {
                      const memberName = member.name || member.email?.split('@')[0] || '未命名成员'
                      const initial = (memberName[0] || '?').toUpperCase()
                      const protectedAdmin = member.isPlatformAdmin
                      return (
                        <div
                          key={member.id}
                          className={`grid min-w-[980px] grid-cols-[minmax(280px,1fr)_150px_110px_100px_220px] items-center gap-5 px-7 py-5 ${index > 0 ? 'border-t border-line' : ''}`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink-900">{memberName}</p>
                              <p className="mt-1 truncate font-mono text-xs text-ink-500">
                                {member.email || '未提供邮箱'}
                              </p>
                            </div>
                          </div>
                          <div className="text-sm text-ink-600">{formatProfileDate(member.created_at)}</div>
                          <div>
                            <span className="inline-flex rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-ink-600">
                              {member.isPlatformAdmin ? (member.platformAdminRole === 'owner' ? '平台所有者' : '平台管理员') : '成员'}
                            </span>
                          </div>
                          <div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] ${member.isDisabled ? 'border-red-100 bg-red-50 text-red-700' : 'border-green-100 bg-green-50 text-green-700'}`}>
                              {member.isDisabled ? '已禁用' : '正常'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openMemberEditor(member)}>
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={protectedAdmin}
                              loading={memberActionId === member.id}
                              title={protectedAdmin ? '平台管理员账号受保护' : undefined}
                              onClick={() => { void toggleMemberDisabled(member) }}
                            >
                              {member.isDisabled ? '启用' : '禁用'}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={protectedAdmin}
                              loading={deletingMemberId === member.id}
                              title={protectedAdmin ? '平台管理员账号受保护' : undefined}
                              onClick={() => { void deleteMember(member) }}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </section>

            <section className="mb-4">
              <Card padding="none" className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between" style={adminPanelHeaderStyle}>
                  <div>
                    <Eyebrow tone="muted" className="mb-3">Audit Log</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">操作记录</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      记录管理员对账号和项目成员角色做出的关键变更。
                    </p>
                  </div>
                  <span className="text-sm text-ink-500">{auditLogs.length} 条记录</span>
                </div>

                {auditLogsError ? (
                  <div className="px-7 py-6">
                    <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                      {auditLogsError}
                    </div>
                  </div>
                ) : auditLogsLoading ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">加载操作记录...</div>
                ) : auditLogs.length === 0 ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">还没有管理员操作记录。</div>
                ) : (
                  <div className="divide-y divide-line">
                    {auditLogs.map(log => (
                      <article key={log.id} className="grid gap-3 px-7 py-5 md:grid-cols-[minmax(0,1fr)_190px] md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-ink-600">
                              {auditActionLabel(log.action)}
                            </span>
                            <p className="truncate text-sm font-medium text-ink-900">
                              {log.targetLabel || log.targetId || '未知对象'}
                            </p>
                          </div>
                          <p className="mt-2 text-xs text-ink-500">{auditMetadataSummary(log)}</p>
                          <p className="mt-1 truncate font-mono text-[11px] text-ink-400">
                            {log.actorEmail || '未知管理员'}
                          </p>
                        </div>
                        <div className="text-sm text-ink-600 md:text-right">
                          {formatAdminDateTime(log.createdAt)}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section className="mb-4">
              <Card padding="none" className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between" style={adminPanelHeaderStyle}>
                  <div>
                    <Eyebrow tone="muted" className="mb-3">Invitations</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">邀请动态</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      查看最近发出的项目邀请及当前状态。
                    </p>
                  </div>
                  <span className="text-sm text-ink-500">{invitationActivity.length} 条邀请</span>
                </div>

                {invitationNotice && (
                  <div className="border-b border-line px-7 py-4">
                    <div className="rounded-xl border border-green-100 bg-green-50 px-5 py-3 text-sm text-green-700">
                      {invitationNotice}
                    </div>
                  </div>
                )}

                {invitationActivityError ? (
                  <div className="px-7 py-6">
                    <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                      {invitationActivityError}
                    </div>
                  </div>
                ) : invitationActivityLoading ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">加载邀请动态...</div>
                ) : invitationActivity.length === 0 ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">还没有邀请记录。</div>
                ) : (
                  <div className="overflow-x-auto" style={adminTableScrollerStyle}>
                    <div className="grid min-w-[1100px] grid-cols-[minmax(250px,1fr)_minmax(180px,0.8fr)_120px_110px_150px_170px] gap-5 border-b border-line bg-canvas/60 px-7 py-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
                      <div>受邀成员</div>
                      <div>项目 / 邀请人</div>
                      <div>角色</div>
                      <div>状态</div>
                      <div>时间</div>
                      <div>操作</div>
                    </div>
                    {invitationActivity.map((invitation, index) => {
                      const canRevoke = invitation.status === 'pending'
                      const canResend = invitation.status !== 'accepted'
                      return (
                        <div
                          key={invitation.id}
                          className={`grid min-w-[1100px] grid-cols-[minmax(250px,1fr)_minmax(180px,0.8fr)_120px_110px_150px_170px] items-center gap-5 px-7 py-5 ${index > 0 ? 'border-t border-line' : ''}`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm text-ink-900">{invitation.inviteeEmail}</p>
                            <p className="mt-1 text-xs text-ink-500">
                              过期于 {formatAdminDate(invitation.expiresAt)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-900">{invitation.projectName}</p>
                            <p className="mt-1 truncate text-xs text-ink-500">{invitationSenderName(invitation)}</p>
                          </div>
                          <div className="text-sm text-ink-700">{invitationRoleLabel(invitation.role)}</div>
                          <div>
                            <span className={invitationStatusClass(invitation.status)}>
                              {invitationStatusLabel(invitation.status)}
                            </span>
                          </div>
                          <div className="text-sm text-ink-600">
                            <p>{formatAdminDateTime(invitation.createdAt)}</p>
                            {invitation.acceptedAt && (
                              <p className="mt-1 text-xs text-ink-500">
                                接受于 {formatAdminDate(invitation.acceptedAt)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!canResend}
                              loading={invitationActionId === `${invitation.id}:resend`}
                              title={canResend ? undefined : '已接受的邀请不能重发'}
                              onClick={() => { void updateInvitation(invitation, 'resend') }}
                            >
                              重发
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={!canRevoke}
                              loading={invitationActionId === `${invitation.id}:revoke`}
                              title={canRevoke ? undefined : '只能撤销待接受邀请'}
                              onClick={() => { void updateInvitation(invitation, 'revoke') }}
                            >
                              撤销
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </section>

            <section className="mb-4">
              <Card padding="none" className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between" style={adminPanelHeaderStyle}>
                  <div>
                    <Eyebrow tone="muted" className="mb-3">Projects</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">项目参与情况</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      按成员、文档和最近文档更新观察平台项目。
                    </p>
                  </div>
                  <span className="text-sm text-ink-500">{projects.length} 个项目</span>
                </div>

                {projectNotice && (
                  <div className="border-b border-line px-7 py-4">
                    <div className="rounded-xl border border-green-100 bg-green-50 px-5 py-3 text-sm text-green-700">
                      {projectNotice}
                    </div>
                  </div>
                )}

                {projectsError ? (
                  <div className="px-7 py-6">
                    <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                      {projectsError}
                    </div>
                  </div>
                ) : projectsLoading ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">加载项目参与情况...</div>
                ) : projects.length === 0 ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">还没有可观察的项目。</div>
                ) : (
                  <div className="overflow-x-auto" style={adminTableScrollerStyle}>
                    <div className="grid min-w-[1180px] grid-cols-[minmax(260px,0.85fr)_170px_90px_90px_minmax(330px,1fr)_130px] gap-5 border-b border-line bg-canvas/60 px-7 py-4 text-[11px] font-medium uppercase tracking-wider text-ink-500">
                      <div>项目</div>
                      <div>创建人</div>
                      <div>成员</div>
                      <div>文档</div>
                      <div>成员角色</div>
                      <div>最近更新</div>
                    </div>
                    {projects.map((project, index) => (
                      <div
                        key={project.id}
                        className={`grid min-w-[1180px] grid-cols-[minmax(260px,0.85fr)_170px_90px_90px_minmax(330px,1fr)_130px] items-start gap-5 px-7 py-5 ${index > 0 ? 'border-t border-line' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{project.name}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-ink-500">
                            {project.description || '暂无项目描述'}
                          </p>
                          <p className="mt-1 text-xs text-ink-500">创建于 {formatAdminDate(project.createdAt)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink-700">{projectCreatorName(project)}</p>
                          <p className="mt-1 truncate font-mono text-xs text-ink-500">
                            {project.creator?.email || '未记录邮箱'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-ink-900">{project.memberCount}</p>
                          <p className="mt-1 text-xs text-ink-500">{project.managerCount} 位经理</p>
                        </div>
                        <div className="text-sm text-ink-700">{project.documentCount}</div>
                        <div className="space-y-2">
                          {project.members.length === 0 ? (
                            <p className="text-sm text-ink-500">暂无成员</p>
                          ) : project.members.map(member => (
                            <div key={member.id} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm text-ink-800">{member.name || member.email || '未命名成员'}</p>
                                <p className="truncate font-mono text-[11px] text-ink-500">{member.email || '未提供邮箱'}</p>
                              </div>
                              <Select
                                value={member.role}
                                onChange={e => { void updateProjectMemberRole(project, member, e.target.value as AdminProjectMember['role']) }}
                                disabled={projectRoleSavingId === member.id}
                                inputClassName="text-xs"
                                style={{ paddingLeft: 10, paddingRight: 30, paddingTop: 7, paddingBottom: 7 }}
                              >
                                <option value="manager">经理</option>
                                <option value="translator">译员</option>
                                <option value="reviewer">审校</option>
                              </Select>
                            </div>
                          ))}
                        </div>
                        <div className="text-sm text-ink-600">{formatAdminDate(project.latestActivityAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section className="mb-4">
              <Card padding="none" className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between" style={adminPanelHeaderStyle}>
                  <div>
                    <Eyebrow tone="muted" className="mb-3">Activity</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">最近文档更新</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      观察最近被创建或修改的项目文档。
                    </p>
                  </div>
                  <span className="text-sm text-ink-500">{documentActivity.length} 条记录</span>
                </div>

                {documentActivityError ? (
                  <div className="px-7 py-6">
                    <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                      {documentActivityError}
                    </div>
                  </div>
                ) : documentActivityLoading ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">加载最近文档更新...</div>
                ) : documentActivity.length === 0 ? (
                  <div className="px-7 py-12 text-center text-sm text-ink-500">还没有文档更新记录。</div>
                ) : (
                  <div className="divide-y divide-line" style={adminTableScrollerStyle}>
                    {documentActivity.map(document => (
                      <article key={document.id} className="grid gap-3 px-7 py-5 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{document.title}</p>
                          <p className="mt-1 truncate text-xs text-ink-500">{document.projectName}</p>
                        </div>
                        <div className="text-sm text-ink-600 md:text-right">
                          <p>{formatAdminDateTime(document.updatedAt)}</p>
                          <p className="mt-1 text-xs text-ink-500">
                            创建于 {formatAdminDate(document.createdAt)}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          </div>
        </div>
      </main>
      {editingMember && (
        <MemberProfileModal
          member={editingMember}
          name={editingMemberName}
          email={editingMemberEmail}
          password={editingMemberPassword}
          error={editingMemberError}
          saving={editingMemberSaving}
          onNameChange={setEditingMemberName}
          onEmailChange={setEditingMemberEmail}
          onPasswordChange={setEditingMemberPassword}
          onClose={() => setEditingMember(null)}
          onSubmit={updateMemberProfile}
        />
      )}
    </div>
  )
}

function formatProfileDate(value: string | null): string {
  return formatAdminDate(value)
}

function formatAdminDate(value: string | null): string {
  if (!value) return '未知'
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatAdminDateTime(value: string | null): string {
  if (!value) return '未知'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function projectCreatorName(project: AdminProject): string {
  return project.creator?.name || project.creator?.email?.split('@')[0] || '未知创建人'
}

function invitationSenderName(invitation: AdminInvitationActivity): string {
  return invitation.inviter?.name || invitation.inviter?.email || '未知邀请人'
}

function invitationRoleLabel(role: AdminInvitationActivity['role']): string {
  return role === 'reviewer' ? '审校' : '译员'
}

function invitationStatusLabel(status: AdminInvitationActivity['status']): string {
  return {
    pending: '待接受',
    accepted: '已接受',
    declined: '已拒绝',
    expired: '已过期',
  }[status]
}

function invitationStatusClass(status: AdminInvitationActivity['status']): string {
  const statusClass = {
    pending: 'border-amber-100 bg-amber-50 text-amber-800',
    accepted: 'border-green-100 bg-green-50 text-green-700',
    declined: 'border-line bg-canvas text-ink-600',
    expired: 'border-red-100 bg-red-50 text-red-700',
  }[status]
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] ${statusClass}`
}

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'admin.user.create': '创建账号',
    'admin.user.update_profile': '更新资料',
    'admin.user.update_email': '修改邮箱',
    'admin.user.reset_password': '重置密码',
    'admin.user.disable': '禁用账号',
    'admin.user.enable': '启用账号',
    'admin.user.delete': '删除账号',
    'admin.project_member.update_role': '调整角色',
    'admin.invitation.revoke': '撤销邀请',
    'admin.invitation.resend': '重发邀请',
  }
  return labels[action] || action
}

function auditMetadataSummary(log: AdminAuditLog): string {
  const metadata = log.metadata || {}
  if (log.action === 'admin.user.create') {
    return `邮箱：${auditText(metadata.email)}`
  }
  if (log.action === 'admin.user.update_profile') {
    return `姓名：${auditText(metadata.oldName)} 改为 ${auditText(metadata.newName)}`
  }
  if (log.action === 'admin.user.update_email') {
    return `邮箱：${auditText(metadata.oldEmail)} 改为 ${auditText(metadata.newEmail)}`
  }
  if (log.action === 'admin.user.reset_password') {
    return '密码已被管理员重置'
  }
  if (log.action === 'admin.user.disable' || log.action === 'admin.user.enable') {
    return log.action === 'admin.user.disable' ? '账号登录已禁用' : '账号登录已恢复'
  }
  if (log.action === 'admin.user.delete') {
    return `邮箱：${auditText(metadata.email)}`
  }
  if (log.action === 'admin.project_member.update_role') {
    const projectName = auditText(metadata.projectName)
    return `${projectName}：${auditRoleLabel(metadata.oldRole)} 改为 ${auditRoleLabel(metadata.newRole)}`
  }
  if (log.action === 'admin.invitation.revoke') {
    return `收件人：${auditText(metadata.inviteeEmail)}，角色：${auditRoleLabel(metadata.role)}`
  }
  if (log.action === 'admin.invitation.resend') {
    const emailStatus = metadata.emailSent === false ? `，邮件失败：${auditText(metadata.emailError)}` : ''
    return `收件人：${auditText(metadata.inviteeEmail)}，角色：${auditRoleLabel(metadata.role)}${emailStatus}`
  }
  return `对象：${log.targetType}`
}

function auditText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '未记录'
}

function auditRoleLabel(value: unknown): string {
  const labels: Record<string, string> = {
    manager: '经理',
    translator: '译员',
    reviewer: '审校',
  }
  return labels[typeof value === 'string' ? value : ''] || auditText(value)
}

function MemberProfileModal({
  member,
  name,
  email,
  password,
  error,
  saving,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onClose,
  onSubmit,
}: {
  member: DirectoryMember
  name: string
  email: string
  password: string
  error: string
  saving: boolean
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}) {
  const accountLocked = member.isPlatformAdmin
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 40 }}>
        <Eyebrow className="mb-3">Profile</Eyebrow>
        <h2 className="font-serif text-2xl text-ink-900">编辑成员资料</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          当前账号邮箱：{member.email || '未提供邮箱'}
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <Input
            label="显示姓名"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            maxLength={80}
            placeholder="成员姓名"
            required
          />
          <Input
            label="登录邮箱"
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="member@example.com"
            disabled={accountLocked}
            required
          />
          <Input
            label="重置密码"
            type="password"
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            minLength={password ? 6 : undefined}
            placeholder={accountLocked ? '平台管理员账号受保护' : '留空则不修改'}
            disabled={accountLocked}
          />

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" type="button" fullWidth onClick={onClose}>
              取消
            </Button>
            <Button type="submit" fullWidth loading={saving}>
              {saving ? '保存中...' : '保存资料'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
