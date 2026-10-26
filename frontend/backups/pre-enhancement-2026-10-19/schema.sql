create table if not exists public.app_records (
  resource text not null,
  record_id text not null,
  data jsonb not null,
  owner_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (resource, record_id)
);

create index if not exists app_records_resource_idx on public.app_records(resource);
create index if not exists app_records_owner_idx on public.app_records(owner_user_id);
alter table public.app_records enable row level security;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public
as $$
  select case
    when data->>'account_status' = 'Active' and coalesce((data->>'email_verified')::boolean, false)
      then data->>'role'
    else null
  end
  from public.app_records
  where resource = 'users' and record_id = auth.uid()::text
  limit 1
$$;

create or replace function public.current_patient_id()
returns text language sql stable security definer set search_path = public
as $$
  select data->>'patient_id' from public.app_records
  where resource = 'patients' and data->>'user_id' = auth.uid()::text
  limit 1
$$;

create or replace function public.current_clinic_id()
returns text language sql stable security definer set search_path = public
as $$
  select data->>'clinic_id' from public.app_records
  where resource = 'users' and record_id = auth.uid()::text
  limit 1
$$;

create or replace function public.can_read_app_record(p_resource text, p_data jsonb)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  app_role text := public.current_app_role();
  patient_id text := public.current_patient_id();
  clinic_id text := public.current_clinic_id();
begin
  if app_role = 'System Administrator' then return true; end if;
  if p_resource in ('specialties', 'services', 'barangays') then return true; end if;
  if p_resource = 'clinics' then
    return (p_data->>'verified' = 'true' and p_data->>'approval_status' = 'Approved')
      or (app_role = 'Clinic Administrator' and p_data->>'clinic_id' = clinic_id);
  end if;
  if p_resource = 'users' then return p_data->>'user_id' = auth.uid()::text; end if;
  if p_resource = 'patients' then
    return p_data->>'user_id' = auth.uid()::text
      or (app_role = 'Clinic Administrator' and exists (
        select 1 from public.app_records a
        where a.resource = 'appointments' and a.data->>'clinic_id' = clinic_id
          and a.data->>'patient_id' = p_data->>'patient_id'
      ));
  end if;
  if p_resource = 'staff' then
    return (app_role = 'Clinic Administrator' and p_data->>'clinic_id' = clinic_id)
      or exists (select 1 from public.app_records c where c.resource = 'clinics'
        and c.data->>'clinic_id' = p_data->>'clinic_id' and c.data->>'verified' = 'true'
        and c.data->>'approval_status' = 'Approved');
  end if;
  if p_resource in ('slots', 'schedules') then
    return (app_role = 'Clinic Administrator' and p_data->>'clinic_id' = clinic_id)
      or (p_resource = 'slots' and p_data->>'slot_status' = 'Available' and exists (
        select 1 from public.app_records c where c.resource = 'clinics'
          and c.data->>'clinic_id' = p_data->>'clinic_id'
          and c.data->>'verified' = 'true' and c.data->>'approval_status' = 'Approved'
      ));
  end if;
  if p_resource = 'appointments' then
    return (app_role = 'Patient' and p_data->>'patient_id' = patient_id)
      or (app_role = 'Clinic Administrator' and p_data->>'clinic_id' = clinic_id);
  end if;
  if p_resource = 'notifications' then
    return p_data->>'recipient_id' in (patient_id, clinic_id, auth.uid()::text)
      or (app_role = 'System Administrator' and p_data->>'recipient_id' = 'system_admin');
  end if;
  if p_resource = 'feedback' then
    return (app_role = 'Patient' and p_data->>'patient_id' = patient_id)
      or (app_role = 'Clinic Administrator' and p_data->>'clinic_id' = clinic_id);
  end if;
  if p_resource = 'activity_logs' then return false; end if;
  return false;
end
$$;

create or replace function public.can_insert_app_record(p_resource text, p_data jsonb)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  app_role text := public.current_app_role();
  patient_id text := public.current_patient_id();
  clinic_id text := public.current_clinic_id();
