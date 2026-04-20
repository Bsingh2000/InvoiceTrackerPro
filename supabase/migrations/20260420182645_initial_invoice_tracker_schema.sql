create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Invoice Tracker',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  constraint workspace_members_role_check
    check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint workspace_members_workspace_user_unique
    unique (workspace_id, user_id)
);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  business_name text not null default 'Sterling Ledger Studio',
  finance_email text not null default 'finance@example.com',
  base_currency text not null default 'TTD',
  reporting_currency text not null default 'TTD',
  supported_currencies text[] not null default array['TTD', 'USD']::text[],
  allow_multi_currency boolean not null default true,
  normalize_reports boolean not null default false,
  default_payment_terms text not null default 'Net 30',
  time_zone text not null default 'America/Port_of_Spain',
  date_format text not null default 'DD MMM YYYY',
  invoice_prefix text not null default 'INV',
  default_status text not null default 'Pending',
  default_priority text not null default 'Medium',
  default_reminder_lead_days integer not null default 3,
  default_payment_method text not null default 'Bank transfer',
  default_category text not null default 'Operations',
  due_today_alerts boolean not null default true,
  due_tomorrow_alerts boolean not null default true,
  overdue_alerts boolean not null default true,
  large_value_alerts boolean not null default true,
  reminder_lead_days integer not null default 3,
  overdue_escalation_days integer not null default 5,
  ttd_large_threshold numeric(12, 2) not null default 20000,
  usd_large_threshold numeric(12, 2) not null default 5000,
  collect_reminder_tone text not null default 'Send reminder',
  pay_reminder_tone text not null default 'Schedule payment review',
  default_export_format text not null default 'CSV',
  include_notes_in_export boolean not null default true,
  include_dismissed_alerts boolean not null default false,
  export_currency_behavior text not null default 'Preserve invoice currency',
  export_date_format text not null default 'Workspace date format',
  number_format text not null default '1,234.56',
  save_filters_by_page boolean not null default true,
  restore_last_view boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint workspace_settings_base_currency_check
    check (base_currency in ('TTD', 'USD', 'EUR', 'GBP', 'CAD', 'BOB')),
  constraint workspace_settings_reporting_currency_check
    check (reporting_currency in ('TTD', 'USD', 'EUR', 'GBP', 'CAD', 'BOB')),
  constraint workspace_settings_supported_currencies_check
    check (supported_currencies <@ array['TTD', 'USD', 'EUR', 'GBP', 'CAD', 'BOB']::text[]),
  constraint workspace_settings_default_status_check
    check (default_status in ('Draft', 'Pending', 'Due Soon', 'Overdue', 'Paid', 'Partially Paid', 'Cancelled')),
  constraint workspace_settings_default_priority_check
    check (default_priority in ('Low', 'Medium', 'High', 'Critical')),
  constraint workspace_settings_positive_defaults_check
    check (
      default_reminder_lead_days >= 0
      and reminder_lead_days >= 0
      and overdue_escalation_days >= 0
      and ttd_large_threshold >= 0
      and usd_large_threshold >= 0
    )
);

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_key text not null,
  preference_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_preferences_workspace_user_key_unique
    unique (workspace_id, user_id, preference_key)
);

create table public.counterparties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,
  name text not null,
  contact text,
  email text,
  phone text,
  default_payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint counterparties_type_check
    check (type in ('customer', 'vendor', 'both')),
  constraint counterparties_workspace_name_unique
    unique (workspace_id, name)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  invoice_number text not null,
  type text not null,
  party_name text not null,
  contact text,
  invoice_date date not null,
  due_date date not null,
  amount numeric(12, 2) not null,
  amount_paid numeric(12, 2) not null default 0,
  balance_remaining numeric(12, 2)
    generated always as (greatest(amount - amount_paid, 0)) stored,
  currency text not null default 'TTD',
  status text not null default 'Pending',
  payment_method text,
  category text not null default 'Operations',
  notes text,
  internal_remarks text,
  priority text not null default 'Medium',
  reminder_date date,
  reference_number text,
  recurring boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_workspace_invoice_number_unique
    unique (workspace_id, invoice_number),
  constraint invoices_type_check
    check (type in ('receivable', 'payable')),
  constraint invoices_currency_check
    check (currency in ('TTD', 'USD', 'EUR', 'GBP', 'CAD', 'BOB')),
  constraint invoices_status_check
    check (status in ('Draft', 'Pending', 'Due Soon', 'Overdue', 'Paid', 'Partially Paid', 'Cancelled')),
  constraint invoices_priority_check
    check (priority in ('Low', 'Medium', 'High', 'Critical')),
  constraint invoices_amounts_check
    check (amount > 0 and amount_paid >= 0 and amount_paid <= amount),
  constraint invoices_due_after_invoice_check
    check (due_date >= invoice_date)
);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12, 2) not null,
  currency text not null,
  payment_date date not null,
  payment_method text,
  reference_number text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invoice_payments_amount_check
    check (amount > 0),
  constraint invoice_payments_currency_check
    check (currency in ('TTD', 'USD', 'EUR', 'GBP', 'CAD', 'BOB'))
);

