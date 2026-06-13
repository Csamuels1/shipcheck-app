import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const formatHours = (minutes) => `${(Number(minutes || 0) / 60).toFixed(1)}h`

const readBody = (request) => {
  if (!request.body) return {}
  if (typeof request.body === 'object') return request.body

  try {
    return JSON.parse(request.body)
  } catch {
    return {}
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Use POST to send a weekly report.' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const resendApiKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseAnonKey || !resendApiKey) {
    return response.status(500).json({ error: 'Email delivery is not configured.' })
  }

  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ error: 'Sign in before sending a report email.' })

  const { projectId } = readBody(request)
  if (!projectId) return response.status(400).json({ error: 'Choose a project before sending a report email.' })

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !user?.email) {
    return response.status(401).json({ error: 'Your session expired. Sign in again and retry.' })
  }

  const { data: project, error: projectError } = await supabase.from('projects').select('*').eq('id', projectId).single()
  if (projectError || !project) {
    return response.status(404).json({ error: 'ShipCheck could not load that project for this account.' })
  }

  const [{ data: scopeItems, error: scopeError }, { data: logs, error: logError }] = await Promise.all([
    supabase.from('scope_items').select('*').eq('project_id', projectId),
    supabase.from('build_logs').select('*').eq('project_id', projectId).order('log_date', { ascending: false }),
  ])

  if (scopeError || logError) {
    return response.status(500).json({ error: 'ShipCheck could not prepare this report.' })
  }

  const items = scopeItems ?? []
  const logRows = logs ?? []
  const shipItems = items.filter((item) => item.column_key === 'ship')
  const completedShipItems = shipItems.filter((item) => item.status === 'done')
  const addedItems = items.filter((item) => !item.existed_at_baseline)
  const loggedMinutes = logRows.reduce((sum, log) => sum + Number(log.minutes_spent || 0), 0)
  const addedHours = addedItems.reduce((sum, item) => sum + Number(item.estimate_hours || 0), 0)
  const completedHours = completedShipItems.reduce((sum, item) => sum + Number(item.estimate_hours || 0), 0)
  const totalShipHours = shipItems.reduce((sum, item) => sum + Number(item.estimate_hours || 0), 0)
  const progress = totalShipHours > 0 ? Math.round((completedHours / totalShipHours) * 100) : 0

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; background: #fafaf7; padding: 28px; color: #18201f;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e7ece9; border-radius: 10px; padding: 24px;">
        <p style="margin: 0 0 8px; color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;">ShipCheck weekly report</p>
        <h1 style="margin: 0 0 8px; font-size: 28px; line-height: 36px;">${escapeHtml(project.name)}</h1>
        <p style="margin: 0 0 24px; color: #3f4a47;">A concise check on scope, logged effort, and launch readiness.</p>
        <div style="display: grid; gap: 12px;">
          <div style="padding: 16px; background: #f2f5f3; border-radius: 8px;">
            <strong>${progress}% Ship scope complete</strong>
            <p style="margin: 6px 0 0; color: #3f4a47;">${completedHours}h complete out of ${totalShipHours}h planned for launch.</p>
          </div>
          <div style="padding: 16px; background: #f2f5f3; border-radius: 8px;">
            <strong>${formatHours(loggedMinutes)} logged</strong>
            <p style="margin: 6px 0 0; color: #3f4a47;">Based on ${logRows.length} build log ${logRows.length === 1 ? 'entry' : 'entries'}.</p>
          </div>
          <div style="padding: 16px; background: #fff7ed; border-left: 4px solid #f9735b; border-radius: 8px;">
            <strong>${addedHours}h added since baseline</strong>
            <p style="margin: 6px 0 0; color: #3f4a47;">${addedItems.length} added scope ${addedItems.length === 1 ? 'item' : 'items'}.</p>
          </div>
        </div>
      </div>
    </div>
  `

  const resend = new Resend(resendApiKey)
  const from = process.env.RESEND_FROM_EMAIL || 'ShipCheck <onboarding@resend.dev>'

  const { error: sendError } = await resend.emails.send({
    from,
    to: user.email,
    subject: `ShipCheck weekly report: ${project.name}`,
    html,
  })

  if (sendError) {
    return response.status(502).json({ error: sendError.message || 'Resend could not deliver this report.' })
  }

  return response.status(200).json({ ok: true })
}
