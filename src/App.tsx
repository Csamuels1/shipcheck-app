import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Download,
  Edit3,
  Flame,
  GripVertical,
  HelpCircle,
  FileText,
  FolderPlus,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  Rocket,
  Settings,
  Sparkles,
  Smartphone,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { AuthView } from './components/AuthView'
import { PricingView } from './components/PricingView'
import { LandingPage } from './components/LandingPage'
import { ResetPasswordView } from './components/ResetPasswordView'
import { useAuth } from './hooks/useAuth'
import { plans } from './lib/plans'
import { supabase, type AuthUser } from './lib/supabase'
import './App.css'

type ColumnKey = 'ship' | 'later' | 'cut'
type ItemStatus = 'not-started' | 'in-progress' | 'done'
type Confidence = 'low' | 'medium' | 'high'
type ProjectStatus = 'Planning' | 'Building' | 'Paused' | 'Shipped' | 'Archived'
type ProjectType = 'MVP/Product' | 'Client Project' | 'Internal Project' | 'Creator Project' | 'Other'
type ViewKey = 'dashboard' | 'projects' | 'scope' | 'logs' | 'reports' | 'pricing' | 'settings' | 'shipped'
type LegalPageKind = 'privacy' | 'terms'

type User = {
  name: string
  email: string
  builderType: string
  plan: string
  trialStartedAt: string
  onboardingForecastSeen: boolean
  notificationPreferences: {
    weeklyReport: boolean
    dailyReminder: boolean
  }
}

type BillingInfo = {
  status: string
  currentPeriodEnd: string
  seatLimit: number
  creemCustomerId: string
  creemSubscriptionId: string
}

type Project = {
  id: string
  name: string
  description: string
  type: ProjectType
  status: ProjectStatus
  startDate: string
  targetLaunchDate: string
  weeklyAvailableHours: number
  baselineLockedAt: string
  teamSize: number
  currentStreak: number
  longestStreak: number
}

type ScopeItem = {
  id: string
  projectId: string
  title: string
  description: string
  column: ColumnKey
  rankOrder: number
  estimateHours: number
  confidence: Confidence
  status: ItemStatus
  completedAt?: string
  existedAtBaseline: boolean
  approvedScopeChange: boolean
  createdAt: string
  addedReason: string
  movementHistory: Array<{
    from: ColumnKey
    to: ColumnKey
    changedAt: string
  }>
}

type BuildLog = {
  id: string
  projectId: string
  logDate: string
  minutesSpent: number
  summary: string
  blockers: string
  scopeItemId: string
  newScopeAdded: boolean
  createdAt: string
}

type AppData = {
  user: User
  billing: BillingInfo
  projects: Project[]
  activeProjectId: string
  scopeItems: ScopeItem[]
  logs: BuildLog[]
  onboarded: boolean
}

type ForecastMovement = {
  direction: 'improved' | 'worsened'
  days: number
}

type ShipMetrics = {
  shipItems: ScopeItem[]
  laterItems: ScopeItem[]
  cutItems: ScopeItem[]
  shipHours: number
  remainingShipHours: number
  completedShipHours: number
  loggedHours: number
  loggedVelocity: number
  completionVelocity: number
  forecastDate: Date
  forecastConfidence: 'Low' | 'Medium' | 'High'
  driftDays: number
  launchStatus: string
  addedItems: ScopeItem[]
  addedHours: number
  baselineScopeHours: number
  currentScopeHours: number
  scopeGrowthPercent: number
  forecastImpactDays: number
  weekHours: number
  todayHours: number
  averageDailyHours: number
  velocityTrend: 'up' | 'down' | 'flat'
  highEffortShipItems: ScopeItem[]
  lowConfidenceShipItems: ScopeItem[]
  unestimatedAddedItems: ScopeItem[]
  completedThisWeekItems: ScopeItem[]
  stalled: boolean
  insufficientData: boolean
}

const storageKey = 'shipcheck.mvp.data.v1'
const loadErrorKey = 'shipcheck.mvp.load-error'
const authNoticeKey = 'shipcheck.auth.notice'
const trialBannerDismissedKey = 'shipcheck.trial-upgrade.dismissed'
const creepDismissMs = 24 * 60 * 60 * 1000
const trialLengthDays = 30

const today = new Date()
const isoToday = today.toISOString().slice(0, 10)

const columnCopy: Record<
  ProjectType,
  Record<ColumnKey, { title: string; description: string }>
> = {
  'MVP/Product': {
    ship: { title: 'Ship', description: 'Required for launch.' },
    later: { title: 'Later', description: 'Useful, not launch-blocking.' },
    cut: { title: 'Cut', description: 'Remove unless reality changes.' },
  },
  'Client Project': {
    ship: { title: 'In Scope', description: 'Committed delivery scope.' },
    later: { title: 'Change Request', description: 'Needs approval or tradeoff.' },
    cut: { title: 'Out of Scope', description: 'Not part of this delivery.' },
  },
  'Internal Project': {
    ship: { title: 'Critical', description: 'Needed for internal rollout.' },
    later: { title: 'Useful', description: 'Helpful after launch.' },
    cut: { title: 'Not Now', description: 'Avoid for this cycle.' },
  },
  'Creator Project': {
    ship: { title: 'Launch Version', description: 'Needed to publish.' },
    later: { title: 'Bonus', description: 'Nice after launch.' },
    cut: { title: 'Distraction', description: 'Pulls focus from shipping.' },
  },
  Other: {
    ship: { title: 'Ship', description: 'Required for launch.' },
    later: { title: 'Later', description: 'Useful, not launch-blocking.' },
    cut: { title: 'Cut', description: 'Remove unless reality changes.' },
  },
}



const seedData: AppData = {
  user: {
    name: 'Ari Builder',
    email: 'ari@shipcheck.local',
    builderType: 'Solo builder',
    plan: 'Free Trial',
    trialStartedAt: isoToday,
    onboardingForecastSeen: false,
    notificationPreferences: {
      weeklyReport: true,
      dailyReminder: true,
    },
  },
  billing: {
    status: 'trialing',
    currentPeriodEnd: '',
    seatLimit: 1,
    creemCustomerId: '',
    creemSubscriptionId: '',
  },
  activeProjectId: 'project-1',
  onboarded: true,
  projects: [
    {
      id: 'project-1',
      name: 'Customer Portal MVP',
      description: 'A focused portal launch with account access, billing visibility, and support intake.',
      type: 'MVP/Product',
      status: 'Building',
      startDate: '2026-05-20',
      targetLaunchDate: '2026-06-14',
      weeklyAvailableHours: 18,
      baselineLockedAt: '2026-05-20',
      teamSize: 1,
      currentStreak: 0,
      longestStreak: 0,
    },
    {
      id: 'project-2',
      name: 'Internal Ops Cleanup',
      description: 'A small internal rollout for cleaning up weekly operations handoffs.',
      type: 'Internal Project',
      status: 'Planning',
      startDate: isoToday,
      targetLaunchDate: '2026-06-21',
      weeklyAvailableHours: 10,
      baselineLockedAt: isoToday,
      teamSize: 3,
      currentStreak: 0,
      longestStreak: 0,
    },
  ],
  scopeItems: [
    {
      id: 'scope-1',
      projectId: 'project-1',
      title: 'Account login and secure sessions',
      description: 'Email login, session persistence, and logout.',
      column: 'ship',
      rankOrder: 1,
      estimateHours: 10,
      confidence: 'high',
      status: 'done',
      completedAt: '2026-05-23',
      existedAtBaseline: true,
      approvedScopeChange: true,
      createdAt: '2026-05-20',
      addedReason: 'Launch requirement',
      movementHistory: [],
    },
    {
      id: 'scope-2',
      projectId: 'project-1',
      title: 'Project dashboard with launch status',
      description: 'Show project health, forecast, and next action.',
      column: 'ship',
      rankOrder: 2,
      estimateHours: 14,
      confidence: 'medium',
      status: 'in-progress',
      existedAtBaseline: true,
      approvedScopeChange: true,
      createdAt: '2026-05-20',
      addedReason: 'Launch requirement',
      movementHistory: [],
    },
    {
      id: 'scope-3',
      projectId: 'project-1',
      title: 'Daily build log',
      description: 'Fast progress logging with time spent and blockers.',
      column: 'ship',
      rankOrder: 3,
      estimateHours: 8,
      confidence: 'high',
      status: 'not-started',
      existedAtBaseline: true,
      approvedScopeChange: true,
      createdAt: '2026-05-20',
      addedReason: 'Launch requirement',
      movementHistory: [],
    },
    {
      id: 'scope-4',
      projectId: 'project-1',
      title: 'Client-facing report link',
      description: 'Share progress with external stakeholders.',
      column: 'later',
      rankOrder: 1,
      estimateHours: 12,
      confidence: 'medium',
      status: 'not-started',
      existedAtBaseline: false,
      approvedScopeChange: false,
      createdAt: '2026-05-25',
      addedReason: 'New stakeholder request',
      movementHistory: [],
    },
    {
      id: 'scope-5',
      projectId: 'project-1',
      title: 'Custom dashboard themes',
      description: 'Per-project theme customization.',
      column: 'cut',
      rankOrder: 1,
      estimateHours: 9,
      confidence: 'low',
      status: 'not-started',
      existedAtBaseline: false,
      approvedScopeChange: false,
      createdAt: '2026-05-26',
      addedReason: 'Nice idea, not needed for launch',
      movementHistory: [],
    },
  ],
  logs: [
    {
      id: 'log-1',
      projectId: 'project-1',
      logDate: '2026-05-23',
      minutesSpent: 180,
      summary: 'Finished login flow and account shell.',
      blockers: '',
      scopeItemId: 'scope-1',
      newScopeAdded: false,
      createdAt: '2026-05-23',
    },
    {
      id: 'log-2',
      projectId: 'project-1',
      logDate: '2026-05-24',
      minutesSpent: 150,
      summary: 'Built dashboard status cards and project summary.',
      blockers: 'Forecast copy still needs tightening.',
      scopeItemId: 'scope-2',
      newScopeAdded: false,
      createdAt: '2026-05-24',
    },
  ],
}

function loadData(): AppData {
  const stored = localStorage.getItem(storageKey)
  if (!stored) return applyWorkspaceStreaks(seedData)

  try {
    const parsed = JSON.parse(stored) as Partial<AppData> & { project?: Project }
    if (parsed.projects && parsed.activeProjectId) {
      return applyWorkspaceStreaks({
        ...seedData,
        ...parsed,
        user: {
          ...seedData.user,
          ...parsed.user,
          notificationPreferences: parsed.user?.notificationPreferences ?? seedData.user.notificationPreferences,
        },
        billing: {
          ...seedData.billing,
          ...parsed.billing,
        },
        projects: (parsed.projects ?? seedData.projects).map((project) => ({
          ...project,
          currentStreak: project.currentStreak ?? 0,
          longestStreak: project.longestStreak ?? 0,
        })),
        scopeItems: (parsed.scopeItems ?? []).map((item) => ({
          ...item,
          projectId: item.projectId ?? parsed.activeProjectId ?? seedData.activeProjectId,
          rankOrder: item.rankOrder ?? 1,
          description: item.description ?? '',
          completedAt: item.completedAt,
          movementHistory: item.movementHistory ?? [],
        })),
        logs: (parsed.logs ?? []).map((log) => ({
          ...log,
          projectId: log.projectId ?? parsed.activeProjectId ?? seedData.activeProjectId,
          newScopeAdded: log.newScopeAdded ?? false,
        })),
      } as AppData)
    }

    if (parsed.project) {
      return applyWorkspaceStreaks({
        user: {
          ...seedData.user,
          ...parsed.user,
          notificationPreferences: parsed.user?.notificationPreferences ?? seedData.user.notificationPreferences,
        },
        billing: {
          ...seedData.billing,
          ...parsed.billing,
        },
        projects: [{ ...parsed.project, currentStreak: parsed.project.currentStreak ?? 0, longestStreak: parsed.project.longestStreak ?? 0 }],
        activeProjectId: parsed.project.id,
        scopeItems: (parsed.scopeItems ?? []).map((item) => ({
          ...item,
          projectId: parsed.project?.id ?? 'project-1',
          rankOrder: item.rankOrder ?? 1,
          description: item.description ?? '',
          completedAt: item.completedAt,
          movementHistory: item.movementHistory ?? [],
        })),
        logs: (parsed.logs ?? []).map((log) => ({ ...log, projectId: parsed.project?.id ?? 'project-1', newScopeAdded: log.newScopeAdded ?? false })),
        onboarded: true,
      })
    }

    return applyWorkspaceStreaks(seedData)
  } catch {
    localStorage.setItem(loadErrorKey, 'ShipCheck could not read saved workspace data, so it loaded the demo workspace.')
    return applyWorkspaceStreaks(seedData)
  }
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  return Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000)
}

function formatDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getDaysUntil(value: string | Date) {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value
  return Math.ceil((date.getTime() - today.getTime()) / 86400000)
}

function getTrialDaysLeft(trialStartedAt: string) {
  return Math.max(0, trialLengthDays - Math.max(0, daysBetween(trialStartedAt, isoToday)))
}

function getTrialExpiryDate(trialStartedAt: string) {
  return addDays(new Date(`${trialStartedAt}T00:00:00`), trialLengthDays).toISOString().slice(0, 10)
}

function isFreeTrial(plan: string) {
  return plan === 'Free Trial'
}

function showsUpgradePrompt(plan: string) {
  return plan === 'Free Trial' || plan === 'Solo'
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function getCreepDismissKey(projectId: string) {
  return `shipcheck.scope-creep.dismissed-until.${projectId}`
}

function calculateProjectStreak(projectId: string, logs: BuildLog[]) {
  const logDates = Array.from(new Set(logs.filter((log) => log.projectId === projectId).map((log) => log.logDate))).sort((a, b) => b.localeCompare(a))
  if (logDates.length === 0) return 0

  const latestLogDate = logDates[0]
  const yesterday = addDays(today, -1).toISOString().slice(0, 10)
  if (latestLogDate !== isoToday && latestLogDate !== yesterday) return 0

  const dateSet = new Set(logDates)
  let streak = 0
  let cursor = latestLogDate
  while (dateSet.has(cursor)) {
    streak += 1
    cursor = addDays(new Date(`${cursor}T00:00:00`), -1).toISOString().slice(0, 10)
  }
  return streak
}

function applyProjectStreak(project: Project, logs: BuildLog[]) {
  const currentStreak = calculateProjectStreak(project.id, logs)
  return {
    ...project,
    currentStreak,
    longestStreak: Math.max(project.longestStreak, currentStreak),
  }
}

function applyWorkspaceStreaks(workspace: AppData): AppData {
  return {
    ...workspace,
    projects: workspace.projects.map((project) => applyProjectStreak(project, workspace.logs)),
  }
}

function createBlankProject(name: string, type: ProjectType, weeklyAvailableHours = 10): Project {
  return {
    id: uid('project'),
    name,
    description: '',
    type,
    status: 'Planning',
    startDate: isoToday,
    targetLaunchDate: addDays(today, 21).toISOString().slice(0, 10),
    weeklyAvailableHours,
    baselineLockedAt: isoToday,
    teamSize: 1,
    currentStreak: 0,
    longestStreak: 0,
  }
}

function calculateForecastDate(project: Project, scopeItems: ScopeItem[], logs: BuildLog[]) {
  const shipItems = scopeItems.filter((item) => item.projectId === project.id && item.column === 'ship')
  const remainingShipHours = shipItems
    .filter((item) => item.status !== 'done')
    .reduce((sum, item) => sum + item.estimateHours, 0)
  const completedShipHours = shipItems
    .filter((item) => item.status === 'done')
    .reduce((sum, item) => sum + item.estimateHours, 0)
  const projectLogs = logs.filter((log) => log.projectId === project.id)
  const loggedHours = projectLogs.reduce((sum, log) => sum + log.minutesSpent / 60, 0)
  const activeDays = Math.max(1, daysBetween(project.startDate, isoToday) + 1)
  const activeWeeks = Math.max(activeDays / 7, 1)
  const loggedVelocity = loggedHours / activeWeeks
  const completionVelocity = completedShipHours > 0 ? completedShipHours / activeWeeks : 0
  const velocity =
    completionVelocity > 0
      ? completionVelocity
      : loggedVelocity > 0
        ? loggedVelocity
        : project.weeklyAvailableHours
  const forecastDays = remainingShipHours === 0 ? 0 : Math.ceil((remainingShipHours / Math.max(velocity, 1)) * 7)
  return addDays(today, forecastDays)
}

function mapProjectFromDb(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    type: String(row.type ?? 'MVP/Product') as ProjectType,
    status: String(row.status ?? 'Planning') as ProjectStatus,
    startDate: String(row.start_date ?? isoToday),
    targetLaunchDate: String(row.target_launch_date ?? isoToday),
    weeklyAvailableHours: Number(row.weekly_available_hours ?? 10),
    baselineLockedAt: String(row.baseline_locked_at ?? isoToday),
    teamSize: Number(row.team_size ?? 1),
    currentStreak: Number(row.current_streak ?? 0),
    longestStreak: Number(row.longest_streak ?? 0),
  }
}

