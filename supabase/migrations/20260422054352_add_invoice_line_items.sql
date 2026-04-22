create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2)
    generated always as (round(quantity * unit_price, 2)) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_line_items_description_check
    check (char_length(btrim(description)) > 0),
  constraint invoice_line_items_quantity_check
    check (quantity > 0),
  constraint invoice_line_items_unit_price_check
    check (unit_price >= 0)
);

alter table public.invoice_line_items
add constraint invoice_line_items_workspace_invoice_fk
foreign key (workspace_id, invoice_id)
references public.invoices(workspace_id, id)
on delete cascade;

create trigger invoice_line_items_set_updated_at
before update on public.invoice_line_items
for each row execute function private.set_updated_at();

create index invoice_line_items_invoice_sort_idx
  on public.invoice_line_items (invoice_id, sort_order, created_at);

create index invoice_line_items_workspace_invoice_idx
  on public.invoice_line_items (workspace_id, invoice_id);

alter table public.invoice_line_items enable row level security;

create policy "Workspace members can read invoice line items"
on public.invoice_line_items for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace writers can insert invoice line items"
on public.invoice_line_items for insert
to authenticated
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can update invoice line items"
on public.invoice_line_items for update
to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));

create policy "Workspace writers can delete invoice line items"
on public.invoice_line_items for delete
to authenticated
using (private.can_write_workspace(workspace_id));