begin
  if app_role = 'System Administrator' then return true; end if;
  if app_role = 'Patient' then
    if p_resource = 'appointments' then
      return p_data->>'patient_id' = patient_id and p_data->>'appointment_status' = 'Pending';
    end if;
    if p_resource = 'feedback' then
      return p_data->>'patient_id' = patient_id and exists (
        select 1 from public.app_records a where a.resource = 'appointments'
          and a.data->>'appointment_id' = p_data->>'appointment_id'
          and a.data->>'patient_id' = patient_id and a.data->>'appointment_status' = 'Completed'
      );
    end if;
    if p_resource = 'notifications' then
      return p_data->>'recipient_id' = patient_id
        or (p_data->>'recipient_id' = clinic_id and exists (
          select 1 from public.app_records a where a.resource = 'appointments'
            and a.data->>'patient_id' = patient_id and a.data->>'clinic_id' = clinic_id
            and a.data->>'reference_number' = substring(p_data->>'message' from 'LC-[0-9]+')
        ));
    end if;
  end if;
  if app_role = 'Clinic Administrator' then
    if p_resource in ('staff', 'slots') then return p_data->>'clinic_id' = clinic_id; end if;
    if p_resource = 'notifications' then
      return p_data->>'recipient_id' = clinic_id
        or (exists (select 1 from public.app_records a where a.resource = 'appointments'
          and a.data->>'clinic_id' = clinic_id and a.data->>'patient_id' = p_data->>'recipient_id'));
    end if;
  end if;
  return false;
end
$$;

create or replace function public.can_update_app_record(p_resource text, p_data jsonb)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_app_role() = 'System Administrator'
    or (public.current_app_role() = 'Patient' and (
      (p_resource = 'patients' and p_data->>'user_id' = auth.uid()::text)
      or (p_resource = 'users' and p_data->>'user_id' = auth.uid()::text)
      or (p_resource = 'notifications' and p_data->>'recipient_id' = public.current_patient_id())
    ))
    or (public.current_app_role() = 'Clinic Administrator' and (
      (p_resource = 'clinics' and p_data->>'clinic_id' = public.current_clinic_id())
      or (p_resource in ('staff', 'slots') and p_data->>'clinic_id' = public.current_clinic_id())
      or (p_resource = 'notifications' and p_data->>'recipient_id' = public.current_clinic_id())
    ))
$$;

create or replace function public.can_delete_app_record(p_resource text, p_data jsonb)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_app_role() = 'System Administrator'
    or (public.current_app_role() = 'Clinic Administrator'
      and p_resource in ('staff', 'slots') and p_data->>'clinic_id' = public.current_clinic_id())
$$;

drop policy if exists app_records_read on public.app_records;
create policy app_records_read on public.app_records for select
using (public.can_read_app_record(resource, data));

drop policy if exists app_records_insert on public.app_records;
create policy app_records_insert on public.app_records for insert
with check (public.can_insert_app_record(resource, data));

drop policy if exists app_records_update on public.app_records;
create policy app_records_update on public.app_records for update
using (public.can_update_app_record(resource, data))
with check (public.can_update_app_record(resource, data));

drop policy if exists app_records_delete on public.app_records;
create policy app_records_delete on public.app_records for delete
using (public.can_delete_app_record(resource, data));

