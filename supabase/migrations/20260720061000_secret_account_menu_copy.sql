-- Align Ten Curtain Calls copy with chip-press counting.

update public.achievement_definitions
set description = 'You pressed the account button ten times.'
where id = 'secret_account_menu';