function mapScopeItemFromDb(row: Record<string, unknown>): ScopeItem {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    column: String(row.column_key ?? 'ship') as ColumnKey,
    rankOrder: Number(row.rank_order ?? 1),
    estimateHours: Number(row.estimate_hours ?? 1),
    confidence: String(row.confidence ?? 'medium') as Confidence,
    status: String(row.status ?? 'not-started') as ItemStatus,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    existedAtBaseline: Boolean(row.existed_at_baseline),
    approvedScopeChange: Boolean(row.approved_scope_change),
    createdAt: String(row.created_at ?? isoToday).slice(0, 10),
    addedReason: String(row.added_reason ?? ''),
    movementHistory: Array.isArray(row.movement_history) ? (row.movement_history as ScopeItem['movementHistory']) : [],
  }
}

function mapBuildLogFromDb(row: Record<string, unknown>): BuildLog {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    logDate: String(row.log_date ?? isoToday),
    minutesSpent: Number(row.minutes_spent ?? 0),
    summary: String(row.summary ?? ''),
    blockers: String(row.blockers ?? ''),
    scopeItemId: row.scope_item_id ? String(row.scope_item_id) : '',
    newScopeAdded: Boolean(row.new_scope_added),
    createdAt: String(row.created_at ?? isoToday).slice(0, 10),
  }
}

async function getPrimaryOrganizationId(userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data?.organization_id) throw new Error('No organization workspace found for this user.')
  return String(data.organization_id)
}

async function loadRemoteWorkspace(user: AuthUser): Promise<AppData> {
  if (!supabase) return seedData

  const organizationId = await getPrimaryOrganizationId(user.id)
  const [
    { data: profile, error: profileError },
    { data: projects, error: projectsError },
    { data: billing, error: billingError },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('projects').select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
    supabase.from('billing_subscriptions').select('*').eq('organization_id', organizationId).maybeSingle(),
  ])

  if (profileError) throw profileError
  if (projectsError) throw projectsError
  if (billingError) throw billingError

  const projectRows = projects ?? []
  const projectIds = projectRows.map((project) => project.id)

  const [{ data: scopeItems, error: scopeError }, { data: logs, error: logsError }] =
    projectIds.length > 0
      ? await Promise.all([
          supabase.from('scope_items').select('*').in('project_id', projectIds).order('rank_order', { ascending: true }),
          supabase.from('build_logs').select('*').in('project_id', projectIds).order('log_date', { ascending: false }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]

  if (scopeError) throw scopeError
  if (logsError) throw logsError

  const mappedProjects = projectRows.map((project) => mapProjectFromDb(project))

  return {
    user: {
      name: String(profile?.name || user.user_metadata?.name || user.email || 'ShipCheck user'),
      email: String(profile?.email || user.email || ''),
      builderType: String(profile?.builder_type || 'Solo builder'),
      plan: String(billing?.plan || profile?.plan || 'Free Trial'),
      trialStartedAt: String(profile?.trial_started_at || isoToday).slice(0, 10),
      onboardingForecastSeen: Boolean(profile?.onboarding_forecast_seen),
      notificationPreferences: seedData.user.notificationPreferences,
    },
    billing: {
      status: String(billing?.status || 'trialing'),
      currentPeriodEnd: billing?.current_period_end ? String(billing.current_period_end).slice(0, 10) : '',
      seatLimit: Number(billing?.seat_limit || 1),
      creemCustomerId: String(billing?.creem_customer_id || ''),
      creemSubscriptionId: String(billing?.creem_subscription_id || ''),
    },
    projects: mappedProjects,
    activeProjectId: mappedProjects[0]?.id ?? '',
    scopeItems: mappedProjects.length > 0 ? (scopeItems ?? []).map((item) => mapScopeItemFromDb(item)) : [],
    logs: mappedProjects.length > 0 ? (logs ?? []).map((log) => mapBuildLogFromDb(log)) : [],
    onboarded: mappedProjects.length > 0,
  }
}

async function saveRemoteWorkspace(data: AppData, userId: string) {
  if (!supabase || data.projects.length === 0) return

  const organizationId = await getPrimaryOrganizationId(userId)
  const updatedAt = new Date().toISOString()

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      name: data.user.name,
      builder_type: data.user.builderType,
      plan: data.user.plan,
      onboarding_forecast_seen: data.user.onboardingForecastSeen,
      updated_at: updatedAt,
    })
    .eq('id', userId)
  if (profileError) throw profileError

  const projectRows = data.projects.map((project) => ({
    id: project.id,
    organization_id: organizationId,
    owner_id: userId,
    name: project.name,
    description: project.description,
    type: project.type,
    status: project.status,
    start_date: project.startDate,
    target_launch_date: project.targetLaunchDate,
    weekly_available_hours: project.weeklyAvailableHours,
    baseline_locked_at: project.baselineLockedAt,
    team_size: project.teamSize,
    current_streak: project.currentStreak,
    longest_streak: project.longestStreak,
    updated_at: updatedAt,
  }))

  const { error: projectError } = await supabase.from('projects').upsert(projectRows)
  if (projectError) throw projectError

  const { error: memberError } = await supabase.from('project_members').upsert(
    data.projects.map((project) => ({
      project_id: project.id,
      user_id: userId,
      role: 'owner',
    })),
    { onConflict: 'project_id,user_id' },
  )
  if (memberError) throw memberError

  if (data.scopeItems.length > 0) {
    const { error } = await supabase.from('scope_items').upsert(
      data.scopeItems.map((item) => ({
        id: item.id,
        project_id: item.projectId,
        title: item.title,
        description: item.description,
        column_key: item.column,
        rank_order: item.rankOrder,
        estimate_hours: item.estimateHours,
        confidence: item.confidence,
        status: item.status,
        existed_at_baseline: item.existedAtBaseline,
        approved_scope_change: item.approvedScopeChange,
        added_reason: item.addedReason,
        completed_at: item.completedAt ?? null,
        movement_history: item.movementHistory,
        updated_at: updatedAt,
      })),
    )
    if (error) throw error
  }

  if (data.logs.length > 0) {
    const { error } = await supabase.from('build_logs').upsert(
      data.logs.map((log) => ({
        id: log.id,
        project_id: log.projectId,
        user_id: userId,
        log_date: log.logDate,
        minutes_spent: log.minutesSpent,
        summary: log.summary,
        blockers: log.blockers,
        scope_item_id: log.scopeItemId || null,
        new_scope_added: log.newScopeAdded,
        updated_at: updatedAt,
      })),
    )
    if (error) throw error
  }
}

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-page">
          <div className="error-card">
            <AlertTriangle size={28} />
            <h1>ShipCheck hit a snag.</h1>
            <p>Reload the app to restore the workspace.</p>
            <button className="button primary" type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

