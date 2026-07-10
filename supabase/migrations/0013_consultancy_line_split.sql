alter table customer_invoices
  add column consultancy_total numeric default 0,
  add column consultancy_net_total numeric default 0,
  add column consultancy_gross_profit numeric default 0,
  drop column has_consultancy_article;