create table public.invoice_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  constraint invoice_tags_invoice_tag_unique
    unique (invoice_id, tag)
);

create table public.invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  bucket text not null default 'invoice-attachments',
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  description text,
  is_primary boolean not null default false,
  checksum text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint invoice_attachments_storage_path_unique
    unique (storage_path),
  constraint invoice_attachments_bucket_check
    check (bucket = 'invoice-attachments'),
  constraint invoice_attachments_size_check
    check (size_bytes is null or size_bytes >= 0)
);

create table public.invoice_activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  tone text not null default 'neutral',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invoice_activity_events_tone_check
    check (tone in ('neutral', 'success', 'warning', 'danger'))
);

create table public.alert_workflow_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  alert_kind text not null,
  state text not null default 'active',
  snooze_until date,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint alert_workflow_states_kind_check
    check (alert_kind in ('overdue', 'due-today', 'due-tomorrow', 'due-soon', 'large-value', 'deadline')),
  constraint alert_workflow_states_state_check
    check (state in ('active', 'snoozed', 'resolved', 'dismissed', 'reviewed')),
  constraint alert_workflow_states_snooze_check
    check (state <> 'snoozed' or snooze_until is not null),
  constraint alert_workflow_states_invoice_kind_unique
    unique (invoice_id, alert_kind)
);

create table public.recurring_invoice_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  frequency text not null default 'Monthly',
  interval_count integer not null default 1,
  start_date date not null,
  end_date date,
  next_run_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_invoice_rules_invoice_unique
    unique (invoice_id),
  constraint recurring_invoice_rules_frequency_check
    check (frequency in ('Monthly', 'Quarterly', 'Annual')),
  constraint recurring_invoice_rules_interval_check
    check (interval_count > 0),
  constraint recurring_invoice_rules_end_after_start_check
    check (end_date is null or end_date >= start_date)
);

