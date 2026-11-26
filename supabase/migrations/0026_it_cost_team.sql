-- Team composition behind each IT cost invoice, so the monthly cost can be split by role
-- (see IT_ROLES in src/lib/it/config.ts for the roles and their rough monthly rates).
-- {"head_developer": 1, "developer": 2, "design": 1} = headcount per role on that invoice.
-- The invoice total is split across roles in proportion to headcount x rate, so the roles
-- always add up exactly to the invoice amount.
alter table it_cost_invoices add column team jsonb;

-- WattWealth: base team = the head developer alone (invoices ~55k SEK/month), plus the
-- "additional" people listed on each invoice.
update it_cost_invoices set team = '{"head_developer":1}'
  where fortnox_doc_number in ('3883','3971','4068','4120','4184','4396');
update it_cost_invoices set team = '{"head_developer":1,"developer":2,"design":1}'
  where fortnox_doc_number in ('4469','4582','4660');
update it_cost_invoices set team = '{"head_developer":1,"developer":2,"product":1,"design":1}'
  where fortnox_doc_number = '4745';
update it_cost_invoices set team = '{"head_developer":1,"developer":1,"product":1}'
  where fortnox_doc_number in ('4934','4956','5014','5015','5109','5159');
update it_cost_invoices set team = '{"head_developer":1,"developer":1,"product":1,"tester":1}'
  where fortnox_doc_number in ('5272','5366','5398','5523','5611');
update it_cost_invoices set team = '{"head_developer":1,"developer":1,"product":1,"tester":1,"marketing":1}'
  where fortnox_doc_number = '5755';

-- Autotme: developers + design only.
update it_cost_invoices set team = '{"developer":2,"design":1}'
  where fortnox_doc_number in ('4932','4933','5071','5070','5139');
update it_cost_invoices set team = '{"developer":1,"design":1}'
  where fortnox_doc_number in ('5240','5308');
