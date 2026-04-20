create index if not exists workspaces_owner_id_idx
  on public.workspaces (owner_id);

create index if not exists invoices_created_by_idx
  on public.invoices (created_by);

create index if not exists invoice_payments_created_by_idx
  on public.invoice_payments (created_by);

create index if not exists invoice_payments_workspace_invoice_fk_idx
  on public.invoice_payments (workspace_id, invoice_id);

create index if not exists invoice_tags_workspace_invoice_fk_idx
  on public.invoice_tags (workspace_id, invoice_id);

create index if not exists invoice_attachments_uploaded_by_idx
  on public.invoice_attachments (uploaded_by);

create index if not exists invoice_activity_events_created_by_idx
  on public.invoice_activity_events (created_by);

create index if not exists invoice_activity_events_workspace_invoice_fk_idx
  on public.invoice_activity_events (workspace_id, invoice_id);

create index if not exists alert_workflow_states_updated_by_idx
  on public.alert_workflow_states (updated_by);

create index if not exists alert_workflow_states_workspace_invoice_fk_idx
  on public.alert_workflow_states (workspace_id, invoice_id);

create index if not exists recurring_invoice_rules_workspace_invoice_fk_idx
  on public.recurring_invoice_rules (workspace_id, invoice_id);

create index if not exists email_send_logs_created_by_idx
  on public.email_send_logs (created_by);
