alter table public.billing_subscriptions
  add column if not exists provider text not null default 'creem',
  add column if not exists creem_customer_id text,
  add column if not exists creem_subscription_id text,
  add column if not exists creem_product_id text;

create unique index if not exists billing_subscriptions_organization_id_key
  on public.billing_subscriptions (organization_id);
