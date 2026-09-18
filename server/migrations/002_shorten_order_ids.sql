-- Rewrites existing "WZ-..." orderId values to the short 8-char hex format
-- produced by generateOrderId() (server/src/services/submissionService.js).
-- orderId has no foreign key from any other table, so this is safe to run
-- regardless of order status. Safe to re-run: only rows still using the old
-- "WZ-" prefixed format are touched.
--
-- Note: any order already sent to the courier (status created/dispatched/
-- delivered/exchange) was submitted with its OLD orderId as the shipment
-- reference. Renaming it here will desync it from the courier's stored
-- reference for that shipment.

do $$
declare
  r record;
  candidate text;
begin
  for r in select id from public.wiz_order where "orderId" like 'WZ-%' loop
    loop
      candidate := upper(substr(md5(random()::text || clock_timestamp()::text || r.id::text), 1, 8));
      exit when not exists (select 1 from public.wiz_order where "orderId" = candidate);
    end loop;

    update public.wiz_order set "orderId" = candidate where id = r.id;
  end loop;
end $$;
