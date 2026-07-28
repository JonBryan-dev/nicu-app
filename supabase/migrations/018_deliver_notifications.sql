-- 018_deliver_notifications.sql
-- Replace the dashboard Database Webhook with a trigger-driven delivery we
-- control: explicit Authorization header (the function enforces JWT) and an
-- explicit JSON payload. Fixes pushes never sending (the dashboard webhook
-- was calling the function unauthenticated / with an empty body).
-- After running this, DELETE the old webhook in Database -> Webhooks to
-- avoid duplicate calls.

create extension if not exists pg_net;

create or replace function public.deliver_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://ldywumoesyeehcqglcdh.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkeXd1bW9lc3llZWhjcWdsY2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzEwNzQsImV4cCI6MjEwMDQ0NzA3NH0.snruNA5CUJW7oQOGbYAz8_QQeV9d0DnMxyMYke5CuMA'
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end $$;

drop trigger if exists trg_deliver_notification on public.notifications;
create trigger trg_deliver_notification after insert on public.notifications
  for each row execute function public.deliver_notification();
