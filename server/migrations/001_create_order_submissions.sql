-- Creates (or updates) the order submissions table used by the server.
-- Run this once in the Supabase SQL editor. Safe to re-run: table/column/
-- constraint creation is guarded with IF NOT EXISTS / DROP...IF EXISTS.
-- Table name must match SUPABASE_TABLE in server/.env (defaults to
-- "wiz_order").

create table if not exists public.wiz_order (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "orderId" text unique,
  submission_reference text,
  name text not null,
  phone text not null,
  address text not null,
  city text not null,
  "advanceAmount" numeric not null,
  "productImage" text,
  "receiptImage" text,
  status text not null default 'placed'
);

-- Backfill columns for tables created before this migration existed.
alter table public.wiz_order
  add column if not exists "orderId" text;

alter table public.wiz_order
  add column if not exists submission_reference text;

alter table public.wiz_order
  add column if not exists status text not null default 'placed';

update public.wiz_order
  set status = 'placed'
  where status is null;

alter table public.wiz_order
  drop constraint if exists wiz_order_status_check;

alter table public.wiz_order
  add constraint wiz_order_status_check
  check (status in ('placed', 'created', 'delivered'));

create unique index if not exists wiz_order_order_id_key
  on public.wiz_order ("orderId");

create index if not exists wiz_order_created_at_idx
  on public.wiz_order (created_at desc);