function App() {
  const auth = useAuth()
  const [data, setData] = useState<AppData>(() => loadData())
  const [dataError, setDataError] = useState<string | null>(() => localStorage.getItem(loadErrorKey))
  const [remoteHydrated, setRemoteHydrated] = useState(!auth.configured)
  const [view, setView] = useState<ViewKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [quickLogSheetOpen, setQuickLogSheetOpen] = useState(false)
  const [creepDismissedUntilByProject, setCreepDismissedUntilByProject] = useState<Record<string, number>>(() => {
    const dismissals: Record<string, number> = {}
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith('shipcheck.scope-creep.dismissed-until.')) continue
      const projectId = key.replace('shipcheck.scope-creep.dismissed-until.', '')
      const until = Number(localStorage.getItem(key) || 0)
      if (projectId && Number.isFinite(until)) dismissals[projectId] = until
    }
    return dismissals
  })
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [dismissedTrialBanner, setDismissedTrialBanner] = useState(() => sessionStorage.getItem(trialBannerDismissedKey) === 'true')
  const [upgradeModalReason, setUpgradeModalReason] = useState('')
  const [logSaved, setLogSaved] = useState(false)
  const [forecastMovement, setForecastMovement] = useState<ForecastMovement | null>(null)
  const [forecastPulsing, setForecastPulsing] = useState(false)
  const [streakCelebration, setStreakCelebration] = useState(0)
  const [isBooting, setIsBooting] = useState(true)
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [authNotice, setAuthNotice] = useState(() => {
    const notice = sessionStorage.getItem(authNoticeKey) ?? ''
    sessionStorage.removeItem(authNoticeKey)
    return notice
  })

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path)
    setCurrentPath(path)
  }

  const navigateToLoginWithNotice = (message: string) => {
    sessionStorage.setItem(authNoticeKey, message)
    setAuthNotice(message)
    window.history.replaceState({}, '', '/login')
    setCurrentPath('/login')
  }

  const legalPage: LegalPageKind | null = currentPath === '/privacy' ? 'privacy' : currentPath === '/terms' ? 'terms' : null

  useEffect(() => {
    if (auth.configured && auth.user && !auth.isPasswordRecovery && (currentPath === '/login' || currentPath === '/signup')) {
      window.history.replaceState({}, '', '/dashboard')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentPath('/dashboard')
      setView('dashboard')
    }
  }, [auth.configured, auth.isPasswordRecovery, auth.user, currentPath])

  useEffect(() => {
    if (!auth.configured || auth.authLoading) return

    if (auth.isPasswordRecovery && auth.user && currentPath !== '/reset-password') {
      window.history.replaceState({}, '', '/reset-password')
      window.setTimeout(() => setCurrentPath('/reset-password'), 0)
      return
    }

    if (currentPath === '/reset-password' && !auth.isPasswordRecovery) {
      const message = 'Request a new password reset link to change your password.'
      sessionStorage.setItem(authNoticeKey, message)
      window.history.replaceState({}, '', '/login')
      window.setTimeout(() => {
        setAuthNotice(message)
        setCurrentPath('/login')
      }, 0)
    }
  }, [auth.authLoading, auth.configured, auth.isPasswordRecovery, auth.user, currentPath])
  const [newProjectDraft, setNewProjectDraft] = useState({
    name: '',
    type: 'MVP/Product' as ProjectType,
    weeklyAvailableHours: 10,
  })
  const [scopeDraft, setScopeDraft] = useState({
    title: '',
    estimateHours: 4,
    column: 'ship' as ColumnKey,
    confidence: 'medium' as Confidence,
    addedReason: '',
  })
  const [logDraft, setLogDraft] = useState({
    logDate: isoToday,
    hours: 1,
    summary: '',
    blockers: '',
    scopeItemId: '',
    newScopeAdded: false,
  })
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [editingLogDraft, setEditingLogDraft] = useState(logDraft)
  const [projectFormError, setProjectFormError] = useState('')
  const [scopeFormError, setScopeFormError] = useState('')
  const [logFormError, setLogFormError] = useState('')
  const [emailReportStatus, setEmailReportStatus] = useState('')
  const [emailReportSending, setEmailReportSending] = useState(false)
  const [billingStatus, setBillingStatus] = useState('')
  const [billingPlanLoading, setBillingPlanLoading] = useState('')

  useEffect(() => {
    if (auth.configured) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch {
      window.setTimeout(
        () => setDataError('ShipCheck could not save your latest changes locally. Try again after freeing browser storage.'),
        0,
      )
    }
  }, [auth.configured, data])

  useEffect(() => {
    if (!auth.configured || !auth.user || auth.isPasswordRecovery) return

    let cancelled = false
    window.setTimeout(() => {
      if (cancelled) return
      setRemoteHydrated(false)
      setIsBooting(true)
    }, 0)

    window.setTimeout(() => {
      if (cancelled) return
      loadRemoteWorkspace(auth.user!)
      .then((remoteData) => {
        if (cancelled) return
        setData(applyWorkspaceStreaks(remoteData))
        setShowOnboarding(!remoteData.onboarded)
        setDataError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setDataError(error instanceof Error ? error.message : 'ShipCheck could not load your workspace data.')
      })
      .finally(() => {
        if (cancelled) return
        setRemoteHydrated(true)
        setIsBooting(false)
      })
    }, 0)

    return () => {
      cancelled = true
    }
  }, [auth.configured, auth.isPasswordRecovery, auth.user])

  useEffect(() => {
    if (!auth.configured || !auth.user || auth.isPasswordRecovery || !remoteHydrated || !data.onboarded) return

    const timer = window.setTimeout(() => {
      saveRemoteWorkspace(data, auth.user!.id).catch((error: unknown) => {
        setDataError(error instanceof Error ? error.message : 'ShipCheck could not save your workspace data.')
      })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [auth.configured, auth.isPasswordRecovery, auth.user, data, remoteHydrated])

  useEffect(() => {
    const timer = window.setTimeout(() => setIsBooting(false), 350)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    document.title = `ShipCheck - ${view === 'dashboard' ? 'Dashboard' : view === 'logs' ? 'Build Log' : view[0].toUpperCase() + view.slice(1)}`
  }, [view])

  const activeProject = data.projects.find((project) => project.id === data.activeProjectId) ?? data.projects[0] ?? createBlankProject('New project', 'MVP/Product')
  const activeScopeItems = data.scopeItems.filter((item) => item.projectId === activeProject.id)
  const activeLogs = data.logs.filter((log) => log.projectId === activeProject.id)
  const activeProjects = data.projects.filter((project) => project.status !== 'Archived')
  const labels = columnCopy[activeProject.type]

  const metrics = useMemo(() => {
    const shipItems = activeScopeItems.filter((item) => item.column === 'ship')
    const laterItems = activeScopeItems.filter((item) => item.column === 'later')
    const cutItems = activeScopeItems.filter((item) => item.column === 'cut')
    const shipHours = shipItems.reduce((sum, item) => sum + item.estimateHours, 0)
    const remainingShipHours = shipItems
      .filter((item) => item.status !== 'done')
      .reduce((sum, item) => sum + item.estimateHours, 0)
    const completedShipHours = shipItems
      .filter((item) => item.status === 'done')
      .reduce((sum, item) => sum + item.estimateHours, 0)
    const loggedHours = activeLogs.reduce((sum, log) => sum + log.minutesSpent / 60, 0)
    const activeDays = Math.max(1, daysBetween(activeProject.startDate, isoToday) + 1)
    const activeWeeks = Math.max(activeDays / 7, 1)
    const loggedVelocity = loggedHours / activeWeeks
    const completionVelocity = completedShipHours > 0 ? completedShipHours / activeWeeks : 0
    const forecastDate = calculateForecastDate(activeProject, activeScopeItems, activeLogs)
    const driftDays = daysBetween(activeProject.targetLaunchDate, forecastDate.toISOString().slice(0, 10))
    const launchStatus =
      remainingShipHours === 0 ? 'Ready' : driftDays <= 0 ? 'On Track' : driftDays <= 14 ? 'At Risk' : 'Slipping'
    const addedItems = activeScopeItems.filter((item) => !item.existedAtBaseline)
    const addedHours = addedItems.reduce((sum, item) => sum + item.estimateHours, 0)
    const baselineScopeHours = activeScopeItems
      .filter((item) => item.existedAtBaseline)
      .reduce((sum, item) => sum + item.estimateHours, 0)
    const currentScopeHours = activeScopeItems.reduce((sum, item) => sum + item.estimateHours, 0)
    const scopeGrowthPercent =
      baselineScopeHours > 0 ? Math.round(((currentScopeHours - baselineScopeHours) / baselineScopeHours) * 100) : 0
    const scopeGrowthHours = Math.max(0, currentScopeHours - baselineScopeHours)
    const forecastImpactDays = activeProject.weeklyAvailableHours > 0 ? Math.ceil((scopeGrowthHours / activeProject.weeklyAvailableHours) * 7) : 0
    const weekLogs = activeLogs.filter((log) => daysBetween(log.logDate, isoToday) <= 7)
    const weekHours = weekLogs.reduce((sum, log) => sum + log.minutesSpent / 60, 0)
    const priorWeekLogs = activeLogs.filter((log) => {
      const age = daysBetween(log.logDate, isoToday)
      return age > 7 && age <= 14
    })
    const priorWeekHours = priorWeekLogs.reduce((sum, log) => sum + log.minutesSpent / 60, 0)
    const velocityTrend: ShipMetrics['velocityTrend'] =
      weekHours > priorWeekHours + 1 ? 'up' : weekHours + 1 < priorWeekHours ? 'down' : 'flat'
    const averageDailyHours = loggedHours / activeDays
    const todayHours = activeLogs
      .filter((log) => log.logDate === isoToday)
      .reduce((sum, log) => sum + log.minutesSpent / 60, 0)
    const highEffortShipItems = shipItems
      .filter((item) => item.status !== 'done' && item.estimateHours >= 10)
      .sort((a, b) => b.estimateHours - a.estimateHours)
    const lowConfidenceShipItems = shipItems.filter((item) => item.status !== 'done' && item.confidence === 'low')
    const unestimatedAddedItems = addedItems.filter((item) => item.estimateHours <= 0)
    const forecastConfidence: ShipMetrics['forecastConfidence'] =
      activeLogs.length >= 5 && lowConfidenceShipItems.length === 0
        ? 'High'
        : activeLogs.length >= 2 && lowConfidenceShipItems.length <= 1
          ? 'Medium'
          : 'Low'
    const completedThisWeekItems = shipItems.filter(
      (item) => item.status === 'done' && item.completedAt && daysBetween(item.completedAt, isoToday) <= 7,
    )
    const stalled = activeProject.status === 'Building' && weekLogs.length === 0 && remainingShipHours > 0
    const insufficientData = activeLogs.length < 2 || shipItems.length === 0

    return {
      shipItems,
      laterItems,
      cutItems,
      shipHours,
      remainingShipHours,
      completedShipHours,
      loggedHours,
      loggedVelocity,
      completionVelocity,
      forecastDate,
      forecastConfidence,
      driftDays,
      launchStatus,
      addedItems,
      addedHours,
      baselineScopeHours,
      currentScopeHours,
      scopeGrowthPercent,
      forecastImpactDays,
      weekHours,
      todayHours,
      averageDailyHours,
      velocityTrend,
      highEffortShipItems,
      lowConfidenceShipItems,
      unestimatedAddedItems,
      completedThisWeekItems,
      stalled,
      insufficientData,
    }
  }, [activeLogs, activeProject, activeScopeItems])

  const trialDaysLeft = getTrialDaysLeft(data.user.trialStartedAt)
  const trialExpiryDate = getTrialExpiryDate(data.user.trialStartedAt)
  const showTrialUpgradeBanner = isFreeTrial(data.user.plan) && trialDaysLeft <= 5 && !dismissedTrialBanner
  const scopeGrowthHours = Math.max(0, metrics.currentScopeHours - metrics.baselineScopeHours)
  const creepDismissedUntil = creepDismissedUntilByProject[activeProject.id] ?? 0
  const showScopeCreepBanner = scopeGrowthHours > 0 && currentTime > creepDismissedUntil
  const scopeCreepTone = metrics.scopeGrowthPercent > 0 && metrics.scopeGrowthPercent < 10 ? 'warning' : 'danger'

  const dismissTrialUpgradeBanner = () => {
    sessionStorage.setItem(trialBannerDismissedKey, 'true')
    setDismissedTrialBanner(true)
  }

  const dismissScopeCreepBanner = () => {
    const dismissedUntil = Date.now() + creepDismissMs
    localStorage.setItem(getCreepDismissKey(activeProject.id), String(dismissedUntil))
    setCurrentTime(Date.now())
    setCreepDismissedUntilByProject((current) => ({ ...current, [activeProject.id]: dismissedUntil }))
  }

  const setProject = (project: Partial<Project>) => {
    setData((current) => ({
      ...current,
      projects: current.projects.map((currentProject) =>
        currentProject.id === activeProject.id ? { ...currentProject, ...project } : currentProject,
      ),
    }))
  }

  const createProject = () => {
    if (!newProjectDraft.name.trim()) {
      setProjectFormError('Add a project name before creating this workspace.')
      return
    }
    if (isFreeTrial(data.user.plan) && activeProjects.length >= 1) {
      setUpgradeModalReason('Free Trial includes 1 active project. Upgrade to Solo or a team plan to create more launch workspaces.')
      return
    }
    const project = createBlankProject(newProjectDraft.name.trim(), newProjectDraft.type, newProjectDraft.weeklyAvailableHours)
    setData((current) => ({
      ...current,
      projects: [...current.projects, project],
      activeProjectId: project.id,
    }))
    setNewProjectDraft({ name: '', type: 'MVP/Product', weeklyAvailableHours: 10 })
    setProjectFormError('')
    setView('dashboard')
  }

  const setActiveProjectId = (projectId: string) => {
    setData((current) => ({ ...current, activeProjectId: projectId }))
    setView('dashboard')
  }

  const addScopeItem = () => {
    if (!scopeDraft.title.trim()) {
      setScopeFormError('Add a scope item title before saving it to the board.')
      return
    }

    const item: ScopeItem = {
      id: uid('scope'),
      projectId: activeProject.id,
      title: scopeDraft.title.trim(),
      description: '',
      column: scopeDraft.column,
      rankOrder: activeScopeItems.filter((item) => item.column === scopeDraft.column).length + 1,
      estimateHours: Number(scopeDraft.estimateHours) || 1,
      confidence: scopeDraft.confidence,
      status: 'not-started',
      existedAtBaseline: false,
      approvedScopeChange: false,
      createdAt: isoToday,
      addedReason: scopeDraft.addedReason.trim() || 'Added after project start',
      movementHistory: [],
    }

    setData((current) => ({ ...current, scopeItems: [...current.scopeItems, item] }))
    setScopeDraft({ title: '', estimateHours: 4, column: 'ship', confidence: 'medium', addedReason: '' })
    setScopeFormError('')
  }

  const updateScopeItem = (id: string, patch: Partial<ScopeItem>) => {
    if (patch.status) {
      setForecastPulsing(true)
      window.setTimeout(() => setForecastPulsing(false), 300)
    }

    setData((current) => ({
      ...current,
      scopeItems: current.scopeItems.map((item) => {
        if (item.id !== id) return item
        const moved = patch.column && patch.column !== item.column
        const completed = patch.status === 'done' && item.status !== 'done'
        return {
          ...item,
          ...patch,
          rankOrder: moved
            ? current.scopeItems.filter((candidate) => candidate.projectId === item.projectId && candidate.column === patch.column).length + 1
            : patch.rankOrder ?? item.rankOrder,
          completedAt: completed ? isoToday : patch.status && patch.status !== 'done' ? undefined : item.completedAt,
          movementHistory: moved
            ? [...item.movementHistory, { from: item.column, to: patch.column as ColumnKey, changedAt: isoToday }]
            : item.movementHistory,
        }
      }),
    }))
  }

  const rankScopeItem = (id: string, direction: 'up' | 'down') => {
    const item = activeScopeItems.find((candidate) => candidate.id === id)
    if (!item) return
    const siblings = activeScopeItems
      .filter((candidate) => candidate.column === item.column)
      .sort((a, b) => a.rankOrder - b.rankOrder)
    const index = siblings.findIndex((candidate) => candidate.id === id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const swapItem = siblings[swapIndex]
    if (!swapItem) return

    setData((current) => ({
      ...current,
      scopeItems: current.scopeItems.map((candidate) => {
        if (candidate.id === item.id) return { ...candidate, rankOrder: swapItem.rankOrder }
        if (candidate.id === swapItem.id) return { ...candidate, rankOrder: item.rankOrder }
        return candidate
      }),
    }))
  }

  const deleteScopeItem = (id: string) => {
    if (auth.configured && auth.user && supabase) {
      void supabase.from('scope_items').delete().eq('id', id)
    }

    setData((current) => ({
      ...current,
      scopeItems: current.scopeItems.filter((item) => item.id !== id),
      logs: current.logs.map((log) => (log.scopeItemId === id ? { ...log, scopeItemId: '' } : log)),
    }))
  }

  const addBuildLog = () => {
    if (!logDraft.summary.trim()) {
      setLogFormError('Add a short summary so ShipCheck can update the project forecast.')
      return
    }
    const forecastBefore = calculateForecastDate(activeProject, activeScopeItems, activeLogs)

    const log: BuildLog = {
      id: uid('log'),
      projectId: activeProject.id,
      logDate: logDraft.logDate,
      minutesSpent: Math.max(15, Math.round(Number(logDraft.hours || 0) * 60)),
      summary: logDraft.summary.trim(),
      blockers: logDraft.blockers.trim(),
      scopeItemId: logDraft.scopeItemId,
      newScopeAdded: logDraft.newScopeAdded,
      createdAt: isoToday,
    }

    const forecastAfter = calculateForecastDate(activeProject, activeScopeItems, [log, ...activeLogs])
    const movementDays = daysBetween(forecastBefore.toISOString().slice(0, 10), forecastAfter.toISOString().slice(0, 10))
    if (movementDays < 0) {
      setForecastMovement({ direction: 'improved', days: Math.abs(movementDays) })
    } else if (movementDays > 0) {
      setForecastMovement({ direction: 'worsened', days: movementDays })
    } else {
      setForecastMovement(null)
    }

    const nextActiveProject = applyProjectStreak(activeProject, [log, ...activeLogs])
    if ([7, 30, 100].includes(nextActiveProject.currentStreak) && nextActiveProject.currentStreak !== activeProject.currentStreak) {
      setStreakCelebration(nextActiveProject.currentStreak)
      window.setTimeout(() => setStreakCelebration(0), 1500)
    }

    setData((current) => {
      const nextLogs = [log, ...current.logs]
      const nextProjects = current.projects.map((project) => (project.id === activeProject.id ? applyProjectStreak(project, nextLogs) : project))
      return { ...current, projects: nextProjects, logs: nextLogs }
    })
    setLogDraft({ logDate: isoToday, hours: 1, summary: '', blockers: '', scopeItemId: '', newScopeAdded: false })
    setLogFormError('')
    setLogSaved(true)
    window.setTimeout(() => setLogSaved(false), 1500)
    window.setTimeout(() => setForecastMovement(null), 4000)
  }

  const deleteBuildLog = (id: string) => {
    if (auth.configured && auth.user && supabase) {
      void supabase.from('build_logs').delete().eq('id', id)
    }

    setData((current) => {
      const removedLog = current.logs.find((log) => log.id === id)
      const nextLogs = current.logs.filter((log) => log.id !== id)
      const nextProjects = removedLog
        ? current.projects.map((project) => (project.id === removedLog.projectId ? applyProjectStreak(project, nextLogs) : project))
        : current.projects
      return { ...current, projects: nextProjects, logs: nextLogs }
    })
  }

  const startEditBuildLog = (log: BuildLog) => {
    setEditingLogId(log.id)
    setEditingLogDraft({
      logDate: log.logDate,
      hours: Number((log.minutesSpent / 60).toFixed(2)),
      summary: log.summary,
      blockers: log.blockers,
      scopeItemId: log.scopeItemId,
      newScopeAdded: log.newScopeAdded,
    })
  }

  const saveEditedBuildLog = () => {
    if (!editingLogId || !editingLogDraft.summary.trim()) return
    setData((current) => {
      const existingLog = current.logs.find((log) => log.id === editingLogId)
      const nextLogs = current.logs.map((log) =>
        log.id === editingLogId
          ? {
              ...log,
              logDate: editingLogDraft.logDate,
              minutesSpent: Math.max(15, Math.round(Number(editingLogDraft.hours || 0) * 60)),
              summary: editingLogDraft.summary.trim(),
              blockers: editingLogDraft.blockers.trim(),
              scopeItemId: editingLogDraft.scopeItemId,
              newScopeAdded: editingLogDraft.newScopeAdded,
            }
          : log,
      )
      const nextProjects = existingLog
        ? current.projects.map((project) => (project.id === existingLog.projectId ? applyProjectStreak(project, nextLogs) : project))
        : current.projects
      return { ...current, projects: nextProjects, logs: nextLogs }
    })
    setEditingLogId(null)
  }

  const deleteProject = () => {
    if (data.projects.length <= 1) return
    const confirmed = window.confirm(`Delete "${activeProject.name}" and all of its scope items and logs?`)
    if (!confirmed) return
    const nextProject = data.projects.find((project) => project.id !== activeProject.id)
    if (!nextProject) return
    if (auth.configured && auth.user && supabase) {
      void supabase.from('projects').delete().eq('id', activeProject.id)
    }

    setData((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== activeProject.id),
      scopeItems: current.scopeItems.filter((item) => item.projectId !== activeProject.id),
      logs: current.logs.filter((log) => log.projectId !== activeProject.id),
      activeProjectId: nextProject.id,
    }))
    setView('dashboard')
  }

  const exportProject = () => {
    const payload = {
      project: activeProject,
      scopeItems: activeScopeItems,
      logs: activeLogs,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-shipcheck-export.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const sendReportEmail = async () => {
    if (!auth.configured || !auth.session) {
      setEmailReportStatus('Sign in before sending a report email.')
      return
    }

    setEmailReportSending(true)
    setEmailReportStatus('')

    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId: activeProject.id }),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'ShipCheck could not send this report email.')
      setEmailReportStatus(`Report sent to ${data.user.email}.`)
    } catch (error) {
      setEmailReportStatus(error instanceof Error ? error.message : 'ShipCheck could not send this report email.')
    } finally {
      setEmailReportSending(false)
    }
  }

  const startBillingCheckout = async (planName: string) => {
    if (planName === data.user.plan) return

    if (planName === 'Free Trial') {
      setBillingStatus('Free Trial is already available for new workspaces.')
      return
    }

    if (planName === 'Enterprise') {
      setBillingStatus('Enterprise is custom priced. Add a contact form before enabling self-serve checkout.')
      return
    }

    if (!auth.configured || !auth.session) {
      setBillingStatus('Sign in before starting checkout.')
      return
    }

    setBillingPlanLoading(planName)
    setBillingStatus('')

    try {
      const response = await fetch('/api/create-creem-checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: planName }),
      })
      const result = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string }
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'ShipCheck could not start Creem checkout.')
      window.location.href = result.checkoutUrl
    } catch (error) {
      setBillingStatus(error instanceof Error ? error.message : 'ShipCheck could not start Creem checkout.')
    } finally {
      setBillingPlanLoading('')
    }
  }

  const manageBilling = () => {
    setBillingStatus('Creem billing management is not connected yet. Choose a plan here or contact support for subscription changes.')
    setView('pricing')
  }

  const markProjectShipped = () => {
    setProject({ status: 'Shipped' })
    setView('shipped')
  }

  const resetDemo = () => {
    setData(seedData)
    localStorage.removeItem(storageKey)
    localStorage.removeItem(loadErrorKey)
    setDataError(null)
  }

  const logOutDemo = () => {
    setSidebarOpen(false)
    setQuickLogSheetOpen(false)
    if (auth.configured) {
      void auth.signOut()
      return
    }
    setShowOnboarding(true)
  }

  const completeOnboarding = (project: Project, initialItems: ScopeItem[], builderType: string) => {
    setData((current) => ({
      ...current,
      user: { ...current.user, builderType, onboardingForecastSeen: true },
      projects: [...current.projects, project],
      activeProjectId: project.id,
      scopeItems: [...current.scopeItems, ...initialItems],
      onboarded: true,
    }))
    setShowOnboarding(false)
    setView('dashboard')
    if (auth.configured && auth.user && supabase) {
      supabase
        .from('profiles')
        .update({ onboarding_forecast_seen: true, updated_at: new Date().toISOString() })
        .eq('id', auth.user.id)
        .then(({ error }) => {
          if (error) setDataError(error.message)
        })
    }
  }

  const dismissOnboardingForecast = () => {
    setData((current) => ({
      ...current,
      user: { ...current.user, onboardingForecastSeen: true },
    }))
    if (auth.configured && auth.user && supabase) {
      supabase
        .from('profiles')
        .update({ onboarding_forecast_seen: true, updated_at: new Date().toISOString() })
        .eq('id', auth.user.id)
        .then(({ error }) => {
          if (error) setDataError(error.message)
        })
    }
  }

  if (auth.configured && auth.authLoading) {
    return <AppSkeleton />
  }

  if (legalPage) {
    return <LegalPage loggedIn={Boolean(auth.user)} onNavigate={navigateTo} page={legalPage} />
  }

  if (currentPath === '/reset-password' && auth.isPasswordRecovery && auth.user) {
    return (
      <ResetPasswordView
        onCancel={async () => {
          auth.clearPasswordRecovery()
          await auth.signOut()
          navigateToLoginWithNotice('Log in or request a new password reset link.')
        }}
        onComplete={async () => {
          auth.clearPasswordRecovery()
          await auth.signOut()
          navigateToLoginWithNotice('Password updated. Log in with your new password.')
        }}
        onUpdatePassword={auth.updatePassword}
      />
    )
  }

  if (currentPath === '/') {
    return (
      <LandingPage 
        onNavigate={navigateTo} 
        billingStatus={billingStatus} 
        billingPlanLoading={billingPlanLoading}
        isLoggedIn={Boolean(auth.user)}
      />
    )
  }

  // Show AuthView for login/signup paths, or if auth is configured but not logged in
  if (!auth.user && (auth.configured || currentPath === '/login' || currentPath === '/signup')) {
    if (!auth.configured) {
      return (
        <AuthView
          initialMode={currentPath === '/signup' ? 'signup' : 'signin'}
          authError="Supabase not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables."
          authLoading={false}
          notice={currentPath === '/login' ? authNotice : ''}
          onNavigate={navigateTo}
          onResetPassword={async () => {}}
          onSignIn={async () => {}}
          onSignUp={async () => {}}
        />
      )
    }

    return (
      <AuthView
        initialMode={currentPath === '/signup' ? 'signup' : 'signin'}
        authError={auth.authError}
        authLoading={auth.authLoading}
        notice={currentPath === '/login' ? authNotice : ''}
        onNavigate={navigateTo}
        onResetPassword={auth.resetPassword}
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
      />
    )
  }

  if (showOnboarding || !data.onboarded) {
    return <OnboardingView onboardingForecastSeen={data.user.onboardingForecastSeen} onComplete={completeOnboarding} />
  }

  if (isBooting) {
    return <AppSkeleton />
  }

  if (!data.user.onboardingForecastSeen) {
    return (
      <OnboardingForecastReveal
        availableHoursPerWeek={activeProject.weeklyAvailableHours}
        daysUntilTarget={getDaysUntil(activeProject.targetLaunchDate)}
        forecastDate={metrics.forecastDate}
        launchStatus={metrics.launchStatus}
        onContinue={dismissOnboardingForecast}
        totalScopeHours={metrics.shipHours}
      />
    )
  }

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Check size={20} strokeWidth={3} />
          </div>
          <div>
            <strong>ShipCheck</strong>
            <span>Launch tracker</span>
          </div>
          <button className="icon-button sidebar-toggle" type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle sidebar">
            <Menu size={18} />
          </button>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { key: 'projects', label: 'Projects', icon: FolderPlus },
            { key: 'reports', label: 'Reports', icon: FileText },
            { key: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                className={view === item.key ? 'active' : ''}
                type="button"
                onClick={() => {
                  setView(item.key as ViewKey)
                  setSidebarOpen(false)
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="nav-divider" />

        <div className="project-switcher">
          <span className="eyebrow">Active projects</span>
          {activeProjects.map((project) => (
            <button
              className={project.id === activeProject.id ? 'project-chip active' : 'project-chip'}
              key={project.id}
              type="button"
              onClick={() => setActiveProjectId(project.id)}
            >
              <span>{project.name}</span>
              <StatusPill status={project.status} />
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-card help-card">
            <button className="help-link" type="button">
              <HelpCircle size={15} />
              Help / Docs
            </button>
            <button className="help-link" type="button" onClick={() => navigateTo('/privacy')}>
              Privacy
            </button>
            <button className="help-link" type="button" onClick={() => navigateTo('/terms')}>
              Terms
            </button>
          </div>

          {showsUpgradePrompt(data.user.plan) && (
            <div className="sidebar-card upgrade-card">
              <span className="eyebrow">{isFreeTrial(data.user.plan) ? `Free Trial - ${trialDaysLeft} days left` : 'Solo plan'}</span>
              <strong>{isFreeTrial(data.user.plan) ? 'Keep shipping after trial.' : 'Need teammates?'}</strong>
              <p>{isFreeTrial(data.user.plan) ? 'Upgrade to unlock more active projects.' : 'Upgrade when shared projects and seats matter.'}</p>
              <button className="upgrade-link" type="button" onClick={() => setView('pricing')}>
                Upgrade Plan
                <ArrowRight size={14} />
              </button>
            </div>
          )}

          <div className="sidebar-card user-card">
            <div className="user-summary">
              <span className="user-avatar" aria-hidden="true">
                {data.user.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <strong>{data.user.name}</strong>
                <p>{data.user.plan} plan</p>
              </div>
            </div>
            <p>Trial started {formatDate(data.user.trialStartedAt)}</p>
            <button className="help-link" type="button" onClick={() => setView('settings')}>
              <Settings size={15} />
              Settings
            </button>
            <button className="help-link" type="button" onClick={logOutDemo}>
              <LogOut size={15} />
              Log out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        {dataError && (
          <InlineError
            message={dataError}
            actionLabel="Try again"
            onAction={() => {
              localStorage.removeItem(loadErrorKey)
              setDataError(null)
            }}
          />
        )}
        <StreakCelebration streak={streakCelebration} />

        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div>
            <h1>{activeProject.name}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill status={metrics.launchStatus} />
            <span className="forecast-date-mini">{formatDate(metrics.forecastDate)}</span>
            <button className="button secondary" type="button" onClick={() => setView('logs')}>
              <Plus size={16} />
              Quick log
            </button>
          </div>
        </header>

        <nav className="project-tabs" aria-label="Project sections">
          {[
            { key: 'dashboard', label: 'Overview' },
            { key: 'scope', label: 'Scope' },
            { key: 'logs', label: 'Build Log' },
            { key: 'reports', label: 'Reports' },
            { key: 'settings', label: 'Settings' },
          ].map((item) => (
            <button key={item.key} className={view === item.key ? 'active' : ''} type="button" onClick={() => setView(item.key as ViewKey)}>
              {item.label}
            </button>
          ))}
        </nav>

        {sidebarOpen && <button className="scrim" type="button" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}

        {view === 'dashboard' && (
          <Dashboard
            data={data}
            project={activeProject}
            projects={activeProjects}
            metrics={metrics}
            setView={setView}
            setProject={setProject}
            newProjectDraft={newProjectDraft}
            setNewProjectDraft={setNewProjectDraft}
            createProject={createProject}
            projectFormError={projectFormError}
            clearProjectFormError={() => setProjectFormError('')}
            showScopeCreepBanner={showScopeCreepBanner}
            scopeCreepTone={scopeCreepTone}
            dismissCreepBanner={dismissScopeCreepBanner}
            showTrialUpgradeBanner={showTrialUpgradeBanner}
            trialDaysLeft={trialDaysLeft}
            dismissTrialUpgradeBanner={dismissTrialUpgradeBanner}
            forecastPulsing={forecastPulsing}
          />
        )}

        {view === 'projects' && (
          <ProjectsView
            projects={activeProjects}
            activeProjectId={activeProject.id}
            scopeItems={data.scopeItems}
            logs={data.logs}
            setActiveProjectId={setActiveProjectId}
            setView={setView}
          />
        )}

        {view === 'scope' && (
          <ScopeView
            items={activeScopeItems}
            labels={labels}
            draft={scopeDraft}
            setDraft={(draft) => {
              setScopeDraft(draft)
              setScopeFormError('')
            }}
            addItem={addScopeItem}
            formError={scopeFormError}
            updateItem={updateScopeItem}
            rankItem={rankScopeItem}
            deleteItem={deleteScopeItem}
            metrics={metrics}
            showScopeCreepBanner={showScopeCreepBanner}
            scopeCreepTone={scopeCreepTone}
            dismissCreepBanner={dismissScopeCreepBanner}
          />
        )}

        {view === 'logs' && (
          <LogsView
            project={activeProject}
            logs={activeLogs}
            items={activeScopeItems}
            draft={logDraft}
            setDraft={(draft) => {
              setLogDraft(draft)
              setLogFormError('')
            }}
            addLog={addBuildLog}
            formError={logFormError}
            deleteLog={deleteBuildLog}
            updateItem={updateScopeItem}
            logSaved={logSaved}
            forecastMovement={forecastMovement}
            editingLogId={editingLogId}
            editingDraft={editingLogDraft}
            setEditingDraft={setEditingLogDraft}
            startEdit={startEditBuildLog}
            saveEdit={saveEditedBuildLog}
            cancelEdit={() => setEditingLogId(null)}
          />
        )}

        {view === 'reports' && (
          <ReportsView
            project={activeProject}
            metrics={metrics}
            setView={setView}
            emailReportStatus={emailReportStatus}
            emailReportSending={emailReportSending}
            sendReportEmail={sendReportEmail}
            plan={data.user.plan}
          />
        )}

        {view === 'shipped' && (
          <ShippedMoment
            project={activeProject}
            metrics={metrics}
            logCount={activeLogs.length}
            setView={setView}
            startNewProject={() => {
              setView('projects')
            }}
          />
        )}

        {view === 'pricing' && (
          <PricingView
            activePlan={data.user.plan}
            billingStatus={billingStatus}
            billingPlanLoading={billingPlanLoading}
            startCheckout={startBillingCheckout}
            onNavigate={navigateTo}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            data={data}
            project={activeProject}
            setData={setData}
            setProject={setProject}
            deleteProject={deleteProject}
            exportProject={exportProject}
            startOnboarding={() => setShowOnboarding(true)}
            markProjectShipped={markProjectShipped}
            resetDemo={resetDemo}
            billing={data.billing}
            trialDaysLeft={trialDaysLeft}
            trialExpiryDate={trialExpiryDate}
            setView={setView}
            manageBilling={manageBilling}
          />
        )}
      </main>

      {upgradeModalReason && (
        <UpgradeModal
          activePlan={data.user.plan}
          billingPlanLoading={billingPlanLoading}
          onClose={() => setUpgradeModalReason('')}
          reason={upgradeModalReason}
          startCheckout={startBillingCheckout}
        />
      )}

      <button
        className="mobile-fab"
        type="button"
        aria-label="Quick log"
        onClick={() => {
          setView('logs')
          setQuickLogSheetOpen(true)
        }}
      >
        <Plus size={24} />
      </button>

      {quickLogSheetOpen && (
        <QuickLogSheet
          draft={logDraft}
          setDraft={(draft) => {
            setLogDraft(draft)
            setLogFormError('')
          }}
          items={activeScopeItems}
          formError={logFormError}
          logSaved={logSaved}
          forecastMovement={forecastMovement}
          addLog={addBuildLog}
          onClose={() => setQuickLogSheetOpen(false)}
        />
      )}

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { key: 'scope', label: 'Scope', icon: ListChecks },
          { key: 'logs', label: 'Log', icon: Clock3 },
          { key: 'reports', label: 'Reports', icon: FileText },
        ].map((item) => {
          const Icon = item.icon
          return (
            <button key={item.key} className={view === item.key ? 'active' : ''} type="button" onClick={() => setView(item.key as ViewKey)}>
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase().replace(' ', '-')
  return <span className={`status-pill ${key}`}>{status}</span>
}

function CountUpNumber({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const duration = 400

    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1)
      setDisplayValue(value * (1 - Math.pow(1 - progress, 3)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <span className="count-up">
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  )
}

function ForecastMovementIndicator({ movement }: { movement: ForecastMovement | null }) {
  if (!movement) return null
  const improved = movement.direction === 'improved'
  const Icon = improved ? ArrowUp : ArrowDown
  return (
    <div className={`forecast-movement ${movement.direction}`} aria-live="polite">
      <Icon size={16} />
      <span>{improved ? `+${movement.days} days sooner` : `${movement.days} days later`}</span>
    </div>
  )
}

function StreakPill({ streak }: { streak: number }) {
  if (streak < 3) return null
  return (
    <span className="streak-pill">
      <Flame size={14} />
      {streak}-day streak
    </span>
  )
}

function StreakCelebration({ streak }: { streak: number }) {
  if (!streak) return null
  return (
    <div className="streak-celebration" role="status" aria-live="polite">
      <div className="confetti-burst" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <strong>{streak}-day streak - you're building momentum.</strong>
    </div>
  )
}

function LegalPage({
  page,
  loggedIn,
  onNavigate,
}: {
  page: LegalPageKind
  loggedIn: boolean
  onNavigate: (path: string) => void
}) {
  const isPrivacy = page === 'privacy'
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service'
  const sections = isPrivacy
    ? [
        {
          title: 'Information we collect',
          body:
            'ShipCheck may collect account details, project information, scope items, build logs, billing status, and basic usage data needed to operate the product.',
        },
        {
          title: 'How we use information',
          body:
            'We use your information to provide launch forecasts, save your workspace, send account and product emails, process billing, improve reliability, and support your requests.',
        },
        {
          title: 'Cookies and local storage',
          body:
            'ShipCheck may use cookies, browser storage, and similar technologies to keep you signed in, remember dismissals, protect sessions, and improve the app experience.',
        },
        {
          title: 'Third-party services',
          body:
            'ShipCheck uses service providers including Supabase for authentication and data storage, Creem for billing, Resend for email delivery, and Vercel for hosting and deployment.',
        },
        {
          title: 'Data retention',
          body:
            'We keep account and project data while your account is active or as needed for product, legal, billing, and security purposes. You may request deletion before public launch.',
        },
        {
          title: 'Your rights',
          body:
            'You may request access, correction, export, or deletion of your personal data, subject to legal and operational limits that may apply to SaaS services.',
        },
        {
          title: 'Contact',
          body: 'For privacy questions, contact the ShipCheck team at privacy@shipcheck.app.',
        },
      ]
    : [
        {
          title: 'Acceptance of terms',
          body:
            'By creating an account or using ShipCheck, you agree to these terms and to use the product only for lawful project planning and launch accountability purposes.',
        },
        {
          title: 'Accounts and security',
          body:
            'You are responsible for keeping your login credentials secure, using accurate account information, and notifying us if you believe your account has been accessed without permission.',
        },
        {
          title: 'Project data',
          body:
            'You retain responsibility for the project content, scope items, build logs, and team information you add to ShipCheck. Do not upload data you are not allowed to store or process.',
        },
        {
          title: 'Billing',
          body:
            'Paid plans are processed through Creem. Prices, plan limits, billing intervals, and renewal terms will be shown before checkout and may be updated before public launch.',
        },
        {
          title: 'Acceptable use',
          body:
            'Do not misuse ShipCheck, interfere with the service, attempt unauthorized access, upload malicious content, or use the product to violate laws or third-party rights.',
        },
        {
          title: 'Availability and beta status',
          body:
            'ShipCheck is still pre-launch software. Features may change, availability may vary, and placeholder legal terms will be reviewed before public launch.',
        },
        {
          title: 'Limitations',
          body:
            'ShipCheck provides planning and forecasting tools, not guarantees of launch dates, revenue, delivery outcomes, or business success.',
        },
        {
          title: 'Contact',
          body: 'For terms or account questions, contact the ShipCheck team at support@shipcheck.app.',
        },
      ]

  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <button className="brand legal-brand" type="button" onClick={() => onNavigate(loggedIn ? '/dashboard' : '/')}>
          <span className="brand-mark" aria-hidden="true">
            <Check size={18} strokeWidth={3} />
          </span>
          <strong>ShipCheck</strong>
        </button>
        <div>
          {loggedIn ? (
            <button className="button secondary" type="button" onClick={() => onNavigate('/dashboard')}>
              Back to app
            </button>
          ) : (
            <>
              <button className="button secondary" type="button" onClick={() => onNavigate('/login')}>
                Log in
              </button>
              <button className="button primary" type="button" onClick={() => onNavigate('/signup')}>
                Sign up
              </button>
            </>
          )}
        </div>
      </nav>

      <article className="legal-document">
        <span className="eyebrow">Trust and legal</span>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: July 1, 2026. This policy will be updated before public launch.</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </article>
    </main>
  )
}

function AnimatedForecastDate({ date }: { date: Date }) {
  const [day, setDay] = useState(0)

  useEffect(() => {
    let frame = 0
    const target = date.getDate()
    const start = performance.now()
    const duration = 600

    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1)
      setDay(Math.max(1, Math.round(target * (1 - Math.pow(1 - progress, 3)))))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [date])

  const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(date)
  return (
    <span className="forecast-number" aria-label={formatDate(date)}>
      {month} <span>{day || 1}</span>, {date.getFullYear()}
    </span>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  valueNode,
  detail,
}: {
  icon: typeof Activity
  label: string
  value?: string
  valueNode?: ReactNode
  detail: string
}) {
  return (
    <div className="metric-card">
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{valueNode ?? value}</strong>
      <p>{detail}</p>
    </div>
  )
}

function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 'var(--radius-md)',
  className = '',
}: {
  width?: number | string
  height?: number | string
  borderRadius?: number | string
  className?: string
}) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
      }}
    />
  )
}

function ForecastPanelSkeleton() {
  return (
    <section className="forecast-skeleton" aria-label="Loading launch forecast">
      <Skeleton width={140} height={14} borderRadius={999} />
      <Skeleton width="min(360px, 80%)" height={44} />
      <Skeleton width={88} height={28} borderRadius={999} />
      <Skeleton height={12} borderRadius={999} />
      <div className="forecast-skeleton-stats">
        <Skeleton height={74} />
        <Skeleton height={74} />
        <Skeleton height={74} />
      </div>
    </section>
  )
}

function ProjectCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="project-card-grid" aria-label="Loading project cards">
      {Array.from({ length: count }).map((_, index) => (
        <article className="project-card skeleton-card" key={index}>
          <div className="project-card-head">
            <Skeleton width="58%" height={18} />
            <Skeleton width={74} height={24} borderRadius={999} />
          </div>
          <Skeleton width={96} height={22} borderRadius={999} />
          <Skeleton width="72%" height={14} />
          <Skeleton height={10} borderRadius={999} />
          <Skeleton width="86%" height={12} />
        </article>
      ))}
    </div>
  )
}

