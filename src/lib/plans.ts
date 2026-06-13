export const plans = [
  { name: 'Free Trial', price: '$0', detail: '30 days, 1 active project', seats: '1 user', billable: false },
  { name: 'Solo', price: '$9/mo', detail: 'Unlimited projects and reports', seats: '1 user', billable: true },
  { name: 'Starter Team', price: '$19/mo', detail: 'Shared projects and team logs', seats: 'Up to 5', billable: true },
  { name: 'Growth Team', price: '$39/mo', detail: 'Seat management and larger teams', seats: 'Up to 15', billable: true },
  { name: 'Agency', price: '$59/mo', detail: 'Client projects and shareable reports', seats: 'Client-ready', billable: true },
  { name: 'Organization', price: '$99+/mo', detail: 'Workspaces and admin controls', seats: 'Larger teams', billable: true },
  { name: 'Enterprise', price: 'Custom', detail: 'SSO, audit logs, custom limits', seats: 'Custom', billable: false },
]