create or replace function public.protect_app_record_changes()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  app_role text := public.current_app_role();
begin
  if auth.role() = 'service_role' or app_role = 'System Administrator'
    or current_setting('lapitcare.appointment_rpc', true) = 'true' then
    if tg_op = 'DELETE' then
      if old.resource = 'slots' and exists (
        select 1 from public.app_records a where a.resource = 'appointments'
          and a.data->>'slot_id' = old.record_id
          and a.data->>'appointment_status' in ('Pending', 'Confirmed')
      ) then raise exception 'A reserved appointment slot cannot be removed'; end if;
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.resource = 'slots' and exists (
      select 1 from public.app_records a where a.resource = 'appointments'
        and a.data->>'slot_id' = old.record_id
        and a.data->>'appointment_status' in ('Pending', 'Confirmed')
    ) then raise exception 'A reserved appointment slot cannot be removed'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if current_setting('lapitcare.internal_auth_trigger', true) = 'true' then return new; end if;
    if new.resource <> old.resource or new.record_id <> old.record_id or new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'Record identity cannot be changed';
    end if;
    if old.resource = 'slots' and exists (
      select 1 from public.app_records a where a.resource = 'appointments'
        and a.data->>'slot_id' = old.record_id
        and a.data->>'appointment_status' in ('Pending', 'Confirmed')
    ) then raise exception 'A reserved appointment slot cannot be changed directly'; end if;
    if app_role = 'Patient' and old.resource = 'users'
      and (new.data - 'name') <> (old.data - 'name') then raise exception 'Patients can only edit their display name'; end if;
    if app_role = 'Patient' and old.resource = 'patients'
      and (new.data - array['name', 'mobile_number', 'barangay']) <> (old.data - array['name', 'mobile_number', 'barangay']) then
      raise exception 'Patients can only edit their contact details';
    end if;
    if app_role = 'Clinic Administrator' and old.resource = 'clinics'
      and (
        new.data
          - array[
            'clinic_name', 'contact_number', 'address', 'barangay',
            'latitude', 'longitude', 'operating_hours', 'services',
            'specialties', 'clinic_status', 'queue_count',
            'estimated_wait_minutes', 'cancellation_window_hours'
          ]
      ) <> (
        old.data
          - array[
            'clinic_name', 'contact_number', 'address', 'barangay',
            'latitude', 'longitude', 'operating_hours', 'services',
            'specialties', 'clinic_status', 'queue_count',
            'estimated_wait_minutes', 'cancellation_window_hours'
          ]
      ) then
      raise exception 'Clinic approval and verification fields are administrator-managed';
    end if;
    if old.resource = 'appointments' and app_role <> 'System Administrator' then
      raise exception 'Appointments must be changed through the appointment RPC';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists app_record_change_guard on public.app_records;
create trigger app_record_change_guard before update or delete on public.app_records
for each row execute function public.protect_app_record_changes();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
  patient_id text := 'pat_' || replace(new.id::text, '-', '');
  clinic_id text := 'cln_' || replace(new.id::text, '-', '');
  clinic jsonb := coalesce(new.raw_user_meta_data->'clinic', '{}'::jsonb);
begin
  if requested_role is null or requested_role not in ('Patient', 'Clinic Administrator') then return new; end if;
  insert into public.app_records(resource, record_id, owner_user_id, data)
  values ('users', new.id::text, new.id, jsonb_build_object(
    'user_id', new.id::text, 'email', new.email, 'name',
    coalesce(new.raw_user_meta_data->>'name', clinic->>'representative_name', ''),
    'role', requested_role,
    'account_status', case when requested_role = 'Patient' then 'Pending Verification' else 'Pending' end,
    'email_verified', false, 'created_at', now()
  ) || case when requested_role = 'Clinic Administrator' then jsonb_build_object('clinic_id', clinic_id) else '{}'::jsonb end);
  if requested_role = 'Patient' then
    insert into public.app_records(resource, record_id, owner_user_id, data)
    values ('patients', patient_id, new.id, jsonb_build_object(
      'patient_id', patient_id, 'user_id', new.id::text, 'name', new.raw_user_meta_data->>'name',
      'email', new.email, 'mobile_number', new.raw_user_meta_data->>'mobile_number',
      'barangay', new.raw_user_meta_data->>'barangay',
      'account_status', 'Pending Verification', 'email_verified', false
    ));
  else
    if clinic->>'clinic_name' is null or clinic->>'latitude' is null or clinic->>'longitude' is null then
      raise exception 'Clinic registration details are incomplete';
    end if;
    insert into public.app_records(resource, record_id, owner_user_id, data)
    values ('clinics', clinic_id, new.id, clinic || jsonb_build_object(
      'clinic_id', clinic_id, 'email', new.email, 'clinic_status', 'Closed',
      'approval_status', 'Pending', 'verified', false, 'queue_count', 0,
      'estimated_wait_minutes', 0, 'cancellation_window_hours', 12, 'rating', 0
    ));
    insert into public.app_records(resource, record_id, owner_user_id, data)
    values ('notifications', 'not_' || replace(new.id::text, '-', ''), new.id,
      jsonb_build_object('notification_id', 'not_' || replace(new.id::text, '-', ''),
        'recipient_id', 'system_admin', 'notification_type', 'Clinic registration',
        'message', 'A new clinic registration from ' || (clinic->>'clinic_name') || ' is awaiting review.',
        'read', false, 'created_at', now()));
  end if;
  return new;
