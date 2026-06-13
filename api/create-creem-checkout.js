import { createClient } from '@supabase/supabase-js'

const planConfig = {
  Solo: { env: 'CREEM_SOLO_PRODUCT_ID', seatLimit: 1 },
  'Starter Team': { env: 'CREEM_STARTER_TEAM_PRODUCT_ID', seatLimit: 5 },
  'Growth Team': { env: 'CREEM_GROWTH_TEAM_PRODUCT_ID', seatLimit: 15 },
  Agency: { env: 'CREEM_AGENCY_PRODUCT_ID', seatLimit: 15 },
  Organization: { env: 'CREEM_ORGANIZATION_PRODUCT_ID', seatLimit: 50 },
}

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
    return response.status(405).json({ error: 'Use POST to create a Creem checkout session.' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const creemApiKey = process.env.CREEM_API_KEY

  if (!supabaseUrl || !supabaseAnonKey || !creemApiKey) {
    return response.status(500).json({ error: 'Creem checkout is not configured.' })
  }

  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ error: 'Sign in before starting checkout.' })

  const { plan } = readBody(request)
  const config = planConfig[plan]
  if (!config) return response.status(400).json({ error: 'Choose a valid paid plan.' })

  const productId = process.env[config.env]
  if (!productId) return response.status(500).json({ error: `${plan} is missing a Creem product ID.` })

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)
  if (userError || !user?.email) return response.status(401).json({ error: 'Your session expired. Sign in again.' })

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (membershipError || !membership?.organization_id) {
    return response.status(404).json({ error: 'No organization workspace was found for this account.' })
  }

  const requestId = `${membership.organization_id}:${plan}:${Date.now()}`
  const origin = request.headers.origin || process.env.APP_URL || 'http://127.0.0.1:5173'
  const apiBaseUrl = process.env.CREEM_TEST_MODE === 'true' ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1'

  const checkoutResponse = await fetch(`${apiBaseUrl}/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': creemApiKey,
    },
    body: JSON.stringify({
      product_id: productId,
      request_id: requestId,
      success_url: `${origin}/?billing=success&plan=${encodeURIComponent(plan)}`,
      customer: {
        email: user.email,
      },
    }),
  })

  const checkout = await checkoutResponse.json().catch(() => ({}))
  if (!checkoutResponse.ok || !checkout.checkout_url) {
    return response.status(502).json({ error: checkout.message || checkout.error || 'Creem could not create checkout.' })
  }

  return response.status(200).json({
    checkoutUrl: checkout.checkout_url,
    checkoutId: checkout.id,
    productId,
    seatLimit: config.seatLimit,
  })
}
