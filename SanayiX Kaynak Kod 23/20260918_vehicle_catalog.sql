-- Only metadata for a cross-instance request lease; no vehicle data warehouse.
begin;
create table if not exists public.vehicle_catalog_gate (
  id boolean primary key default true check (id),
  token uuid,
  available_at timestamptz not null default now()
);
alter table public.vehicle_catalog_gate enable row level security;
revoke all on public.vehicle_catalog_gate from anon, authenticated;
insert into public.vehicle_catalog_gate(id) values (true) on conflict do nothing;

create or replace function public.acquire_vehicle_catalog(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.vehicle_catalog_gate set token = p_token, available_at = clock_timestamp() + interval '30 seconds'
  where id = true and available_at <= clock_timestamp();
  return found;
end; $$;
create or replace function public.release_vehicle_catalog(p_token uuid)
returns void language sql security definer set search_path = public as $$
  update public.vehicle_catalog_gate set token = null, available_at = clock_timestamp() + interval '1100 milliseconds'
  where id = true and token = p_token;
$$;
revoke all on function public.acquire_vehicle_catalog(uuid) from public, anon, authenticated;
revoke all on function public.release_vehicle_catalog(uuid) from public, anon, authenticated;
grant execute on function public.acquire_vehicle_catalog(uuid) to service_role;
grant execute on function public.release_vehicle_catalog(uuid) to service_role;
commit;
