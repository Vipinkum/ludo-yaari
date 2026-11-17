

-- rooms the admin deleted: the host checks this and sends everyone back to the lobby
create table if not exists public.closed_rooms (
  code text primary key,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz not null default now()
);
alter table public.closed_rooms enable row level security;
drop policy if exists "admins read" on public.closed_rooms;
create policy "admins read" on public.closed_rooms for select to authenticated using (public.is_admin());

create or replace function public.admin_close_room(p_room text) returns void
language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(p_room));
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if c !~ '^[A-Z0-9]{4,8}$' then raise exception 'Invalid room code'; end if;
  insert into closed_rooms (code, closed_by, closed_at) values (c, auth.uid(), now())
    on conflict (code) do update set closed_by = excluded.closed_by, closed_at = now();
  insert into activity (user_id, kind, room_code) values (auth.uid(), 'room_deleted', c);
end $$;

create or replace function public.room_closed(p_room text, p_since timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from closed_rooms where code = upper(p_room) and closed_at >= p_since)
$$;

revoke execute on function public.admin_close_room(text) from public, anon;
grant execute on function public.admin_close_room(text) to authenticated;
revoke execute on function public.room_closed(text, timestamptz) from public, anon;
grant execute on function public.room_closed(text, timestamptz) to authenticated;
