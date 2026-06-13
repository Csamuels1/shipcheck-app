import { plans } from '../lib/plans'

export function PricingView({
  activePlan,
  billingStatus,
  billingPlanLoading,
  startCheckout,
  isPublic = false,
}: {
  activePlan: string
  billingStatus: string
  billingPlanLoading: string
  startCheckout: (plan: string) => void
  isPublic?: boolean
}) {
  return (
    <section className="page-stack" id="pricing">
      <div className="section-header">
        <div>
          <span className="eyebrow">Billing plans</span>
          <h2>Pricing that scales past five seats</h2>
        </div>
      </div>
      {billingStatus && <p className="form-note">{billingStatus}</p>}
      <div className="pricing-grid">
        {plans.map((plan) => (
          <article className={`plan-card ${activePlan === plan.name ? 'selected' : ''}`} key={plan.name}>
            <div>
              <h3>{plan.name}</h3>
              <strong>{plan.price}</strong>
              <p>{plan.detail}</p>
              <span>{plan.seats}</span>
            </div>
            <button
              className="button secondary full"
              type="button"
              onClick={() => startCheckout(plan.name)}
              disabled={(!isPublic && activePlan === plan.name) || billingPlanLoading === plan.name}
            >
              {isPublic
                ? 'Get started'
                : activePlan === plan.name
                  ? 'Current plan'
                  : billingPlanLoading === plan.name
                    ? 'Starting checkout...'
                    : plan.name === 'Enterprise'
                      ? 'Contact sales'
                      : plan.billable
                        ? 'Checkout with Creem'
                        : 'Included'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
