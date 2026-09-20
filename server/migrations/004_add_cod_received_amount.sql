-- Tracks COD that has actually been received when an order is delivered.
-- Run this in the Supabase SQL editor.

alter table public.wiz_order
  add column if not exists "codReceivedAmount" numeric not null default 0;

update public.wiz_order
set "codReceivedAmount" = greatest(0, coalesce("productPrice", 0) - coalesce("advanceAmount", 0))
where status in ('delivered');