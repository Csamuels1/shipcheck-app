import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: {
    bodyParser: false,
  },
}

const productPlanMap = {
  CREEM_SOLO_PRODUCT_ID: { plan: 'Solo', seatLimit: 1 },
  CREEM_STARTER_TEAM_PRODUCT_ID: { plan: 'Starter Team', seatLimit: 5 },
  CREEM_GROWTH_TEAM_PRODUCT_ID: { plan: 'Growth Team', seatLimit: 15 },
  CREEM_AGENCY_PRODUCT_ID: { plan: 'Agency', seatLimit: 15 },
  CREEM_ORGANIZATION_PRODUCT_ID: { plan: 'Organization', seatLimit: 50 },
}

const statusMap = {
  'checkout.completed': 'active',
  'subscription.active': 'active',
  'subscription.paid': 'active',
  'subscription.trialing': 'trialing',
  'subscription.update': 'active',
  'subscription.scheduled_cancel': 'scheduled_cancel',
  'subscription.paused': 'paused',
  'subscription.past_due': 'past_due',
  'subscription.expired': 'expired',
  'subscription.canceled': 'canceled',
}

const readRawBody = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

const verifySignature = (payload, secret, signature) => {
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (computed.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
}

const resolvePlan = (productId) => {
  for (const [envName, value] of Object.entries(productPlanMap)) {
    if (process.env[envName] === productId) return value
  }

  return null
}

const resolveOrganizationId = (eventObject) => {
  const requestId = eventObject?.request_id || eventObject?.checkout?.request_id || eventObject?.metadata?.request_id
  if (typeof requestId === 'string' && requestId.includes(':')) return requestId.split(':')[0]
  return eventObject?.metadata?.organization_id || eventObject?.metadata?.organizationId || null
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).send('Use POST for Creem webhooks.')
  }

  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return response.status(500).send('Webhook is not configured.')
  }

  const rawBody = await readRawBody(request)
  const signature = String(request.headers['creem-signature'] || '')
  if (!signature || !verifySignature(rawBody, webhookSecret, signature)) {
    return response.status(400).send('Invalid signature.')
  }

  const event = JSON.parse(rawBody)
  const eventObject = event.object ?? {}
  const eventType = event.eventType ?? event.event_type
  const productId = eventObject.product?.id || eventObject.product_id || eventObject.productId
  const plan = resolvePlan(productId)
  const organizationId = resolveOrganizationId(eventObject)

  if (!organizationId || !plan) return response.status(200).json({ ignored: true })

  const status = statusMap[eventType] ?? eventObject.status ?? 'active'
  const subscriptionId = eventObject.id || eventObject.subscription_id || eventObject.subscriptionId || null
  const customerId = eventObject.customer?.id || eventObject.customer_id || eventObject.customerId || null
  const periodEnd = eventObject.current_period_end_date || eventObject.current_period_end || null
  const nextPlan = ['canceled', 'expired'].includes(status) ? 'Free Trial' : plan.plan
  const nextSeatLimit = ['canceled', 'expired'].includes(status) ? 1 : plan.seatLimit

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: organization, error: organizationLoadError } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', organizationId)
    .single()
  if (organizationLoadError || !organization?.owner_id) {
    return response.status(200).json({ ignored: true })
  }

  const { error: billingError } = await supabase.from('billing_subscriptions').upsert(
    {
      organization_id: organizationId,
      creem_customer_id: customerId,
      creem_subscription_id: subscriptionId,
      creem_product_id: productId,
      provider: 'creem',
      plan: nextPlan,
      status,
      seat_limit: nextSeatLimit,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  )
  if (billingError) throw billingError

  const [{ error: organizationError }, { error: profileError }] = await Promise.all([
    supabase.from('organizations').update({ plan: nextPlan, seat_limit: nextSeatLimit }).eq('id', organizationId),
    supabase.from('profiles').update({ plan: nextPlan, updated_at: new Date().toISOString() }).eq('id', organization.owner_id),
  ])

  if (organizationError || profileError) {
    throw organizationError || profileError
  }

  return response.status(200).json({ ok: true })
}