create table public.email_send_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject text not null,
  recipients text[] not null,
  provider text not null default 'mailersend',
  provider_message_id text,
  status text not null,
  error_message text,
  summary_snapshot jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint email_send_logs_status_check
    check (status in ('sent', 'failed')),
  constraint email_send_logs_recipients_check
    check (coalesce(array_length(recipients, 1), 0) > 0)
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_workspace_role(
  target_workspace_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function private.can_admin_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select private.has_workspace_role(target_workspace_id, array['owner', 'admin']::text[])
    or exists (
      select 1
      from public.workspaces w
      where w.id = target_workspace_id
        and w.owner_id = (select auth.uid())
    );
$$;

create or replace function private.can_write_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select private.has_workspace_role(target_workspace_id, array['owner', 'admin', 'member']::text[]);
$$;

create or replace function private.storage_workspace_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

alter table public.workspace_settings
add constraint workspace_settings_active_currencies_check
check (
  base_currency = any(supported_currencies)
  and reporting_currency = any(supported_currencies)
);

alter table public.invoices
add constraint invoices_workspace_id_id_unique
unique (workspace_id, id);

alter table public.invoice_payments
add constraint invoice_payments_workspace_invoice_fk
foreign key (workspace_id, invoice_id)
references public.invoices(workspace_id, id)
on delete cascade;

alter table public.invoice_tags
add constraint invoice_tags_workspace_invoice_fk
foreign key (workspace_id, invoice_id)
references public.invoices(workspace_id, id)
on delete cascade;

alter table public.invoice_attachments
add constraint invoice_attachments_workspace_invoice_fk
foreign key (workspace_id, invoice_id)
references public.invoices(workspace_id, id)
on delete cascade;

alter table public.invoice_attachments
add constraint invoice_attachments_storage_path_workspace_check
check (
  private.storage_workspace_id(storage_path) is not null
  and private.storage_workspace_id(storage_path) = workspace_id
);

alter table public.invoice_activity_events
add constraint invoice_activity_events_workspace_invoice_fk
foreign key (workspace_id, invoice_id)
references public.invoices(workspace_id, id)
on delete cascade;

alter table public.alert_workflow_states
add constraint alert_workflow_states_workspace_invoice_fk
foreign key (workspace_id, invoice_id)
references public.invoices(workspace_id, id)
on delete cascade;

alter table public.recurring_invoice_rules
add constraint recurring_invoice_rules_workspace_invoice_fk
foreign key (workspace_id, invoice_id)
references public.invoices(workspace_id, id)
on delete cascade;

revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.has_workspace_role(uuid, text[]) from public;
revoke all on function private.can_admin_workspace(uuid) from public;
revoke all on function private.can_write_workspace(uuid) from public;
revoke all on function private.storage_workspace_id(text) from public;

grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function private.can_admin_workspace(uuid) to authenticated;
grant execute on function private.can_write_workspace(uuid) to authenticated;
grant execute on function private.storage_workspace_id(text) to authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function private.set_updated_at();

create trigger workspace_settings_set_updated_at
before update on public.workspace_settings
for each row execute function private.set_updated_at();

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function private.set_updated_at();

create trigger counterparties_set_updated_at
before update on public.counterparties
for each row execute function private.set_updated_at();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function private.set_updated_at();

create trigger alert_workflow_states_set_updated_at
before update on public.alert_workflow_states
for each row execute function private.set_updated_at();

create trigger recurring_invoice_rules_set_updated_at
before update on public.recurring_invoice_rules
for each row execute function private.set_updated_at();

create index workspace_members_user_id_idx
  on public.workspace_members (user_id);

create index workspace_members_workspace_role_idx
  on public.workspace_members (workspace_id, role);

create index user_preferences_user_workspace_idx
  on public.user_preferences (user_id, workspace_id);

create index counterparties_workspace_type_name_idx
  on public.counterparties (workspace_id, type, name);

create index invoices_workspace_due_date_idx
  on public.invoices (workspace_id, due_date);

create index invoices_workspace_type_idx
  on public.invoices (workspace_id, type);

create index invoices_workspace_status_idx
  on public.invoices (workspace_id, status);

create index invoices_workspace_priority_idx
  on public.invoices (workspace_id, priority);

create index invoices_counterparty_id_idx
  on public.invoices (counterparty_id);

create index invoices_open_due_date_idx
  on public.invoices (workspace_id, due_date)
  where archived_at is null
    and status not in ('Paid', 'Cancelled');

create index invoice_payments_invoice_date_idx
  on public.invoice_payments (invoice_id, payment_date desc);

create index invoice_payments_workspace_date_idx
  on public.invoice_payments (workspace_id, payment_date desc);

create index invoice_tags_workspace_tag_idx
  on public.invoice_tags (workspace_id, tag);

create index invoice_tags_invoice_id_idx
  on public.invoice_tags (invoice_id);

create index invoice_attachments_invoice_id_idx
  on public.invoice_attachments (invoice_id);

create index invoice_attachments_workspace_active_idx
  on public.invoice_attachments (workspace_id, invoice_id)
  where deleted_at is null;

create index invoice_activity_events_invoice_created_idx
  on public.invoice_activity_events (invoice_id, created_at desc);

create index invoice_activity_events_workspace_created_idx
  on public.invoice_activity_events (workspace_id, created_at desc);

create index alert_workflow_states_invoice_id_idx
  on public.alert_workflow_states (invoice_id);

create index alert_workflow_states_workspace_state_idx
  on public.alert_workflow_states (workspace_id, state);

create index recurring_invoice_rules_workspace_next_run_idx
  on public.recurring_invoice_rules (workspace_id, next_run_date)
  where active;

create index email_send_logs_workspace_created_idx
  on public.email_send_logs (workspace_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.user_preferences enable row level security;
alter table public.counterparties enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.invoice_tags enable row level security;
alter table public.invoice_attachments enable row level security;
alter table public.invoice_activity_events enable row level security;
alter table public.alert_workflow_states enable row level security;
alter table public.recurring_invoice_rules enable row level security;
alter table public.email_send_logs enable row level security;

create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Workspace members can read workspaces"
on public.workspaces for select
to authenticated
using (owner_id = (select auth.uid()) or private.is_workspace_member(id));

create policy "Users can create owned workspaces"
on public.workspaces for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Workspace admins can update workspaces"
on public.workspaces for update
to authenticated
using (private.can_admin_workspace(id))
with check (private.can_admin_workspace(id));

create policy "Workspace admins can delete workspaces"
on public.workspaces for delete
to authenticated
using (private.can_admin_workspace(id));

create policy "Workspace members can read memberships"
on public.workspace_members for select
to authenticated
using (user_id = (select auth.uid()) or private.can_admin_workspace(workspace_id));

create policy "Workspace admins can add members"
on public.workspace_members for insert
to authenticated
with check (
  private.can_admin_workspace(workspace_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1
      from public.workspaces w
      where w.id = workspace_id
        and w.owner_id = (select auth.uid())
    )
  )
);

create policy "Workspace admins can update members"
on public.workspace_members for update
to authenticated
using (private.can_admin_workspace(workspace_id))
with check (private.can_admin_workspace(workspace_id));

create policy "Workspace admins can delete members"
on public.workspace_members for delete
to authenticated
using (private.can_admin_workspace(workspace_id));

create policy "Workspace members can read settings"
on public.workspace_settings for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace admins can insert settings"
on public.workspace_settings for insert
to authenticated
with check (private.can_admin_workspace(workspace_id));

create policy "Workspace admins can update settings"
on public.workspace_settings for update
to authenticated
using (private.can_admin_workspace(workspace_id))
with check (private.can_admin_workspace(workspace_id));

create policy "Workspace admins can delete settings"
on public.workspace_settings for delete
to authenticated
using (private.can_admin_workspace(workspace_id));

create policy "Users can manage own preferences"
on public.user_preferences for all
to authenticated
using (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id))
with check (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id));

