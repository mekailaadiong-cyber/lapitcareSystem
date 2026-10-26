-- Additive migration: permit small, JPEG data-URL profile photos in existing
-- patient and clinic JSON records. No records or tables are deleted or reset.
-- Apply only after taking a Supabase backup.
create or replace function public.protect_app_record_changes()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  app_role text := public.current_app_role();
  photo text;
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
    if app_role = 'Patient' and old.resource = 'patients' then
      photo := new.data->>'profile_photo';
      if photo is not null and (
        length(photo) > 250000 or photo not like 'data:image/jpeg;base64,%'
      ) then
        raise exception 'Patient profile photo must be a small JPEG data URL';
      end if;
      if (new.data - array['name', 'mobile_number', 'barangay', 'profile_photo'])
        <> (old.data - array['name', 'mobile_number', 'barangay', 'profile_photo']) then
        raise exception 'Patients can only edit their contact details and profile photo';
      end if;
    end if;
    if app_role = 'Clinic Administrator' and old.resource = 'clinics' then
      photo := new.data->>'profile_photo';
      if photo is not null and (
        length(photo) > 250000 or photo not like 'data:image/jpeg;base64,%'
      ) then
        raise exception 'Clinic profile photo must be a small JPEG data URL';
      end if;
      if (
        new.data - array[
          'clinic_name', 'contact_number', 'address', 'barangay',
          'latitude', 'longitude', 'operating_hours', 'services',
          'specialties', 'clinic_status', 'queue_count',
          'estimated_wait_minutes', 'cancellation_window_hours',
          'profile_photo'
        ]
      ) <> (
        old.data - array[
          'clinic_name', 'contact_number', 'address', 'barangay',
          'latitude', 'longitude', 'operating_hours', 'services',
          'specialties', 'clinic_status', 'queue_count',
          'estimated_wait_minutes', 'cancellation_window_hours',
          'profile_photo'
        ]
      ) then
        raise exception 'Clinic approval and verification fields are administrator-managed';
      end if;
    end if;
    if old.resource = 'appointments' and app_role <> 'System Administrator' then
      raise exception 'Appointments must be changed through the appointment RPC';
    end if;
  end if;
  return new;
end
$$;
