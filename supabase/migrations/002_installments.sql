-- Adds installment plans. Safe to run more than once.
alter table recurring_rules add column if not exists kind text not null default 'recurring';
alter table recurring_rules add column if not exists total_myr numeric(12,2);
alter table recurring_rules add column if not exists installment_count int;
alter table transactions add column if not exists installment_no int;

do $$ begin
  alter table recurring_rules add constraint recurring_rules_kind_check check (kind in ('recurring','installment'));
exception when duplicate_object then null;
end $$;