create policy "Workspace members can read counterparties"
on public.counterparties for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert counterparties"
on public.counterparties for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update counterparties"
on public.counterparties for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete counterparties"
on public.counterparties for delete
to authenticated
using (private.can_write_workspace(workspace_id));

create policy "Workspace members can read invoices"
on public.invoices for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert invoices"
on public.invoices for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update invoices"
on public.invoices for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete invoices"
on public.invoices for delete
to authenticated
using (private.can_write_workspace(workspace_id));

create policy "Workspace members can read invoice payments"
on public.invoice_payments for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert invoice payments"
on public.invoice_payments for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update invoice payments"
on public.invoice_payments for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete invoice payments"
on public.invoice_payments for delete
to authenticated
using (private.can_write_workspace(workspace_id));

create policy "Workspace members can read invoice tags"
on public.invoice_tags for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert invoice tags"
on public.invoice_tags for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update invoice tags"
on public.invoice_tags for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete invoice tags"
on public.invoice_tags for delete
to authenticated
using (private.can_write_workspace(workspace_id));

create policy "Workspace members can read invoice attachments"
on public.invoice_attachments for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert invoice attachments"
on public.invoice_attachments for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update invoice attachments"
on public.invoice_attachments for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete invoice attachments"
on public.invoice_attachments for delete
to authenticated
using (private.can_write_workspace(workspace_id));

create policy "Workspace members can read invoice activity"
on public.invoice_activity_events for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert invoice activity"
on public.invoice_activity_events for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace members can read alert workflow"
on public.alert_workflow_states for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert alert workflow"
on public.alert_workflow_states for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update alert workflow"
on public.alert_workflow_states for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete alert workflow"
on public.alert_workflow_states for delete
to authenticated
using (private.can_write_workspace(workspace_id));

create policy "Workspace members can read recurring rules"
on public.recurring_invoice_rules for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert recurring rules"
on public.recurring_invoice_rules for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update recurring rules"
on public.recurring_invoice_rules for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete recurring rules"
on public.recurring_invoice_rules for delete
to authenticated
using (private.can_write_workspace(workspace_id));

create policy "Workspace members can read email logs"
on public.email_send_logs for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert email logs"
on public.email_send_logs for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

insert into storage.buckets (id, name, public)
values ('invoice-attachments', 'invoice-attachments', false)
on conflict (id) do update
set public = excluded.public;

create policy "Workspace members can read invoice attachment files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'invoice-attachments'
  and private.is_workspace_member(private.storage_workspace_id(name))
);

create policy "Workspace writers can upload invoice attachment files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'invoice-attachments'
  and private.can_write_workspace(private.storage_workspace_id(name))
);

create policy "Workspace writers can update invoice attachment files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'invoice-attachments'
  and private.can_write_workspace(private.storage_workspace_id(name))
)
with check (
  bucket_id = 'invoice-attachments'
  and private.can_write_workspace(private.storage_workspace_id(name))
);

create policy "Workspace writers can delete invoice attachment files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'invoice-attachments'
  and private.can_write_workspace(private.storage_workspace_id(name))
);