function ScopeBoardSkeleton() {
  return (
    <div className="board skeleton-board" aria-label="Loading scope board">
      {['Ship', 'Later', 'Cut'].map((column) => (
        <section className="board-column skeleton-column" key={column}>
          <div className="column-header">
            <div>
              <Skeleton width={72} height={20} />
              <Skeleton width={150} height={12} />
            </div>
            <Skeleton width={62} height={24} borderRadius={999} />
          </div>
          <div className="scope-list">
            {[0, 1, 2].map((item) => (
              <article className="scope-card skeleton-card" key={item}>
                <Skeleton width="70%" height={16} />
                <div className="scope-meta">
                  <Skeleton width={50} height={20} borderRadius={999} />
                  <Skeleton width={44} height={20} borderRadius={999} />
                  <Skeleton width={82} height={20} borderRadius={999} />
                </div>
                <Skeleton height={38} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BuildLogListSkeleton() {
  return (
    <section className="log-history" aria-label="Loading build logs">
      <div className="section-header">
        <div>
          <Skeleton width={72} height={12} borderRadius={999} />
          <Skeleton width={210} height={28} />
        </div>
      </div>
      {[0, 1, 2, 3].map((row) => (
        <article className="log-card skeleton-card" key={row}>
          <div>
            <Skeleton width="58%" height={18} />
            <Skeleton width="82%" height={14} />
          </div>
          <Skeleton width={72} height={24} borderRadius={999} />
        </article>
      ))}
    </section>
  )
}

function WeeklyReportSkeleton() {
  return (
    <section className="section-band weekly-report-skeleton" aria-label="Loading weekly report">
      <Skeleton width={160} height={14} borderRadius={999} />
      <Skeleton width="min(420px, 86%)" height={32} />
      <div className="report-grid">
        <Skeleton height={108} />
        <Skeleton height={108} />
        <Skeleton height={108} />
      </div>
      <Skeleton height={180} />
    </section>
  )
}

function AppSkeleton() {
  return (
    <div className="app">
      <aside className="sidebar">
        <Skeleton width={34} height={34} />
        <Skeleton width="90%" height={40} />
        <Skeleton width="86%" height={40} />
        <Skeleton width="82%" height={40} />
      </aside>
      <main className="main">
        <ForecastPanelSkeleton />
        <div className="metrics-grid">
          <Skeleton height={128} />
          <Skeleton height={128} />
          <Skeleton height={128} />
          <Skeleton height={128} />
        </div>
        <ProjectCardsSkeleton />
        <ScopeBoardSkeleton />
        <BuildLogListSkeleton />
        <WeeklyReportSkeleton />
      </main>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Activity
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <Icon size={40} />
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}

function InlineError({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <AlertTriangle size={18} />
      <p>{message}</p>
      <button className="button secondary" type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-track" aria-label={`Progress ${Math.round(value)} percent`}>
      <span style={{ width: `${clampPercent(value)}%` }} />
    </div>
  )
}

function ProjectsView({
  projects,
  activeProjectId,
  scopeItems,
  logs,
  setActiveProjectId,
  setView,
}: {
  projects: Project[]
  activeProjectId: string
  scopeItems: ScopeItem[]
  logs: BuildLog[]
  setActiveProjectId: (projectId: string) => void
  setView: (view: ViewKey) => void
}) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderPlus}
        title="Create your first project to start tracking scope and forecasting your launch."
        body="A project gives ShipCheck enough structure to estimate launch risk and scope drift."
        action={
          <button className="button primary" type="button" onClick={() => setView('dashboard')}>
            Create project
          </button>
        }
      />
    )
  }

  return (
    <section className="page-stack">
      <div className="section-header">
        <div>
          <span className="eyebrow">Projects</span>
          <h2>Launch portfolio</h2>
        </div>
      </div>
      <div className="project-card-grid">
        {projects.map((project) => {
          const projectScope = scopeItems.filter((item) => item.projectId === project.id && item.column === 'ship')
          const total = projectScope.reduce((sum, item) => sum + item.estimateHours, 0)
          const done = projectScope.filter((item) => item.status === 'done').reduce((sum, item) => sum + item.estimateHours, 0)
          const percent = total > 0 ? (done / total) * 100 : 0
          const days = getDaysUntil(project.targetLaunchDate)
          return (
            <button
              className={`project-card ${project.id === activeProjectId ? 'active' : ''}`}
              key={project.id}
              type="button"
              onClick={() => setActiveProjectId(project.id)}
            >
              <div className="project-card-head">
                <strong>{project.name}</strong>
                <StatusPill status={project.status} />
              </div>
              <span className="scope-meta-badge">{project.type}</span>
              <p>{formatDate(project.targetLaunchDate)} · {days >= 0 ? `${days} days left` : `${Math.abs(days)} days overdue`}</p>
              <ProgressBar value={percent} />
              <small>{done}h of {total}h Ship scope complete · {logs.filter((log) => log.projectId === project.id).length} logs</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function AutomationPanel({
  metrics,
  project,
  setView,
}: {
  metrics: ShipMetrics
  project: Project
  setView: (view: ViewKey) => void
}) {
  const nudges = [
    metrics.todayHours === 0
      ? { title: 'Daily log missing', detail: 'No time logged today. Add a quick update to keep the forecast honest.', action: 'Log work', view: 'logs' as ViewKey }
      : { title: 'Daily log captured', detail: `${metrics.todayHours.toFixed(1)} hours logged today.`, action: 'Review logs', view: 'logs' as ViewKey },
    metrics.addedHours > metrics.completedShipHours
      ? { title: 'Scope drift watch', detail: `${metrics.addedHours} added hours is higher than completed Ship work.`, action: 'Trim scope', view: 'scope' as ViewKey }
      : { title: 'Scope steady', detail: 'Added scope is under control for this project.', action: 'Open scope', view: 'scope' as ViewKey },
    metrics.driftDays > 0
      ? { title: 'Forecast slipped', detail: `${project.name} is trending ${metrics.driftDays} days after target.`, action: 'Read report', view: 'reports' as ViewKey }
      : { title: 'Launch window intact', detail: 'Forecast is still inside the target window.', action: 'Read report', view: 'reports' as ViewKey },
  ]

  return (
    <div className="automation-strip" aria-label="Automated project nudges">
      {nudges.map((nudge) => (
        <button className="automation-nudge" key={nudge.title} type="button" onClick={() => setView(nudge.view)}>
          <Sparkles size={18} />
          <span>
            <strong>{nudge.title}</strong>
            <small>{nudge.detail}</small>
          </span>
          <em>{nudge.action}</em>
        </button>
      ))}
    </div>
  )
}

function Dashboard({
  data,
  project,
  projects,
  metrics,
  setView,
  setProject,
  newProjectDraft,
  setNewProjectDraft,
  createProject,
  projectFormError,
  clearProjectFormError,
  showScopeCreepBanner,
  scopeCreepTone,
  dismissCreepBanner,
  showTrialUpgradeBanner,
  trialDaysLeft,
  dismissTrialUpgradeBanner,
  forecastPulsing,
}: {
  data: AppData
  project: Project
  projects: Project[]
  metrics: ShipMetrics
  setView: (view: ViewKey) => void
  setProject: (project: Partial<Project>) => void
  newProjectDraft: { name: string; type: ProjectType; weeklyAvailableHours: number }
  setNewProjectDraft: (draft: { name: string; type: ProjectType; weeklyAvailableHours: number }) => void
  createProject: () => void
  projectFormError: string
  clearProjectFormError: () => void
  showScopeCreepBanner: boolean
  scopeCreepTone: 'warning' | 'danger'
  dismissCreepBanner: () => void
  showTrialUpgradeBanner: boolean
  trialDaysLeft: number
  dismissTrialUpgradeBanner: () => void
  forecastPulsing: boolean
}) {
  const completedPercent = metrics.shipHours > 0 ? (metrics.completedShipHours / metrics.shipHours) * 100 : 0
  const daysUntilForecast = getDaysUntil(metrics.forecastDate)
  const scopeGrowthWarning = metrics.scopeGrowthPercent > 20
  const focusProjectName = () => document.querySelector<HTMLInputElement>('[data-project-name-input="true"]')?.focus()

  if (projects.length === 0) {
    return (
      <section className="page-stack dashboard-empty-layout">
        <EmptyState
          icon={Rocket}
          title="Your first project is one step away"
          body="Create a project, set your scope, and ShipCheck will forecast your launch date automatically."
          action={
            <button className="button primary" type="button" onClick={focusProjectName}>
              Create your first project
            </button>
          }
        />
        <div className="new-project-panel dashboard-empty-form">
          <FolderPlus size={24} />
          <h3>Create project</h3>
          <label>
            Project name
            <input
              data-project-name-input="true"
              value={newProjectDraft.name}
              placeholder="Customer Portal MVP"
              onChange={(event) => {
                setNewProjectDraft({ ...newProjectDraft, name: event.target.value })
                clearProjectFormError()
              }}
            />
          </label>
          <label>
            Project type
            <select value={newProjectDraft.type} onChange={(event) => setNewProjectDraft({ ...newProjectDraft, type: event.target.value as ProjectType })}>
              <option>MVP/Product</option>
              <option>Client Project</option>
              <option>Internal Project</option>
              <option>Creator Project</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Weekly hours
            <input
              type="number"
              min="1"
              value={newProjectDraft.weeklyAvailableHours}
              onChange={(event) => setNewProjectDraft({ ...newProjectDraft, weeklyAvailableHours: Number(event.target.value) })}
            />
          </label>
          <button className="button primary full" type="button" onClick={createProject}>
            <Plus size={16} />
            Create project
          </button>
          {projectFormError && <InlineError message={projectFormError} actionLabel="Try again" onAction={clearProjectFormError} />}
        </div>
      </section>
    )
  }

  return (
    <section className="page-grid">
      {showTrialUpgradeBanner && (
        <div className="trial-upgrade-banner">
          <CreditCard size={20} />
          <div>
            <strong>Free Trial ends in {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'}.</strong>
            <p>Upgrade now so your active projects, reports, and forecasts stay available after the trial.</p>
          </div>
          <button className="button coral" type="button" onClick={() => setView('pricing')}>
            Upgrade
          </button>
          <button className="icon-button" type="button" aria-label="Dismiss trial upgrade prompt" onClick={dismissTrialUpgradeBanner}>
            <X size={16} />
          </button>
        </div>
      )}

      {project.currentStreak >= 3 && (
        <div className="overview-streak-row">
          <StreakPill streak={project.currentStreak} />
          <span>Longest streak: {project.longestStreak} days</span>
        </div>
      )}

      <div className={`forecast-panel ${metrics.launchStatus === 'Slipping' ? 'slipping' : ''} ${forecastPulsing ? 'forecast-pulse' : ''}`}>
        <div>
          <span className="eyebrow">Launch forecast</span>
          <h2>
            <AnimatedForecastDate date={metrics.forecastDate} />
          </h2>
          <p className="forecast-days">{daysUntilForecast >= 0 ? `${daysUntilForecast} days until forecast launch` : `${Math.abs(daysUntilForecast)} days past forecast launch`}</p>
          <StatusPill status={metrics.launchStatus} />
          <ProgressBar value={completedPercent} />
          <p>
            Target is {formatDate(project.targetLaunchDate)}.{' '}
            {metrics.driftDays <= 0
              ? 'The current scope fits the target timeline.'
              : `Current forecast is ${metrics.driftDays} days after target.`}
          </p>
          <span className="forecast-confidence">{metrics.forecastConfidence} confidence forecast</span>
        </div>
      </div>

      {showScopeCreepBanner && (
        <div className={`scope-creep-banner ${scopeCreepTone}`}>
          <AlertTriangle size={18} />
          <div>
            <strong>
              Scope has grown by {Math.max(0, metrics.currentScopeHours - metrics.baselineScopeHours)} hours since baseline -{' '}
              {metrics.addedItems.length} items added after project start.
            </strong>
            <p>Your forecast has shifted {metrics.forecastImpactDays} days later.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Dismiss scope creep banner" onClick={dismissCreepBanner}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="metrics-grid">
        <MetricCard
          icon={Target}
          label="Remaining ship scope"
          valueNode={<CountUpNumber value={metrics.remainingShipHours} suffix="h" />}
          detail={`${metrics.shipHours}h total in Ship`}
        />
        <MetricCard
          icon={Clock3}
          label="Logged velocity"
          valueNode={<CountUpNumber value={metrics.loggedVelocity} suffix="h/wk" decimals={1} />}
          detail={`${metrics.averageDailyHours.toFixed(1)}h/day, trend ${metrics.velocityTrend}`}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Scope added"
          valueNode={<CountUpNumber value={metrics.addedHours} suffix="h" />}
          detail={`${metrics.addedItems.length} items since baseline`}
        />
        <MetricCard
          icon={Users}
          label="Team size"
          valueNode={<CountUpNumber value={project.teamSize} />}
          detail={`${data.user.plan} plan`}
        />
      </div>

      <AutomationPanel metrics={metrics} project={project} setView={setView} />

      <div className={`section-band scope-health ${scopeGrowthWarning ? 'warning' : ''}`}>
        <span className="eyebrow">Scope health</span>
        <h2>Your scope has grown {Math.max(0, metrics.scopeGrowthPercent)}% since you started.</h2>
        <div className="scope-health-bars">
          <div>
            <span>Baseline</span>
            <ProgressBar value={metrics.currentScopeHours > 0 ? (metrics.baselineScopeHours / metrics.currentScopeHours) * 100 : 0} />
            <strong>{metrics.baselineScopeHours}h</strong>
          </div>
          <div>
            <span>Current</span>
            <ProgressBar value={100} />
            <strong>{metrics.currentScopeHours}h</strong>
          </div>
        </div>
      </div>

      <div className="section-band two-column animated-band">
        <div>
          <span className="eyebrow">Project portfolio</span>
          <h2>{projects.length} active project{projects.length === 1 ? '' : 's'}</h2>
          <p className="muted">Create a focused project when a new launch needs its own scope, logs, and forecast.</p>
          <div className="project-list">
            {projects.map((currentProject) => (
              <div className="mini-project" key={currentProject.id}>
                <div>
                  <strong>{currentProject.name}</strong>
                  <p>{currentProject.type}</p>
                </div>
                <StatusPill status={currentProject.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="new-project-panel">
          <FolderPlus size={24} />
          <h3>Create project</h3>
          <label>
            Project name
            <input
              value={newProjectDraft.name}
              placeholder="Mobile onboarding sprint"
              onChange={(event) => {
                setNewProjectDraft({ ...newProjectDraft, name: event.target.value })
                clearProjectFormError()
              }}
            />
          </label>
          <label>
            Project type
            <select value={newProjectDraft.type} onChange={(event) => setNewProjectDraft({ ...newProjectDraft, type: event.target.value as ProjectType })}>
              <option>MVP/Product</option>
              <option>Client Project</option>
              <option>Internal Project</option>
              <option>Creator Project</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Weekly hours
            <input
              type="number"
              min="1"
              value={newProjectDraft.weeklyAvailableHours}
              onChange={(event) => setNewProjectDraft({ ...newProjectDraft, weeklyAvailableHours: Number(event.target.value) })}
            />
          </label>
          <button className="button primary full" type="button" onClick={createProject}>
            <Plus size={16} />
            Create project
          </button>
          {projectFormError && <InlineError message={projectFormError} actionLabel="Try again" onAction={clearProjectFormError} />}
        </div>
      </div>

      <div className="section-band two-column">
        <div>
          <span className="eyebrow">Project setup</span>
          <h2>Keep the launch contract current</h2>
          <p className="muted">These fields drive forecast and scope pressure checks.</p>
          <div className="form-grid">
            <label>
              Project type
              <select value={project.type} onChange={(event) => setProject({ type: event.target.value as ProjectType })}>
                <option>MVP/Product</option>
                <option>Client Project</option>
                <option>Internal Project</option>
                <option>Creator Project</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Status
              <select value={project.status} onChange={(event) => setProject({ status: event.target.value as ProjectStatus })}>
                <option>Planning</option>
                <option>Building</option>
                <option>Paused</option>
                <option>Shipped</option>
                <option>Archived</option>
              </select>
            </label>
            <label>
              Start date
              <input type="date" value={project.startDate} onChange={(event) => setProject({ startDate: event.target.value })} />
            </label>
            <label>
              Target launch date
              <input type="date" value={project.targetLaunchDate} onChange={(event) => setProject({ targetLaunchDate: event.target.value })} />
            </label>
            <label>
              Weekly available hours
              <input
                type="number"
                min="1"
                value={project.weeklyAvailableHours}
                onChange={(event) => setProject({ weeklyAvailableHours: Number(event.target.value) })}
              />
            </label>
          </div>
          <label className="project-description">
            Project description
            <textarea value={project.description} onChange={(event) => setProject({ description: event.target.value })} />
          </label>
        </div>
        <div className="next-action">
          <ClipboardCheck size={24} />
          <h3>Recommended next action</h3>
          <p>
            {metrics.highEffortShipItems.length > 0
              ? `${metrics.highEffortShipItems[0].title} is the largest remaining Ship item at ${metrics.highEffortShipItems[0].estimateHours} hours.`
              : metrics.lowConfidenceShipItems.length > 0
                ? 'Tighten low-confidence estimates before trusting the forecast.'
                : metrics.addedHours > metrics.completedShipHours
              ? 'Review added scope before adding more work. Scope added is outpacing completed launch work.'
              : 'Log progress today and keep the Ship column limited to launch-critical work.'}
          </p>
          <div className="button-row">
            <button className="button primary" type="button" onClick={() => setView('scope')}>
              Review scope
              <ArrowRight size={16} />
            </button>
            <button className="button secondary" type="button" onClick={() => setView('logs')}>
              Add log
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function ScopeView({
  items,
  labels,
  draft,
  setDraft,
  addItem,
  formError,
  updateItem,
  rankItem,
  deleteItem,
  metrics,
  showScopeCreepBanner,
  scopeCreepTone,
  dismissCreepBanner,
}: {
  items: ScopeItem[]
  labels: Record<ColumnKey, { title: string; description: string }>
  draft: { title: string; estimateHours: number; column: ColumnKey; confidence: Confidence; addedReason: string }
  setDraft: (draft: { title: string; estimateHours: number; column: ColumnKey; confidence: Confidence; addedReason: string }) => void
  addItem: () => void
  formError: string
  updateItem: (id: string, patch: Partial<ScopeItem>) => void
  rankItem: (id: string, direction: 'up' | 'down') => void
  deleteItem: (id: string) => void
  metrics: ShipMetrics
  showScopeCreepBanner: boolean
  scopeCreepTone: 'warning' | 'danger'
  dismissCreepBanner: () => void
}) {
  const [mobileExpandedColumns, setMobileExpandedColumns] = useState<Record<ColumnKey, boolean>>({
    ship: true,
    later: false,
    cut: false,
  })
  const [draggingItemId, setDraggingItemId] = useState('')
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | ''>('')
  const [droppedItemId, setDroppedItemId] = useState('')
  const focusScopeInput = () => document.querySelector<HTMLInputElement>('[data-scope-title-input="true"]')?.focus()

  const clearDragState = () => {
    setDraggingItemId('')
    setDragOverColumn('')
  }

  const dropItemIntoColumn = (column: ColumnKey) => {
    if (!draggingItemId) return
    updateItem(draggingItemId, { column })
    setDroppedItemId(draggingItemId)
    window.setTimeout(() => setDroppedItemId(''), 220)
    clearDragState()
  }

  return (
    <section className="page-stack">
      <div className="section-header">
        <div>
          <span className="eyebrow">Scope board</span>
          <h2>Force the launch decision</h2>
        </div>
      </div>

      <div className="quick-add">
        <input
          data-scope-title-input="true"
          value={draft.title}
          placeholder="Add a scope item"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <input
          type="number"
          min="1"
          value={draft.estimateHours}
          aria-label="Estimated hours"
          onChange={(event) => setDraft({ ...draft, estimateHours: Number(event.target.value) })}
        />
        <select value={draft.column} aria-label="Scope column" onChange={(event) => setDraft({ ...draft, column: event.target.value as ColumnKey })}>
          <option value="ship">Ship</option>
          <option value="later">Later</option>
          <option value="cut">Cut</option>
        </select>
        <select value={draft.confidence} aria-label="Estimate confidence" onChange={(event) => setDraft({ ...draft, confidence: event.target.value as Confidence })}>
          <option value="high">High confidence</option>
          <option value="medium">Medium confidence</option>
          <option value="low">Low confidence</option>
        </select>
        <button className="button primary" type="button" onClick={addItem}>
          <Plus size={16} />
          Add
        </button>
      </div>
      {formError && <InlineError message={formError} actionLabel="Try again" onAction={() => setDraft({ ...draft, title: '' })} />}

      {showScopeCreepBanner && (
        <div className={`scope-creep-banner ${scopeCreepTone}`}>
          <AlertTriangle size={18} />
          <div>
            <strong>
              Scope has grown by {Math.max(0, metrics.currentScopeHours - metrics.baselineScopeHours)} hours since baseline -{' '}
              {metrics.addedItems.length} items added after project start.
            </strong>
            <p>Your forecast has shifted {metrics.forecastImpactDays} days later.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Dismiss scope creep banner" onClick={dismissCreepBanner}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="board">
        {(['ship', 'later', 'cut'] as ColumnKey[]).map((column) => {
          const columnItems = items.filter((item) => item.column === column).sort((a, b) => a.rankOrder - b.rankOrder)
          const total = columnItems.reduce((sum, item) => sum + item.estimateHours, 0)
          const isMobileExpanded = mobileExpandedColumns[column]
          return (
            <div
              className={`board-column ${isMobileExpanded ? 'mobile-open' : 'mobile-collapsed'} ${dragOverColumn === column ? 'drag-over' : ''}`}
              key={column}
              onDragOver={(event) => {
                event.preventDefault()
                if (draggingItemId) setDragOverColumn(column)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverColumn('')
              }}
              onDrop={(event) => {
                event.preventDefault()
                dropItemIntoColumn(column)
              }}
            >
              <div className="column-header">
                <div>
                  <h3>{labels[column].title}</h3>
                  <p>{labels[column].description}</p>
                </div>
                <div className="column-meta">
                  <span>{columnItems.length} items · {total}h</span>
                  <button
                    className="column-toggle"
                    type="button"
                    aria-expanded={isMobileExpanded}
                    aria-label={`${isMobileExpanded ? 'Collapse' : 'Expand'} ${labels[column].title}`}
                    onClick={() => setMobileExpandedColumns((current) => ({ ...current, [column]: !current[column] }))}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
              <div className="scope-list">
                {columnItems.length === 0 && (
                  <EmptyState
                    icon={ListChecks}
                    title={column === 'ship' ? 'Nothing in scope yet' : 'Nothing here yet'}
                    body={
                      column === 'ship'
                        ? 'Add your first scope item - everything that must exist before you launch.'
                        : undefined
                    }
                    action={
                      column === 'ship' ? (
                        <button className="button primary" type="button" onClick={focusScopeInput}>
                          Add scope item
                        </button>
                      ) : undefined
                    }
                  />
                )}
                {columnItems.map((item) => (
                  <article
                    className={`scope-card ${!item.existedAtBaseline ? 'added' : ''} ${draggingItemId === item.id ? 'drag-active' : ''} ${
                      droppedItemId === item.id ? 'drop-settle' : ''
                    }`}
                    draggable
                    key={item.id}
                    onDragStart={(event) => {
                      setDraggingItemId(item.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', item.id)
                    }}
                    onDragEnd={clearDragState}
                  >
                    <GripVertical className="drag-handle" size={16} aria-hidden="true" />
                    {!item.existedAtBaseline && <span className="added-badge">Added after baseline</span>}
                    <div className="scope-card-head">
                      <strong>{item.title}</strong>
                      <div className="scope-card-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Edit ${item.title}`}
                          onClick={(event) => {
                            event.currentTarget
                              .closest('article')
                              ?.querySelector<HTMLInputElement>('[aria-label="Edit estimated hours"]')
                              ?.focus()
                          }}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button className="icon-button" type="button" aria-label={`Delete ${item.title}`} onClick={() => deleteItem(item.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="scope-meta">
                      <span>Rank {item.rankOrder}</span>
                      <span className="estimate-badge">{item.estimateHours}h</span>
                      <span className={`confidence-dot ${item.confidence}`}>{item.confidence}</span>
                      <span>{item.confidence} confidence</span>
                      <StatusPill status={item.status === 'not-started' ? 'Not Started' : item.status === 'in-progress' ? 'In Progress' : 'Done'} />
                      {item.approvedScopeChange && <span>Approved</span>}
                      {item.movementHistory.length > 0 && <span>{item.movementHistory.length} moves</span>}
                    </div>
                    <div className="scope-controls">
                      <button className="button tiny" type="button" onClick={() => rankItem(item.id, 'up')}>
                        Move up
                      </button>
                      <button className="button tiny" type="button" onClick={() => rankItem(item.id, 'down')}>
                        Move down
                      </button>
                      <select value={item.column} aria-label="Move item" onChange={(event) => updateItem(item.id, { column: event.target.value as ColumnKey })}>
                        <option value="ship">Ship</option>
                        <option value="later">Later</option>
                        <option value="cut">Cut</option>
                      </select>
                      <select value={item.status} aria-label="Item status" onChange={(event) => updateItem(item.id, { status: event.target.value as ItemStatus })}>
                        <option value="not-started">Not Started</option>
                        <option value="in-progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        aria-label="Edit estimated hours"
                        value={item.estimateHours}
                        onChange={(event) => updateItem(item.id, { estimateHours: Number(event.target.value) })}
                      />
                      <select value={item.confidence} aria-label="Edit confidence" onChange={(event) => updateItem(item.id, { confidence: event.target.value as Confidence })}>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <label className="scope-note">
                      Notes
                      <textarea
                        value={item.description}
                        placeholder="Why this belongs in this launch scope"
                        onChange={(event) => updateItem(item.id, { description: event.target.value })}
                      />
                    </label>
                    <div className="scope-toggles">
                      <label>
                        <input
                          type="checkbox"
                          checked={item.existedAtBaseline}
                          onChange={(event) => updateItem(item.id, { existedAtBaseline: event.target.checked })}
                        />
                        Baseline item
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.approvedScopeChange}
                          onChange={(event) => updateItem(item.id, { approvedScopeChange: event.target.checked })}
                        />
                        Approved change
                      </label>
                    </div>
                    {item.movementHistory.length > 0 && (
                      <p className="movement-note">
                        Last moved {formatDate(item.movementHistory[item.movementHistory.length - 1].changedAt)}.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function LogsView({
  project,
  logs,
  items,
  draft,
  setDraft,
  addLog,
  formError,
  deleteLog,
  updateItem,
  logSaved,
  forecastMovement,
  editingLogId,
  editingDraft,
  setEditingDraft,
  startEdit,
  saveEdit,
  cancelEdit,
}: {
  project: Project
  logs: BuildLog[]
  items: ScopeItem[]
  draft: { logDate: string; hours: number; summary: string; blockers: string; scopeItemId: string; newScopeAdded: boolean }
  setDraft: (draft: { logDate: string; hours: number; summary: string; blockers: string; scopeItemId: string; newScopeAdded: boolean }) => void
  addLog: () => void
  formError: string
  deleteLog: (id: string) => void
  updateItem: (id: string, patch: Partial<ScopeItem>) => void
  logSaved: boolean
  forecastMovement: ForecastMovement | null
  editingLogId: string | null
  editingDraft: { logDate: string; hours: number; summary: string; blockers: string; scopeItemId: string; newScopeAdded: boolean }
  setEditingDraft: (draft: { logDate: string; hours: number; summary: string; blockers: string; scopeItemId: string; newScopeAdded: boolean }) => void
  startEdit: (log: BuildLog) => void
  saveEdit: () => void
  cancelEdit: () => void
}) {
  const focusLogSummary = () => document.querySelector<HTMLTextAreaElement>('[data-log-summary-input="true"]')?.focus()

  return (
    <section className="page-grid logs-grid">
      <div className="log-form">
        <span className="eyebrow">Mobile-first quick log</span>
        <h2>Log today's build work</h2>
        <div className="quick-log-row">
          <label>
            Date
            <input type="date" value={draft.logDate} onChange={(event) => setDraft({ ...draft, logDate: event.target.value })} />
          </label>
          <label>
            Hours
            <input type="number" min="0.25" step="0.25" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: Number(event.target.value) })} />
          </label>
          <label>
            Worked on
            <select value={draft.scopeItemId} onChange={(event) => setDraft({ ...draft, scopeItemId: event.target.value })}>
              <option value="">No linked scope item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="quick-log-summary">
            Summary
            <textarea
              data-log-summary-input="true"
              value={draft.summary}
              rows={2}
              placeholder="What moved forward?"
              onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            />
          </label>
          <button className="button primary" type="button" onClick={addLog}>
            <Plus size={16} />
            Log It
          </button>
        </div>
        <label>
          Blockers
          <textarea value={draft.blockers} placeholder="Optional" onChange={(event) => setDraft({ ...draft, blockers: event.target.value })} />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={draft.newScopeAdded}
            onChange={(event) => setDraft({ ...draft, newScopeAdded: event.target.checked })}
          />
          New scope was added today
        </label>
        {formError && <InlineError message={formError} actionLabel="Try again" onAction={() => setDraft({ ...draft, summary: '' })} />}
        {logSaved && (
          <div className="log-save-feedback">
            <div className="save-confirmation">
              <Check size={16} />
              Build log saved.
            </div>
            <ForecastMovementIndicator movement={forecastMovement} />
          </div>
        )}
      </div>

      <div className="log-history">
        <div className="section-header">
          <div>
            <span className="eyebrow">History</span>
            <h2>Recent build logs</h2>
          </div>
          <StreakPill streak={project.currentStreak} />
        </div>
        {logs.length === 0 && (
          <EmptyState
            icon={Clock3}
            title="No logs yet"
            body="Log your first session to start building your launch forecast."
            action={
              <button className="button primary" type="button" onClick={focusLogSummary}>
                Log today's work
              </button>
            }
          />
        )}
        {logs.map((log) => {
          const linkedItem = items.find((item) => item.id === log.scopeItemId)
          const isEditing = editingLogId === log.id
          return (
            <article className="log-card" key={log.id}>
              {isEditing ? (
                <div className="edit-log">
                  <label>
                    Date
                    <input type="date" value={editingDraft.logDate} onChange={(event) => setEditingDraft({ ...editingDraft, logDate: event.target.value })} />
                  </label>
                  <label>
                    Hours
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      value={editingDraft.hours}
                      onChange={(event) => setEditingDraft({ ...editingDraft, hours: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Worked on
                    <select value={editingDraft.scopeItemId} onChange={(event) => setEditingDraft({ ...editingDraft, scopeItemId: event.target.value })}>
                      <option value="">No linked scope item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Summary
                    <textarea value={editingDraft.summary} onChange={(event) => setEditingDraft({ ...editingDraft, summary: event.target.value })} />
                  </label>
                  <label>
                    Blockers
                    <textarea value={editingDraft.blockers} onChange={(event) => setEditingDraft({ ...editingDraft, blockers: event.target.value })} />
                  </label>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={editingDraft.newScopeAdded}
                      onChange={(event) => setEditingDraft({ ...editingDraft, newScopeAdded: event.target.checked })}
                    />
                    New scope was added that day
                  </label>
                  <div className="button-row">
                    <button className="button primary" type="button" onClick={saveEdit}>
                      Save changes
                    </button>
                    <button className="button secondary" type="button" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{formatDate(log.logDate)}</strong>
                    <p>{log.summary}</p>
                    {log.blockers && <p className="blocker">Blocker: {log.blockers}</p>}
                    {log.newScopeAdded && <p className="blocker">New scope was added that day.</p>}
                    {linkedItem && <span className="linked-item">{linkedItem.title}</span>}
                  </div>
                  <div className="log-actions">
                    <span>{(log.minutesSpent / 60).toFixed(1)}h</span>
                    {linkedItem && linkedItem.status !== 'done' && (
                      <button className="button tiny" type="button" onClick={() => updateItem(linkedItem.id, { status: 'done' })}>
                        Mark done
                      </button>
                    )}
                    <button className="icon-button" type="button" aria-label={`Edit log from ${log.logDate}`} onClick={() => startEdit(log)}>
                      <Edit3 size={15} />
                    </button>
                    <button className="icon-button" type="button" aria-label="Delete log" onClick={() => deleteLog(log.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function QuickLogSheet({
  draft,
  setDraft,
  items,
  formError,
  logSaved,
  forecastMovement,
  addLog,
  onClose,
}: {
  draft: { logDate: string; hours: number; summary: string; blockers: string; scopeItemId: string; newScopeAdded: boolean }
  setDraft: (draft: { logDate: string; hours: number; summary: string; blockers: string; scopeItemId: string; newScopeAdded: boolean }) => void
  items: ScopeItem[]
  formError: string
  logSaved: boolean
  forecastMovement: ForecastMovement | null
  addLog: () => void
  onClose: () => void
}) {
  return (
    <div className="sheet-overlay" role="presentation">
      <section className="quick-log-sheet sheet" role="dialog" aria-modal="true" aria-labelledby="quick-log-title">
        <button className="sheet-handle" type="button" aria-label="Close quick log" onClick={onClose} />
        <div className="sheet-header">
          <div>
            <span className="eyebrow">Quick log</span>
            <h2 id="quick-log-title">Log today's work</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close quick log" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <label>
          Summary
          <textarea value={draft.summary} rows={3} placeholder="What moved forward?" onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
        </label>
        <div className="sheet-grid">
          <label>
            Hours
            <input type="number" min="0.25" step="0.25" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: Number(event.target.value) })} />
          </label>
          <label>
            Worked on
            <select value={draft.scopeItemId} onChange={(event) => setDraft({ ...draft, scopeItemId: event.target.value })}>
              <option value="">No linked scope item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={draft.newScopeAdded}
            onChange={(event) => setDraft({ ...draft, newScopeAdded: event.target.checked })}
          />
          New scope was added today
        </label>
        {formError && <InlineError message={formError} actionLabel="Try again" onAction={() => setDraft({ ...draft, summary: '' })} />}
        {logSaved && (
          <div className="log-save-feedback">
            <div className="save-confirmation">
              <Check size={16} />
              Build log saved.
            </div>
            <ForecastMovementIndicator movement={forecastMovement} />
          </div>
        )}
        <button className="button primary full" type="button" onClick={addLog}>
          Log It
        </button>
      </section>
    </div>
  )
}

function ReportsView({
  project,
  metrics,
  setView,
  emailReportStatus,
  emailReportSending,
  sendReportEmail,
  plan,
}: {
  project: Project
  metrics: ShipMetrics
  setView: (view: ViewKey) => void
  emailReportStatus: string
  emailReportSending: boolean
  sendReportEmail: () => void
  plan: string
}) {
  const suggestions = [
    metrics.addedHours > 0 ? `Review ${metrics.addedItems.length} added scope items before adding more work.` : 'Scope has stayed steady since baseline.',
    metrics.highEffortShipItems.length > 0
      ? `${metrics.highEffortShipItems[0].title} is a high-effort Ship item. Move it to Later unless it is launch-critical.`
      : 'No unusually large Ship items are currently blocking launch.',
    metrics.lowConfidenceShipItems.length > 0
      ? `${metrics.lowConfidenceShipItems.length} remaining Ship item has low estimate confidence. Re-estimate before relying on the launch date.`
      : 'Remaining Ship estimates have acceptable confidence.',
    metrics.unestimatedAddedItems.length > 0
      ? `${metrics.unestimatedAddedItems.length} added scope item needs an estimate before the report is complete.`
      : 'All added scope has an estimate.',
    metrics.remainingShipHours > project.weeklyAvailableHours
      ? 'Ship scope is larger than one available week. Consider moving one high-effort item to Later.'
      : 'Remaining Ship scope fits inside your weekly capacity.',
    metrics.driftDays > 0 ? 'Launch forecast is past target. Reduce Ship scope or increase weekly capacity.' : 'Forecast is inside the target window.',
    metrics.stalled ? 'No build logs were recorded this week while work remains. Log progress or pause the project.' : 'Recent activity is present for this project.',
    metrics.insufficientData ? 'Forecast confidence is limited until at least two logs and one Ship item exist.' : 'There is enough activity to produce a directional forecast.',
  ]

  return (
    <section className="page-stack">
      <div className="section-header">
        <div>
          <span className="eyebrow">Weekly scope report</span>
          <h2>Project reality check</h2>
        </div>
        <div className="section-actions">
          <StatusPill status={metrics.launchStatus} />
          <button className="button secondary" type="button" onClick={sendReportEmail} disabled={emailReportSending}>
            {emailReportSending ? 'Sending...' : 'Email report'}
          </button>
        </div>
      </div>

      {emailReportStatus && <p className="form-note">{emailReportStatus}</p>}

      {project.status === 'Shipped' && (
        <div className="report-banner shipped">
          <Rocket size={20} />
          <div>
            <strong>Project shipped</strong>
            <p>Weekly scope creep reports are paused for shipped projects. This report remains available as project history.</p>
          </div>
        </div>
      )}

      {metrics.insufficientData && project.status !== 'Shipped' && (
        <div className="report-banner">
          <AlertTriangle size={20} />
          <div>
            <strong>Limited forecast data</strong>
            <p>Add at least two build logs and keep estimates current before treating this forecast as reliable.</p>
          </div>
        </div>
      )}

      {metrics.insufficientData && project.status !== 'Shipped' && (
        <EmptyState
          icon={FileText}
          title="Your first report appears after a week of project activity."
          body="Log work and keep your Ship scope updated so ShipCheck can produce a useful weekly report."
          action={
            <button className="button primary" type="button" onClick={() => setView('logs')}>
              Log It
            </button>
          }
        />
      )}

      {metrics.stalled && (
        <div className="report-banner stalled">
          <Clock3 size={20} />
          <div>
            <strong>Project appears stalled</strong>
            <p>No build logs were recorded in the last seven days while Ship scope remains unfinished.</p>
          </div>
        </div>
      )}

      <div className="report-grid">
        <MetricCard
          icon={CalendarDays}
          label="Forecast date"
          value={formatDate(metrics.forecastDate)}
          detail={`${metrics.forecastConfidence} confidence, target ${formatDate(project.targetLaunchDate)}`}
        />
        <MetricCard icon={BarChart3} label="This week logged" value={`${metrics.weekHours.toFixed(1)}h`} detail="Recent build activity" />
        <MetricCard icon={AlertTriangle} label="Added scope cost" value={`${metrics.addedHours}h`} detail="Since baseline" />
      </div>

      <div className="section-band">
        <h3>Work completed this week</h3>
        {metrics.completedThisWeekItems.length === 0 && <p className="empty">No Ship items were marked done this week.</p>}
        {metrics.completedThisWeekItems.map((item) => (
          <div className="report-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.estimateHours} estimated hours completed.</p>
            </div>
            <span>{item.completedAt ? formatDate(item.completedAt) : 'Done'}</span>
          </div>
        ))}
      </div>

      <div className="section-band">
        <h3>Scope creep summary</h3>
        {metrics.addedItems.length === 0 && <p className="empty">No scope added since project start.</p>}
        {metrics.addedItems.map((item) => (
          <div className="report-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.addedReason}</p>
            </div>
            <span>{item.estimateHours}h</span>
          </div>
        ))}
      </div>

      <div className="section-band">
        <h3>Launch date movement</h3>
        <p className="muted">
          {metrics.driftDays <= 0
            ? 'Current forecast is on or before the target date.'
            : `Current scope and velocity put launch ${metrics.driftDays} days after target.`}
        </p>
      </div>

      <div className="section-band">
        <h3>Recommendations</h3>
        <div className="recommendations">
          {suggestions.map((suggestion) => (
            <div className="recommendation" key={suggestion}>
              <Check size={16} />
              <span>{suggestion}</span>
            </div>
          ))}
        </div>
      </div>

      {isFreeTrial(plan) && (
        <div className="report-upgrade-banner">
          <CreditCard size={18} />
          <span>Unlock full report history with Solo - $9/month.</span>
          <button className="button coral" type="button" onClick={() => setView('pricing')}>
            Upgrade
          </button>
        </div>
      )}
    </section>
  )
}



function ShippedMoment({
  project,
  metrics,
  logCount,
  setView,
  startNewProject,
}: {
  project: Project
  metrics: ShipMetrics
  logCount: number
  setView: (view: ViewKey) => void
  startNewProject: () => void
}) {
  const shippedDate = formatDate(today)
  const buildDays = Math.max(1, daysBetween(project.startDate, isoToday) + 1)
  const completedItems = metrics.shipItems.filter((item) => item.status === 'done').length
  const driftHours = metrics.addedHours
  const targetDelta = daysBetween(project.targetLaunchDate, isoToday)
  const scopeDriftCopy = driftHours > 0 ? `+${driftHours} hours added after baseline` : 'No scope drift'
  const targetCopy =
    targetDelta === 0
      ? 'Your final launch landed on your original target.'
      : `Your final launch landed ${Math.abs(targetDelta)} day${Math.abs(targetDelta) === 1 ? '' : 's'} ${
          targetDelta < 0 ? 'ahead of' : 'behind'
        } your original target.`
  const story = `You shipped ${project.name} in ${buildDays} day${buildDays === 1 ? '' : 's'}, logging ${metrics.loggedHours.toFixed(
    1,
  )} hours across ${logCount} session${logCount === 1 ? '' : 's'}. ${
    driftHours > 0 ? `Scope grew by ${driftHours} hours after baseline. ` : 'Scope stayed aligned with the baseline. '
  }${targetCopy}`
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://shipcheck.app'

  const downloadShareCard = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 630
    const context = canvas.getContext('2d')
    if (!context) return

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#fafaf7'
    context.fillRect(48, 48, 1104, 534)
    context.strokeStyle = '#e7ece9'
    context.lineWidth = 3
    context.strokeRect(48, 48, 1104, 534)
    context.fillStyle = '#0f766e'
    context.beginPath()
    context.roundRect(92, 88, 56, 56, 12)
    context.fill()
    context.strokeStyle = '#ffffff'
    context.lineWidth = 6
    context.beginPath()
    context.moveTo(108, 118)
    context.lineTo(122, 132)
    context.lineTo(144, 104)
    context.stroke()
    context.fillStyle = '#18201f'
    context.font = '700 56px Inter, Arial, sans-serif'
    context.fillText(project.name, 92, 226, 920)
    context.font = '700 34px Inter, Arial, sans-serif'
    context.fillText('Shipped with ShipCheck', 92, 288)
    context.fillStyle = '#3f4a47'
    context.font = '500 28px Inter, Arial, sans-serif'
    context.fillText(`Shipped ${shippedDate}`, 92, 360)
    context.fillText(`${metrics.loggedHours.toFixed(1)} hours logged`, 92, 410)
    context.fillText(scopeDriftCopy, 92, 460)
    context.fillStyle = '#0f766e'
    context.font = '800 28px Inter, Arial, sans-serif'
    context.fillText(shareUrl, 92, 528)

    const link = document.createElement('a')
    link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-shipcheck-card.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <section className="shipped-screen">
      <div className="shipped-content">
        <svg className="shipped-check" viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r="34" />
          <path d="M24 41.5 35.5 53 57 28" />
        </svg>
        <h2>Shipped.</h2>
        <p>{project.name} is done. Here's how it went.</p>

        <div className="shipped-stats">
          <MetricCard icon={CalendarDays} label="Launch date" value={shippedDate} detail="Actual ship date" />
          <MetricCard icon={Clock3} label="Total hours logged" value={`${metrics.loggedHours.toFixed(1)}h`} detail={`${logCount} build sessions`} />
          <MetricCard icon={Target} label="Scope items completed" value={`${completedItems}`} detail={`${metrics.shipItems.length} Ship items tracked`} />
          <MetricCard icon={AlertTriangle} label="Scope drift" value={driftHours > 0 ? `+${driftHours}h` : '0h'} detail={scopeDriftCopy} />
        </div>

        <p className="launch-story">{story}</p>

        <div className="share-card" aria-label="Shareable shipped card">
          <div className="share-card-brand">
            <span className="brand-mark" aria-hidden="true">
              <Check size={17} strokeWidth={3} />
            </span>
            <strong>ShipCheck</strong>
          </div>
          <h3>{project.name}</h3>
          <p>Shipped {shippedDate}</p>
          <div>
            <span>{metrics.loggedHours.toFixed(1)}h logged</span>
            <span>{scopeDriftCopy}</span>
          </div>
          <small>{shareUrl}</small>
        </div>

        <div className="button-row shipped-actions">
          <button className="button secondary" type="button" onClick={downloadShareCard}>
            <Download size={16} />
            Download card
          </button>
          <button className="button secondary" type="button" onClick={() => setView('reports')}>
            View Final Report
          </button>
          <button className="button primary" type="button" onClick={startNewProject}>
            Start a New Project
          </button>
        </div>
      </div>
    </section>
  )
}

function UpgradeModal({
  activePlan,
  billingPlanLoading,
  onClose,
  reason,
  startCheckout,
}: {
  activePlan: string
  billingPlanLoading: string
  onClose: () => void
  reason: string
  startCheckout: (plan: string) => void
}) {
  const upgradePlans = plans.filter((plan) => plan.name !== 'Free Trial')

  return (
    <div className="modal-overlay" role="presentation">
      <section className="modal upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
        <button className="icon-button modal-close" type="button" aria-label="Close upgrade options" onClick={onClose}>
          <X size={16} />
        </button>
        <span className="eyebrow">Plan limit reached</span>
        <h2 id="upgrade-modal-title">Upgrade to keep building.</h2>
        <p>{reason}</p>
        <div className="upgrade-plan-grid">
          {upgradePlans.map((plan) => (
            <article className={`upgrade-plan ${activePlan === plan.name ? 'selected' : ''}`} key={plan.name}>
              <div>
                <h3>{plan.name}</h3>
                <strong>{plan.price}</strong>
                <p>{plan.detail}</p>
                <span>{plan.seats}</span>
              </div>
              <button
                className={plan.name === 'Enterprise' ? 'button secondary full' : 'button coral full'}
                type="button"
                onClick={() => startCheckout(plan.name)}
                disabled={activePlan === plan.name || billingPlanLoading === plan.name}
              >
                {activePlan === plan.name
                  ? 'Current plan'
                  : billingPlanLoading === plan.name
                    ? 'Starting checkout...'
                    : plan.name === 'Enterprise'
                      ? 'Contact sales'
                      : 'Checkout with Creem'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function SettingsView({
  data,
  project,
  setData,
  setProject,
  deleteProject,
  exportProject,
  startOnboarding,
  markProjectShipped,
  resetDemo,
  billing,
  trialDaysLeft,
  trialExpiryDate,
  setView,
  manageBilling,
}: {
  data: AppData
  project: Project
  setData: (data: AppData) => void
  setProject: (project: Partial<Project>) => void
  deleteProject: () => void
  exportProject: () => void
  startOnboarding: () => void
  markProjectShipped: () => void
  resetDemo: () => void
  billing: BillingInfo
  trialDaysLeft: number
  trialExpiryDate: string
  setView: (view: ViewKey) => void
  manageBilling: () => void
}) {
  const trialing = isFreeTrial(data.user.plan)
  const paidPlan = !trialing && data.user.plan !== 'Free Trial'

  return (
    <section className="page-grid">
      <div className="section-band">
        <span className="eyebrow">Account</span>
        <h2>Profile and project settings</h2>
        <div className="form-grid">
          <label>
            Name
            <input value={data.user.name} onChange={(event) => setData({ ...data, user: { ...data.user, name: event.target.value } })} />
          </label>
          <label>
            Email
            <input value={data.user.email} onChange={(event) => setData({ ...data, user: { ...data.user, email: event.target.value } })} />
          </label>
          <label>
            Project name
            <input value={project.name} onChange={(event) => setProject({ name: event.target.value })} />
          </label>
          <label>
            Team size
            <input
              type="number"
              min="1"
              value={project.teamSize}
              onChange={(event) => setProject({ teamSize: Number(event.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="section-band">
        <span className="eyebrow">Project lifecycle</span>
        <h2>Ship, archive, export, or reset</h2>
        <div className="lifecycle-actions">
          <button className="button primary" type="button" onClick={markProjectShipped}>
            <Rocket size={16} />
            Mark shipped
          </button>
          <button className="button secondary" type="button" onClick={() => setProject({ status: 'Archived' })}>
            <Archive size={16} />
            Archive project
          </button>
          <button className="button secondary" type="button" onClick={exportProject}>
            <Download size={16} />
            Export project
          </button>
          <button className="button secondary" type="button" onClick={startOnboarding}>
            <Sparkles size={16} />
            Guided onboarding
          </button>
          <button className="button danger" type="button" onClick={deleteProject}>
            <Trash2 size={16} />
            Delete project
          </button>
        </div>
      </div>

      <div className="section-band two-column">
        <div>
          <span className="eyebrow">Notifications</span>
          <h2>Report and reminder preferences</h2>
          <div className="settings-toggle-list">
            <label>
              <input
                type="checkbox"
                checked={data.user.notificationPreferences.weeklyReport}
                onChange={(event) =>
                  setData({
                    ...data,
                    user: {
                      ...data.user,
                      notificationPreferences: {
                        ...data.user.notificationPreferences,
                        weeklyReport: event.target.checked,
                      },
                    },
                  })
                }
              />
              Weekly scope report
            </label>
            <label>
              <input
                type="checkbox"
                checked={data.user.notificationPreferences.dailyReminder}
                onChange={(event) =>
                  setData({
                    ...data,
                    user: {
                      ...data.user,
                      notificationPreferences: {
                        ...data.user.notificationPreferences,
                        dailyReminder: event.target.checked,
                      },
                    },
                  })
                }
              />
              Daily build log reminder
            </label>
          </div>
        </div>
        <div className="billing-panel">
          <CreditCard size={22} />
          <span className="eyebrow">Plan & Billing</span>
          <h3>{data.user.plan}</h3>
          {trialing ? (
            <p>
              Trial expires {formatDate(trialExpiryDate)}. {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left.
            </p>
          ) : (
            <p>
              Creem status: {billing.status || 'active'}.{' '}
              {billing.currentPeriodEnd
                ? `Next billing date is ${formatDate(billing.currentPeriodEnd)}.`
                : 'Next billing date appears after Creem syncs the subscription.'}
            </p>
          )}
          <div className="billing-meta">
            <span>{billing.seatLimit} seat{billing.seatLimit === 1 ? '' : 's'} included</span>
            {billing.creemSubscriptionId && <span>Subscription connected</span>}
          </div>
          <div className="button-row">
            <button className="button primary" type="button" onClick={() => setView('pricing')}>
              Change Plan
            </button>
            {paidPlan && (
              <button className="button secondary" type="button" onClick={manageBilling}>
                Manage Billing
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="section-band two-column">
        <div>
          <span className="eyebrow">Team settings</span>
          <h2>Members and seats</h2>
          <p className="muted">Current local project size is {project.teamSize}. Live invitations require authentication and email delivery.</p>
          <div className="team-preview">
            <div>
              <strong>{data.user.name}</strong>
              <span>Owner</span>
            </div>
            <div>
              <strong>{project.teamSize - 1 > 0 ? `${project.teamSize - 1} planned seat${project.teamSize - 1 === 1 ? '' : 's'}` : 'No extra seats'}</strong>
              <span>Pending team features</span>
            </div>
          </div>
        </div>
        <div>
          <span className="eyebrow">Archived projects</span>
          <h2>Project history</h2>
          <div className="archived-list">
            {data.projects.filter((archivedProject) => archivedProject.status === 'Archived').length === 0 && (
              <p className="empty">No archived projects yet.</p>
            )}
            {data.projects
              .filter((archivedProject) => archivedProject.status === 'Archived')
              .map((archivedProject) => (
                <div className="mini-project" key={archivedProject.id}>
                  <div>
                    <strong>{archivedProject.name}</strong>
                    <p>{archivedProject.type}</p>
                  </div>
                  <StatusPill status={archivedProject.status} />
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="section-band">
        <span className="eyebrow">Planned platform support</span>
        <h2>Mobile and organization readiness</h2>
        <div className="readiness-list">
          <div>
            <Smartphone size={18} />
            <span>Mobile web quick logging is part of this MVP.</span>
          </div>
          <div>
            <Users size={18} />
            <span>Organization and enterprise structures are reserved for later build phases.</span>
          </div>
          <div>
            <LogOut size={18} />
            <span>Password reset, SSO, audit logs, and native mobile apps stay outside MVP scope.</span>
          </div>
        </div>
        <button className="button danger" type="button" onClick={resetDemo}>
          <X size={16} />
          Reset demo data
        </button>
      </div>
    </section>
  )
}

function AnimatedRevealDate({ date }: { date: Date }) {
  const [displayDate, setDisplayDate] = useState(today)

  useEffect(() => {
    const start = today.getTime()
    const end = date.getTime()
    const duration = 800
    let animationFrame = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayDate(new Date(start + (end - start) * eased))
      if (progress < 1) animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [date])

  return <>{formatDate(displayDate)}</>
}

function OnboardingForecastReveal({
  availableHoursPerWeek,
  daysUntilTarget,
  forecastDate,
  launchStatus,
  onContinue,
  totalScopeHours,
}: {
  availableHoursPerWeek: number
  daysUntilTarget: number
  forecastDate: Date
  launchStatus: string
  onContinue: () => void
  totalScopeHours: number
}) {
  return (
    <main className="onboarding-forecast-page">
      <section className="onboarding-forecast-panel">
        <div className="forecast-wordmark">
          <div className="brand-mark" aria-hidden="true">
            <Check size={18} strokeWidth={3} />
          </div>
          <strong>ShipCheck</strong>
        </div>
        <div>
          <h1>Here's when you're launching.</h1>
          <p>Based on your scope and availability, here's your forecast.</p>
        </div>
        <div className="forecast-date-reveal" aria-live="polite">
          <AnimatedRevealDate date={forecastDate} />
        </div>
        <StatusPill status={launchStatus} />
        <div className="forecast-reveal-stats">
          <MetricCard icon={Target} label="Total scope hours" value={`${totalScopeHours}h`} detail="Current Ship scope" />
          <MetricCard icon={Clock3} label="Available hours per week" value={`${availableHoursPerWeek}h`} detail="Your weekly capacity" />
          <MetricCard
            icon={CalendarDays}
            label="Days until target date"
            value={`${Math.max(0, daysUntilTarget)}`}
            detail={daysUntilTarget >= 0 ? 'Target still ahead' : `${Math.abs(daysUntilTarget)} days overdue`}
          />
        </div>
        <button className="button primary forecast-reveal-cta" type="button" onClick={onContinue}>
          Go to my project
          <ArrowRight size={16} />
        </button>
      </section>
    </main>
  )
}

function OnboardingView({
  onboardingForecastSeen,
  onComplete,
}: {
  onboardingForecastSeen: boolean
  onComplete: (project: Project, initialItems: ScopeItem[], builderType: string) => void
}) {
  const [reveal, setReveal] = useState<null | { project: Project; items: ScopeItem[]; forecastDate: Date; builderType: string }>(null)
  const [draft, setDraft] = useState({
    builderType: 'Solo builder',
    teamMode: 'Solo' as 'Solo' | 'Team',
    projectName: '',
    projectType: 'MVP/Product' as ProjectType,
    targetLaunchDate: addDays(today, 21).toISOString().slice(0, 10),
    weeklyAvailableHours: 10,
    scopeText: 'Core dashboard\nDaily progress log\nLaunch forecast',
  })

  const finish = () => {
    if (!draft.projectName.trim()) return
    const project = {
      ...createBlankProject(draft.projectName.trim(), draft.projectType, draft.weeklyAvailableHours),
      targetLaunchDate: draft.targetLaunchDate,
      teamSize: draft.teamMode === 'Solo' ? 1 : 3,
    }
    const initialItems = draft.scopeText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((title, index): ScopeItem => ({
        id: uid('scope'),
        projectId: project.id,
        title,
        description: '',
        column: 'ship',
        rankOrder: index + 1,
        estimateHours: index === 0 ? 8 : 4,
        confidence: 'medium',
        status: 'not-started',
        existedAtBaseline: true,
        approvedScopeChange: true,
        createdAt: isoToday,
        addedReason: 'Initial launch scope',
        movementHistory: [],
      }))

    const totalHours = initialItems.reduce((sum, item) => sum + item.estimateHours, 0)
    const forecastDate = addDays(today, Math.ceil((totalHours / Math.max(project.weeklyAvailableHours, 1)) * 7))
    if (onboardingForecastSeen) {
      onComplete(project, initialItems, draft.builderType)
      return
    }
    setReveal({ project, items: initialItems, forecastDate, builderType: draft.builderType })
  }

  if (reveal) {
    const totalHours = reveal.items.reduce((sum, item) => sum + item.estimateHours, 0)
    const driftDays = daysBetween(reveal.project.targetLaunchDate, reveal.forecastDate.toISOString().slice(0, 10))
    const launchStatus = driftDays <= 0 ? 'On Track' : driftDays <= 14 ? 'At Risk' : 'Slipping'

    return (
      <OnboardingForecastReveal
        availableHoursPerWeek={reveal.project.weeklyAvailableHours}
        daysUntilTarget={getDaysUntil(reveal.project.targetLaunchDate)}
        forecastDate={reveal.forecastDate}
        launchStatus={launchStatus}
        onContinue={() => onComplete(reveal.project, reveal.items, reveal.builderType)}
        totalScopeHours={totalHours}
      />
    )
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-panel">
        <div className="brand onboarding-brand">
          <div className="brand-mark" aria-hidden="true">
            <Check size={20} strokeWidth={3} />
          </div>
          <div>
            <strong>ShipCheck</strong>
            <span>Guided project setup</span>
          </div>
        </div>
        <div>
          <span className="eyebrow">Onboarding</span>
          <h1>Start with the smallest shippable version</h1>
          <p className="muted">Create a project, set capacity, and baseline the first launch scope.</p>
        </div>
        <div className="form-grid">
          <label>
            Builder type
            <select value={draft.builderType} onChange={(event) => setDraft({ ...draft, builderType: event.target.value })}>
              <option>Solo builder</option>
              <option>Product manager</option>
              <option>Agency or consultant</option>
              <option>Creator</option>
              <option>Organization lead</option>
            </select>
          </label>
          <label>
            Project type
            <select value={draft.projectType} onChange={(event) => setDraft({ ...draft, projectType: event.target.value as ProjectType })}>
              <option>MVP/Product</option>
              <option>Client Project</option>
              <option>Internal Project</option>
              <option>Creator Project</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Solo or team
            <select value={draft.teamMode} onChange={(event) => setDraft({ ...draft, teamMode: event.target.value as 'Solo' | 'Team' })}>
              <option>Solo</option>
              <option>Team</option>
            </select>
          </label>
          <label>
            Project name
            <input value={draft.projectName} placeholder="Customer Portal MVP" onChange={(event) => setDraft({ ...draft, projectName: event.target.value })} />
          </label>
          <label>
            Target launch
            <input type="date" value={draft.targetLaunchDate} onChange={(event) => setDraft({ ...draft, targetLaunchDate: event.target.value })} />
          </label>
          <label>
            Weekly available hours
            <input
              type="number"
              min="1"
              value={draft.weeklyAvailableHours}
              onChange={(event) => setDraft({ ...draft, weeklyAvailableHours: Number(event.target.value) })}
            />
          </label>
        </div>
        <label>
          Initial Ship scope, one item per line
          <textarea value={draft.scopeText} onChange={(event) => setDraft({ ...draft, scopeText: event.target.value })} />
        </label>
        <div className="button-row">
          <button className="button primary" type="button" onClick={finish}>
            Create launch tracker
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  )
}

function ShipCheckRoot() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

export default ShipCheckRoot
