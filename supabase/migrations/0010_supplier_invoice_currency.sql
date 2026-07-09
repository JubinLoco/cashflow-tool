alter table supplier_invoices
  add column currency text default 'SEK',
  add column original_total numeric;
