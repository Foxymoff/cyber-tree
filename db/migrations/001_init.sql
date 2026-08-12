-- 001_init.sql — исходная схема. Раздел 4 ТЗ.
-- Миграция идемпотентна: повторный прогон на уже применённой базе ничего не ломает.

create table if not exists wishes (
  id          serial primary key,
  name        text not null,
  specialty   text not null,
  wish        text not null,
  status      text not null default 'pending',  -- pending | approved | rejected
  auto_flag   text,                             -- причина срабатывания автомода, null если чисто
  device_hash text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at — курсор опроса для /display и /admin.
-- Клиенты запрашивают всё, что изменилось позже их последней метки, поэтому
-- поле обязано обновляться при ЛЮБОМ изменении строки. Полагаться на то, что
-- каждый запрос выставит его руками, нельзя — рано или поздно кто-то забудет,
-- и лист, снятый с экрана, там и останется. Поэтому триггер.
create or replace function wishes_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists wishes_set_updated_at on wishes;
create trigger wishes_set_updated_at
  before update on wishes
  for each row
  execute function wishes_touch_updated_at();

create index if not exists wishes_updated_at_idx on wishes (updated_at);
create index if not exists wishes_status_idx on wishes (status);

-- Одно пожелание на устройство. Ограничение по IP не ставим сознательно:
-- у мобильных операторов сотни абонентов сидят за одним адресом.
-- Частичный индекс, потому что device_hash допускает null (записи, залитые вручную).
create unique index if not exists wishes_device_hash_key
  on wishes (device_hash)
  where device_hash is not null;
