-- 004_seed_templates.sql — seed default templates + support tasks for each new family

create or replace function public.seed_family_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- daily
  insert into public.checklist_templates (family_id, list_type, item_text, sort_order) values
  (new.id,'daily','Be at ward round — note weight, feeds, any changes',1),
  (new.id,'daily','Skin-to-skin / kangaroo care session',2),
  (new.id,'daily','Expressing kit washed & sterilised, bottles labelled',3),
  (new.id,'daily','One proper sit-down meal each',4),
  (new.id,'daily','Photo or video of the day',5),
  (new.id,'daily','Ask the nurses: what can we do ourselves today?',6),
  (new.id,'daily','Do one of her cares ourselves (nappy, temp, mouth care)',7);
  -- weekly
  insert into public.checklist_templates (family_id, list_type, item_text, sort_order) values
  (new.id,'weekly','Half a day off-site each (separately is fine)',1),
  (new.id,'weekly','One evening together while family sits with baby',2),
  (new.id,'weekly','Laundry swapped with family',3),
  (new.id,'weekly','Check in with unit counsellor / Bliss if needed',4),
  (new.id,'weekly','Send family the jobs list for next week',5),
  (new.id,'weekly','Review shift pattern for next week together',6);
  -- wellbeing mum
  insert into public.checklist_templates (family_id, list_type, item_text, sort_order) values
  (new.id,'wellbeing_mum','Unbroken sleep block protected (3h+)',1),
  (new.id,'wellbeing_mum','Shower & properly dressed',2),
  (new.id,'wellbeing_mum','Proper meal, sat down — not over the incubator',3),
  (new.id,'wellbeing_mum','30 min outside the unit — daylight & air',4),
  (new.id,'wellbeing_mum','One non-hospital thing (call a friend, walk, podcast)',5),
  (new.id,'wellbeing_mum','Expressing on track without skipping rest to do it',6);
  -- wellbeing dad
  insert into public.checklist_templates (family_id, list_type, item_text, sort_order) values
  (new.id,'wellbeing_dad','Sleep block protected',1),
  (new.id,'wellbeing_dad','Shower & properly dressed',2),
  (new.id,'wellbeing_dad','Proper meal, sat down',3),
  (new.id,'wellbeing_dad','Exercise or 30 min fresh air',4),
  (new.id,'wellbeing_dad','One non-hospital thing (mate, gym, podcast)',5),
  (new.id,'wellbeing_dad','Checked in with mum: how is she actually doing?',6);
  -- respite (weekly)
  insert into public.checklist_templates (family_id, list_type, item_text, sort_order) values
  (new.id,'respite','Half-day at home each — sleep in your own bed',1),
  (new.id,'respite','Evening together out of the hospital (family sit-in booked)',2),
  (new.id,'respite','Gym / swim / long walk',3),
  (new.id,'respite','Coffee or pub lunch with a friend, off-site',4),
  (new.id,'respite','Film night in the family room — phones down',5),
  (new.id,'respite','Sunday lunch out — the unit will ring if needed',6),
  (new.id,'respite','One full night''s sleep at home each (take turns)',7);
  -- default support jobs
  insert into public.support_tasks (family_id, task_text) values
  (new.id,'Monday — home-cooked meal drop to the hospital'),
  (new.id,'Wednesday — meal or decent takeaway drop'),
  (new.id,'Friday — meal drop + snack/toiletries top-up'),
  (new.id,'Sunday — collect laundry, return last week''s clean'),
  (new.id,'House check: post, bins, plants'),
  (new.id,'One errand run (whatever we text you that week)'),
  (new.id,'Batch-cook freezer meals for when we''re home'),
  (new.id,'Pick up any prescriptions / pharmacy bits'),
  (new.id,'Fuel the car / sort parking top-ups'),
  (new.id,'Wash & prep baby clothes at home (non-bio, ready for discharge)'),
  (new.id,'Sort the nursery so it''s ready for homecoming'),
  (new.id,'Deep clean the house the week before discharge'),
  (new.id,'Sit with baby so mum & dad get an evening off together'),
  (new.id,'Collect anything we order online');
  return new;
end $$;

create trigger trg_seed_family after insert on public.families
  for each row execute function public.seed_family_defaults();