end
$$;

drop trigger if exists on_auth_user_created_lapitcare on auth.users;
create trigger on_auth_user_created_lapitcare after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.activate_verified_lapitcare_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  profile jsonb;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform set_config('lapitcare.internal_auth_trigger', 'true', true);
    select data into profile from public.app_records where resource = 'users' and record_id = new.id::text;
    if profile->>'role' = 'Patient' then
      update public.app_records set data = jsonb_set(jsonb_set(data, '{email_verified}', 'true'), '{account_status}', '"Active"')
      where resource = 'users' and record_id = new.id::text;
      update public.app_records set data = jsonb_set(jsonb_set(data, '{email_verified}', 'true'), '{account_status}', '"Active"')
      where resource = 'patients' and data->>'user_id' = new.id::text;
    elsif profile->>'role' = 'Clinic Administrator' then
      update public.app_records set data = jsonb_set(data, '{email_verified}', 'true')
      where resource = 'users' and record_id = new.id::text;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists on_auth_email_confirmed_lapitcare on auth.users;
create trigger on_auth_email_confirmed_lapitcare after update of email_confirmed_at on auth.users
for each row execute function public.activate_verified_lapitcare_user();

create or replace function public.update_appointment(p_appointment_id text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  appointment_row public.app_records%rowtype;
  clinic_row public.app_records%rowtype;
  old_slot public.app_records%rowtype;
  new_slot public.app_records%rowtype;
  new_staff public.app_records%rowtype;
  next_status text := p_changes->>'appointment_status';
  actor_role text := public.current_app_role();
  patient_id text := public.current_patient_id();
  clinic_id text := public.current_clinic_id();
  next_data jsonb;
begin
  perform set_config('lapitcare.appointment_rpc', 'true', true);
  select * into appointment_row from public.app_records
  where resource = 'appointments' and record_id = p_appointment_id for update;
  if not found then raise exception 'Appointment was not found'; end if;
  if actor_role = 'Patient'
    and appointment_row.data->>'patient_id' is distinct from patient_id then
    raise exception 'Access denied';
  end if;
  if actor_role = 'Clinic Administrator'
    and appointment_row.data->>'clinic_id' is distinct from clinic_id then
    raise exception 'Access denied';
  end if;
  if actor_role is null
    or actor_role not in ('Patient', 'Clinic Administrator', 'System Administrator') then
    raise exception 'Access denied';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'Appointment changes must be an object'; end if;
  if actor_role = 'Patient' and (p_changes - array['appointment_status']) <> '{}'::jsonb then
    raise exception 'Patients may only cancel their appointment';
  end if;
  if actor_role = 'Clinic Administrator' and
    (p_changes - array['appointment_status', 'slot_id', 'staff_id', 'appointment_date', 'appointment_time']) <> '{}'::jsonb then
    raise exception 'Clinic appointment changes contain unsupported fields';
  end if;
  if actor_role = 'Clinic Administrator' and not (p_changes ? 'slot_id')
    and (p_changes ?| array['staff_id', 'appointment_date', 'appointment_time']) then
    raise exception 'Appointment time changes require an available slot';
  end if;
  if actor_role = 'Clinic Administrator' and p_changes ? 'slot_id' and next_status is not null then
    raise exception 'Reschedule and status changes must be submitted separately';
  end if;
  if actor_role = 'Patient' and (appointment_row.data->>'appointment_status' is null
    or appointment_row.data->>'appointment_status' not in ('Pending', 'Confirmed')) then
    raise exception 'Only pending or confirmed appointments can be changed';
  end if;
  if actor_role = 'Patient' and next_status is not null and next_status <> 'Cancelled' then
    raise exception 'Patients may only cancel their appointment';
  end if;
  if actor_role = 'Clinic Administrator' and next_status is not null and not coalesce((
    (appointment_row.data->>'appointment_status' = 'Pending' and next_status in ('Confirmed', 'Rejected', 'Cancelled'))
    or (appointment_row.data->>'appointment_status' = 'Confirmed' and next_status in ('Completed', 'No-show', 'Cancelled'))
  ), false) then raise exception 'Invalid clinic appointment status transition'; end if;
  if actor_role = 'Clinic Administrator' and p_changes ? 'slot_id'
    and p_changes->>'slot_id' = appointment_row.data->>'slot_id' then
    raise exception 'Choose a different available appointment slot';
  end if;

  if actor_role in ('Patient', 'Clinic Administrator') then
    select * into clinic_row from public.app_records where resource = 'clinics'
      and data->>'clinic_id' = appointment_row.data->>'clinic_id';
    if appointment_row.data->>'appointment_status' in ('Pending', 'Confirmed')
      and (next_status in ('Cancelled', 'Rejected') or p_changes ? 'slot_id') then
      if ((appointment_row.data->>'appointment_date') || ' ' || (appointment_row.data->>'appointment_time'))::timestamp
        - (now() at time zone 'Asia/Manila') < make_interval(
          hours => coalesce(
            (clinic_row.data->>'cancellation_window_hours')::integer,
            12
          )
        ) then
        raise exception 'Appointment changes are closed for this visit';
      end if;
    end if;
  end if;

  next_data := appointment_row.data || p_changes;
  if p_changes ? 'slot_id' and p_changes->>'slot_id' <> appointment_row.data->>'slot_id' then
    if clinic_row.data->>'verified' <> 'true' or clinic_row.data->>'approval_status' <> 'Approved'
      or clinic_row.data->>'clinic_status' = 'Closed'
      or not (clinic_row.data->'services' ? (appointment_row.data->>'service_name')) then
      raise exception 'The clinic or service is no longer available';
    end if;
    select * into new_slot from public.app_records where resource = 'slots'
      and record_id = p_changes->>'slot_id' for update;
    if not found or new_slot.data->>'slot_status' <> 'Available'
      or new_slot.data->>'clinic_id' <> appointment_row.data->>'clinic_id'
      or (new_slot.data->>'slot_date' || ' ' || new_slot.data->>'start_time')::timestamp at time zone 'Asia/Manila' <= now() then
      raise exception 'The selected appointment time is no longer available';
    end if;
    select * into new_staff from public.app_records where resource = 'staff' and record_id = new_slot.data->>'staff_id';
    if not found or new_staff.data->>'clinic_id' <> appointment_row.data->>'clinic_id'
      or new_staff.data->>'duty_status' <> 'On Duty'
      or not (clinic_row.data->'specialties' ? (new_staff.data->>'specialty_name')) then
      raise exception 'The selected provider is not available for this clinic';
    end if;
    select * into old_slot from public.app_records where resource = 'slots'
      and record_id = appointment_row.data->>'slot_id' for update;
    update public.app_records set data = jsonb_set(data, '{slot_status}', '"Available')
      where resource = 'slots' and record_id = old_slot.record_id;
    update public.app_records set data = jsonb_set(data, '{slot_status}', '"Booked')
      where resource = 'slots' and record_id = new_slot.record_id;
    next_data := next_data || jsonb_build_object('staff_id', new_slot.data->>'staff_id',
      'appointment_date', new_slot.data->>'slot_date', 'appointment_time', new_slot.data->>'start_time');
  elsif next_status in ('Cancelled', 'Rejected') then
    update public.app_records set data = jsonb_set(data, '{slot_status}', '"Available')
      where resource = 'slots' and record_id = appointment_row.data->>'slot_id';
  end if;
  update public.app_records set data = next_data, updated_at = now()
  where resource = 'appointments' and record_id = p_appointment_id;
  return next_data;
end
$$;

create or replace function public.reserve_appointment_slot()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  slot_row public.app_records%rowtype;
  staff_row public.app_records%rowtype;
  clinic_row public.app_records%rowtype;
begin
  if new.resource <> 'appointments' or public.current_app_role() <> 'Patient' then return new; end if;
  if new.data->>'patient_id' is distinct from public.current_patient_id()
    or new.data->>'appointment_status' <> 'Pending' then
    raise exception 'Appointment request is invalid';
  end if;
  select * into slot_row from public.app_records where resource = 'slots'
    and record_id = new.data->>'slot_id' for update;
  if not found or slot_row.data->>'slot_status' <> 'Available'
    or slot_row.data->>'clinic_id' <> new.data->>'clinic_id'
    or slot_row.data->>'staff_id' <> new.data->>'staff_id'
    or slot_row.data->>'slot_date' <> new.data->>'appointment_date'
    or slot_row.data->>'start_time' <> new.data->>'appointment_time'
    or (slot_row.data->>'slot_date' || ' ' || slot_row.data->>'start_time')::timestamp at time zone 'Asia/Manila' <= now() then
    raise exception 'The selected appointment time is no longer available';
  end if;
  select * into clinic_row from public.app_records where resource = 'clinics'
    and data->>'clinic_id' = new.data->>'clinic_id';
  if not found or clinic_row.data->>'verified' <> 'true'
    or clinic_row.data->>'approval_status' <> 'Approved'
    or clinic_row.data->>'clinic_status' = 'Closed'
    or not (clinic_row.data->'services' ? (new.data->>'service_name')) then
    raise exception 'The selected clinic or service is not available';
  end if;
  select * into staff_row from public.app_records where resource = 'staff'
    and record_id = new.data->>'staff_id';
  if not found or staff_row.data->>'clinic_id' <> new.data->>'clinic_id'
    or staff_row.data->>'duty_status' <> 'On Duty'
    or not (clinic_row.data->'specialties' ? (staff_row.data->>'specialty_name')) then
    raise exception 'The selected provider is not available';
  end if;
  if nullif(trim(new.data->>'visit_reason'), '') is null or nullif(trim(new.data->>'contact_number'), '') is null then
    raise exception 'Visit reason and contact number are required';
  end if;
  update public.app_records set data = jsonb_set(data, '{slot_status}', '"Booked')
    where resource = 'slots' and record_id = slot_row.record_id;
  return new;
end
$$;

drop trigger if exists reserve_appointment_slot_before_insert on public.app_records;
create trigger reserve_appointment_slot_before_insert before insert on public.app_records
for each row execute function public.reserve_appointment_slot();

grant select, insert, update, delete on public.app_records to anon, authenticated;
revoke all on function public.current_app_role() from public, anon, authenticated;
revoke all on function public.current_patient_id() from public, anon, authenticated;
revoke all on function public.current_clinic_id() from public, anon, authenticated;
revoke all on function public.can_read_app_record(text, jsonb) from public, anon, authenticated;
revoke all on function public.can_insert_app_record(text, jsonb) from public, anon, authenticated;
revoke all on function public.can_update_app_record(text, jsonb) from public, anon, authenticated;
revoke all on function public.can_delete_app_record(text, jsonb) from public, anon, authenticated;
revoke all on function public.update_appointment(text, jsonb) from public, anon, authenticated;
grant execute on function public.can_read_app_record(text, jsonb) to anon, authenticated;
grant execute on function public.can_insert_app_record(text, jsonb) to authenticated;
grant execute on function public.can_update_app_record(text, jsonb) to authenticated;
grant execute on function public.can_delete_app_record(text, jsonb) to authenticated;
grant execute on function public.update_appointment(text, jsonb) to authenticated;
