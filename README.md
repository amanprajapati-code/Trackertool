# TICICTRACKER

A personal academic dashboard for college students — live "what's next" class card,
per-subject + overall attendance tracking (with a liquid/water-fill visual), and a
place for assignments, exams, and reminders. Every student sets up their own
timetable on first visit via a 3-step wizard, since everyone's schedule is different.

## 1. Create a Supabase project
Go to https://supabase.com → New project. Wait for it to finish provisioning.

## 2. Run the database schema
Open **SQL Editor** in your Supabase project → paste the contents of
`supabase-schema.sql` → Run. This creates the tables (`profiles`, `subjects`,
`schedule_slots`, `attendance`, `tasks`) with Row Level Security so each student
only ever sees their own data.

## 3. Add your API keys
Open `config.js` and paste your **Project URL** and **anon public key**
(Settings → API in your Supabase dashboard):

```js
export const SUPABASE_URL = "https://xxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

## 4. Turn on email auth (usually on by default)
Supabase dashboard → Authentication → Providers → make sure **Email** is enabled.
For quick testing you can turn off "Confirm email" under Authentication → Settings,
so accounts can log in immediately after signup.

## 5. Run it
This is a static site (no build step). Easiest ways to run it:
- **Locally:** `npx serve .` inside the project folder, then open the printed URL.
- **Deploy free:** drag the whole folder into Netlify, or run `vercel` / `vercel deploy`
  from inside the folder, or push to GitHub and import into Vercel/Netlify/Cloudflare Pages.

Opening `index.html` directly via `file://` will mostly work too, but a real
local server is more reliable for ES modules.

## How it works
- **First login → onboarding wizard:** add subjects → add each subject's weekly
  time slots (day, start/end time, room) → review → save. Every student builds
  their own timetable — nothing is hardcoded.
- **Dashboard hero card:** shows the class happening right now with time
  remaining, or the next class with a countdown, or "no classes today" /
  "done for today".
- **Attendance:** after a class's end time passes, mark it Present/Absent right
  from the today strip. The liquid ring shows your overall %, and each subject
  gets its own % bar. Colors follow the standard 75% eligibility line (green ≥75%,
  amber 65–74%, red <65%) — thresholds are in `config.js` (`ATT_SAFE`, `ATT_WARN`).
- **Tasks:** add assignments, exams, or reminders with an optional due date;
  mark done or delete anytime.
- **Settings:** add/remove subjects and time slots after onboarding, anytime.

## Files
- `index.html` — page shell, all CSS (the "liquid glass" design system)
- `config.js` — your Supabase keys + tunables (colors, thresholds)
- `app.js` — all app logic (auth, onboarding wizard, dashboard, attendance, tasks, settings)
- `supabase-schema.sql` — database tables + Row Level Security policies
