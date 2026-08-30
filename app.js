import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, DAYS, DAYS_SHORT, ATT_SAFE, ATT_WARN, SUBJECT_COLORS } from "./config.js";

const $app = document.getElementById("app");
const $toastWrap = document.getElementById("toastWrap");

const state = {
  session: null,
  profile: null,
  subjects: [],
  slots: [],
  attendance: [],
  tasks: [],
  onboardStep: 1,
  onboardSubjects: [],   // temp subjects being built during wizard
  clockTimer: null,
};

function toast(msg, kind = "info") {
  const colors = { info: "rgba(77,163,255,0.18);color:#bfe0ff;border:1px solid rgba(77,163,255,0.35)",
                    success: "rgba(95,225,192,0.18);color:#bdf5e6;border:1px solid rgba(95,225,192,0.35)",
                    error: "rgba(255,107,107,0.18);color:#ffd0d0;border:1px solid rgba(255,107,107,0.35)" };
  const el = document.createElement("div");
  el.className = "toast glass-sm";
  el.style.cssText += ";background:" + colors[kind];
  el.textContent = msg;
  $toastWrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; setTimeout(() => el.remove(), 400); }, 2600);
}

let supabase = null;
const configured = SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR_SUPABASE");
if (configured) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function pad(n) { return n.toString().padStart(2, "0"); }
function timeToMinutes(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

// ---------- reliable time picker (hour / minute / AM-PM dropdowns) ----------
// Native <input type="time"> renders inconsistently across Android browsers/locales,
// so time is entered explicitly via three selects and combined into 24h "HH:MM".
function timePickerHTML(prefix, defHour24 = 9, defMinute = 0) {
  const defHour12 = defHour24 % 12 === 0 ? 12 : defHour24 % 12;
  const defAmPm = defHour24 >= 12 ? "PM" : "AM";
  const hourOpts = Array.from({ length: 12 }, (_, i) => i + 1)
    .map(h => `<option value="${h}" ${h === defHour12 ? "selected" : ""}>${h}</option>`).join("");
  const minOpts = Array.from({ length: 12 }, (_, i) => i * 5)
    .map(m => `<option value="${m}" ${m === defMinute ? "selected" : ""}>${pad(m)}</option>`).join("");
  const ampmOpts = ["AM", "PM"].map(a => `<option value="${a}" ${a === defAmPm ? "selected" : ""}>${a}</option>`).join("");
  return `
    <div class="time-picker">
      <select id="${prefix}Hour">${hourOpts}</select>
      <span class="text-3">:</span>
      <select id="${prefix}Min">${minOpts}</select>
      <select id="${prefix}AmPm">${ampmOpts}</select>
    </div>`;
}
function timePickerValue(prefix) {
  const h12 = +document.getElementById(prefix + "Hour").value;
  const min = +document.getElementById(prefix + "Min").value;
  const ampm = document.getElementById(prefix + "AmPm").value;
  let h24 = h12 % 12;
  if (ampm === "PM") h24 += 12;
  return `${pad(h24)}:${pad(min)}`;
}
function minutesToLabel(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ap}`;
}
function fmtDate(d) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

// ============================================================
// BOOTSTRAP
// ============================================================
async function boot() {
  if (!configured) { renderSetupNeeded(); return; }

  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if (!session) { renderAuth(); }
  });

  if (!state.session) { renderAuth(); return; }
  await loadEverything();
}

async function loadEverything() {
  const uid = state.session.user.id;
  const [{ data: profile }, { data: subjects }, { data: slots }, { data: attendance }, { data: tasks }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("subjects").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("schedule_slots").select("*").eq("user_id", uid),
    supabase.from("attendance").select("*").eq("user_id", uid),
    supabase.from("tasks").select("*").eq("user_id", uid).order("due_date", { ascending: true }),
  ]);

  state.profile = profile || { onboarded: false };
  state.subjects = subjects || [];
  state.slots = slots || [];
  state.attendance = attendance || [];
  state.tasks = tasks || [];

  if (!state.profile.onboarded || state.subjects.length === 0) {
    state.onboardStep = 1;
    state.onboardSubjects = [];
    renderOnboarding();
  } else {
    renderDashboard();
  }
}

boot();

function renderSetupNeeded() {
  $app.innerHTML = `
  <div class="center-stage">
    <div class="glass fade-in" style="max-width:480px; width:100%; padding:38px;">
      <div class="eyebrow">SETUP REQUIRED</div>
      <h1 style="font-size:24px; margin:10px 0 14px;">Connect your Supabase project</h1>
      <p class="text-2" style="line-height:1.6; font-size:14.5px; margin-bottom:18px;">
        Open <span class="mono" style="color:var(--signal-soft)">config.js</span> and paste your
        <b>Project URL</b> and <b>anon public key</b> from your Supabase dashboard
        (Settings → API). Then run <span class="mono" style="color:var(--signal-soft)">supabase-schema.sql</span>
        in the SQL editor to create the tables.
      </p>
      <div class="glass-sm" style="padding:16px; font-family:var(--mono); font-size:12.5px; color:var(--text-2); line-height:1.7;">
        export const SUPABASE_URL = "https://xxxx.supabase.co";<br>
        export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
      </div>
    </div>
  </div>`;
}

function renderAuth(mode = "login") {
  $app.innerHTML = `
  <div class="center-stage">
    <div class="glass fade-in" style="max-width:420px; width:100%; padding:40px 36px;">
      <div class="eyebrow">TICICTRACKER</div>
      <h1 style="font-size:28px; margin:8px 0 6px;">${mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p class="text-2" style="font-size:14px; margin-bottom:26px;">
        ${mode === "login" ? "Sign in to see today's schedule and attendance." : "Set up your dashboard in under a minute."}
      </p>

      <form id="authForm">
        ${mode === "signup" ? `
        <div class="field">
          <label>Full name</label>
          <input type="text" id="fullName" placeholder="Aditi Sharma" required>
        </div>` : ""}
        <div class="field">
          <label>Email</label>
          <input type="email" id="email" placeholder="you@college.edu" required>
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="password" placeholder="••••••••" minlength="6" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="authSubmit" style="margin-top:6px;">
          ${mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p class="text-2" style="text-align:center; margin-top:20px; font-size:13.5px;">
        ${mode === "login" ? "New here?" : "Already have an account?"}
        <a href="#" id="switchMode" style="color:var(--signal-soft); font-weight:600; text-decoration:none;">
          ${mode === "login" ? "Create an account" : "Sign in"}
        </a>
      </p>
    </div>
  </div>`;

  document.getElementById("switchMode").onclick = (e) => {
    e.preventDefault();
    renderAuth(mode === "login" ? "signup" : "login");
  };

  document.getElementById("authForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("authSubmit");
    btn.disabled = true; btn.textContent = "Please wait…";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      if (mode === "signup") {
        const fullName = document.getElementById("fullName").value.trim();
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (error) throw error;
        if (data.user) {
          await supabase.from("profiles").update({ full_name: fullName }).eq("id", data.user.id);
        }
        toast("Account created! Signing you in…", "success");
        state.session = data.session;
        if (state.session) await loadEverything();
        else renderAuth("login");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        state.session = data.session;
        await loadEverything();
      }
    } catch (err) {
      toast(err.message || "Something went wrong", "error");
      btn.disabled = false; btn.textContent = mode === "login" ? "Sign in" : "Create account";
    }
  };
}

async function logout() {
  await supabase.auth.signOut();
  state.session = null; state.profile = null;
  renderAuth();
}
function wizardShell(stepTitle, stepDesc, bodyHtml, footerHtml) {
  const steps = ["Subjects", "Time slots", "Review"];
  $app.innerHTML = `
  <div class="center-stage">
    <div class="glass fade-in" style="max-width:600px; width:100%; padding:36px 34px;">
      <div class="eyebrow" style="margin-bottom:16px; opacity:0.6;">TICICTRACKER</div>
      <div class="row gap-8" style="margin-bottom:22px;">
        ${steps.map((s, i) => {
          const n = i + 1;
          const active = n === state.onboardStep;
          const done = n < state.onboardStep;
          return `<div style="flex:1; height:4px; border-radius:4px; background:${done || active ? "var(--signal)" : "rgba(255,255,255,0.1)"}; transition:background .3s;"></div>`;
        }).join("")}
      </div>
      <div class="eyebrow">STEP ${state.onboardStep} OF 3 · ${stepTitle.toUpperCase()}</div>
      <h1 style="font-size:23px; margin:8px 0 6px;">${stepTitle}</h1>
      <p class="text-2" style="font-size:14px; margin-bottom:24px;">${stepDesc}</p>
      <div id="wizardBody">${bodyHtml}</div>
      <div class="row between" style="margin-top:26px;">${footerHtml}</div>
    </div>
  </div>`;
}

function renderOnboarding() {
  if (state.onboardStep === 1) return renderOnboardStep1();
  if (state.onboardStep === 2) return renderOnboardStep2();
  return renderOnboardStep3();
}

// ---------- STEP 1 : subjects ----------
function renderOnboardStep1() {
  const list = state.onboardSubjects.map((s, i) => `
    <div class="row between glass-sm" style="padding:12px 14px; margin-bottom:10px;">
      <div class="row gap-12">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};"></span>
        <div>
          <div style="font-weight:600; font-size:14.5px;">${s.name}</div>
          <div class="text-3" style="font-size:12px;">${s.type === "lab" ? "Lab" : "Lecture"}${s.teacher ? " · " + s.teacher : ""}</div>
        </div>
      </div>
      <button data-i="${i}" class="removeSubBtn btn btn-ghost btn-sm">Remove</button>
    </div>`).join("") || `<p class="text-3" style="font-size:13.5px; padding:6px 2px;">No subjects added yet — add your first one below.</p>`;

  const body = `
    <div style="max-height:220px; overflow-y:auto; margin-bottom:18px;">${list}</div>
    <div class="glass-sm" style="padding:18px;">
      <div class="field" style="margin-bottom:12px;">
        <label>Subject name</label>
        <input type="text" id="subName" placeholder="e.g. Calculus and Linear Algebra">
      </div>
      <div class="row gap-12" style="margin-bottom:12px;">
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Short code (optional)</label>
          <input type="text" id="subCode" placeholder="MATH-I">
        </div>
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Teacher (optional)</label>
          <input type="text" id="subTeacher" placeholder="Dr. Shubham Singh">
        </div>
      </div>
      <div class="field" style="margin-bottom:14px;">
        <label>Type</label>
        <select id="subType">
          <option value="lecture">Lecture</option>
          <option value="lab">Lab</option>
        </select>
      </div>
      <button class="btn btn-ghost btn-block" id="addSubBtn">+ Add subject</button>
    </div>`;

  const footer = `
    <span></span>
    <button class="btn btn-primary" id="nextStep1" ${state.onboardSubjects.length === 0 ? "disabled" : ""}>Continue →</button>`;

  wizardShell("Add your subjects", "List every subject you're taking this semester — labs included.", body, footer);

  document.getElementById("addSubBtn").onclick = () => {
    const name = document.getElementById("subName").value.trim();
    if (!name) { toast("Enter a subject name", "error"); return; }
    const code = document.getElementById("subCode").value.trim();
    const teacher = document.getElementById("subTeacher").value.trim();
    const type = document.getElementById("subType").value;
    const color = SUBJECT_COLORS[state.onboardSubjects.length % SUBJECT_COLORS.length];
    state.onboardSubjects.push({ tempId: crypto.randomUUID(), name, code, teacher, type, color, slots: [] });
    renderOnboardStep1();
  };

  document.querySelectorAll(".removeSubBtn").forEach(b => {
    b.onclick = () => { state.onboardSubjects.splice(+b.dataset.i, 1); renderOnboardStep1(); };
  });

  const next = document.getElementById("nextStep1");
  if (next) next.onclick = () => { state.onboardStep = 2; renderOnboarding(); };
}

// ---------- STEP 2 : weekly time slots per subject ----------
function renderOnboardStep2() {
  const tabs = state.onboardSubjects.map((s, i) => `
    <button class="subjTab btn btn-sm ${i === (state._activeSubjTab || 0) ? "btn-primary" : "btn-ghost"}" data-i="${i}">
      ${s.name.length > 16 ? s.name.slice(0, 16) + "…" : s.name}
    </button>`).join("");

  const activeIdx = state._activeSubjTab || 0;
  const subj = state.onboardSubjects[activeIdx];
  const slotList = subj.slots.map((sl, i) => `
    <div class="row between glass-sm" style="padding:10px 14px; margin-bottom:8px;">
      <div style="font-size:13.5px;"><b>${DAYS_SHORT[sl.day]}</b> · ${minutesToLabel(timeToMinutes(sl.start))} – ${minutesToLabel(timeToMinutes(sl.end))} ${sl.room ? "· " + sl.room : ""}</div>
      <button data-i="${i}" class="removeSlotBtn btn btn-ghost btn-sm">✕</button>
    </div>`).join("") || `<p class="text-3" style="font-size:13px; padding:4px 2px 12px;">No time slots yet for this subject.</p>`;

  const body = `
    <div class="row gap-8" style="flex-wrap:wrap; margin-bottom:18px;">${tabs}</div>
    <div style="margin-bottom:16px;">${slotList}</div>
    <div class="glass-sm" style="padding:18px;">
      <div class="row gap-12" style="margin-bottom:12px;">
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Day</label>
          <select id="slotDay">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select>
        </div>
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Room (optional)</label>
          <input type="text" id="slotRoom" placeholder="B4">
        </div>
      </div>
      <div class="row gap-12" style="margin-bottom:14px;">
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>Start time</label>
          ${timePickerHTML("slotStart", 9, 0)}
        </div>
        <div class="field" style="flex:1; margin-bottom:0;">
          <label>End time</label>
          ${timePickerHTML("slotEnd", 9, 50)}
        </div>
      </div>
      <button class="btn btn-ghost btn-block" id="addSlotBtn">+ Add this time slot</button>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" id="backStep2">← Back</button>
    <button class="btn btn-primary" id="nextStep2">Continue →</button>`;

  wizardShell("Set the weekly schedule", "Add every recurring class time for each subject — mornings, labs, everything.", body, footer);

  document.querySelectorAll(".subjTab").forEach(b => {
    b.onclick = () => { state._activeSubjTab = +b.dataset.i; renderOnboardStep2(); };
  });

  document.getElementById("addSlotBtn").onclick = () => {
    const day = +document.getElementById("slotDay").value;
    const start = timePickerValue("slotStart");
    const end = timePickerValue("slotEnd");
    const room = document.getElementById("slotRoom").value.trim();
    if (timeToMinutes(end) <= timeToMinutes(start)) { toast("End time must be after start time", "error"); return; }
    subj.slots.push({ day, start, end, room });
    renderOnboardStep2();
  };

  document.querySelectorAll(".removeSlotBtn").forEach(b => {
    b.onclick = () => { subj.slots.splice(+b.dataset.i, 1); renderOnboardStep2(); };
  });

  document.getElementById("backStep2").onclick = () => { state.onboardStep = 1; renderOnboarding(); };
  document.getElementById("nextStep2").onclick = () => { state.onboardStep = 3; renderOnboarding(); };
}

// ---------- STEP 3 : review & save ----------
function renderOnboardStep3() {
  const byDay = DAYS.map((d, di) => {
    const items = [];
    state.onboardSubjects.forEach(s => s.slots.filter(sl => sl.day === di).forEach(sl => items.push({ ...sl, name: s.name, color: s.color })));
    items.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    return { day: d, items };
  });

  const body = `
    <div style="max-height:360px; overflow-y:auto;">
    ${byDay.map(({ day, items }) => `
      <div style="margin-bottom:16px;">
        <div class="eyebrow" style="margin-bottom:8px;">${day.toUpperCase()}</div>
        ${items.length ? items.map(it => `
          <div class="row gap-12 glass-sm" style="padding:10px 14px; margin-bottom:6px;">
            <span style="width:9px;height:9px;border-radius:50%;background:${it.color};"></span>
            <div style="font-size:13.5px;">${it.name} <span class="text-3">· ${minutesToLabel(timeToMinutes(it.start))}–${minutesToLabel(timeToMinutes(it.end))}</span></div>
          </div>`).join("") : `<p class="text-3" style="font-size:13px;">No classes — free day.</p>`}
      </div>`).join("")}
    </div>`;

  const footer = `
    <button class="btn btn-ghost" id="backStep3">← Back</button>
    <button class="btn btn-primary" id="saveOnboard">Save & enter dashboard</button>`;

  wizardShell("Review your timetable", "Here's how your week looks. You can always edit this later in Settings.", body, footer);

  document.getElementById("backStep3").onclick = () => { state.onboardStep = 2; renderOnboarding(); };
  document.getElementById("saveOnboard").onclick = saveOnboardingToSupabase;
}

async function saveOnboardingToSupabase() {
  const btn = document.getElementById("saveOnboard");
  btn.disabled = true; btn.textContent = "Saving…";
  const uid = state.session.user.id;

  try {
    for (const s of state.onboardSubjects) {
      const { data: inserted, error } = await supabase.from("subjects").insert({
        user_id: uid, name: s.name, code: s.code || null, teacher: s.teacher || null, type: s.type, color: s.color,
      }).select().single();
      if (error) throw error;

      if (s.slots.length) {
        const rows = s.slots.map(sl => ({
          user_id: uid, subject_id: inserted.id, day_of_week: sl.day, start_time: sl.start, end_time: sl.end, room: sl.room || null,
        }));
        const { error: slotErr } = await supabase.from("schedule_slots").insert(rows);
        if (slotErr) throw slotErr;
      }
    }
    await supabase.from("profiles").update({ onboarded: true }).eq("id", uid);
    toast("Timetable saved!", "success");
    await loadEverything();
  } catch (err) {
    toast(err.message || "Could not save", "error");
    btn.disabled = false; btn.textContent = "Save & enter dashboard";
  }
}
// ============================================================
// DASHBOARD
// ============================================================

function subjectById(id) { return state.subjects.find(s => s.id === id); }

function weeklyMap() {
  const map = Array.from({ length: 7 }, () => []);
  state.slots.forEach(sl => {
    const subj = subjectById(sl.subject_id);
    if (!subj) return;
    map[sl.day_of_week].push({ ...sl, subject: subj });
  });
  map.forEach(day => day.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)));
  return map;
}

function attendanceStats() {
  const perSubject = {};
  state.subjects.forEach(s => { perSubject[s.id] = { present: 0, total: 0, name: s.name, color: s.color }; });
  state.attendance.forEach(a => {
    if (!perSubject[a.subject_id]) return;
    perSubject[a.subject_id].total++;
    if (a.status === "present") perSubject[a.subject_id].present++;
  });
  let totalPresent = 0, totalAll = 0;
  Object.values(perSubject).forEach(s => { totalPresent += s.present; totalAll += s.total; });
  const overallPct = totalAll ? Math.round((totalPresent / totalAll) * 100) : 100;
  return { perSubject, overallPct, totalPresent, totalAll };
}

function pctColor(pct) {
  if (pct >= ATT_SAFE) return "var(--foam)";
  if (pct >= ATT_WARN) return "var(--amber)";
  return "var(--coral)";
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function renderDashboard() {
  const name = state.profile?.full_name?.split(" ")[0] || "there";
  const today = new Date();
  const wmap = weeklyMap();

  $app.innerHTML = `
    <div style="max-width:920px; margin:0 auto; padding:26px 20px 90px;">
      <header class="row between fade-in" style="margin-bottom:26px;">
        <div>
          <div class="eyebrow">TICICTRACKER</div>
          <h1 style="font-size:25px; margin-top:6px;">${greeting()}, ${name} 👋</h1>
          <p class="text-2" style="font-size:13.5px; margin-top:2px;">${fmtDate(today)}</p>
        </div>
        <div class="row gap-8">
          <button class="btn btn-ghost btn-sm" id="settingsBtn">⚙ Settings</button>
          <button class="btn btn-ghost btn-sm" id="logoutBtn">Log out</button>
        </div>
      </header>

      <div id="heroCard"></div>
      <div id="todayStrip" style="margin-top:22px;"></div>

      <div class="row gap-16" style="margin-top:26px; align-items:flex-start; flex-wrap:wrap;">
        <div id="attendanceBlock" style="flex:1.1; min-width:300px;"></div>
        <div id="tasksBlock" style="flex:1; min-width:300px;"></div>
      </div>
    </div>
    <div id="modalRoot"></div>
  `;

  document.getElementById("logoutBtn").onclick = logout;
  document.getElementById("settingsBtn").onclick = renderSettings;

  renderHeroAndStrip(wmap);
  renderAttendanceBlock();
  renderTasksBlock();

  if (state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer = setInterval(() => renderHeroAndStrip(weeklyMap()), 30000);
}

function renderHeroAndStrip(wmap) {
  const now = new Date();
  const dayIdx = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const todayClasses = wmap[dayIdx];

  const current = todayClasses.find(c => nowMins >= timeToMinutes(c.start_time) && nowMins < timeToMinutes(c.end_time));
  const upcoming = todayClasses.filter(c => timeToMinutes(c.start_time) > nowMins);
  const next = upcoming[0];

  let heroHtml;
  if (todayClasses.length === 0) {
    heroHtml = `
      <div class="glass fade-in" style="padding:30px; text-align:center;">
        <div style="font-size:38px; margin-bottom:6px;">🌊</div>
        <h2 style="font-size:20px;">No classes today</h2>
        <p class="text-2" style="font-size:13.5px; margin-top:4px;">Enjoy your day off — nothing on the timetable.</p>
      </div>`;
  } else if (current) {
    const endMins = timeToMinutes(current.end_time);
    const remaining = endMins - nowMins;
    heroHtml = `
      <div class="glass fade-in" style="padding:28px 30px; position:relative; overflow:hidden;">
        <div class="eyebrow" style="color:var(--foam);">● HAPPENING NOW</div>
        <div class="row between" style="margin-top:10px; align-items:flex-end; flex-wrap:wrap; gap:14px;">
          <div>
            <h2 style="font-size:24px;">${current.subject.name}</h2>
            <p class="text-2" style="font-size:13.5px; margin-top:4px;">
              ${minutesToLabel(timeToMinutes(current.start_time))} – ${minutesToLabel(endMins)}
              ${current.room ? " · Room " + current.room : ""} · ${current.subject.type === "lab" ? "Lab" : "Lecture"}
            </p>
          </div>
          <div class="mono" style="font-size:26px; color:var(--foam);">${remaining} min left</div>
        </div>
      </div>`;
  } else if (next) {
    const startMins = timeToMinutes(next.start_time);
    const untilMins = startMins - nowMins;
    const hrs = Math.floor(untilMins / 60), mins = untilMins % 60;
    heroHtml = `
      <div class="glass fade-in" style="padding:28px 30px;">
        <div class="eyebrow">UP NEXT</div>
        <div class="row between" style="margin-top:10px; align-items:flex-end; flex-wrap:wrap; gap:14px;">
          <div>
            <h2 style="font-size:24px;">${next.subject.name}</h2>
            <p class="text-2" style="font-size:13.5px; margin-top:4px;">
              ${minutesToLabel(startMins)} – ${minutesToLabel(timeToMinutes(next.end_time))}
              ${next.room ? " · Room " + next.room : ""} · ${next.subject.type === "lab" ? "Lab" : "Lecture"}
            </p>
          </div>
          <div class="mono" style="font-size:22px; color:var(--signal-soft);">in ${hrs > 0 ? hrs + "h " : ""}${mins}m</div>
        </div>
      </div>`;
  } else {
    heroHtml = `
      <div class="glass fade-in" style="padding:28px 30px; text-align:center;">
        <div style="font-size:32px; margin-bottom:4px;">✅</div>
        <h2 style="font-size:19px;">Done for today</h2>
        <p class="text-2" style="font-size:13.5px; margin-top:4px;">All your classes for today are over.</p>
      </div>`;
  }
  document.getElementById("heroCard").innerHTML = heroHtml;

  const todayDateISO = isoDate(now);
  const stripHtml = `
    <div class="eyebrow" style="margin-bottom:10px;">TODAY'S SCHEDULE</div>
    <div class="row gap-12" style="overflow-x:auto; padding-bottom:6px;">
      ${todayClasses.length === 0 ? `<p class="text-3" style="font-size:13px;">Nothing scheduled.</p>` :
        todayClasses.map(c => {
          const marked = state.attendance.find(a => a.subject_id === c.subject.id && a.class_date === todayDateISO && a.start_time.slice(0,5) === c.start_time);
          const isPast = timeToMinutes(c.end_time) <= nowMins;
          const isCurrent = nowMins >= timeToMinutes(c.start_time) && nowMins < timeToMinutes(c.end_time);
          return `
          <div class="glass-sm fade-in" style="min-width:168px; padding:14px 16px; border-left:3px solid ${c.subject.color}; ${isCurrent ? "box-shadow:0 0 0 1px var(--signal);" : ""}">
            <div class="mono text-3" style="font-size:11px;">${minutesToLabel(timeToMinutes(c.start_time))}</div>
            <div style="font-weight:600; font-size:13.5px; margin:4px 0 8px;">${c.subject.name.length > 22 ? c.subject.name.slice(0,22)+"…" : c.subject.name}</div>
            ${isPast ? `
              <div class="row gap-8">
                <button class="btn btn-sm ${marked?.status === 'present' ? 'btn-primary' : 'btn-ghost'} markBtn" data-subj="${c.subject.id}" data-start="${c.start_time}" data-status="present" style="flex:1;">✓</button>
                <button class="btn btn-sm ${marked?.status === 'absent' ? 'btn-danger' : 'btn-ghost'} markBtn" data-subj="${c.subject.id}" data-start="${c.start_time}" data-status="absent" style="flex:1;">✕</button>
              </div>` : `<div class="text-3" style="font-size:11.5px;">${isCurrent ? "in progress" : "upcoming"}</div>`}
          </div>`;
        }).join("")}
    </div>`;
  document.getElementById("todayStrip").innerHTML = stripHtml;

  document.querySelectorAll(".markBtn").forEach(b => {
    b.onclick = () => markAttendance(b.dataset.subj, b.dataset.start, b.dataset.status, todayDateISO);
  });
}

async function markAttendance(subjectId, startTime, status, dateISO) {
  const uid = state.session.user.id;
  try {
    const { data, error } = await supabase.from("attendance")
      .upsert({ user_id: uid, subject_id: subjectId, class_date: dateISO, start_time: startTime, status },
               { onConflict: "user_id,subject_id,class_date,start_time" })
      .select().single();
    if (error) throw error;
    const idx = state.attendance.findIndex(a => a.subject_id === subjectId && a.class_date === dateISO && a.start_time.slice(0,5) === startTime);
    if (idx >= 0) state.attendance[idx] = data; else state.attendance.push(data);
    toast(status === "present" ? "Marked present" : "Marked absent", status === "present" ? "success" : "info");
    renderHeroAndStrip(weeklyMap());
    renderAttendanceBlock();
  } catch (err) {
    toast(err.message || "Could not save attendance", "error");
  }
}
function renderAttendanceBlock() {
  const { perSubject, overallPct } = attendanceStats();
  const color = pctColor(overallPct);

  const rows = Object.values(perSubject).map(s => {
    const pct = s.total ? Math.round((s.present / s.total) * 100) : 100;
    const c = pctColor(pct);
    return `
      <div style="margin-bottom:14px;">
        <div class="row between" style="margin-bottom:6px;">
          <div class="row gap-8">
            <span style="width:8px;height:8px;border-radius:50%;background:${s.color};"></span>
            <span style="font-size:13.5px; font-weight:600;">${s.name}</span>
          </div>
          <span class="mono" style="font-size:13px; color:${c};">${pct}%</span>
        </div>
        <div class="liquid-bar">
          <div class="liquid-bar-fill" style="width:${pct}%; background:${c};"></div>
        </div>
        <div class="text-3" style="font-size:11px; margin-top:3px;">${s.present}/${s.total} classes attended</div>
      </div>`;
  }).join("") || `<p class="text-3" style="font-size:13px;">No subjects yet.</p>`;

  document.getElementById("attendanceBlock").innerHTML = `
    <div class="glass fade-in" style="padding:26px 28px;">
      <div class="eyebrow" style="margin-bottom:18px;">ATTENDANCE</div>
      <div class="row gap-20" style="align-items:center; margin-bottom:24px; flex-wrap:wrap;">
        <div class="ring" style="--fill:${overallPct}%;">
          <div class="water" style="height:${overallPct}%; background:${color};">
            <div class="wave" style="background:${color};"></div>
            <div class="wave wave2" style="background:${color};"></div>
          </div>
          <div class="ring-label">
            <div class="mono" style="font-size:26px; font-weight:600;">${overallPct}%</div>
            <div class="text-3" style="font-size:10.5px; letter-spacing:0.06em;">OVERALL</div>
          </div>
        </div>
        <div style="flex:1; min-width:160px;">
          <p class="text-2" style="font-size:13px; line-height:1.6;">
            ${overallPct >= ATT_SAFE ? "You're comfortably above the 75% requirement. 🎉" :
              overallPct >= ATT_WARN ? "Cutting it close — a few more present marks will help." :
              "Below the safe zone. Try not to miss upcoming classes."}
          </p>
        </div>
      </div>
      <div class="eyebrow" style="margin-bottom:12px;">PER SUBJECT</div>
      ${rows}
    </div>`;
}
const TASK_META = {
  assignment: { label: "Assignment", color: "var(--signal-soft)", icon: "📝" },
  exam: { label: "Exam", color: "var(--coral)", icon: "🧪" },
  note: { label: "Reminder", color: "var(--amber)", icon: "🔖" },
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d - today) / 86400000);
}

function renderTasksBlock() {
  const sorted = [...state.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.due_date || "9999").localeCompare(b.due_date || "9999");
  });

  const items = sorted.map(t => {
    const meta = TASK_META[t.type] || TASK_META.note;
    const du = daysUntil(t.due_date);
    let dueLabel = "";
    if (du !== null) {
      dueLabel = du === 0 ? "Today" : du === 1 ? "Tomorrow" : du > 1 ? `In ${du} days` : `${Math.abs(du)}d overdue`;
    }
    return `
      <div class="row between glass-sm" style="padding:13px 15px; margin-bottom:9px; opacity:${t.done ? 0.5 : 1};">
        <div class="row gap-12">
          <span style="font-size:17px;">${meta.icon}</span>
          <div>
            <div style="font-weight:600; font-size:13.5px; text-decoration:${t.done ? "line-through" : "none"};">${t.title}</div>
            <div class="text-3" style="font-size:11.5px; margin-top:2px;">
              <span style="color:${meta.color};">${meta.label}</span>${dueLabel ? " · " + dueLabel : ""}
            </div>
          </div>
        </div>
        <div class="row gap-8">
          <button class="btn btn-ghost btn-sm toggleTaskBtn" data-id="${t.id}">${t.done ? "Undo" : "✓"}</button>
          <button class="btn btn-ghost btn-sm delTaskBtn" data-id="${t.id}">✕</button>
        </div>
      </div>`;
  }).join("") || `<p class="text-3" style="font-size:13px;">Nothing on your list. Add an assignment, exam, or reminder.</p>`;

  document.getElementById("tasksBlock").innerHTML = `
    <div class="glass fade-in" style="padding:26px 28px;">
      <div class="row between" style="margin-bottom:16px;">
        <div class="eyebrow">ASSIGNMENTS · EXAMS · NOTES</div>
        <button class="btn btn-primary btn-sm" id="addTaskBtn">+ Add</button>
      </div>
      ${items}
    </div>`;

  document.getElementById("addTaskBtn").onclick = openTaskModal;
  document.querySelectorAll(".toggleTaskBtn").forEach(b => b.onclick = () => toggleTask(b.dataset.id));
  document.querySelectorAll(".delTaskBtn").forEach(b => b.onclick = () => deleteTask(b.dataset.id));
}

function openTaskModal() {
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="glass fade-in" style="max-width:420px; width:100%; padding:28px;">
        <h2 style="font-size:19px; margin-bottom:18px;">Add to your list</h2>
        <div class="field">
          <label>Title</label>
          <input type="text" id="taskTitle" placeholder="DBMS Assignment 3">
        </div>
        <div class="row gap-12">
          <div class="field" style="flex:1;">
            <label>Type</label>
            <select id="taskType">
              <option value="assignment">Assignment</option>
              <option value="exam">Exam</option>
              <option value="note">Reminder / Note</option>
            </select>
          </div>
          <div class="field" style="flex:1;">
            <label>Due date</label>
            <input type="date" id="taskDate">
          </div>
        </div>
        <div class="field">
          <label>Details (optional)</label>
          <textarea id="taskDesc" rows="2" placeholder="Any extra notes…"></textarea>
        </div>
        <div class="row gap-12" style="margin-top:6px;">
          <button class="btn btn-ghost btn-block" id="cancelTask">Cancel</button>
          <button class="btn btn-primary btn-block" id="saveTask">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cancelTask").onclick = closeModal;
  document.getElementById("modalOverlay").onclick = (e) => { if (e.target.id === "modalOverlay") closeModal(); };
  document.getElementById("saveTask").onclick = saveTask;
}

function closeModal() { document.getElementById("modalRoot").innerHTML = ""; }

async function saveTask() {
  const title = document.getElementById("taskTitle").value.trim();
  if (!title) { toast("Enter a title", "error"); return; }
  const type = document.getElementById("taskType").value;
  const due_date = document.getElementById("taskDate").value || null;
  const description = document.getElementById("taskDesc").value.trim() || null;
  const uid = state.session.user.id;
  try {
    const { data, error } = await supabase.from("tasks").insert({ user_id: uid, title, type, due_date, description }).select().single();
    if (error) throw error;
    state.tasks.push(data);
    closeModal();
    renderTasksBlock();
    toast("Added", "success");
  } catch (err) { toast(err.message || "Could not save", "error"); }
}

async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  const { error } = await supabase.from("tasks").update({ done: !t.done }).eq("id", id);
  if (error) { toast(error.message, "error"); return; }
  t.done = !t.done;
  renderTasksBlock();
}

async function deleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) { toast(error.message, "error"); return; }
  state.tasks = state.tasks.filter(x => x.id !== id);
  renderTasksBlock();
}
function renderSettings() {
  const wmap = weeklyMap();

  const subjectRows = state.subjects.map(s => `
    <div class="row between glass-sm" style="padding:12px 14px; margin-bottom:8px;">
      <div class="row gap-12">
        <span style="width:9px;height:9px;border-radius:50%;background:${s.color};"></span>
        <div>
          <div style="font-weight:600; font-size:13.5px;">${s.name}</div>
          <div class="text-3" style="font-size:11.5px;">${s.type === "lab" ? "Lab" : "Lecture"}${s.teacher ? " · " + s.teacher : ""}</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm delSubjBtn" data-id="${s.id}">Delete</button>
    </div>`).join("") || `<p class="text-3" style="font-size:13px;">No subjects yet.</p>`;

  const scheduleRows = DAYS.map((d, di) => {
    const items = wmap[di];
    if (!items.length) return "";
    return `
      <div style="margin-bottom:12px;">
        <div class="eyebrow" style="margin-bottom:6px;">${d.toUpperCase()}</div>
        ${items.map(it => `
          <div class="row between glass-sm" style="padding:10px 14px; margin-bottom:6px;">
            <div style="font-size:13px;">${it.subject.name} <span class="text-3">· ${minutesToLabel(timeToMinutes(it.start_time))}–${minutesToLabel(timeToMinutes(it.end_time))}${it.room ? " · " + it.room : ""}</span></div>
            <button class="btn btn-ghost btn-sm delSlotBtn" data-id="${it.id}">✕</button>
          </div>`).join("")}
      </div>`;
  }).join("");

  $app.innerHTML = `
    <div style="max-width:640px; margin:0 auto; padding:26px 20px 90px;">
      <div class="row between fade-in" style="margin-bottom:22px;">
        <div>
          <div class="eyebrow">TICICTRACKER · SETTINGS</div>
          <h1 style="font-size:22px; margin-top:6px;">Manage your timetable</h1>
        </div>
        <button class="btn btn-ghost btn-sm" id="backToDash">← Back</button>
      </div>

      <div class="glass" style="padding:24px; margin-bottom:20px;">
        <div class="row between" style="margin-bottom:14px;">
          <div class="eyebrow">SUBJECTS</div>
          <button class="btn btn-primary btn-sm" id="addSubjSettings">+ Add subject</button>
        </div>
        ${subjectRows}
      </div>

      <div class="glass" style="padding:24px; margin-bottom:20px;">
        <div class="row between" style="margin-bottom:14px;">
          <div class="eyebrow">WEEKLY SCHEDULE</div>
          <button class="btn btn-primary btn-sm" id="addSlotSettings">+ Add time slot</button>
        </div>
        ${scheduleRows || `<p class="text-3" style="font-size:13px;">No time slots yet.</p>`}
      </div>
    </div>
    <div id="modalRoot"></div>`;

  document.getElementById("backToDash").onclick = renderDashboard;
  document.querySelectorAll(".delSubjBtn").forEach(b => b.onclick = () => deleteSubject(b.dataset.id));
  document.querySelectorAll(".delSlotBtn").forEach(b => b.onclick = () => deleteSlot(b.dataset.id));
  document.getElementById("addSubjSettings").onclick = openAddSubjectModal;
  document.getElementById("addSlotSettings").onclick = openAddSlotModal;
}

async function deleteSubject(id) {
  if (!confirm("Delete this subject? Its schedule and attendance history will be removed too.")) return;
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) { toast(error.message, "error"); return; }
  state.subjects = state.subjects.filter(s => s.id !== id);
  state.slots = state.slots.filter(s => s.subject_id !== id);
  state.attendance = state.attendance.filter(a => a.subject_id !== id);
  renderSettings();
}

async function deleteSlot(id) {
  const { error } = await supabase.from("schedule_slots").delete().eq("id", id);
  if (error) { toast(error.message, "error"); return; }
  state.slots = state.slots.filter(s => s.id !== id);
  renderSettings();
}

function openAddSubjectModal() {
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="glass fade-in" style="max-width:420px; width:100%; padding:28px;">
        <h2 style="font-size:19px; margin-bottom:18px;">Add a subject</h2>
        <div class="field"><label>Name</label><input type="text" id="mSubName" placeholder="Fundamentals of Electrical Engineering"></div>
        <div class="row gap-12">
          <div class="field" style="flex:1;"><label>Code (optional)</label><input type="text" id="mSubCode" placeholder="EE"></div>
          <div class="field" style="flex:1;"><label>Teacher (optional)</label><input type="text" id="mSubTeacher" placeholder=""></div>
        </div>
        <div class="field"><label>Type</label><select id="mSubType"><option value="lecture">Lecture</option><option value="lab">Lab</option></select></div>
        <div class="row gap-12" style="margin-top:6px;">
          <button class="btn btn-ghost btn-block" id="cancelM">Cancel</button>
          <button class="btn btn-primary btn-block" id="saveMSub">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cancelM").onclick = closeModal;
  document.getElementById("modalOverlay").onclick = (e) => { if (e.target.id === "modalOverlay") closeModal(); };
  document.getElementById("saveMSub").onclick = async () => {
    const name = document.getElementById("mSubName").value.trim();
    if (!name) { toast("Enter a name", "error"); return; }
    const code = document.getElementById("mSubCode").value.trim() || null;
    const teacher = document.getElementById("mSubTeacher").value.trim() || null;
    const type = document.getElementById("mSubType").value;
    const color = SUBJECT_COLORS[state.subjects.length % SUBJECT_COLORS.length];
    const uid = state.session.user.id;
    const { data, error } = await supabase.from("subjects").insert({ user_id: uid, name, code, teacher, type, color }).select().single();
    if (error) { toast(error.message, "error"); return; }
    state.subjects.push(data);
    closeModal();
    renderSettings();
    toast("Subject added", "success");
  };
}

function openAddSlotModal() {
  if (!state.subjects.length) { toast("Add a subject first", "error"); return; }
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="glass fade-in" style="max-width:420px; width:100%; padding:28px;">
        <h2 style="font-size:19px; margin-bottom:18px;">Add a time slot</h2>
        <div class="field"><label>Subject</label>
          <select id="mSlotSubj">${state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
        </div>
        <div class="row gap-12">
          <div class="field" style="flex:1;"><label>Day</label><select id="mSlotDay">${DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join("")}</select></div>
          <div class="field" style="flex:1;"><label>Room (optional)</label><input type="text" id="mSlotRoom"></div>
        </div>
        <div class="row gap-12">
          <div class="field" style="flex:1;"><label>Start</label>${timePickerHTML("mSlotStart", 9, 0)}</div>
          <div class="field" style="flex:1;"><label>End</label>${timePickerHTML("mSlotEnd", 9, 50)}</div>
        </div>
        <div class="row gap-12" style="margin-top:6px;">
          <button class="btn btn-ghost btn-block" id="cancelM2">Cancel</button>
          <button class="btn btn-primary btn-block" id="saveMSlot">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cancelM2").onclick = closeModal;
  document.getElementById("modalOverlay").onclick = (e) => { if (e.target.id === "modalOverlay") closeModal(); };
  document.getElementById("saveMSlot").onclick = async () => {
    const subject_id = document.getElementById("mSlotSubj").value;
    const day_of_week = +document.getElementById("mSlotDay").value;
    const room = document.getElementById("mSlotRoom").value.trim() || null;
    const start_time = timePickerValue("mSlotStart");
    const end_time = timePickerValue("mSlotEnd");
    if (timeToMinutes(end_time) <= timeToMinutes(start_time)) { toast("End time must be after start", "error"); return; }
    const uid = state.session.user.id;
    const { data, error } = await supabase.from("schedule_slots").insert({ user_id: uid, subject_id, day_of_week, start_time, end_time, room }).select().single();
    if (error) { toast(error.message, "error"); return; }
    state.slots.push(data);
    closeModal();
    renderSettings();
    toast("Time slot added", "success");
  };
}
