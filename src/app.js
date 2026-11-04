/* =====================================================================
   VOLUNTR app shell and screens (Sprint 4 working system)
   Builds on Prototype D "Together": same layout, tokens and wording.
   ===================================================================== */
(function () {
"use strict";
const C = window.VCore;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DB_KEY = "voluntr.db.v1", SES_KEY = "voluntr.session.v1";

/* ---------- Storage (browser only; wrapped so private windows still work) ---------- */
const mem = {};
const store = {
  get(k, sess) { try { return (sess ? sessionStorage : localStorage).getItem(k); } catch { return mem[k] ?? null; } },
  set(k, v, sess) { try { (sess ? sessionStorage : localStorage).setItem(k, v); } catch { mem[k] = v; } },
  del(k, sess) { try { (sess ? sessionStorage : localStorage).removeItem(k); } catch { delete mem[k]; } }
};
let db = null;
function save() { store.set(DB_KEY, JSON.stringify(db)); }
function saveSession() { S.session ? store.set(SES_KEY, JSON.stringify(S.session), true) : store.del(SES_KEY, true); }

/* ---------- Icons (from Prototype D) ---------- */
const I = {
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5 6.5-5s5.7 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.3 4.5 4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V5l8-2v18M12 8h8v13M8 8h0M8 12h0M8 16h0M16 12h0M16 16h0"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v0"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>'
};
const TABS = {
  volunteer: [["home", "Home", I.home], ["discover", "Discover", I.compass], ["saved", "Saved", I.bookmark], ["connections", "Connections", I.link], ["profile", "Profile", I.user]],
  member: [["home", "Home", I.home], ["postings", "Postings", I.list], ["review", "Review", I.people], ["post", "Post", I.plus], ["organization", "Organization", I.building]],
  admin: [["home", "Home", I.home], ["approvals", "Approvals", I.check], ["attention", "Attention", I.flag], ["reports", "Reports", I.chart], ["matching", "Matching", I.sliders], ["people", "People", I.people]]
};

/* ---------- UI state ---------- */
const S = { session: null, pub: "landing", tab: "home", device: null, wizard: null, form: null, reg: null, errors: {}, openConn: null, reviewFor: null, deckIdx: 0, mfaPending: null, notice: "", draftWeights: null, skillQuery: "" };

const me = () => !S.session ? null : S.session.type === "volunteer" ? db.volunteers.find(v => v.id === S.session.id) : S.session.type === "member" ? db.members.find(m => m.id === S.session.id) : db.administrators.find(a => a.id === S.session.id);
const myOrg = () => S.session && S.session.type === "member" ? db.organizations.find(o => o.id === me().orgId) : null;
const myNotifs = () => S.session ? db.notifications.filter(n => n.toType === S.session.type && n.toId === S.session.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt)) : [];

function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3200); }
function sheet(html) { $("#sheet").innerHTML = html ? `<div class="sheet-wrap" data-act="closeSheet"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">${html}</div></div>` : ""; if (html) setTimeout(() => { const f = $("#sheet .sheet [autofocus], #sheet .sheet input, #sheet .sheet button"); f && f.focus(); }, 0); }
function device() { return S.device || (innerWidth >= 900 ? "desktop" : "phone"); }
const tabCount = (n, cls = "badge") => n ? `<span class="${cls}">${n}</span>` : "";
const initials = name => esc(String(name).split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 3).map(w => w[0]).join("") || "?");

