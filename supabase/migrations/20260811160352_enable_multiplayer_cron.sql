-- Ensure the multiplayer phase/expiry sweeper is installed on every environment.
create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'multiplayer-tick-minute'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'multiplayer-tick-minute',
    '* * * * *',
    'select public.multiplayer_tick(500);'
  );
end;
$$;
