-- ============================================================
-- Campus / Academic Dashboard — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → Run
-- ============================================================

-- Profile info (extends built-in auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  section text,
  onboarded boolean default false,
  created_at timestamptz default now()
);

-- Subjects the student is taking
create table if not exists subjects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  code text,
  teacher text,
  type text default 'lecture' check (type in ('lecture','lab')),
  color text default '#4DA3FF',
  created_at timestamptz default now()
);

-- Weekly recurring timetable slots (the "when" of each subject)
create table if not exists schedule_slots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  subject_id uuid references subjects on delete cascade not null,
  day_of_week int not null,        -- 0=Sunday .. 6=Saturday
  start_time time not null,
  end_time time not null,
  room text,
  created_at timestamptz default now()
);

-- Daily attendance marks (present/absent per class occurrence)
create table if not exists attendance (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  subject_id uuid references subjects on delete cascade not null,
  class_date date not null,
  start_time time not null,
  status text not null check (status in ('present','absent')),
  created_at timestamptz default now(),
  unique (user_id, subject_id, class_date, start_time)
);

-- Assignments / Exams / Notes-reminders
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  type text default 'assignment' check (type in ('assignment','exam','note')),
  due_date date,
  description text,
  done boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security — every user only ever sees their own rows
-- ============================================================
alter table profiles enable row level security;
alter table subjects enable row level security;
alter table schedule_slots enable row level security;
alter table attendance enable row level security;
alter table tasks enable row level security;

create policy "own profile"   on profiles       for all using (auth.uid() = id)         with check (auth.uid() = id);
create policy "own subjects"  on subjects       for all using (auth.uid() = user_id)    with check (auth.uid() = user_id);
create policy "own slots"     on schedule_slots for all using (auth.uid() = user_id)    with check (auth.uid() = user_id);
create policy "own attendance" on attendance    for all using (auth.uid() = user_id)    with check (auth.uid() = user_id);
create policy "own tasks"     on tasks          for all using (auth.uid() = user_id)    with check (auth.uid() = user_id);

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