/* ---------- Form helpers ---------- */
function field(id, label, input, opts = {}) {
  const e = S.errors[opts.key || id];
  return `<div class="field" ${opts.style ? `style="${opts.style}"` : ""}><label for="${id}">${label}</label>${input.replace("<input", `<input aria-invalid="${!!e}" ${e || opts.hint ? `aria-describedby="${id}-d"` : ""}`).replace("<select", `<select aria-invalid="${!!e}"`).replace("<textarea", `<textarea aria-invalid="${!!e}" ${e || opts.hint ? `aria-describedby="${id}-d"` : ""}`)}${e ? `<span class="ferr" id="${id}-d">${esc(e)}</span>` : opts.hint ? `<span class="hint" id="${id}-d">${opts.hint}</span>` : ""}</div>`;
}
const fe = k => S.errors[k] ? `<span class="ferr">${esc(S.errors[k])}</span>` : "";
function errSummary() {
  const list = Object.values(S.errors);
  return list.length ? `<div class="errsum" role="alert" tabindex="-1" id="errsum"><b>Please fix ${list.length === 1 ? "this" : `these ${list.length} things`}:</b><ul>${list.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "";
}
const pick = (scope, key, opts, selected) => `<div class="pick" role="group">${opts.map(o => `<button type="button" data-act="pick" data-scope="${scope}" data-key="${key}" data-val="${esc(o)}" aria-pressed="${selected.includes(o)}">${esc(o)}</button>`).join("")}</div>`;
const one = (scope, key, opts, val) => `<div class="pick" role="radiogroup">${opts.map(o => `<button type="button" role="radio" data-act="one" data-scope="${scope}" data-key="${key}" data-val="${esc(o)}" aria-checked="${val === o}" aria-pressed="${val === o}">${esc(o)}</button>`).join("")}</div>`;
function slotGrid(scope, slots) {
  return `<div class="grid-week" role="group" aria-label="Days and times"><span></span>${C.TIMES.map(t => `<span>${t}</span>`).join("")}${C.DAYS.map(d => `<span>${d}</span>` + C.TIMES.map(t => { const v = `${d}|${t}`, on = slots.includes(v); return `<button type="button" data-act="slot" data-scope="${scope}" data-val="${v}" aria-pressed="${on}" aria-label="${d} ${t}">${on ? "✓" : ""}</button>`; }).join("")).join("")}</div>`;
}
const scopeObj = s => s === "wizard" ? S.wizard : s === "form" ? S.form : s === "reg" ? S.reg : null;
const zipOptions = sel => `<option value="">Choose ZIP</option>` + Object.entries(C.ZIPS).map(([z, v]) => `<option value="${z}" ${z === sel ? "selected" : ""}>${z} · ${v.city}</option>`).join("");
const today = () => C.today(db);

/* ---------- Render ---------- */
function render() {
  if (S.session && Date.now() - S.session.lastActive > C.SESSION_IDLE_MIN * 60000) { signOut("You were signed out after 30 minutes without activity."); return; }
  const dv = device(), app = $("#app");
  app.dataset.device = dv;
  const pub = !S.session || (S.session.type === "admin" && !S.session.mfa) || (S.session.type === "member" && !S.session.mfa);
  app.dataset.join = pub ? "1" : "0";
  document.querySelectorAll("button[data-device]").forEach(b => b.setAttribute("aria-pressed", b.dataset.device === dv));
  const scr = $("#screen");
  let html, key;
  if (pub) {
    $("#tabs").hidden = true;
    $("#who").innerHTML = S.session ? `<button class="linkish" data-act="signOut">Cancel sign-in</button>` : S.pub === "signin" ? "" : `<button class="linkish" style="color:inherit" data-act="goSignin">Sign in</button>`;
    key = "pub-" + S.pub + (S.wizard ? S.wizard.step : "") + (S.mfaPending ? "mfa" : "");
    html = S.mfaPending ? vMfa() : S.wizard ? vWizard() : S.pub === "signin" ? vSignin() : S.pub === "orgreg" ? vOrgReg() : vLanding();
  } else {
    const u = me(), t = S.session.type;
    const unread = myNotifs().filter(n => !n.readAt).length;
    const label = t === "volunteer" ? `${esc(u.firstName)} · Volunteer` : t === "member" ? `${esc(u.firstName)} · ${esc(myOrg().name)}` : `${esc(u.firstName)} · PCC admin`;
    $("#who").innerHTML = `<div class="who-wrap"><button class="bell" data-tab="inbox" aria-label="Notifications${unread ? `, ${unread} unread` : ""}">${I.bell}${tabCount(unread)}</button><span class="wholabel">${label}</span><button class="linkish" data-act="signOut">Sign out</button></div>`;
    $("#tabs").hidden = false;
    $("#tabs").innerHTML = TABS[t].map(([id, lab, icon]) => `<button data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ""}>${icon}<span>${lab}</span>${tabCount(badgeFor(id))}</button>`).join("") + (dv === "desktop" ? `<span class="rail-note">Need help? Call PCC at ${C.HELPLINE}</span>` : "");
    key = t + S.tab + (S.wizard ? "w" + S.wizard.step : "") + (S.openConn || "") + (S.form ? "f" : "") + (S.reviewFor || "");
    try { html = S.wizard ? vWizard() : S.openConn ? vConversation() : (VIEWS[t][S.tab] || VIEWS[t].home)(); }
    catch (e) { console.error(e); html = `<div class="errsum">Something went wrong showing this screen. <button class="linkish" data-tab="home">Go home</button></div>`; }
  }
  const changed = scr.dataset.view !== key;
  scr.dataset.view = key;
  scr.innerHTML = (S.notice ? `<div class="banner warn" role="status">${I.info}<span>${esc(S.notice)}</span></div>` : "") + html;
  if (changed) { scr.scrollTop = 0; const h = scr.querySelector("h2"); if (h && document.activeElement && document.activeElement !== document.body && !scr.contains(document.activeElement)) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
  if (Object.keys(S.errors).length) { const es = $("#errsum"); es && es.focus(); }
}
function badgeFor(id) {
  const t = S.session.type;
  if (t === "volunteer") {
    if (id === "saved") return db.saved.filter(s => s.volunteerId === S.session.id && C.oppIsLive(db, db.opportunities.find(o => o.id === s.oppId) || {})).length;
    if (id === "connections") return db.interests.filter(i => i.volunteerId === S.session.id && i.initiatedBy === "Organization" && i.status === "Pending").length;
  }
  if (t === "member") {
    const opps = db.opportunities.filter(o => o.orgId === me().orgId).map(o => o.id);
    if (id === "review") return db.interests.filter(i => opps.includes(i.oppId) && i.initiatedBy === "Volunteer" && i.status === "Pending").length + db.hours.filter(h => h.status === "Submitted" && opps.includes((db.connections.find(c => c.id === h.connectionId) || {}).oppId)).length;
  }
  if (t === "admin") {
    if (id === "approvals") return db.organizations.filter(o => o.status === "Pending").length + db.skills.filter(s => s.status === "Pending").length;
    if (id === "attention") return C.lowInterest(db).length + db.flags.filter(f => f.status === "Open").length;
  }
  return 0;
}

/* ---------- Shared pieces ---------- */
const task = (tab, title, desc, count, act) => `<button class="task" ${act ? `data-act="${act}"` : `data-tab="${tab}"`}><b>${title}${count ? `<span class="cnt">${count}</span>` : ""}</b><span>${desc}</span><i class="arrow" aria-hidden="true">→</i></button>`;
const callbar = `<div class="callbar"><span>Prefer to talk to someone? We're happy to help by phone.</span><b>Call PCC: ${C.HELPLINE}</b></div>`;
function hello() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
const fitLabel = s => s >= 85 ? "Excellent fit" : s >= 70 ? "Good fit" : "Possible fit";
const whenOf = o => esc(o.whenText || (o.flexible ? "Flexible timing" : o.slots.map(C.slotLabel).join(", ")));
function fitBars(ev) {
  return `<div class="bars">${db.rules.filter(r => r.active).map(r => `<div class="bar"><span>${esc(r.criterion)} <small class="sub">(${r.weight}%)</small></span><i><b style="width:${ev.fit[r.id]}%"></b></i><em>${ev.fit[r.id]}</em></div>`).join("")}</div>`;
}
function oppCard(item, mode) {
  const o = item.opp, org = C.orgOf(db, o), saved = db.saved.some(s => s.volunteerId === S.session.id && s.oppId === o.id);
  const skills = o.skills.map(s => esc(C.skillName(db, s.skillId)) + (s.required ? " (required)" : "")).join(", ") || "None needed";
  return `<article class="card opp enter" aria-label="${esc(o.title)}"><div class="opp-main">
    <div class="org-row"><div class="avatar" aria-hidden="true">${esc(org.short)}</div><div class="stack"><span class="eyebrow">${esc(org.name)}</span><h2>${esc(o.title)}</h2></div></div>
    <div class="chips"><span class="chip">${esc(o.roleType)}</span><span class="chip">${esc(o.commitment)}</span>${o.bgCheck ? '<span class="chip warn">Background check</span>' : ""}${o.format !== "In person" ? `<span class="chip ok">${esc(o.format)}</span>` : ""}</div>
    <p class="sub" style="color:var(--ink)">${esc(o.description)}</p>
    <dl class="facts"><dt>When</dt><dd>${whenOf(o)} · starts ${C.fmtDate(o.startDate)}</dd><dt>Where</dt><dd>${esc(o.location)}${item.miles ? ` · ${item.miles} mi` : ""}</dd><dt>Needed</dt><dd>${C.openSpots(o)} of ${o.needed} spots open</dd><dt>Skills</dt><dd>${skills}</dd><dt>Age</dt><dd>${o.minAge}+</dd></dl></div>
    <div class="opp-side"><div class="match"><div class="ring" style="--p:${item.score}" role="img" aria-label="Match score ${item.score} out of 100"><span>${item.score}</span></div><div><div class="fitlabel">${fitLabel(item.score)}</div><strong style="font-size:14px">Why we suggested this</strong><ul>${item.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div></div>
    <details><summary>See how the match score is calculated</summary>${fitBars(item)}<p class="sub" style="font-size:12.5px;margin-top:6px">Score = weighted average of the criteria PCC sets. No contact details are shared until you and the organization both agree.</p></details>
    <button class="linkish" style="justify-self:start;font-size:13px" data-act="report" data-kind="Posting" data-id="${o.id}">Report this posting</button></div>
    ${mode === "deck" ? `<div class="actions"><button class="btn quiet" data-act="pass" data-id="${o.id}">Not for me</button><button class="btn" data-act="save" data-id="${o.id}" aria-pressed="${saved}" aria-label="${saved ? "Saved. Tap to remove from saved" : "Save for later"}">${I.bookmark}</button><button class="btn solid" data-act="interest" data-id="${o.id}">I'm interested</button></div>` : ""}
  </article>`;
}
function vNotifications() {
  const list = myNotifs();
  const html = `<div class="row"><h2>Notifications</h2>${list.some(n => !n.readAt) ? '<button class="btn quiet small" data-act="readAll">Mark all read</button>' : ""}</div><p class="sub">These are also sent to your email address.</p>
  <div class="card">${list.length ? list.map(n => `<div class="notif"><span class="dot ${n.readAt ? "read" : ""}" aria-label="${n.readAt ? "Read" : "Unread"}"></span><div><div>${esc(n.text)}</div><span class="sub" style="font-size:12.5px">${C.fmtDate(n.sentAt)} · ${esc(n.channel)}</span></div></div>`).join("") : '<p class="sub">Nothing yet.</p>'}</div>`;
  return html;
}

/* ---------- Public: landing, sign in, MFA ---------- */
const WSTEPS = ["About you", "What you like to do", "What you're willing to do", "What you can do", "When you're free", "Review your preferences"];
function vLanding() {
  return `<section class="hero"><div class="hero-copy"><span class="eyebrow" style="color:inherit;opacity:.8">Pitt County Cares · VOLUNTR</span><h2>Find volunteer work in Pitt County that fits your skills and your schedule</h2><p>Tell us what you care about, what you're good at and when you're free. We'll match you with local organizations that need exactly that.</p><button class="btn accent" data-act="wizardNew">Start sign-up</button><p style="font-size:13px">About 10 minutes · Free · 18 and older</p></div>
    <ol class="outline" aria-label="What we'll ask">${WSTEPS.slice(0, 5).map((t, i) => `<li><span><b>${t}</b><span>${["Name, email and date of birth", "Causes you care about", "Kinds of roles you'd accept", "Skills, credentials and languages", "Days, times and how far you'll travel"][i]}</span></span></li>`).join("")}</ol></section>
  <div class="promises">${[["Your contact details stay private", "Organizations see only your first name, skills and general area until you both agree to connect."], ["Matches, not a long list", "You'll see the opportunities that fit you best first, and why."], ["Change anything later", "Update your preferences whenever your schedule or interests change."]].map(([h, t]) => `<div class="card promise">${I.shield}<div><b>${h}</b><p class="sub">${t}</p></div></div>`).join("")}</div>
  <div class="card"><div class="row" style="flex-wrap:wrap"><div><h3>Representing a nonprofit?</h3><p class="sub">Organizations register separately and are approved by PCC before posting needs.</p></div><button class="btn quiet small" data-act="goOrgReg">Register an organization</button></div></div>
  <p class="legal">Already have an account? <button class="linkish" data-act="goSignin">Sign in</button> · Prefer to sign up by phone? Call PCC at ${C.HELPLINE}. PCC does not screen or vet volunteers or organizations. <button class="linkish" data-act="terms">Terms & privacy</button></p>`;
}
function vSignin() {
  return `<div class="card narrow" style="margin-top:8px"><h2>Sign in</h2><p class="sub">Volunteers, organization members and PCC staff all sign in here.</p>
  ${S.errors.login ? `<div class="errsum" role="alert" id="errsum" tabindex="-1">${esc(S.errors.login)}</div>` : ""}
  <form data-form="signin" class="list" novalidate>
    <div class="field"><label for="si-email">Email</label><input id="si-email" type="email" autocomplete="username" required value="${esc(S.lastEmail || "")}"></div>
    <div class="field"><label for="si-pw">Password</label><input id="si-pw" type="password" autocomplete="current-password" required></div>
    <button class="btn solid">Sign in</button></form>
  <p class="sub">New here? <button class="linkish" data-act="wizardNew">Sign up as a volunteer</button> or <button class="linkish" data-act="goOrgReg">register an organization</button>. Forgot your password? Call PCC at ${C.HELPLINE}.</p></div>`;
}
function vMfa() {
  return `<div class="card narrow" style="margin-top:20px">${I.lock.replace("<svg", '<svg width="32" height="32" aria-hidden="true"')}<h2>Confirm it's you</h2><p class="sub">${S.session.type === "admin" ? "PCC admin accounts always use two-step sign-in." : "You turned on two-step sign-in for your account."} Enter the 6-digit code from your authenticator app.</p>
  ${S.errors.mfa ? `<div class="errsum" role="alert" id="errsum" tabindex="-1">${esc(S.errors.mfa)}</div>` : ""}
  <form data-form="mfa" class="list" novalidate><div class="field"><label for="code">6-digit code</label><input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div><button class="btn solid">Verify and continue</button></form>
  <p class="sub" style="font-size:13px">Training: open <b>Training tools</b> above to see the current code.</p></div>`;
}

/* ---------- Volunteer sign-up / edit wizard ---------- */
function newWizard(v) {
  if (v) return { editing: true, step: 0, ...JSON.parse(JSON.stringify(v)), password: "", terms: true, pendingSkills: [] };
  return { step: 0, firstName: "", lastName: "", email: "", phone: "", dob: "", zip: "", password: "", terms: false, causes: [], roles: [], bgWilling: false, skills: [], certs: "", physical: "No lifting limits", languages: "English", slots: [], commitments: [], format: [], radius: 10, season: "", pendingSkills: [] };
}
function wSummary(w, edit) {
  const sec = (h, val, step) => `<div><h4>${h}${edit ? `<button class="linkish" data-act="wgo" data-step="${step}">Change</button>` : ""}</h4><p class="${val ? "" : "empty"}">${val ? esc(val) : "Not chosen yet"}</p></div>`;
  return `<div class="sum">${sec("About you", [w.firstName, w.lastName].filter(Boolean).join(" ") + (w.email ? ` · ${w.email}` : "") + (w.zip ? ` · ${C.cityOf(w.zip)}` : ""), 0)}${sec("Causes", w.causes.join(", "), 1)}${sec("Roles you'd accept", w.roles.join(", ") + (w.roles.length ? (w.bgWilling ? " · OK with a background check" : " · No background checks") : ""), 2)}${sec("Skills", [...w.skills.map(id => C.skillName(db, id)), w.certs].filter(Boolean).join(", "), 3)}${sec("Free times", w.slots.map(C.slotLabel).join(", "), 4)}${sec("Commitment and format", [...w.commitments, ...w.format].join(", ") + (w.commitments.length || w.format.length ? ` · within ${w.radius} mi` : ""), 4)}</div>`;
}
function skillPicker(scope, selected, mode) {
  const q = C.norm(S.skillQuery);
  const pool = db.skills.filter(s => s.status === "Active" || (s.status === "Pending" && (scopeObj(scope).pendingSkills || []).includes(s.id)));
  const shown = pool.filter(s => !q || C.norm(s.name).includes(q));
  const exact = q && db.skills.some(s => C.norm(s.name) === q && s.status !== "Retired");
  const btn = s => {
    if (mode === "tri") { const k = selected.find(x => x.skillId === s.id), st = k ? (k.required ? "req" : "nice") : ""; return `<button type="button" data-act="tri" data-val="${s.id}" data-state="${st}" data-pending="${s.status === "Pending" ? 1 : 0}" aria-label="${esc(s.name)}: ${st === "req" ? "required" : st === "nice" ? "nice to have" : "not needed"}">${esc(s.name)}${st === "req" ? " · required" : ""}</button>`; }
    return `<button type="button" data-act="pickSkill" data-scope="${scope}" data-val="${s.id}" data-pending="${s.status === "Pending" ? 1 : 0}" aria-pressed="${selected.includes(s.id)}">${esc(s.name)}</button>`;
  };
  return `<div class="field"><label for="skq">Search skills</label><input id="skq" type="search" value="${esc(S.skillQuery)}" data-act="skillq" placeholder="Type to search, for example 'grant'" autocomplete="off"></div>
    <div class="pick" role="group" aria-label="Skills">${shown.map(btn).join("") || '<span class="sub">No skills match that search.</span>'}</div>
    ${q && !exact ? `<div class="banner info"><span>Can't find “${esc(S.skillQuery)}”? <button type="button" class="linkish" data-act="suggestSkill" data-scope="${scope}">Suggest it as a new skill</button>. PCC reviews new skills before they're used in matching.</span></div>` : ""}`;
}
function vWizard() {
  const w = S.wizard, s = w.step, last = WSTEPS.length - 1;
  let body = "";
  if (s === 0) body = `<div class="grid-2">${field("wf", "First name", `<input id="wf" type="text" value="${esc(w.firstName)}" data-bind="firstName" data-scope="wizard" autocomplete="given-name">`, { key: "firstName" })}${field("wl", "Last name", `<input id="wl" type="text" value="${esc(w.lastName)}" data-bind="lastName" data-scope="wizard" autocomplete="family-name">`, { key: "lastName" })}</div>
    ${field("we", "Email", `<input id="we" type="email" value="${esc(w.email)}" data-bind="email" data-scope="wizard" autocomplete="email">`, { key: "email" })}
    ${w.editing ? "" : field("wpw", "Create a password", `<input id="wpw" type="password" value="${esc(w.password)}" data-bind="password" data-scope="wizard" autocomplete="new-password">`, { key: "password", hint: "At least 10 characters, with a letter and a number." })}
    ${field("wph", "Mobile phone (optional)", `<input id="wph" type="tel" value="${esc(w.phone)}" data-bind="phone" data-scope="wizard" autocomplete="tel">`, { key: "phone", hint: "Shared only after you connect with an organization." })}
    <div class="grid-2">${field("wb", "Date of birth", `<input id="wb" type="date" value="${esc(w.dob)}" data-bind="dob" data-scope="wizard">`, { key: "dob", hint: "Volunteers must be 18 or older for this version." })}
    ${field("wz", "ZIP code", `<select id="wz" data-bind="zip" data-scope="wizard">${zipOptions(w.zip)}</select>`, { key: "zip", hint: "Organizations see only your town." })}</div>
    ${w.editing ? "" : `<label class="note" style="color:var(--ink)"><input id="wt" type="checkbox" data-bind="terms" data-scope="wizard" ${w.terms ? "checked" : ""}> <span>I agree to the <button type="button" class="linkish" data-act="terms">terms of use and privacy policy</button>. I understand PCC does not screen or vet volunteers or organizations.</span></label>${fe("terms")}`}`;
  if (s === 1) body = `<p class="sub">Pick the causes you care about most. Choose as many as you like.</p>` + pick("wizard", "causes", C.CAUSES, w.causes) + fe("causes");
  if (s === 2) body = `<p class="sub">Which kinds of roles would you accept?</p>` + pick("wizard", "roles", C.ROLE_TYPES, w.roles) + fe("roles") + `<label class="note" style="color:var(--ink)"><input type="checkbox" data-bind="bgWilling" data-scope="wizard" ${w.bgWilling ? "checked" : ""}> I'm willing to complete a background check if a role requires one</label>`;
  if (s === 3) body = `<p class="sub">Skills, expertise and languages you can offer. Optional, but it makes your matches much better.</p>` + skillPicker("wizard", w.skills) +
    `${field("wc", "Certifications or credentials", `<input id="wc" type="text" placeholder="e.g. CPR, CPA, food handler" data-bind="certs" data-scope="wizard" value="${esc(w.certs)}">`)}
     ${field("wlang", "Languages", `<input id="wlang" type="text" data-bind="languages" data-scope="wizard" value="${esc(w.languages)}">`)}
     ${field("wp", "Physical capability", `<select id="wp" data-bind="physical" data-scope="wizard">${["No lifting limits", "Can lift up to 25 lbs", "Seated roles preferred"].map(o => `<option ${o === w.physical ? "selected" : ""}>${o}</option>`).join("")}</select>`)}`;
  if (s === 4) body = `<p class="sub">Tap the times you're usually free.</p>${slotGrid("wizard", w.slots)}${fe("slots")}
    <fieldset><legend>Commitment</legend>${pick("wizard", "commitments", C.COMMITMENTS, w.commitments)}${fe("commitments")}</fieldset>
    <fieldset><legend>Format</legend>${pick("wizard", "format", ["In person", "Remote"], w.format)}${fe("format")}</fieldset>
    <div class="field"><label for="wr">Travel radius: <b id="wrv">${w.radius}</b> miles</label><input id="wr" type="range" min="1" max="50" value="${w.radius}" data-bind="radius" data-scope="wizard" style="accent-color:var(--navy)"></div>
    ${field("ws", "Busy seasons (optional)", `<input id="ws" type="text" data-bind="season" data-scope="wizard" value="${esc(w.season)}" placeholder="e.g. Busy Feb – Apr">`)}`;
  if (s === 5) body = `<p class="sub">Check your preferences. You can change any of them now or later from your profile.</p><div class="card">${wSummary(w, true)}</div><div class="banner info">Organizations will see: ${esc(w.firstName || "your first name")}, your skills, causes, free times and town. Never your last name, email or phone until you both agree to connect.</div>`;
  const main = `<div class="row"><button class="linkish" data-act="wizardClose">${w.editing ? "Cancel" : "← Back"}</button><span class="sub">${s === last ? "Last step" : `About ${[10, 8, 6, 4, 2, 1][s]} min left`}</span></div>
    <div class="steps" aria-label="Step ${s + 1} of ${WSTEPS.length}">${WSTEPS.map((_, i) => `<i class="${i <= s ? "on" : ""}"></i>`).join("")}</div>
    <div class="stack"><span class="eyebrow">Step ${s + 1} of ${WSTEPS.length}</span><h2>${WSTEPS[s]}</h2></div>
    ${errSummary()}
    <form data-form="wizard" class="list" novalidate>${body}
    <div class="row" style="margin-top:8px">${s ? '<button type="button" class="btn quiet" data-act="wback">Back</button>' : "<span></span>"}<button class="btn solid">${s === last ? (w.editing ? "Save preferences" : "Create my profile") : "Continue"}</button></div></form>`;
  return `<div class="two-col"><div class="list">${main}</div>${s < last ? `<aside class="card side-only" style="flex-direction:column;position:sticky;top:0"><h3>Your preferences so far</h3>${wSummary(w, false)}</aside>` : ""}</div>`;
}

