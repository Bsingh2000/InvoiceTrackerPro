create table public.month_end_job_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_type text not null,
  status text not null,
  reason text,
  recipient_email text,
  snapshot_month text,
  snapshot_date date,
  time_zone text,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint month_end_job_runs_type_check
    check (run_type in ('manual_preview', 'manual_send', 'auto_check', 'auto_send')),
  constraint month_end_job_runs_status_check
    check (status in ('success', 'skipped', 'failed'))
);

create index month_end_job_runs_workspace_created_idx
  on public.month_end_job_runs (workspace_id, created_at desc);

create index month_end_job_runs_workspace_type_created_idx
  on public.month_end_job_runs (workspace_id, run_type, created_at desc);

alter table public.month_end_job_runs enable row level security;

create policy "Workspace admins can read month-end job runs"
on public.month_end_job_runs for select
to authenticated
using (private.can_admin_workspace(workspace_id));

create policy "Workspace admins can insert month-end job runs"
on public.month_end_job_runs for insert
to authenticated
with check (private.can_admin_workspace(workspace_id));
