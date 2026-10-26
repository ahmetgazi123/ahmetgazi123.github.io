create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"makers":[],"printOrders":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "Users can read their own app data" on public.user_data;
create policy "Users can read their own app data"
  on public.user_data for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own app data" on public.user_data;
create policy "Users can create their own app data"
  on public.user_data for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own app data" on public.user_data;
create policy "Users can update their own app data"
  on public.user_data for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_data'
  ) then
    alter publication supabase_realtime add table public.user_data;
  end if;
end
$$;

-- Veri Modeli Notu (JSONB):
-- public.user_data.data sütunu aşağıdaki yapıyı barındırır:
-- {
--   "makers": [
--     {
--       "id": "...",
--       "name": "...",
--       "phone": "...",
--       "color": "...",
--       "transactions": [
--         {
--           "id": "...",
--           "type": "debt",
--           "amount": 25000,
--           "date": "YYYY-MM-DD",
--           "note": "500 adet bebek tulumu dikim ücreti"
--         }
--       ],
--       "works": [
--         {
--           "id": "...",
--           "product": "...",
--           "quantity": 500,
--           "date": "YYYY-MM-DD",
--           "completedAt": "YYYY-MM-DD",
--           "logs": [{ "id": "...", "note": "...", "date": "YYYY-MM-DD" }],
--           "tasks": [{ "id": "...", "text": "...", "completed": false }]
--         }
--       ]
--     }
--   ],
--   "printOrders": [...]
-- }