/* ---------- Organization registration ---------- */
function vOrgReg() {
  const r = S.reg;
  return `<button class="linkish" data-act="goLanding">← Back</button><div class="stack"><span class="eyebrow">For nonprofits</span><h2>Register your organization</h2></div>
  <p class="sub">PCC reviews every organization before its postings go live, usually within two business days. You'll become the organization's Owner and can add teammates later.</p>${errSummary()}
  <form data-form="orgreg" class="list narrow" novalidate>
    <h3>Organization</h3>
    ${field("rn", "Organization name", `<input id="rn" type="text" data-bind="name" data-scope="reg" value="${esc(r.name)}">`, { key: "name" })}
    ${field("rm", "Mission", `<textarea id="rm" data-bind="mission" data-scope="reg">${esc(r.mission)}</textarea>`, { key: "mission" })}
    <fieldset><legend>Causes you work on</legend>${pick("reg", "causes", C.CAUSES, r.causes)}${fe("causes")}</fieldset>
    <div class="grid-2">${field("rz", "ZIP code", `<select id="rz" data-bind="zip" data-scope="reg">${zipOptions(r.zip)}</select>`, { key: "zip" })}${field("rw", "Website (optional)", `<input id="rw" type="text" data-bind="website" data-scope="reg" value="${esc(r.website)}" placeholder="example.org">`, { key: "website" })}</div>
    ${field("re", "EIN (optional)", `<input id="re" type="text" data-bind="ein" data-scope="reg" value="${esc(r.ein)}" placeholder="12-3456789">`, { key: "ein", hint: "Helps PCC verify you faster." })}
    <h3>You (the Owner)</h3>
    <div class="grid-2">${field("rf", "First name", `<input id="rf" type="text" data-bind="firstName" data-scope="reg" value="${esc(r.firstName)}">`, { key: "firstName" })}${field("rl", "Last name", `<input id="rl" type="text" data-bind="lastName" data-scope="reg" value="${esc(r.lastName)}">`, { key: "lastName" })}</div>
    <div class="grid-2">${field("rem", "Work email", `<input id="rem" type="email" data-bind="email" data-scope="reg" value="${esc(r.email)}">`, { key: "email" })}${field("rp", "Phone (optional)", `<input id="rp" type="tel" data-bind="phone" data-scope="reg" value="${esc(r.phone)}">`, { key: "phone" })}</div>
    ${field("rpw", "Create a password", `<input id="rpw" type="password" data-bind="password" data-scope="reg" value="${esc(r.password)}" autocomplete="new-password">`, { key: "password", hint: "At least 10 characters, with a letter and a number." })}
    <label class="note" style="color:var(--ink)"><input type="checkbox" data-bind="terms" data-scope="reg" ${r.terms ? "checked" : ""}> <span>I agree to the terms of use. Our organization is responsible for screening and supervising its volunteers.</span></label>${fe("terms")}
    <button class="btn solid">Submit for PCC approval</button></form>`;
}

