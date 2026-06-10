alter table public.tones
  add column if not exists color_hex text not null default '#D4D4D4';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tones_color_hex_format'
      and conrelid = 'public.tones'::regclass
  ) then
    alter table public.tones
      add constraint tones_color_hex_format
      check (color_hex ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
