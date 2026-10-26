-- Additive feedback RPCs. These preserve existing records and expose only
-- approved public review fields; patient identifiers remain private.
create or replace function public.submit_feedback(p_feedback jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  patient_id text := public.current_patient_id();
  appointment_row public.app_records%rowtype;
  feedback_id text := nullif(trim(p_feedback->>'feedback_id'), '');
  appointment_id text := nullif(trim(p_feedback->>'appointment_id'), '');
  rating_value integer;
  comment_text text := trim(coalesce(p_feedback->>'comment', ''));
  feedback_data jsonb;
  average_rating numeric;
begin
  if public.current_app_role() <> 'Patient' or patient_id is null then
    raise exception 'Only an active patient can submit feedback';
  end if;
  if p_feedback is null or jsonb_typeof(p_feedback) <> 'object' then
    raise exception 'Feedback must be an object';
  end if;
  if feedback_id is null or appointment_id is null then
    raise exception 'Feedback and appointment identifiers are required';
  end if;
  if coalesce(p_feedback->>'rating', '') !~ '^[1-5]$' then
    raise exception 'Feedback rating must be from 1 to 5';
  end if;
  rating_value := (p_feedback->>'rating')::integer;
  if comment_text = '' or length(comment_text) > 1500 then
    raise exception 'Feedback comment must contain 1 to 1500 characters';
  end if;

  select * into appointment_row
  from public.app_records
  where resource = 'appointments' and record_id = appointment_id
  for update;
  if not found
    or appointment_row.data->>'patient_id' is distinct from patient_id
    or appointment_row.data->>'appointment_status' <> 'Completed' then
    raise exception 'Feedback is only available for your completed appointments';
  end if;
  if exists (
    select 1 from public.app_records f
    where f.resource = 'feedback'
      and f.data->>'appointment_id' = appointment_id
  ) then
    raise exception 'Feedback has already been submitted for this appointment';
  end if;

  feedback_data := jsonb_build_object(
    'feedback_id', feedback_id,
    'appointment_id', appointment_id,
    'patient_id', patient_id,
    'clinic_id', appointment_row.data->>'clinic_id',
    'rating', rating_value,
    'comment', comment_text,
    'created_at', now()
  );
  insert into public.app_records(resource, record_id, owner_user_id, data)
  values ('feedback', feedback_id, auth.uid(), feedback_data);

  select avg((f.data->>'rating')::numeric) into average_rating
  from public.app_records f
  where f.resource = 'feedback'
    and f.data->>'clinic_id' = appointment_row.data->>'clinic_id';
  update public.app_records
  set data = jsonb_set(data, '{rating}', to_jsonb(round(average_rating, 2)), true),
      updated_at = now()
  where resource = 'clinics'
    and data->>'clinic_id' = appointment_row.data->>'clinic_id';

  return feedback_data;
end
$$;

create or replace function public.public_clinic_feedback(p_clinic_id text)
returns table(feedback_id text, rating integer, comment text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select
    f.data->>'feedback_id',
    (f.data->>'rating')::integer,
    f.data->>'comment',
    (f.data->>'created_at')::timestamptz
  from public.app_records f
  where f.resource = 'feedback'
    and f.data->>'clinic_id' = p_clinic_id
    and exists (
      select 1 from public.app_records c
      where c.resource = 'clinics'
        and c.data->>'clinic_id' = p_clinic_id
        and c.data->>'verified' = 'true'
        and c.data->>'approval_status' = 'Approved'
    )
  order by (f.data->>'created_at')::timestamptz desc
$$;

revoke all on function public.submit_feedback(jsonb) from public, anon, authenticated;
grant execute on function public.submit_feedback(jsonb) to authenticated;
revoke all on function public.public_clinic_feedback(text) from public, anon, authenticated;
grant execute on function public.public_clinic_feedback(text) to anon, authenticated;