/* ---------- Volunteer screens ---------- */
const VIEWS = { volunteer: {}, member: {}, admin: {} };
const VV = VIEWS.volunteer;
VV.inbox = vNotifications;
VV.home = () => {
  const u = me(), feed = C.volunteerFeed(db, u.id);
  const invites = db.interests.filter(i => i.volunteerId === u.id && i.initiatedBy === "Organization" && i.status === "Pending").length;
  const conns = db.connections.filter(c => c.volunteerId === u.id && c.status === "Active").length;
  const waiting = db.interests.filter(i => i.volunteerId === u.id && i.initiatedBy === "Volunteer" && i.status === "Pending").length;
  return `<div class="greet"><h2>${hello()}, ${esc(u.firstName)}</h2><p class="lead">What would you like to do today?</p></div>
  ${invites ? `<div class="banner ok">${I.people}<span>${invites === 1 ? "An organization has" : `${invites} organizations have`} invited you to help. <button class="linkish" data-tab="connections">See invitations</button></span></div>` : ""}
  <div class="tasks">${task("discover", "Find a way to help", "Your best matches first, one at a time, with the reasons we picked each one", feed.ranked.length)}${task("saved", "Look at what I saved", "Opportunities you set aside for later", badgeFor("saved"))}${task("connections", "See my connections", `${waiting} waiting for an answer, ${conns} connected`, invites)}${task("profile", "Update what I can do and when", "Your causes, skills and free times")}</div>${callbar}`;
};
VV.discover = () => {
  const feed = C.volunteerFeed(db, S.session.id), d = feed.ranked;
  if (S.deckIdx >= d.length) S.deckIdx = 0;
  const head = `<div class="row"><div><h2>Opportunities for you</h2><p class="sub">Ranked by how well they fit your profile</p></div><span class="chip navy">${d.length ? `${S.deckIdx + 1} of ${d.length}` : "Done"}</span></div>`;
  const ex = feed.hidden.length ? `<div class="note">${I.info}<span>${feed.hidden.length} opportunities are hidden because a must-have doesn't fit. <button class="linkish" data-act="why">See why</button></span></div>` : "";
  if (!d.length) return head + `<div class="card"><h3>You've seen every current match</h3><p class="sub">We'll email you when a new opportunity fits your profile. You can also review the ones you saved, or widen your preferences.</p><button class="btn solid" data-tab="saved">Go to saved</button><button class="btn quiet" data-act="editProfile">Update my preferences</button></div>` + ex;
  return head + oppCard(d[S.deckIdx], "deck") + (d.length > 1 ? `<div class="row"><button class="btn quiet small" data-act="deckPrev" ${S.deckIdx ? "" : "disabled"}>← Previous</button><button class="btn quiet small" data-act="deckNext">Skip for now →</button></div>` : "") + ex;
};
VV.saved = () => {
  const u = me();
  const list = db.saved.filter(s => s.volunteerId === u.id).map(s => db.opportunities.find(o => o.id === s.oppId)).filter(Boolean);
  return `<h2>Saved for later</h2>` + (list.length ? `<div class="list cards">${list.map(o => { const ev = C.evaluate(db, u, o), live = C.oppIsLive(db, o); return `<div class="card"><div class="row"><div><span class="eyebrow">${esc(C.orgOf(db, o).name)}</span><h3>${esc(o.title)}</h3><p class="sub">${whenOf(o)}</p></div><div class="ring" style="--p:${ev.score}"><span>${ev.score}</span></div></div>${live ? "" : `<span class="chip bad">No longer open</span>`}${live && !ev.eligible ? `<span class="chip warn">${esc(ev.fails[0])}</span>` : ""}<div class="row"><button class="btn quiet small" data-act="unsave" data-id="${o.id}">Remove</button>${live && ev.eligible ? `<button class="btn solid small" data-act="interest" data-id="${o.id}">I'm interested</button>` : ""}</div></div>`; }).join("")}</div>` : `<div class="banner info">Nothing saved yet. Tap the bookmark on any opportunity to keep it here.</div>`);
};
VV.connections = () => {
  const u = me(), mine = db.interests.filter(i => i.volunteerId === u.id && i.response === "Interested" && i.status !== "Withdrawn");
  const opp = i => db.opportunities.find(o => o.id === i.oppId), org = i => C.orgOf(db, opp(i));
  const invites = mine.filter(i => i.initiatedBy === "Organization" && i.status === "Pending");
  const waiting = mine.filter(i => i.initiatedBy === "Volunteer" && i.status === "Pending");
  const conns = db.connections.filter(c => c.volunteerId === u.id);
  const past = mine.filter(i => i.status === "Declined");
  const sec = (title, items) => items.length ? `<h3>${title}</h3><div class="list cards">${items.join("")}</div>` : "";
  return `<h2>Your connections</h2><p class="sub">A connection is made when you and an organization both say yes. Contact details are shared only then.</p>
  ${sec("Invitations from organizations", invites.map(i => `<div class="card"><span class="eyebrow">${esc(org(i).name)}</span><h3>${esc(opp(i).title)}</h3><p class="sub">${whenOf(opp(i))}</p><p class="sub">They saw your profile and think you'd be a great fit (match ${i.matchScore}).</p><div class="row"><button class="btn quiet small" data-act="invNo" data-id="${i.id}">No thanks</button><button class="btn solid small" data-act="invYes" data-id="${i.id}">Accept and connect</button></div></div>`))}
  ${sec("Connected", conns.map(c => { const o = db.opportunities.find(x => x.id === c.oppId); return `<button class="card" style="text-align:left" data-act="openConn" data-id="${c.id}"><div class="row"><div><span class="eyebrow">${esc(C.orgOf(db, o).name)}</span><h3>${esc(o.title)}</h3><p class="sub">${whenOf(o)}</p></div><span class="chip ok">Connected</span></div><span class="sub" style="font-size:13px">Open to see contact details, messages and hours</span></button>`; }))}
  ${sec("Waiting for the organization", waiting.map(i => `<div class="card"><div class="row"><div><span class="eyebrow">${esc(org(i).name)}</span><h3>${esc(opp(i).title)}</h3></div><span class="chip warn">Waiting</span></div><p class="sub" style="font-size:13px">Contact details appear here once the organization accepts.</p><button class="btn quiet small" data-act="withdraw" data-id="${i.id}">Withdraw my interest</button></div>`))}
  ${sec("Not this time", past.map(i => `<div class="card"><div class="row"><div><span class="eyebrow">${esc(org(i).name)}</span><h3>${esc(opp(i).title)}</h3></div><span class="chip">Declined</span></div></div>`))}
  ${!invites.length && !waiting.length && !conns.length && !past.length ? `<div class="banner info">No connections yet. Say “I'm interested” on an opportunity in Discover to start one.</div>` : ""}`;
};
VV.profile = () => {
  const v = me();
  const sec = (title, body, step) => `<div class="card"><div class="row"><h3>${title}</h3><button class="linkish" data-act="editProfile" data-step="${step}">Edit</button></div>${body}</div>`;
  const chips = a => `<div class="chips">${a.map(c => `<span class="chip">${esc(c)}</span>`).join("") || '<span class="sub">None yet</span>'}</div>`;
  return `<div class="row"><div><h2>${esc(v.firstName)} ${esc(v.lastName)}</h2><p class="sub">${esc(C.cityOf(v.zip))} · within ${v.radius} mi · ${esc(v.email)}</p></div></div>
    <div class="banner info">Organizations see only your first name, skills, causes, free times and town until you both agree to connect.</div>
    ${sec("What you like to do", chips(v.causes), 1)}
    ${sec("What you're willing to do", chips(v.roles) + `<p class="sub">${v.bgWilling ? "Willing to complete a background check" : "Not willing to complete a background check"}</p>`, 2)}
    ${sec("What you can do", chips(v.skills.map(id => C.skillName(db, id) + ((db.skills.find(s => s.id === id) || {}).status === "Pending" ? " (pending review)" : ""))) + `<dl class="facts"><dt>Credentials</dt><dd>${esc(v.certs || "None listed")}</dd><dt>Languages</dt><dd>${esc(v.languages)}</dd><dt>Physical</dt><dd>${esc(v.physical)}</dd></dl>`, 3)}
    ${sec("When you're available", `<dl class="facts"><dt>Times</dt><dd>${esc(v.slots.map(C.slotLabel).join(", "))}</dd><dt>Commitment</dt><dd>${esc(v.commitments.join(", "))}</dd><dt>Format</dt><dd>${esc(v.format.join(", "))}</dd><dt>Seasonal</dt><dd>${esc(v.season || "None")}</dd></dl>`, 4)}
    <div class="card"><h3>Your account</h3><p class="sub">Deleting your account removes your name, contact details and preferences. Anonymous totals stay in PCC's reports.</p><button class="btn danger small" data-act="deleteAsk">Delete my account</button></div>
    <p class="legal">PCC does not screen or vet volunteers or organizations. Organizations are responsible for their own screening and supervision. <button class="linkish" data-act="terms">Terms & privacy</button></p>`;
};

/* ---------- Conversation (volunteer and organization) ---------- */
function vConversation() {
  const c = db.connections.find(x => x.id === S.openConn);
  if (!c) { S.openConn = null; return ""; }
  const o = db.opportunities.find(x => x.id === c.oppId), org = C.orgOf(db, o), vol = db.volunteers.find(v => v.id === c.volunteerId);
  const isVol = S.session.type === "volunteer";
  const owner = db.members.find(m => m.id === o.createdBy) || db.members.find(m => m.orgId === org.id && m.role === "Owner");
  const pv = C.volunteerPublicView(db, vol, S.session);
  const contact = isVol ? `<dt>Contact</dt><dd>${esc(owner.firstName + " " + owner.lastName)}</dd><dt>Email</dt><dd>${esc(owner.email)}</dd><dt>Phone</dt><dd>${esc(owner.phone)}</dd><dt>Address</dt><dd>${o.shareAddress && o.street ? esc(o.street + ", " + o.location) : "Not needed for this opportunity"}</dd>`
    : `<dt>Volunteer</dt><dd>${esc(pv.firstName + " " + (pv.lastName || ""))}</dd><dt>Email</dt><dd>${esc(pv.email || "Hidden")}</dd><dt>Phone</dt><dd>${esc(pv.phone || "Hidden")}</dd>`;
  const msgs = db.messages.filter(m => m.connectionId === c.id).sort((a, b) => a.at.localeCompare(b.at));
  const who = m => m.fromType === S.session.type && (m.fromType === "volunteer" ? m.fromId === S.session.id : true) ? "You" : m.fromType === "volunteer" ? vol.firstName : (db.members.find(x => x.id === m.fromId) || {}).firstName || org.name;
  const hrs = db.hours.filter(h => h.connectionId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const hrsTotal = hrs.filter(h => h.status === "Confirmed").reduce((s, h) => s + h.hours, 0);
  return `<button class="linkish" data-act="closeConn">← Back</button>
    <div class="card"><span class="eyebrow">${esc(isVol ? org.name : "Connection")}</span><h2>${esc(o.title)}</h2><p class="sub">${whenOf(o)}</p>
    <div class="banner ok">${I.check}<span>Connected ${C.fmtDate(c.createdAt)}. Contact details are now shared with both of you.</span></div>
    <dl class="facts">${contact}</dl></div>
    <div class="card"><h3>Messages</h3><div class="list" aria-live="polite">${msgs.map(m => `<div class="msg ${who(m) === "You" ? "me" : ""}">${esc(m.text)}<small>${esc(who(m))} · ${C.fmtDate(m.at)} ${esc(m.at.slice(11, 16))}</small></div>`).join("") || '<p class="sub">No messages yet. Say hello and agree on the details.</p>'}</div>
    <form data-form="msg" class="row"><label for="msgIn" class="sr">Message</label><input id="msgIn" type="text" placeholder="Write a message" autocomplete="off" maxlength="1000" style="flex:1"><button class="btn solid small">Send</button></form></div>
    <div class="card"><div class="row"><h3>Volunteer hours</h3><span class="chip ok">${hrsTotal} confirmed</span></div>
    ${hrs.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Hours</th><th>Status</th>${isVol ? "" : "<th></th>"}</tr></thead><tbody>${hrs.map(h => `<tr><td>${C.fmtDate(h.date)}</td><td>${h.hours}</td><td>${esc(h.status)}</td>${isVol ? "" : `<td>${h.status === "Submitted" ? `<button class="btn solid small" data-act="hrsOk" data-id="${h.id}">Confirm</button> <button class="btn quiet small" data-act="hrsNo" data-id="${h.id}">Not right</button>` : ""}</td>`}</tr>`).join("")}</tbody></table>` : '<p class="sub">No hours logged yet.</p>'}
    ${isVol ? `${errSummary()}<form data-form="hours" class="grid-2" novalidate>${field("hd", "Date", `<input id="hd" type="date" max="${today()}" value="${today()}">`, { key: "hdate" })}${field("hh", "Hours", `<input id="hh" type="number" min="0.25" max="24" step="0.25" value="2">`, { key: "hhours" })}<button class="btn small">Log hours for the organization to confirm</button></form>` : ""}
    <p class="sub" style="font-size:12.5px">Hours help PCC report volunteer time to funders. Organizations confirm each entry.</p></div>`;
}

/* ---------- Organization screens ---------- */
const VO = VIEWS.member;
VO.inbox = vNotifications;
const myOpps = () => db.opportunities.filter(o => o.orgId === me().orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
VO.home = () => {
  const org = myOrg(), u = me();
  if (org.status !== "Approved") return `<div class="greet"><h2>Welcome, ${esc(u.firstName)}</h2><p class="lead">${esc(org.name)}</p></div>
    <div class="banner ${org.status === "Rejected" ? "warn" : "info"}">${I.info}<span>${org.status === "Pending" ? "PCC is reviewing your organization. You'll get an email when you're approved, and then you can post volunteer needs." : `PCC didn't approve this registration${org.decisionNote ? `: ${esc(org.decisionNote)}` : "."} Call PCC at ${C.HELPLINE} if you have questions.`}</span></div>
    <div class="tasks">${task("organization", "Check our organization's details", "Mission, causes, location and team")}${task("inbox", "See notifications", "Updates from PCC")}</div>${callbar}`;
  const li = C.lowInterest(db).filter(x => x.opp.orgId === org.id)[0];
  return `<div class="greet"><h2>Welcome, ${esc(u.firstName)}</h2><p class="lead">${esc(org.name)} · What would you like to do today?</p></div>
  ${li ? `<div class="banner warn">${I.flag}<span><b>${esc(li.opp.title)}</b> has had ${li.interested ? "only one interested volunteer" : "no interest"} in ${li.days} days. Try changing the time or description, or call PCC and we'll help you recruit.</span></div>` : ""}
  <div class="tasks">${task("review", "See who wants to help", "Volunteers who asked to help, strong matches, and hours to confirm", badgeFor("review"))}${task("post", "Ask for volunteers", "Post a new need in about 3 minutes", 0, "newPost")}${task("postings", "Update my postings", "Pause, mark as filled, or change when a posting ends", myOpps().filter(o => o.status === "Active").length)}${task("organization", "Update our organization's details", "Mission, team members and sign-in settings")}</div>${callbar}`;
};
VO.postings = () => {
  const list = myOpps();
  return `<div class="row"><div><h2>Your postings</h2><p class="sub">${esc(myOrg().name)}</p></div>${C.can(db, S.session, "org.post") ? '<button class="btn accent small" data-act="newPost">+ New</button>' : ""}</div>
  <div class="list cards">${list.map(p => {
    const cls = { Active: "ok", Paused: "warn", Filled: "navy", Expired: "bad", Closed: "bad" }[p.status];
    const intr = db.interests.filter(i => i.oppId === p.id && i.initiatedBy === "Volunteer" && i.status === "Pending").length;
    return `<div class="card"><div class="row"><h3>${esc(p.title)}</h3><span class="chip ${cls}">${p.status}</span></div>
      <div class="progress" role="img" aria-label="${p.filled} of ${p.needed} filled"><b style="width:${Math.min(100, p.filled / p.needed * 100)}%"></b></div>
      <div class="row sub" style="font-size:13px;flex-wrap:wrap"><span>${p.filled} of ${p.needed} filled · ${intr} waiting for you</span><span>${p.status === "Expired" ? "Expired" : "Comes down"} ${C.fmtDate(p.expires)}</span></div>
      <div class="chips">${["Expired", "Filled", "Closed"].includes(p.status) ? `<button class="btn quiet small" data-act="repost" data-id="${p.id}">Repost as new</button>${p.status !== "Closed" ? `<button class="btn quiet small" data-act="editPost" data-id="${p.id}">Edit</button>` : ""}` :
      `${intr ? `<button class="btn solid small" data-act="review" data-id="${p.id}">Review ${intr}</button>` : `<button class="btn quiet small" data-act="review" data-id="${p.id}">Matches</button>`}<button class="btn quiet small" data-act="editPost" data-id="${p.id}">Edit</button><button class="btn quiet small" data-act="oppStatus" data-status="${p.status === "Paused" ? "Active" : "Paused"}" data-id="${p.id}">${p.status === "Paused" ? "Resume" : "Pause"}</button><button class="btn quiet small" data-act="oppStatus" data-status="Filled" data-id="${p.id}">Mark filled</button><button class="btn danger small" data-act="oppStatus" data-status="Closed" data-id="${p.id}">Close</button>`}</div></div>`;
  }).join("") || '<div class="banner info">No postings yet.</div>'}</div>`;
};
VO.review = () => {
  const list = myOpps().filter(o => !["Closed"].includes(o.status));
  if (!list.length) return `<h2>Review volunteers</h2><div class="banner info">Post a need first, then matching volunteers appear here.</div>`;
  if (!S.reviewFor || !list.some(o => o.id === S.reviewFor)) { const withInt = list.find(o => db.interests.some(i => i.oppId === o.id && i.status === "Pending" && i.initiatedBy === "Volunteer")); S.reviewFor = (withInt || list[0]).id; }
  const opp = db.opportunities.find(o => o.id === S.reviewFor), cands = C.candidatesFor(db, opp.id);
  const live = C.oppIsLive(db, opp);
  const conns = db.connections.filter(c => c.oppId === opp.id);
  return `<h2>Review volunteers</h2>
  <div class="field narrow"><label for="rf">Posting</label><select id="rf" data-act="reviewFor">${list.map(o => `<option value="${o.id}" ${o.id === S.reviewFor ? "selected" : ""}>${esc(o.title)} (${o.status})</option>`).join("")}</select></div>
  ${live ? "" : `<div class="banner warn">${I.info}<span>This posting is ${esc(opp.status.toLowerCase())}, so it isn't in matching right now.</span></div>`}
  <div class="note">${I.lock}<span>You'll see full names and contact details only after you accept someone who expressed interest, or they accept your invitation.</span></div>
  <div class="list cards">${cands.map(c => `<div class="card enter">
    <div class="row"><div class="org-row"><div class="avatar" aria-hidden="true">${esc(c.firstName[0])}</div><div><h3>${esc(c.firstName)}</h3><p class="sub">${esc(c.area)}</p></div></div><div class="ring" style="--p:${c.score}" role="img" aria-label="Match ${c.score}"><span>${c.score}</span></div></div>
    <div class="chips">${c.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>
    <dl class="facts"><dt>Causes</dt><dd>${esc(c.causes.join(", "))}</dd><dt>Free</dt><dd>${esc(c.availability)}</dd></dl>
    ${c.reasons.length ? `<p class="sub" style="font-size:13px">Why: ${esc(c.reasons.join("; "))}</p>` : ""}
    ${c.status === "Interested" ? `<div class="chips"><span class="chip warn">Interested in this need</span></div><div class="row"><button class="btn quiet small" data-act="decline" data-id="${c.interestId}">Decline</button><button class="btn solid small" data-act="accept" data-id="${c.interestId}" ${live ? "" : "disabled"}>Accept and connect</button></div>` : ""}
    ${c.status === "Suggested" ? `<div class="row"><span class="chip">Suggested match</span><button class="btn small" data-act="invite" data-id="${c.volunteerId}" ${live ? "" : "disabled"}>Express interest</button></div>` : ""}
    ${c.status === "Invited" ? `<span class="chip warn">You expressed interest. Waiting for ${esc(c.firstName)}.</span>` : ""}
    ${c.status === "Declined" ? `<span class="chip bad">Declined</span>` : ""}
    ${c.status === "Connected" ? `<div class="row"><span class="chip ok">Connected</span><button class="btn small" data-act="openConn" data-id="${(conns.find(x => x.volunteerId === c.volunteerId) || {}).id}">Contact, messages and hours</button></div>` : ""}
  </div>`).join("") || '<div class="banner info">No eligible volunteers yet. PCC is adding new volunteers every week.</div>'}</div>`;
};
function blankOpp() {
  const t = today();
  return { title: "", roleType: "", cause: myOrg().causes[0] || "", description: "", commitment: "", format: "In person", zip: myOrg().zip, location: "", street: "", shareAddress: false, flexible: false, slots: [], whenText: "", startDate: C.addDays(t, 14), expires: C.addDays(t, 13), needed: 5, minAge: 18, bgCheck: false, skills: [], pendingSkills: [] };
}
VO.post = () => {
  if (!C.can(db, S.session, "org.post")) return `<h2>Post a volunteer need</h2><div class="banner info">${I.info}<span>Your organization needs PCC approval before you can post.</span></div>`;
  if (!S.form) S.form = blankOpp();
  const f = S.form;
  return `<h2>${f.id ? "Edit posting" : "Post a volunteer need"}</h2><p class="sub">About 3 minutes. Every field helps us match the right people.</p>${errSummary()}
  <form data-form="post" class="list narrow" novalidate>
    ${field("pt", "Title", `<input id="pt" type="text" data-bind="title" data-scope="form" value="${esc(f.title)}" placeholder="e.g. Saturday food distribution">`, { key: "title" })}
    <fieldset><legend>Role type</legend>${one("form", "roleType", C.ROLE_TYPES, f.roleType)}${fe("roleType")}</fieldset>
    ${field("pc", "Cause", `<select id="pc" data-bind="cause" data-scope="form"><option value="">Choose a cause</option>${C.CAUSES.map(c => `<option ${c === f.cause ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>`, { key: "cause" })}
    ${field("pd", "What will volunteers do?", `<textarea id="pd" data-bind="description" data-scope="form" placeholder="Two or three sentences">${esc(f.description)}</textarea>`, { key: "description" })}
    <fieldset><legend>Skills or credentials</legend><span class="hint">Tap once for nice-to-have, twice for required, three times to clear. Required skills hide this need from volunteers who don't have them.</span>${skillPicker("form", f.skills, "tri")}</fieldset>
    <fieldset><legend>Time commitment</legend>${one("form", "commitment", C.COMMITMENTS, f.commitment)}${fe("commitment")}</fieldset>
    <fieldset><legend>When</legend><label class="note" style="color:var(--ink)"><input type="checkbox" data-bind="flexible" data-scope="form" ${f.flexible ? "checked" : ""}> Timing is flexible (volunteers choose when)</label>${f.flexible ? "" : slotGrid("form", f.slots)}${fe("slots")}</fieldset>
    ${field("pw", "Describe the timing", `<input id="pw" type="text" data-bind="whenText" data-scope="form" value="${esc(f.whenText)}" placeholder="e.g. Saturday, 8:00 AM – 12:00 PM">`)}
    <div class="grid-2">${field("ps", "Start date", `<input id="ps" type="date" data-bind="startDate" data-scope="form" value="${esc(f.startDate)}">`, { key: "startDate" })}${field("pe", "Take this posting down on", `<input id="pe" type="date" data-bind="expires" data-scope="form" value="${esc(f.expires)}">`, { key: "expires", hint: "Expired postings drop out of matching automatically." })}</div>
    <fieldset><legend>Can this be done remotely?</legend>${one("form", "format", C.FORMATS, f.format)}${fe("format")}</fieldset>
    ${f.format === "Remote" ? "" : `<div class="grid-2">${field("pz", "ZIP code", `<select id="pz" data-bind="zip" data-scope="form">${zipOptions(f.zip)}</select>`, { key: "zip" })}${field("pst", "Street address (optional)", `<input id="pst" type="text" data-bind="street" data-scope="form" value="${esc(f.street)}">`, { key: "street" })}</div>
    <label class="note" style="color:var(--ink)"><input type="checkbox" data-bind="shareAddress" data-scope="form" ${f.shareAddress ? "checked" : ""}> Share the street address with volunteers after you connect</label>`}
    <div class="grid-2">${field("pn", "Volunteers needed", `<input id="pn" type="number" min="1" max="500" data-bind="needed" data-scope="form" value="${esc(f.needed)}">`, { key: "needed" })}${field("pa", "Minimum age", `<input id="pa" type="number" min="18" data-bind="minAge" data-scope="form" value="${esc(f.minAge)}">`, { key: "minAge" })}</div>
    <label class="note" style="color:var(--ink)"><input type="checkbox" data-bind="bgCheck" data-scope="form" ${f.bgCheck ? "checked" : ""}> Background check required (your organization runs it)</label>
    <div class="row"><button type="button" class="btn quiet" data-act="cancelPost">Cancel</button><button class="btn solid">${f.id ? "Save changes" : "Publish need"}</button></div>
  </form>`;
};
VO.organization = () => {
  const org = myOrg(), u = me(), owner = u.role === "Owner";
  const team = db.members.filter(m => m.orgId === org.id);
  return `<div class="org-row"><div class="avatar" style="width:56px;height:56px">${esc(org.short)}</div><div><h2>${esc(org.name)}</h2><span class="chip ${org.status === "Approved" ? "ok" : "warn"}">${org.status === "Approved" ? "Verified by PCC" : esc(org.status)}</span></div></div>
  ${owner ? `${errSummary()}<form data-form="orgprofile" class="card list" novalidate><h3>Organization details</h3>
    ${field("om", "Mission", `<textarea id="om">${esc(org.mission)}</textarea>`, { key: "mission" })}
    <div class="grid-2">${field("ow", "Website", `<input id="ow" type="text" value="${esc(org.website)}">`, { key: "website" })}${field("oz", "ZIP code", `<select id="oz">${zipOptions(org.zip)}</select>`, { key: "zip" })}</div>
    <button class="btn quiet small">Save details</button></form>` : `<div class="card"><dl class="facts"><dt>Mission</dt><dd>${esc(org.mission)}</dd><dt>Causes</dt><dd>${esc(org.causes.join(", "))}</dd><dt>Location</dt><dd>${esc(org.city)}</dd><dt>Website</dt><dd>${esc(org.website || "None")}</dd></dl><p class="sub">Only an Owner can edit these details.</p></div>`}
  <div class="card"><h3>Team</h3><p class="sub">Each person has their own login. Owners manage the profile and team; Editors manage postings and volunteers.</p>
    <table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Status</th>${owner ? "<th></th>" : ""}</tr></thead><tbody>${team.map(m => `<tr><td>${esc(m.firstName + " " + m.lastName)}<br><span class="sub">${esc(m.email)}</span></td><td>${m.role}</td><td>${m.status}</td>${owner ? `<td>${m.id !== u.id && m.status === "Active" ? `<button class="btn quiet small" data-act="deactivateMember" data-id="${m.id}">Deactivate</button>` : ""}</td>` : ""}</tr>`).join("")}</tbody></table>
    ${owner ? `<details><summary>Add a team member</summary><form data-form="addMember" class="list" novalidate style="margin-top:10px"><div class="grid-2">${field("amf", "First name", '<input id="amf" type="text">', { key: "amFirst" })}${field("aml", "Last name", '<input id="aml" type="text">', { key: "amLast" })}</div>${field("ame", "Email", '<input id="ame" type="email">', { key: "amEmail" })}<div class="grid-2">${field("amr", "Role", '<select id="amr"><option>Editor</option><option>Owner</option></select>')}${field("amp", "Temporary password", '<input id="amp" type="text" autocomplete="off">', { key: "amPw", hint: "Share it with them privately. 10+ characters with a letter and a number." })}</div><button class="btn small">Add member</button></form></details>` : ""}</div>
  <div class="card"><div class="row"><div><h3>Two-step sign-in</h3><p class="sub">Optional for organizations. Uses an authenticator app.</p></div><span class="chip ${u.mfaEnabled ? "ok" : ""}">${u.mfaEnabled ? "On" : "Off"}</span></div>
    <button class="btn quiet small" data-act="${u.mfaEnabled ? "mfaOff" : "mfaOn"}">${u.mfaEnabled ? "Turn off" : "Turn on"}</button></div>`;
};

/* ---------- Admin screens ---------- */
const VA = VIEWS.admin;
VA.inbox = vNotifications;
VA.home = () => {
  const pend = db.organizations.filter(o => o.status === "Pending").length, sk = db.skills.filter(s => s.status === "Pending").length;
  return `<div class="greet"><h2>${hello()}, ${esc(me().firstName)}</h2><p class="lead">Here's what needs your attention.</p></div><div class="tasks">${task("approvals", "Approve new organizations and skills", "Postings stay hidden until you approve the organization", pend + sk)}${task("attention", "Help needs nobody has answered", `Open ${C.LOW_INTEREST_DAYS}+ days with one or no interested volunteers, plus reports`, badgeFor("attention"))}${task("reports", "See reports and export data", "Numbers for the board, funders and grants")}${task("matching", "Adjust how matching works", "Choose what matters most when ranking matches")}${task("people", "Find a person or organization", "Deactivate accounts and review the activity log")}</div>`;
};
VA.approvals = () => {
  const pend = db.organizations.filter(o => o.status === "Pending");
  const sk = db.skills.filter(s => s.status === "Pending");
  const active = db.skills.filter(s => s.status === "Active").sort((a, b) => a.name.localeCompare(b.name));
  return `<h2>Organizations to approve</h2><p class="sub">Postings go live only after an organization is approved. Check for duplicates first.</p>
  <div class="list cards">${pend.length ? pend.map(o => { const owner = db.members.find(m => m.orgId === o.id && m.role === "Owner") || {}; const sim = C.similarOrgs(db, o); return `<div class="card" ${sim.length ? 'style="border-color:var(--bad)"' : ""}><div class="org-row"><div class="avatar">${esc(o.short)}</div><div><h3>${esc(o.name)}</h3><p class="sub">${esc(o.city)} · submitted ${C.fmtDate(o.submittedAt)}</p></div></div><p class="sub" style="color:var(--ink)">${esc(o.mission)}</p>
    ${sim.length ? `<div class="banner warn">${I.flag}<span>Possible duplicate of <b>${sim.map(s => esc(s.name)).join(", ")}</b>. If it's the same group, reject it and ask the existing Owner to add this person as a member.</span></div>` : ""}${o.note ? `<div class="banner info">${esc(o.note)}</div>` : ""}
    <dl class="facts"><dt>Owner</dt><dd>${esc(owner.firstName + " " + owner.lastName)}, ${esc(owner.email)}</dd><dt>Website</dt><dd>${esc(o.website || "None")}</dd><dt>EIN</dt><dd>${esc(o.ein || "Not given")}</dd><dt>Causes</dt><dd>${esc(o.causes.join(", "))}</dd></dl>
    <div class="chips"><button class="btn solid small" data-act="approveOrg" data-id="${o.id}">Approve</button><button class="btn danger small" data-act="rejectOrgAsk" data-id="${o.id}">Reject…</button></div></div>`; }).join("") : `<div class="banner ok">${I.check}<span>All caught up.</span></div>`}</div>
  <h2>Suggested skills</h2><p class="sub">Approve a new skill, merge it into an existing one, or reject it. Pending skills don't count in matching.</p>
  <div class="list cards">${sk.length ? sk.map(s => `<div class="card"><h3>${esc(s.name)}</h3><p class="sub">Suggested ${C.fmtDate(s.suggestedAt)}</p>
    <div class="grid-2"><div class="field"><label for="cat-${s.id}">Category if approved</label><select id="cat-${s.id}">${C.SKILL_CATEGORIES.map(c => `<option>${c}</option>`).join("")}</select></div><div class="field"><label for="mg-${s.id}">Merge into</label><select id="mg-${s.id}">${active.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div></div>
    <div class="chips"><button class="btn solid small" data-act="skillApprove" data-id="${s.id}">Approve</button><button class="btn quiet small" data-act="skillMerge" data-id="${s.id}">Merge</button><button class="btn danger small" data-act="skillReject" data-id="${s.id}">Reject</button></div></div>`).join("") : `<div class="banner ok">${I.check}<span>No skill suggestions waiting.</span></div>`}</div>`;
};
VA.attention = () => {
  const li = C.lowInterest(db), flags = db.flags.filter(f => f.status === "Open");
  return `<h2>Needs with little or no interest</h2><p class="sub">Open ${C.LOW_INTEREST_DAYS}+ days with one or no interested volunteers. Step in and recruit directly.</p>
  <div class="list cards">${li.map(x => { const org = C.orgOf(db, x.opp), owner = db.members.find(m => m.orgId === org.id && m.role === "Owner") || {}; return `<div class="card"><span class="eyebrow">${esc(org.name)}</span><h3>${esc(x.opp.title)}</h3><div class="chips"><span class="chip bad">${x.days} days open</span><span class="chip">${x.interested} interested</span><span class="chip">${esc(x.opp.roleType)}</span></div><p class="sub">Contact: ${esc(owner.firstName + " " + owner.lastName)} · ${esc(owner.email)} · ${esc(owner.phone)}</p></div>`; }).join("") || `<div class="banner ok">${I.check}<span>Every open need has interest.</span></div>`}</div>
  <h2>Reported content</h2><div class="list cards">${flags.map(f => `<div class="card"><h3 style="font-size:15px">${esc(f.what)}</h3><p class="sub">${esc(f.reason)} · ${C.fmtDate(f.at)}</p><div class="chips"><button class="btn quiet small" data-act="flagKeep" data-id="${f.id}">Keep, close report</button><button class="btn danger small" data-act="flagRemove" data-id="${f.id}">${f.kind === "Posting" ? "Close posting" : "Deactivate account"}</button></div></div>`).join("") || `<div class="banner ok">${I.check}<span>No open reports.</span></div>`}</div>`;
};
VA.reports = () => {
  S.range = S.range || { from: C.addDays(today(), -90), to: today() };
  const s = C.reportStats(db, S.range.from, S.range.to), max = Math.max(1, ...s.byCause.map(c => c.needs));
  return `<h2>Reports</h2>
  <form data-form="range" class="row" style="flex-wrap:wrap;gap:8px;align-items:end"><div class="field"><label for="rfrom">From</label><input id="rfrom" type="date" value="${S.range.from}"></div><div class="field"><label for="rto">To</label><input id="rto" type="date" value="${S.range.to}"></div><button class="btn quiet small">Update</button></form>
  <div class="kpis"><div class="kpi"><b>${s.orgs}</b><span>Approved organizations (${s.orgsPending} pending)</span></div><div class="kpi"><b>${s.volunteers}</b><span>Active volunteers</span></div><div class="kpi"><b>${s.needs}</b><span>Needs posted</span></div><div class="kpi"><b>${s.connections}</b><span>Connections made</span></div><div class="kpi"><b>${s.roleSpotsFilled}/${s.roleSpotsPosted}</b><span>Volunteer spots filled</span></div><div class="kpi"><b>${s.hours}</b><span>Confirmed volunteer hours</span></div></div>
  <div class="card"><h3>Needs posted vs filled, by cause</h3>${s.byCause.map(c => `<div class="hbar"><div class="row"><span>${esc(c.cause)}</span><span class="sub" style="font-size:12.5px">${c.filled} filled / ${c.needs} posted</span></div><div class="track"><b style="width:${c.needs / max * 100}%"></b><b style="width:${c.filled / max * 100}%"></b></div></div>`).join("") || '<p class="sub">No needs posted in this period.</p>'}<p class="sub" style="font-size:12px">Light bar: needs posted. Dark bar: filled.</p></div>
  <div class="card"><h3>Export for newsletters and grants</h3><p class="sub">CSV files open in Excel or Google Sheets. They contain personal contact details, so store them securely.</p><div class="chips"><button class="btn quiet small" data-act="export" data-id="volunteers">Volunteers (CSV)</button><button class="btn quiet small" data-act="export" data-id="connections">Connections and hours (CSV)</button></div></div>`;
};
VA.matching = () => {
  if (!S.draftWeights) S.draftWeights = db.rules.map(r => ({ ...r }));
  const W = S.draftWeights, total = W.reduce((a, r) => a + (r.active ? r.weight : 0), 0);
  const vols = db.volunteers.filter(v => v.status === "Active");
  S.previewVol = S.previewVol && vols.some(v => v.id === S.previewVol) ? S.previewVol : vols[0] && vols[0].id;
  const now = C.volunteerFeed(db, S.previewVol).ranked.slice(0, 5), next = C.volunteerFeed(db, S.previewVol, W).ranked.slice(0, 5);
  const last = db.rules[0];
  return `<h2>Matching rules</h2><p class="sub">Transparent, rules-based scoring. Adjust how much each factor counts. Must-have rules always apply.</p>
  <div class="card">${W.map((r, i) => `<div class="slider"><label for="w${i}">${esc(r.criterion)}</label><output for="w${i}">${r.weight}</output><input id="w${i}" type="range" min="0" max="50" step="5" value="${r.weight}" data-act="weight" data-id="${i}"></div>`).join("")}
  <div class="row"><b>Total</b><span class="chip ${total === 100 ? "ok" : "warn"}" id="wtotal">${total} / 100</span></div>
  <p class="sub" style="font-size:12.5px">Last changed ${C.fmtDate(last.updatedAt)} by ${esc((db.administrators.find(a => a.id === last.updatedBy) || {}).firstName || "PCC")}.</p></div>
  <div class="card"><div class="field"><label for="pv">Preview the effect for</label><select id="pv" data-act="previewVol">${vols.map(v => `<option value="${v.id}" ${v.id === S.previewVol ? "selected" : ""}>${esc(v.firstName + " " + v.lastName)}</option>`).join("")}</select></div>
  <div class="grid-2"><div><h3>Now</h3><ol style="margin:0;padding-left:20px;font-size:14px">${now.map(x => `<li>${esc(x.opp.title)} <b>${x.score}</b></li>`).join("") || "<li>No matches</li>"}</ol></div><div><h3>With these weights</h3><ol style="margin:0;padding-left:20px;font-size:14px">${next.map(x => `<li>${esc(x.opp.title)} <b>${x.score}</b></li>`).join("") || "<li>No matches</li>"}</ol></div></div></div>
  <div class="note">${I.info}<span>Always excluded, whatever the weights: under minimum age, missing a required skill, background check not accepted, schedule conflict, too far away, or in-person/remote mismatch.</span></div>
  <div class="row"><button class="btn quiet" data-act="resetWeights">Undo changes</button><button class="btn solid" data-act="saveWeights" ${total === 100 ? "" : "disabled"}>Save weights</button></div>`;
};
VA.people = () => {
  const q = C.norm(S.peopleQ || "");
  const hit = s => !q || C.norm(s).includes(q);
  const vols = db.volunteers.filter(v => v.status !== "Deleted" && hit(v.firstName + " " + v.lastName + " " + v.email));
  const orgs = db.organizations.filter(o => hit(o.name));
  const opps = db.opportunities.filter(o => q && hit(o.title));
  return `<h2>People and organizations</h2>
  <div class="field narrow"><label for="pq">Search</label><input id="pq" type="search" data-act="peopleQ" value="${esc(S.peopleQ || "")}" placeholder="Name, email or organization"></div>
  <div class="card scroll-x"><h3>Volunteers (${vols.length})</h3><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Town</th><th>Status</th><th></th></tr></thead><tbody>${vols.map(v => `<tr><td>${esc(v.firstName + " " + v.lastName)}</td><td>${esc(v.email)}</td><td>${esc(C.cityOf(v.zip))}</td><td>${v.status}</td><td><button class="btn quiet small" data-act="toggleVol" data-id="${v.id}">${v.status === "Active" ? "Deactivate" : "Reactivate"}</button></td></tr>`).join("")}</tbody></table></div>
  <div class="card scroll-x"><h3>Organizations (${orgs.length})</h3><table class="tbl"><thead><tr><th>Name</th><th>Town</th><th>Status</th><th>Postings</th><th></th></tr></thead><tbody>${orgs.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.city)}</td><td>${o.status}</td><td>${db.opportunities.filter(x => x.orgId === o.id).length}</td><td>${o.status === "Approved" ? `<button class="btn quiet small" data-act="suspendOrg" data-id="${o.id}">Suspend</button>` : o.status === "Suspended" ? `<button class="btn quiet small" data-act="unsuspendOrg" data-id="${o.id}">Restore</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
  ${opps.length ? `<div class="card scroll-x"><h3>Postings</h3><table class="tbl"><tbody>${opps.map(o => `<tr><td>${esc(o.title)}</td><td>${esc(C.orgOf(db, o).name)}</td><td>${o.status}</td><td>${o.status !== "Closed" ? `<button class="btn danger small" data-act="adminClose" data-id="${o.id}">Close</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
  <div class="card scroll-x"><h3>Activity log</h3><p class="sub">Every approval, rule change and moderation action, newest first.</p><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>${db.audit.slice().reverse().slice(0, 40).map(a => { const who = a.actorType === "admin" ? (db.administrators.find(x => x.id === a.actorId) || {}).firstName : a.actorType === "member" ? (db.members.find(x => x.id === a.actorId) || {}).firstName : a.actorType === "volunteer" ? "Volunteer" : "System"; return `<tr><td>${esc(C.fmtDate(a.at))}</td><td>${esc(who || a.actorType)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`; }).join("") || '<tr><td colspan="4">No activity yet.</td></tr>'}</tbody></table></div>`;
};

/* ---------- Training tools ---------- */
async function trainingSheet() {
  const code = await C.totp(db.administrators[0].mfaSecret);
  const mfaMembers = db.members.filter(m => m.mfaEnabled && m.mfaSecret);
  const memberCodes = await Promise.all(mfaMembers.map(async m => `<li>${esc(m.firstName)} (${esc(m.email)}): <span class="cred">${await C.totp(m.mfaSecret)}</span></li>`));
  const acct = [["Volunteer", "jordan@example.com", "Jordan Ellis, full profile with a connection"], ["Volunteer", "maya@example.com", "Maya Thompson, waiting on the pantry"], ["Volunteer", "ana@example.com", "Ana Reyes, has an invitation"], ["Organization Owner", "renee@gcpantry.example.org", "Greenville Community Pantry"], ["Organization Editor", "omar@gcpantry.example.org", "Greenville Community Pantry"], ["Organization (pending)", "gloria@encliteracy.example.org", "Awaiting PCC approval"], ["PCC admin", "nichole@pcc.example.org", "Requires the 6-digit code below"]];
  sheet(`<h2 id="sheetTitle">Training tools</h2><p class="sub">For training sessions only. Everything is saved in this browser, so each trainee has their own copy.</p>
    <div class="card"><h3>Demo accounts</h3><p class="sub">Every demo password is <span class="cred">Training2026!</span></p><table class="tbl"><tbody>${acct.map(([r, e, n]) => `<tr><td>${r}</td><td><button class="linkish" data-act="fillLogin" data-id="${e}">${e}</button><br><span class="sub">${n}</span></td></tr>`).join("")}</tbody></table></div>
    <div class="card"><h3>Admin sign-in code</h3><p class="code-big" aria-live="polite">${code}</p><p class="sub">Changes every 30 seconds, like an authenticator app. Reopen this panel for a fresh code.</p>${memberCodes.length ? `<p class="sub">Organization members with two-step sign-in on:</p><ul>${memberCodes.join("")}</ul>` : ""}</div>
    <div class="card"><h3>Practice clock</h3><p class="sub">Move the system date forward to practice expiring postings. Today is ${C.fmtDate(today())}${db.settings.clockOffsetDays ? ` (${db.settings.clockOffsetDays} days ahead)` : ""}.</p><div class="chips"><button class="btn quiet small" data-act="clock" data-id="7">+7 days</button><button class="btn quiet small" data-act="clock" data-id="30">+30 days</button><button class="btn quiet small" data-act="clock" data-id="0">Back to real date</button></div></div>
    <div class="card"><h3>Data</h3><div class="chips"><button class="btn quiet small" data-act="backup">Download a backup (JSON)</button><label class="btn quiet small" style="cursor:pointer">Restore a backup<input type="file" accept="application/json" data-act="restore" class="sr"></label><button class="btn danger small" data-act="resetAsk">Reset to fresh training data</button></div></div>
    <button class="btn solid" data-act="closeSheet">Close</button>`);
}

/* ---------- Actions ---------- */
/** Checks the idle timeout before recording activity. Returns false if the session just expired. */
function touch() {
  if (!S.session) return true;
  if (Date.now() - S.session.lastActive > C.SESSION_IDLE_MIN * 60000) { signOut("You were signed out after 30 minutes without activity."); return false; }
  S.session.lastActive = Date.now(); saveSession(); return true;
}
function signOut(msg) { S.session = null; S.tab = "home"; S.pub = msg ? "signin" : "landing"; S.wizard = S.form = S.openConn = S.mfaPending = S.draftWeights = null; S.errors = {}; S.notice = msg || ""; saveSession(); sheet(""); render(); }
function startSession(sess) { sess.lastActive = Date.now(); S.session = sess; S.tab = "home"; S.pub = "landing"; S.errors = {}; S.notice = ""; S.mfaPending = null; saveSession(); }
function run(fn, okMsg) {
  try { const r = fn(); save(); if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg); render(); return r; }
  catch (e) { if (e.userFacing) { toast(e.message); render(); } else if (e.fields) { S.errors = e.fields; render(); } else { console.error(e); toast("Something went wrong. Please try again."); } }
}
async function download(name, text, type) {
  try { const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; if (dl) { await dl.save({ filename: name, data: text }); return; } } catch (e) { if (e && e.code === "declined") return; }
  try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  catch { sheet(`<h2 id="sheetTitle">${esc(name)}</h2><p class="sub">Copy this text into a file.</p><textarea style="min-height:240px">${esc(text)}</textarea><button class="btn solid" data-act="closeSheet">Close</button>`); }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-tab],[data-act],button[data-device],[data-size]");
  if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
  if (!touch()) return;
  if (b.dataset.device) { S.device = b.dataset.device; return render(); }
  if (b.dataset.size) { document.documentElement.style.setProperty("--scale", b.dataset.size); document.querySelectorAll("[data-size]").forEach(x => x.setAttribute("aria-pressed", x === b)); return; }
  if (b.dataset.tab) {
    S.tab = b.dataset.tab; S.wizard = null; S.openConn = null; S.errors = {}; S.notice = "";
    if (S.tab !== "post") S.form = null;
    if (S.tab !== "matching") S.draftWeights = null;
    if (S.tab === "inbox") { render(); myNotifs().forEach(n => { if (!n.readAt) n.readAt = C.nowStamp(db); }); save(); return; }
    return render();
  }
  const a = b.dataset.act, id = b.dataset.id, ses = S.session;
  const o = id && db.opportunities.find(x => x.id === id);
  switch (a) {
    case "closeSheet": if (b.classList.contains("sheet-wrap") && e.target !== b) return; sheet(""); return;
    case "training": return trainingSheet();
    case "fillLogin": sheet(""); S.session = null; S.mfaPending = null; S.wizard = null; S.pub = "signin"; S.errors = {}; render(); $("#si-email").value = id; $("#si-pw").value = "Training2026!"; $("#si-pw").focus(); return;
    case "clock": db.settings.clockOffsetDays = id === "0" ? 0 : (db.settings.clockOffsetDays || 0) + +id; { const n = C.sweepExpired(db); save(); sheet(""); toast(`Practice date is now ${C.fmtDate(today())}.${n ? ` ${n} posting(s) expired.` : ""}`); } return render();
    case "backup": return download(`voluntr-backup-${today()}.json`, JSON.stringify(db, null, 1), "application/json");
    case "resetAsk": sheet(`<h2 id="sheetTitle">Reset training data?</h2><p class="sub">This replaces everything in this browser with the original training data and signs you out.</p><div class="row"><button class="btn quiet" data-act="closeSheet">Cancel</button><button class="btn danger" data-act="reset">Reset</button></div>`); return;
    case "reset": db = await C.seed(); save(); sheet(""); signOut(); toast("Training data reset."); return;
    case "goSignin": S.pub = "signin"; S.wizard = null; S.errors = {}; S.notice = ""; return render();
    case "goLanding": S.pub = "landing"; S.wizard = null; S.reg = null; S.errors = {}; return render();
    case "goOrgReg": S.pub = "orgreg"; S.wizard = null; S.errors = {}; S.reg = S.reg || { name: "", mission: "", causes: [], zip: "", website: "", ein: "", firstName: "", lastName: "", email: "", phone: "", password: "", terms: false }; return render();
    case "signOut": return signOut();
    case "terms": sheet(`<h2 id="sheetTitle">Terms & privacy</h2><p class="sub" style="color:var(--ink)">Your contact details stay private until you and an organization both agree to connect. Before that, organizations see only your first name, skills, causes, free times and town. PCC does not screen, vet or supervise volunteers or organizations; organizations are responsible for their own screening and supervision. Volunteers must be 18 or older. You can delete your account at any time from your profile, which removes your personal details. PCC keeps anonymous totals for reports.</p><button class="btn solid" data-act="closeSheet">Close</button>`); return;
    case "wizardNew": S.wizard = newWizard(null); S.errors = {}; S.skillQuery = ""; return render();
    case "editProfile": S.wizard = newWizard(me()); S.wizard.step = +(b.dataset.step || 1); S.errors = {}; S.skillQuery = ""; return render();
    case "wizardClose": S.wizard = null; S.errors = {}; return render();
    case "wback": S.wizard.step--; S.errors = {}; return render();
    case "wgo": S.wizard.step = +b.dataset.step; S.errors = {}; return render();
    case "pick": { const obj = scopeObj(b.dataset.scope), arr = obj[b.dataset.key], v = b.dataset.val, i = arr.indexOf(v); i > -1 ? arr.splice(i, 1) : arr.push(v); b.setAttribute("aria-pressed", i === -1); if (b.dataset.scope === "wizard") refreshSummary(); return; }
    case "one": { const obj = scopeObj(b.dataset.scope); obj[b.dataset.key] = b.dataset.val; if (b.dataset.key === "format") return render(); b.parentElement.querySelectorAll("button").forEach(x => { const on = x === b; x.setAttribute("aria-pressed", on); x.setAttribute("aria-checked", on); }); return; }
    case "slot": { const obj = scopeObj(b.dataset.scope), arr = obj.slots, v = b.dataset.val, i = arr.indexOf(v); i > -1 ? arr.splice(i, 1) : arr.push(v); b.setAttribute("aria-pressed", i === -1); b.textContent = i === -1 ? "✓" : ""; if (b.dataset.scope === "wizard") refreshSummary(); return; }
    case "pickSkill": { const obj = scopeObj(b.dataset.scope), i = obj.skills.indexOf(id || b.dataset.val), v = b.dataset.val; i > -1 ? obj.skills.splice(i, 1) : obj.skills.push(v); b.setAttribute("aria-pressed", i === -1); if (b.dataset.scope === "wizard") refreshSummary(); return; }
    case "tri": { const arr = S.form.skills, v = b.dataset.val, k = arr.find(x => x.skillId === v); if (!k) arr.push({ skillId: v, required: false }); else if (!k.required) k.required = true; else arr.splice(arr.indexOf(k), 1); return render(); }
    case "suggestSkill": { const obj = scopeObj(b.dataset.scope); const r = run(() => C.suggestSkill(db, S.session, S.skillQuery)); if (!r) return; if (b.dataset.scope === "form") { if (!obj.skills.some(k => k.skillId === r.skill.id)) obj.skills.push({ skillId: r.skill.id, required: false }); } else if (!obj.skills.includes(r.skill.id)) obj.skills.push(r.skill.id); if (!r.existing) obj.pendingSkills.push(r.skill.id); S.skillQuery = ""; save(); toast(r.existing ? `“${r.skill.name}” is already on the list, so we picked it for you.` : `Thanks! PCC will review “${r.skill.name}”.`); return render(); }
    // volunteer
    case "pass": return run(() => C.notForMe(db, ses, id), "Got it. We won't show that one again.");
    case "save": return run(() => { const on = C.toggleSave(db, ses, id); if (on) S.deckIdx++; return on; }, on => on ? "Saved for later" : "Removed from saved");
    case "unsave": return run(() => C.toggleSave(db, ses, id), "Removed from saved");
    case "interest": return run(() => C.expressInterest(db, ses, id), () => `Interest sent to ${C.orgOf(db, o).name}. We'll email you when they respond.`);
    case "deckNext": S.deckIdx++; return render();
    case "deckPrev": S.deckIdx = Math.max(0, S.deckIdx - 1); return render();
    case "why": { const h = C.volunteerFeed(db, ses.id).hidden; sheet(`<h2 id="sheetTitle">Hidden opportunities</h2><p class="sub">These don't meet a must-have, so they never appear as matches. Changing your preferences may open some up.</p>${h.map(x => `<div class="card"><h3>${esc(x.opp.title)}</h3><p class="sub">${esc(C.orgOf(db, x.opp).name)}</p><span class="chip bad">${esc(x.reason)}</span></div>`).join("")}<button class="btn solid" data-act="closeSheet">Close</button>`); return; }
    case "report": sheet(`<h2 id="sheetTitle">Report this posting</h2><form data-form="report" data-id="${id}" data-kind="${esc(b.dataset.kind)}" class="list"><div class="field"><label for="rr">What's wrong?</label><textarea id="rr" placeholder="For example: it asks for money, or looks like a job ad"></textarea></div><div class="row"><button type="button" class="btn quiet" data-act="closeSheet">Cancel</button><button class="btn solid">Send to PCC</button></div></form>`); return;
    case "withdraw": return run(() => C.withdrawInterest(db, ses, id), "Interest withdrawn.");
    case "invYes": return run(() => C.respondToInvite(db, ses, id, true), "Connected! Contact details are now shared.");
    case "invNo": return run(() => C.respondToInvite(db, ses, id, false), "Declined. The organization has been told.");
    case "openConn": S.openConn = id; S.errors = {}; return render();
    case "closeConn": S.openConn = null; S.errors = {}; return render();
    case "deleteAsk": sheet(`<h2 id="sheetTitle">Delete your account?</h2><p class="sub">This removes your name, contact details, preferences, saved items and messages. It can't be undone.</p><div class="row"><button class="btn quiet" data-act="closeSheet">Keep my account</button><button class="btn danger" data-act="deleteYes">Delete my account</button></div>`); return;
    case "deleteYes": run(() => C.deleteVolunteer(db, ses, ses.id)); sheet(""); signOut(); toast("Your account was deleted."); return;
    // organization
    case "newPost": S.tab = "post"; S.form = blankOpp(); S.errors = {}; S.skillQuery = ""; return render();
    case "editPost": S.tab = "post"; S.form = { ...JSON.parse(JSON.stringify(o)), pendingSkills: [] }; S.errors = {}; S.skillQuery = ""; return render();
    case "repost": { const c = JSON.parse(JSON.stringify(o)); delete c.id; const t = today(); Object.assign(c, { startDate: C.addDays(t, 14), expires: C.addDays(t, 13), pendingSkills: [] }); S.form = c; S.tab = "post"; S.errors = {}; toast(`Copied “${o.title}” into a new posting. Check the dates.`); return render(); }
    case "cancelPost": S.form = null; S.errors = {}; S.tab = "postings"; return render();
    case "oppStatus": return run(() => C.setOppStatus(db, ses, id, b.dataset.status), r => ({ Active: "Resumed. Back in matching.", Paused: "Paused. Hidden from matching until you resume.", Filled: "Marked filled. Removed from matching.", Closed: "Closed. Removed from matching." })[r.status]);
    case "review": S.reviewFor = id; S.tab = "review"; return render();
    case "accept": return run(() => C.orgDecide(db, ses, id, true), () => "Connected. You both got an email, and contact details are now shared.");
    case "decline": return run(() => C.orgDecide(db, ses, id, false), "Declined. The volunteer will be told kindly.");
    case "invite": return run(() => C.orgInvite(db, ses, S.reviewFor, id), "Interest sent. The volunteer will see it in Connections.");
    case "hrsOk": return run(() => C.confirmHours(db, ses, id, true), "Hours confirmed.");
    case "hrsNo": return run(() => C.confirmHours(db, ses, id, false), "Marked as not right. The volunteer was told.");
    case "deactivateMember": return run(() => { if (!C.can(db, ses, "org.manageTeam")) throw Object.assign(new Error("Only an Owner can manage the team."), { userFacing: true }); const m = db.members.find(x => x.id === id); if (m.role === "Owner" && db.members.filter(x => x.orgId === m.orgId && x.role === "Owner" && x.status === "Active").length < 2) throw Object.assign(new Error("Every organization needs at least one active Owner."), { userFacing: true }); m.status = "Deactivated"; C.audit(db, ses, "member.deactivate", m.email); }, "Member deactivated. Their past postings stay on record.");
    case "mfaOn": { const u = me(); u.pendingMfa = C.randomBase32(16); save(); const code = await C.totp(u.pendingMfa); sheet(`<h2 id="sheetTitle">Turn on two-step sign-in</h2><p class="sub">Add this key to an authenticator app (Google Authenticator, Microsoft Authenticator or similar), then enter the 6-digit code it shows.</p><p class="cred" style="font-size:16px">${u.pendingMfa.replace(/(.{4})/g, "$1 ")}</p><p class="sub">Training: the current code is <b>${code}</b>.</p><form data-form="mfaSetup" class="list"><div class="field"><label for="mcode">6-digit code</label><input id="mcode" type="text" inputmode="numeric" maxlength="6"></div><button class="btn solid">Turn on</button></form>`); return; }
    case "mfaOff": return run(() => { const u = me(); u.mfaEnabled = false; u.mfaSecret = null; C.audit(db, ses, "member.mfaOff", u.email); }, "Two-step sign-in is off.");
    // admin
    case "approveOrg": return run(() => C.decideOrg(db, ses, id, true), r => `${r.name} approved. Their team was emailed.`);
    case "rejectOrgAsk": sheet(`<h2 id="sheetTitle">Reject this organization?</h2><form data-form="rejectOrg" data-id="${id}" class="list"><div class="field"><label for="rjr">Reason (sent to the organization)</label><textarea id="rjr">This organization is already registered. Please ask its Owner to add you as a team member.</textarea></div><div class="row"><button type="button" class="btn quiet" data-act="closeSheet">Cancel</button><button class="btn danger">Reject</button></div></form>`); return;
    case "skillApprove": return run(() => C.reviewSkill(db, ses, id, "approve", null, $("#cat-" + id).value), "Skill approved and added to the list.");
    case "skillMerge": return run(() => C.reviewSkill(db, ses, id, "merge", $("#mg-" + id).value), r => `Merged into “${C.skillName(db, r.mergedInto)}”.`);
    case "skillReject": return run(() => C.reviewSkill(db, ses, id, "reject"), "Suggestion rejected.");
    case "flagKeep": return run(() => { const f = db.flags.find(x => x.id === id); f.status = "Kept"; C.audit(db, ses, "flag.keep", f.what); }, "Kept. Report closed.");
    case "flagRemove": return run(() => { if (!C.can(db, ses, "admin")) throw new Error("no"); const f = db.flags.find(x => x.id === id); f.status = "Actioned"; if (f.kind === "Posting") C.setOppStatus(db, ses, f.targetId, "Closed"); else { const v = db.volunteers.find(x => x.id === f.targetId); if (v) v.status = "Deactivated"; } C.audit(db, ses, "flag.action", f.what); }, "Done. The report is closed.");
    case "export": { if (!C.can(db, ses, "admin")) return; const text = id === "volunteers" ? C.exportVolunteers(db) : C.exportConnections(db); C.audit(db, ses, "export", id); save(); return download(`voluntr-${id}-${today()}.csv`, text, "text/csv"); }
    case "resetWeights": S.draftWeights = null; return render();
    case "saveWeights": return run(() => { C.saveWeights(db, ses, S.draftWeights); S.draftWeights = null; }, "Weights saved. Matches re-rank right away.");
    case "toggleVol": return run(() => { if (!C.can(db, ses, "admin")) throw new Error("no"); const v = db.volunteers.find(x => x.id === id); v.status = v.status === "Active" ? "Deactivated" : "Active"; C.audit(db, ses, "volunteer." + v.status.toLowerCase(), v.email); return v; }, v => `${v.firstName} is now ${v.status.toLowerCase()}.`);
    case "suspendOrg": case "unsuspendOrg": return run(() => { const g = db.organizations.find(x => x.id === id); g.status = a === "suspendOrg" ? "Suspended" : "Approved"; C.audit(db, ses, "org." + (a === "suspendOrg" ? "suspend" : "restore"), g.name); return g; }, g => `${g.name} is now ${g.status.toLowerCase()}.`);
    case "adminClose": return run(() => C.setOppStatus(db, ses, id, "Closed"), "Posting closed.");
    case "readAll": myNotifs().forEach(n => { if (!n.readAt) n.readAt = C.nowStamp(db); }); save(); return render();
    default: return;
  }
});
function refreshSummary() { const aside = document.querySelector(".two-col aside .sum"); if (aside) aside.outerHTML = wSummary(S.wizard, false); }

document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.act === "weight") { S.draftWeights[+t.dataset.id].weight = +t.value; const pos = t.id; render(); const el = document.getElementById(pos); el && el.focus(); return; }
  if (t.dataset.act === "skillq") { S.skillQuery = t.value; const pos = t.selectionStart; render(); const el = $("#skq"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if (t.dataset.act === "peopleQ") { S.peopleQ = t.value; render(); const el = $("#pq"); if (el) { el.focus(); el.setSelectionRange(t.value.length, t.value.length); } return; }
  const obj = t.dataset.bind && scopeObj(t.dataset.scope);
  if (obj) { obj[t.dataset.bind] = t.type === "checkbox" ? t.checked : t.type === "range" ? +t.value : t.value; if (t.dataset.bind === "radius") $("#wrv").textContent = t.value; if (t.dataset.scope === "wizard") refreshSummary(); if (t.dataset.bind === "flexible") render(); }
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset.act === "reviewFor") { S.reviewFor = t.value; render(); }
  if (t.dataset.act === "previewVol") { S.previewVol = t.value; render(); }
  if (t.dataset.act === "restore" && t.files[0]) {
    try { const data = C.migrate(JSON.parse(await t.files[0].text())); if (!data) throw new Error("bad"); db = data; save(); sheet(""); signOut(); toast("Backup restored."); }
    catch { toast("That file isn't a VOLUNTR backup."); }
  }
  const obj = t.dataset.bind && scopeObj(t.dataset.scope);
  if (obj && t.tagName === "SELECT") { obj[t.dataset.bind] = t.value; if (t.dataset.scope === "wizard") refreshSummary(); }
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  if (!touch()) return;
  const f = e.target.dataset.form, ses = S.session;
  if (f === "signin") {
    S.errors = {};
    S.lastEmail = $("#si-email").value;
    try { const r = await C.login(db, $("#si-email").value, $("#si-pw").value); save(); if (r.needsMfa) { S.session = r.session; S.mfaPending = true; saveSession(); } else { startSession(r.session); toast(`Welcome back, ${r.user.firstName}.`); } }
    catch (x) { save(); S.errors = { login: x.userFacing ? x.message : "Sign-in failed." }; }
    return render();
  }
  if (f === "mfa") {
    const u = me(), secret = u.mfaSecret, ok = await C.verifyTotp(secret, $("#code").value);
    if (!ok) { S.errors = { mfa: "That code didn't work. Codes change every 30 seconds, so enter the newest one." }; return render(); }
    S.session.mfa = true; startSession(S.session); C.audit(db, S.session, "signin.mfa", u.email); save(); toast(`Welcome, ${u.firstName}.`); return render();
  }
  if (f === "mfaSetup") {
    const u = me(); if (!(await C.verifyTotp(u.pendingMfa, $("#mcode").value))) { toast("That code didn't match. Try the newest code."); return; }
    u.mfaSecret = u.pendingMfa; u.mfaEnabled = true; delete u.pendingMfa; C.audit(db, ses, "member.mfaOn", u.email); save(); sheet(""); toast("Two-step sign-in is on. You'll need a code next time you sign in."); return render();
  }
  if (f === "wizard") {
    const w = S.wizard;
    S.errors = w.step === 0 ? C.validateVolunteer(db, w, { requirePassword: !w.editing, requireTerms: !w.editing }) : [1, 2, 4].includes(w.step) ? C.validatePreferences(w, w.step) : {};
    if (Object.keys(S.errors).length) return render();
    if (w.step < WSTEPS.length - 1) { w.step++; S.skillQuery = ""; return render(); }
    const all = { ...C.validateVolunteer(db, w, { requirePassword: !w.editing, requireTerms: !w.editing }), ...C.validatePreferences(w) };
    if (Object.keys(all).length) { S.errors = all; return render(); }
    const fields = ["firstName", "lastName", "email", "phone", "dob", "zip", "causes", "roles", "bgWilling", "skills", "certs", "languages", "physical", "slots", "commitments", "format", "radius", "season"];
    if (w.editing) {
      const v = me(); fields.forEach(k => { v[k] = typeof w[k] === "string" ? w[k].trim() : w[k]; });
      C.audit(db, ses, "volunteer.update", v.email); save(); S.wizard = null; S.tab = "profile"; toast("Preferences saved. Your matches have been updated."); return render();
    }
    const v = { id: C.uid("vol"), status: "Active", createdAt: today() };
    fields.forEach(k => { v[k] = typeof w[k] === "string" ? w[k].trim() : w[k]; });
    v.salt = C.randomHex(16); v.pwHash = await C.hashPassword(w.password, v.salt);
    db.volunteers.push(v);
    db.skills.filter(s => w.pendingSkills.includes(s.id)).forEach(s => { s.suggestedBy = "volunteer:" + v.id; });
    C.notify(db, "volunteer", v.id, "Welcome", `Welcome to VOLUNTR, ${v.firstName}! Your best matches are ready in Discover.`);
    C.audit(db, { type: "volunteer", id: v.id }, "volunteer.signup", v.email);
    save(); S.wizard = null; startSession({ type: "volunteer", id: v.id, mfa: true }); S.tab = "discover"; S.deckIdx = 0;
    toast("Welcome! Your profile is ready. Here are your best matches."); return render();
  }
  if (f === "orgreg") {
    const r = S.reg; S.errors = C.validateOrgRegistration(db, r);
    if (Object.keys(S.errors).length) return render();
    const org = { id: C.uid("org"), name: r.name.trim(), short: r.name.trim().split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 3).map(w => w[0].toUpperCase()).join(""), mission: r.mission.trim(), causes: r.causes, zip: r.zip, city: C.cityOf(r.zip), website: r.website.trim(), ein: r.ein.trim(), status: "Pending", submittedAt: today(), approvedBy: null, approvedAt: null, note: "", decisionNote: "" };
    const m = { id: C.uid("mem"), orgId: org.id, firstName: r.firstName.trim(), lastName: r.lastName.trim(), email: r.email.trim(), phone: r.phone.trim(), role: "Owner", mfaEnabled: false, mfaSecret: null, status: "Active", createdAt: today() };
    m.salt = C.randomHex(16); m.pwHash = await C.hashPassword(r.password, m.salt);
    db.organizations.push(org); db.members.push(m);
    db.administrators.forEach(a => C.notify(db, "admin", a.id, "OrgPending", `${org.name} registered and is waiting for approval.`));
    C.audit(db, { type: "member", id: m.id }, "org.register", org.name);
    save(); S.reg = null; startSession({ type: "member", id: m.id, orgId: org.id, mfa: true }); toast("Thanks! PCC will review your organization soon."); return render();
  }
  if (f === "post") {
    S.errors = {};
    const data = { ...S.form, needed: +S.form.needed, minAge: +S.form.minAge };
    const r = run(() => C.saveOpportunity(db, ses, data));
    if (r) { db.skills.filter(s => (S.form.pendingSkills || []).includes(s.id)).forEach(s => { s.suggestedBy = "member:" + ses.id; }); save(); const n = C.candidatesFor(db, r.id).length; S.form = null; S.tab = "postings"; toast(data.id ? "Changes saved." : `“${r.title}” is live. ${n} volunteer${n === 1 ? "" : "s"} match it.`); render(); }
    return;
  }
  if (f === "msg") { const v = $("#msgIn").value; run(() => C.sendMessage(db, ses, S.openConn, v)); return; }
  if (f === "hours") { S.errors = {}; run(() => C.logHours(db, ses, S.openConn, $("#hd").value, $("#hh").value), "Hours sent to the organization to confirm."); return; }
  if (f === "report") { const t = e.target, txt = $("#rr").value.trim(); if (txt.length < 5) { toast("Tell PCC a little about the problem."); return; } const o = db.opportunities.find(x => x.id === t.dataset.id); db.flags.push({ id: C.uid("flg"), kind: t.dataset.kind, targetId: t.dataset.id, what: `Posting: ${o.title}`, reason: txt.slice(0, 300), at: today(), status: "Open" }); db.administrators.forEach(a => C.notify(db, "admin", a.id, "Flag", `A posting was reported: ${o.title}`)); save(); sheet(""); toast("Thanks. PCC will take a look."); return; }
  if (f === "rejectOrg") { const id = e.target.dataset.id, reason = $("#rjr").value; const r = run(() => C.decideOrg(db, ses, id, false, reason), "Organization rejected and told why."); if (r) sheet(""); return; }
  if (f === "range") { S.range = { from: $("#rfrom").value, to: $("#rto").value }; return render(); }
  if (f === "orgprofile") {
    const org = myOrg(), d = { mission: $("#om").value.trim(), website: $("#ow").value.trim(), zip: $("#oz").value };
    S.errors = {}; if (d.mission.length < 20) S.errors.mission = "Describe the mission in at least 20 characters."; if (!C.V.url(d.website)) S.errors.website = "Enter a web address like example.org."; if (!C.V.zip(d.zip)) S.errors.zip = "Choose a ZIP code.";
    if (Object.keys(S.errors).length) return render();
    run(() => { if (!C.can(db, ses, "org.editProfile")) throw Object.assign(new Error("Only an Owner can edit."), { userFacing: true }); Object.assign(org, d, { city: C.cityOf(d.zip) }); C.audit(db, ses, "org.update", org.name); }, "Organization details saved."); return;
  }
  if (f === "addMember") {
    const d = { firstName: $("#amf").value.trim(), lastName: $("#aml").value.trim(), email: $("#ame").value.trim(), role: $("#amr").value, pw: $("#amp").value };
    S.errors = {}; if (!d.firstName) S.errors.amFirst = "Enter a first name."; if (!d.lastName) S.errors.amLast = "Enter a last name."; if (!C.V.email(d.email)) S.errors.amEmail = "Enter a valid email."; else if (C.emailInUse(db, d.email)) S.errors.amEmail = "An account already uses this email."; if (!C.V.password(d.pw)) S.errors.amPw = "Use at least 10 characters with a letter and a number.";
    if (Object.keys(S.errors).length || !C.can(db, ses, "org.manageTeam")) return render();
    const m = { id: C.uid("mem"), orgId: me().orgId, firstName: d.firstName, lastName: d.lastName, email: d.email, phone: "", role: d.role, mfaEnabled: false, mfaSecret: null, status: "Active", createdAt: today() };
    m.salt = C.randomHex(16); m.pwHash = await C.hashPassword(d.pw, m.salt); db.members.push(m); C.audit(db, ses, "member.add", m.email); save(); toast(`${m.firstName} can now sign in with ${m.email}.`); return render();
  }
});
addEventListener("resize", () => { if (!S.device) render(); });
setInterval(() => { if (S.session && Date.now() - S.session.lastActive > C.SESSION_IDLE_MIN * 60000) signOut("You were signed out after 30 minutes without activity."); }, 60000);

/* ---------- Boot ---------- */
(async function boot() {
  let loaded = null;
  try { loaded = C.migrate(JSON.parse(store.get(DB_KEY) || "null")); } catch { loaded = null; }
  db = loaded || await C.seed();
  if (C.sweepExpired(db) || !loaded) save();
  try { const s = JSON.parse(store.get(SES_KEY, true) || "null"); if (s && (s.type === "volunteer" ? db.volunteers : s.type === "member" ? db.members : db.administrators).some(u => u.id === s.id && u.status === "Active")) S.session = s; } catch { /* no session */ }
  window.__voluntr = { get db() { return db; }, S, C };
  render();
})();
})();
