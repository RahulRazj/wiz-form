-- Adds 'cancelled' to the allowed status values check constraint in wiz_order.
-- Run this in your Supabase SQL editor.

alter table public.wiz_order
  drop constraint if exists wiz_order_status_check;

alter table public.wiz_order
  add constraint wiz_order_status_check
  check (status in ('pending', 'placed', 'created', 'dispatched', 'delivered', 'exchange', 'cancelled'));
