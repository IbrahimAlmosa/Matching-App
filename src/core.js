/* =====================================================================
   VOLUNTR core (Sprint 4 working system)
   Data layer, business rules, matching engine, auth helpers.
   Pure functions over a `db` object whose tables follow the revised
   Sprint 2 ERD (19 entities). Runs in the browser and in Node (tests).
   ===================================================================== */
(function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const PBKDF2_ITERATIONS = 50000;
  const SESSION_IDLE_MIN = 30;
  const LOCKOUT_ATTEMPTS = 5;
  const LOCKOUT_MIN = 15;
  const LOW_INTEREST_DAYS = 10;
  const HELPLINE = "(252) 555-0100";

  /* ---------- Reference lists (D6 Reference Data) ---------- */
  const CAUSES = ["Hunger & food security", "Youth & education", "Health", "Housing", "Arts & culture", "Seniors", "Foster care", "Community spaces"];
  const ROLE_TYPES = ["Board / committee service", "Event support", "Marketing or design help", "Professional / pro bono expertise", "Hands-on labor", "Mentoring", "Administrative support"];
  const COMMITMENTS = ["One-time", "Short-term project", "Ongoing / recurring"];
  const FORMATS = ["In person", "Remote", "Hybrid"];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const TIMES = ["Morning", "Afternoon", "Evening"];
  const SKILL_CATEGORIES = ["Finance", "Communications", "Education", "Food service", "Trades", "Languages", "Events", "Administration", "Other"];

  // Approximate ZIP centroids for the PCC service area (used for distance).
  const ZIPS = {
    "27858": { city: "Greenville", lat: 35.573, lon: -77.330 },
    "27834": { city: "Greenville", lat: 35.650, lon: -77.380 },
    "27833": { city: "Greenville", lat: 35.613, lon: -77.373 },
    "28590": { city: "Winterville", lat: 35.529, lon: -77.401 },
    "28513": { city: "Ayden", lat: 35.473, lon: -77.416 },
    "27828": { city: "Farmville", lat: 35.596, lon: -77.585 },
    "27837": { city: "Grimesland", lat: 35.563, lon: -77.193 },
    "27812": { city: "Bethel", lat: 35.807, lon: -77.378 },
    "27879": { city: "Simpson", lat: 35.575, lon: -77.278 },
    "27829": { city: "Fountain", lat: 35.672, lon: -77.636 },
    "28530": { city: "Grifton", lat: 35.372, lon: -77.437 },
    "27884": { city: "Stokes", lat: 35.711, lon: -77.271 },
    "27811": { city: "Bellarthur", lat: 35.585, lon: -77.509 },
    "28586": { city: "Vanceboro", lat: 35.303, lon: -77.156 }
  };

  /* ---------- Small utilities ---------- */
  const pad = n => String(n).padStart(2, "0");
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const fmtDate = s => s ? parseDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  function today(db) {
    const base = isoDate(new Date());
    return db && db.settings && db.settings.clockOffsetDays ? addDays(base, db.settings.clockOffsetDays) : base;
  }
  function nowStamp(db) { return today(db) + "T" + new Date().toTimeString().slice(0, 5); }

  function ageOn(dob, onDate) {
    const b = parseDate(dob), t = parseDate(onDate);
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
  }
  function milesBetween(z1, z2) {
    const a = ZIPS[z1], b = ZIPS[z2];
    if (!a || !b) return null;
    const R = 3958.8, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
  }
  const cityOf = zip => (ZIPS[zip] || {}).city || "Pitt County";

  /* ---------- Validation ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const V = {
    email: e => EMAIL_RE.test(String(e || "").trim()),
    password: p => typeof p === "string" && p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p),
    zip: z => Object.prototype.hasOwnProperty.call(ZIPS, String(z || "")),
    phone: p => !p || /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(String(p).trim()),
    url: u => !u || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(String(u).trim()),
    ein: e => !e || /^\d{2}-?\d{7}$/.test(String(e).trim())
  };

  function emailInUse(db, email, exceptId) {
    const e = norm(email);
    return [...db.volunteers, ...db.members, ...db.administrators].some(u => norm(u.email) === e && u.id !== exceptId && u.status !== "Deleted");
  }

  /** Validates volunteer sign-up/profile data. Returns {field: message}. */
  function validateVolunteer(db, v, opts = {}) {
    const err = {};
    const t = today(db);
    if (!String(v.firstName || "").trim()) err.firstName = "Enter your first name.";
    if (!String(v.lastName || "").trim()) err.lastName = "Enter your last name.";
    if (!V.email(v.email)) err.email = "Enter a valid email address, like name@example.com.";
    else if (emailInUse(db, v.email, v.id)) err.email = "An account already uses this email. Sign in instead, or use a different email.";
    if (!V.phone(v.phone)) err.phone = "Enter a 10-digit phone number, or leave it blank.";
    if (!v.dob) err.dob = "Enter your date of birth.";
    else if (parseDate(v.dob) > parseDate(t)) err.dob = "Date of birth can't be in the future.";
    else if (ageOn(v.dob, t) < 18) err.dob = "VOLUNTR is for volunteers 18 and older right now. Call PCC to hear about family-friendly events.";
    if (!V.zip(v.zip)) err.zip = "Enter a Pitt County area ZIP code, such as 27858.";
    if (opts.requirePassword && !V.password(v.password)) err.password = "Use at least 10 characters, with at least one letter and one number.";
    if (opts.requireTerms && !v.terms) err.terms = "Please agree to the terms of use to continue.";
    return err;
  }
  function validatePreferences(v, step) {
    const err = {};
    if ((step === undefined || step === 1) && !(v.causes || []).length) err.causes = "Pick at least one cause.";
    if ((step === undefined || step === 2) && !(v.roles || []).length) err.roles = "Pick at least one kind of role.";
    if (step === undefined || step === 4) {
      if (!(v.slots || []).length) err.slots = "Pick at least one time you're usually free.";
      if (!(v.commitments || []).length) err.commitments = "Pick at least one kind of commitment.";
      if (!(v.format || []).length) err.format = "Pick in person, remote, or both.";
      if (!(v.radius >= 1 && v.radius <= 50)) err.radius = "Travel radius must be between 1 and 50 miles.";
    }
    return err;
  }
  function validateOpportunity(db, o) {
    const err = {};
    const t = today(db);
    if (String(o.title || "").trim().length < 4) err.title = "Give the need a short title (at least 4 characters).";
    if (!ROLE_TYPES.includes(o.roleType)) err.roleType = "Choose a role type.";
    if (!CAUSES.includes(o.cause)) err.cause = "Choose the cause this need supports.";
    if (String(o.description || "").trim().length < 20) err.description = "Describe what volunteers will do (at least 20 characters).";
    if (!COMMITMENTS.includes(o.commitment)) err.commitment = "Choose a time commitment.";
    if (!FORMATS.includes(o.format)) err.format = "Choose in person, remote or hybrid.";
    if (!o.flexible && !(o.slots || []).length) err.slots = "Pick at least one day and time, or mark the timing as flexible.";
    if (o.format !== "Remote" && !V.zip(o.zip)) err.zip = "Enter the Pitt County area ZIP code where volunteers will meet.";
    if (!(Number.isInteger(+o.needed) && +o.needed >= 1 && +o.needed <= 500)) err.needed = "Volunteers needed must be a whole number from 1 to 500.";
    if (!(Number.isInteger(+o.minAge) && +o.minAge >= 18 && +o.minAge <= 99)) err.minAge = "Minimum age must be 18 or older.";
    if (!o.startDate) err.startDate = "Choose a start date.";
    if (!o.expires) err.expires = "Choose when this posting should come down.";
    else if (parseDate(o.expires) < parseDate(t)) err.expires = "The removal date can't be in the past.";
    else if (o.startDate && parseDate(o.expires) < parseDate(o.startDate) && o.commitment !== "Ongoing / recurring") { /* allowed: posting can come down before start */ }
    if (o.shareAddress && !String(o.street || "").trim()) err.street = "Add the street address, or untick 'share address after connecting'.";
    return err;
  }
  function validateOrgRegistration(db, r) {
    const err = {};
    if (String(r.name || "").trim().length < 3) err.name = "Enter the organization's name.";
    if (String(r.mission || "").trim().length < 20) err.mission = "Describe the mission in a sentence or two (at least 20 characters).";
    if (!(r.causes || []).length) err.causes = "Pick at least one cause.";
    if (!V.zip(r.zip)) err.zip = "Enter a Pitt County area ZIP code.";
    if (!V.url(r.website)) err.website = "Enter a web address like example.org, or leave it blank.";
    if (!V.ein(r.ein)) err.ein = "EIN should look like 12-3456789, or leave it blank.";
    if (!String(r.firstName || "").trim()) err.firstName = "Enter your first name.";
    if (!String(r.lastName || "").trim()) err.lastName = "Enter your last name.";
    if (!V.email(r.email)) err.email = "Enter a valid email address.";
    else if (emailInUse(db, r.email)) err.email = "An account already uses this email.";
    if (!V.phone(r.phone)) err.phone = "Enter a 10-digit phone number, or leave it blank.";
    if (!V.password(r.password)) err.password = "Use at least 10 characters, with at least one letter and one number.";
    if (!r.terms) err.terms = "Please agree to the terms of use.";
    return err;
  }

  /* ---------- Matching engine (Process 4.0, Level 1 steps 4.2–4.5) ---------- */
  function activeSkillId(db, id) {
    let s = db.skills.find(x => x.id === id), guard = 0;
    while (s && s.mergedInto && guard++ < 5) s = db.skills.find(x => x.id === s.mergedInto);
    return s ? s.id : id;
  }
  const skillName = (db, id) => (db.skills.find(s => s.id === id) || {}).name || "Unknown skill";
  const orgOf = (db, opp) => db.organizations.find(o => o.id === opp.orgId);
  const openSpots = o => Math.max(0, o.needed - o.filled);
  const slotLabel = s => { const [d, t] = s.split("|"); return `${d} ${t.toLowerCase()}`; };

  /** Is the opportunity visible to matching at all (status, org approval, expiry, spots)? */
  function oppIsLive(db, opp) {
    const org = orgOf(db, opp);
    return !!org && org.status === "Approved" && opp.status === "Active" && parseDate(opp.expires) >= parseDate(today(db)) && openSpots(opp) > 0;
  }

  /** Evaluates one volunteer/opportunity pair. Hard rules first (4.3), then weighted fit (4.4). */
  function evaluate(db, vol, opp, rules) {
    rules = rules || db.rules;
    const t = today(db);
    const fails = [];
    const org = orgOf(db, opp);
    if (!org || org.status !== "Approved") fails.push("Organization not yet approved by PCC");
    if (opp.status !== "Active") fails.push(`Posting is ${opp.status.toLowerCase()}`);
    if (parseDate(opp.expires) < parseDate(t)) fails.push("Posting has expired");
    if (openSpots(opp) <= 0) fails.push("All spots are filled");
    if (vol.status !== "Active") fails.push("Volunteer account is not active");
    const minAge = Math.max(18, opp.minAge || 18);
    if (ageOn(vol.dob, t) < minAge) fails.push(`Minimum age is ${minAge}`);
    const volSkills = new Set((vol.skills || []).map(id => activeSkillId(db, id)));
    const oppSkills = (opp.skills || []).map(s => ({ id: activeSkillId(db, s.skillId), required: s.required }));
    oppSkills.filter(s => s.required && !volSkills.has(s.id)).forEach(s => fails.push(`Requires ${skillName(db, s.id)}`));
    if (opp.bgCheck && !vol.bgWilling) fails.push("Requires a background check");
    const fmt = vol.format || [];
    if (opp.format === "In person" && !fmt.includes("In person")) fails.push("In person only (you chose remote)");
    if (opp.format === "Remote" && !fmt.includes("Remote")) fails.push("Remote only (you chose in person)");
    let miles = null;
    if (opp.format !== "Remote") {
      miles = milesBetween(vol.zip, opp.zip);
      if (miles !== null && miles > vol.radius && !(opp.format === "Hybrid" && fmt.includes("Remote"))) fails.push(`${miles} miles away (your limit is ${vol.radius})`);
    }
    const overlap = opp.flexible ? opp.slots || [] : (opp.slots || []).filter(s => (vol.slots || []).includes(s));
    if (!opp.flexible && !overlap.length) fails.push(`Schedule conflict: ${(opp.slots || []).map(slotLabel).join(", ")}`);

    // 4.4 weighted fit, each criterion 0–100
    const matched = oppSkills.filter(s => volSkills.has(s.id));
    const fit = {
      skill: oppSkills.length ? Math.round(matched.length / oppSkills.length * 100) : 50,
      role: (vol.roles || []).includes(opp.roleType) ? 100 : 0,
      cause: (vol.causes || []).includes(opp.cause) ? 100 : (org && (org.causes || []).some(c => (vol.causes || []).includes(c)) ? 50 : 0),
      schedule: opp.flexible ? 100 : Math.round(overlap.length / Math.max(1, (opp.slots || []).length) * 100),
      commitment: (vol.commitments || []).includes(opp.commitment) ? 100 : 0,
      distance: opp.format === "Remote" || miles === null ? 100 : Math.max(0, Math.round(100 - 60 * Math.min(1, miles / Math.max(1, vol.radius))))
    };
    const active = rules.filter(r => r.active && r.weight > 0);
    const total = active.reduce((s, r) => s + r.weight, 0) || 1;
    const score = Math.round(active.reduce((s, r) => s + r.weight * (fit[r.id] || 0), 0) / total);

    const text = {
      skill: matched.length ? `You listed ${matched.map(s => skillName(db, s.id)).join(" and ")}, which this role uses` : "",
      role: `You said you'd do ${opp.roleType.toLowerCase()}`,
      cause: (vol.causes || []).includes(opp.cause) ? `${opp.cause} is one of your causes` : "This organization works on causes you care about",
      schedule: opp.flexible ? "Flexible timing you can fit around your week" : `You're free ${overlap.map(slotLabel).join(" and ")}`,
      commitment: `You accept ${opp.commitment.toLowerCase()} roles`,
      distance: opp.format === "Remote" ? "Can be done remotely" : miles !== null ? `${miles} miles from you` : "Near you"
    };
    const reasons = active.filter(r => fit[r.id] >= 50 && text[r.id]).sort((a, b) => b.weight * fit[b.id] - a.weight * fit[a.id]).slice(0, 3).map(r => text[r.id]);
    return { eligible: fails.length === 0, fails, fit, score, reasons, miles };
  }

  function priorInterest(db, volId, oppId) { return db.interests.find(i => i.volunteerId === volId && i.oppId === oppId && i.status !== "Withdrawn"); }

  /** Volunteer feed: eligible, not yet responded to, ranked by score (4.5). */
  function volunteerFeed(db, volId, rules) {
    const vol = db.volunteers.find(v => v.id === volId);
    const out = { ranked: [], hidden: [] };
    if (!vol) return out;
    db.opportunities.forEach(opp => {
      const org = orgOf(db, opp);
      if (!org || org.status !== "Approved" || opp.status !== "Active" || parseDate(opp.expires) < parseDate(today(db))) return; // not live: not listed at all
      if (priorInterest(db, volId, opp.id)) return;
      const ev = evaluate(db, vol, opp, rules);
      if (ev.eligible) out.ranked.push({ opp, ...ev });
      else out.hidden.push({ opp, reason: ev.fails[0] });
    });
    out.ranked.sort((a, b) => b.score - a.score || a.opp.title.localeCompare(b.opp.title));
    return out;
  }

  /** Candidates for an organization's posting. Contact details never included here. */
  function candidatesFor(db, oppId, rules) {
    const opp = db.opportunities.find(o => o.id === oppId);
    if (!opp) return [];
    return db.volunteers.filter(v => v.status === "Active").map(vol => {
      const i = priorInterest(db, vol.id, oppId);
      if (i && i.response === "NotForMe") return null;
      const ev = evaluate(db, vol, opp, rules);
      const st = !i ? "Suggested" : i.status === "Accepted" ? "Connected" : i.status === "Declined" ? "Declined" : i.initiatedBy === "Volunteer" ? "Interested" : "Invited";
      if (!i && !ev.eligible) return null;
      return { volunteerId: vol.id, firstName: vol.firstName, area: cityOf(vol.zip), status: st, score: i && i.matchScore != null && st !== "Suggested" ? i.matchScore : ev.score, reasons: ev.reasons, interestId: i && i.id,
        skills: (vol.skills || []).map(id => skillName(db, activeSkillId(db, id))), causes: vol.causes, availability: (vol.slots || []).map(slotLabel).join(", ") };
    }).filter(Boolean).sort((a, b) => {
      const rank = { Interested: 0, Invited: 1, Suggested: 2, Connected: 3, Declined: 4 };
      return rank[a.status] - rank[b.status] || b.score - a.score;
    });
  }

  /* ---------- Privacy rule: contact released only after a mutual connection ---------- */
  function connected(db, volId, orgId) {
    return db.connections.some(c => c.volunteerId === volId && c.status === "Active" && (db.opportunities.find(o => o.id === c.oppId) || {}).orgId === orgId);
  }
  function volunteerPublicView(db, vol, viewer) {
    const base = { id: vol.id, firstName: vol.firstName, area: cityOf(vol.zip), skills: (vol.skills || []).map(id => skillName(db, id)), causes: vol.causes, availability: (vol.slots || []).map(slotLabel) };
    const may = viewer && (viewer.type === "admin" || viewer.id === vol.id || (viewer.type === "member" && connected(db, vol.id, viewer.orgId)));
    return may ? { ...base, lastName: vol.lastName, email: vol.email, phone: vol.phone || "Not provided", contactReleased: true } : { ...base, contactReleased: false };
  }

  /* ---------- Permissions (role-based access) ---------- */
  function can(db, session, action, target) {
    if (!session) return false;
    const t = session.type;
    switch (action) {
      case "volunteer.act": return t === "volunteer" && db.volunteers.some(v => v.id === session.id && v.status === "Active");
      case "org.post": { const m = db.members.find(x => x.id === session.id); const org = m && db.organizations.find(o => o.id === m.orgId); return t === "member" && !!m && m.status === "Active" && !!org && org.status === "Approved"; }
      case "org.manageOpp": { const m = db.members.find(x => x.id === session.id); return t === "member" && !!m && m.status === "Active" && !!target && target.orgId === m.orgId; }
      case "org.manageTeam": { const m = db.members.find(x => x.id === session.id); return t === "member" && !!m && m.role === "Owner" && m.status === "Active"; }
      case "org.editProfile": return can(db, session, "org.manageTeam");
      case "admin": return t === "admin" && session.mfa === true;
      default: return false;
    }
  }

  /* ---------- Notifications (D7) and audit ---------- */
  function notify(db, toType, toId, type, text, refs = {}) {
    const n = { id: uid("ntf"), toType, toId, type, text, oppId: refs.oppId || null, connectionId: refs.connectionId || null, channel: "Email + in-app", sentAt: nowStamp(db), readAt: null };
    db.notifications.push(n);
    return n;
  }
  function notifyOrg(db, orgId, type, text, refs) { db.members.filter(m => m.orgId === orgId && m.status === "Active").forEach(m => notify(db, "member", m.id, type, text, refs)); }
  function audit(db, session, action, detail) { db.audit.push({ id: uid("aud"), at: nowStamp(db), actorType: session ? session.type : "system", actorId: session ? session.id : null, action, detail }); }

  /* ---------- Workflow operations (Process 5.0) ---------- */
  function err(msg) { const e = new Error(msg); e.userFacing = true; throw e; }

  function expressInterest(db, session, oppId) {
    if (!can(db, session, "volunteer.act")) err("Sign in as a volunteer to express interest.");
    const vol = db.volunteers.find(v => v.id === session.id), opp = db.opportunities.find(o => o.id === oppId);
    if (!opp) err("That opportunity no longer exists.");
    const prior = priorInterest(db, vol.id, oppId);
    if (prior && prior.response === "Interested") err("You've already expressed interest in this opportunity.");
    if (prior && prior.initiatedBy === "Organization" && prior.status === "Pending") return respondToInvite(db, session, prior.id, true);
    const ev = evaluate(db, vol, opp);
    if (!ev.eligible) err("This opportunity isn't open to you: " + ev.fails[0] + ".");
    if (prior) db.interests.splice(db.interests.indexOf(prior), 1);
    const i = { id: uid("int"), volunteerId: vol.id, oppId, initiatedBy: "Volunteer", response: "Interested", status: "Pending", matchScore: ev.score, createdAt: nowStamp(db), decidedAt: null, decidedBy: null };
    db.interests.push(i);
    db.saved = db.saved.filter(s => !(s.volunteerId === vol.id && s.oppId === oppId));
    notifyOrg(db, opp.orgId, "NewInterest", `${vol.firstName} is interested in “${opp.title}”. Review and accept or decline.`, { oppId });
    return i;
  }
  function notForMe(db, session, oppId) {
    if (!can(db, session, "volunteer.act")) err("Sign in as a volunteer first.");
    if (priorInterest(db, session.id, oppId)) err("You've already responded to this opportunity.");
    const i = { id: uid("int"), volunteerId: session.id, oppId, initiatedBy: "Volunteer", response: "NotForMe", status: "Closed", matchScore: null, createdAt: nowStamp(db), decidedAt: null, decidedBy: null };
    db.interests.push(i);
    db.saved = db.saved.filter(s => !(s.volunteerId === session.id && s.oppId === oppId));
    return i;
  }
  function toggleSave(db, session, oppId) {
    if (!can(db, session, "volunteer.act")) err("Sign in as a volunteer first.");
    const ex = db.saved.find(s => s.volunteerId === session.id && s.oppId === oppId);
    if (ex) { db.saved.splice(db.saved.indexOf(ex), 1); return false; }
    db.saved.push({ id: uid("sav"), volunteerId: session.id, oppId, savedAt: nowStamp(db) });
    return true;
  }
  function withdrawInterest(db, session, interestId) {
    const i = db.interests.find(x => x.id === interestId);
    if (!i || session.type !== "volunteer" || i.volunteerId !== session.id) err("You can only withdraw your own interest.");
    if (i.status !== "Pending") err("Only a pending interest can be withdrawn.");
    i.status = "Withdrawn"; i.decidedAt = nowStamp(db);
    return i;
  }
  function makeConnection(db, i, session) {
    const opp = db.opportunities.find(o => o.id === i.oppId);
    if (!oppIsLive(db, opp)) err("This posting is no longer accepting volunteers.");
    i.status = "Accepted"; i.decidedAt = nowStamp(db); i.decidedBy = session.id;
    const c = { id: uid("con"), interestId: i.id, volunteerId: i.volunteerId, oppId: i.oppId, createdAt: nowStamp(db), status: "Active" };
    db.connections.push(c);
    opp.filled += 1;
    const vol = db.volunteers.find(v => v.id === i.volunteerId), org = orgOf(db, opp);
    notify(db, "volunteer", vol.id, "Connected", `You're connected with ${org.name} for “${opp.title}”. Contact details are now shared.`, { oppId: opp.id, connectionId: c.id });
    notifyOrg(db, org.id, "Connected", `You're connected with ${vol.firstName} ${vol.lastName} for “${opp.title}”. Contact details are now shared.`, { oppId: opp.id, connectionId: c.id });
    if (openSpots(opp) === 0) { opp.status = "Filled"; notifyOrg(db, org.id, "Filled", `“${opp.title}” is now full and was removed from matching.`, { oppId: opp.id }); }
    return c;
  }
  function orgDecide(db, session, interestId, accept) {
    const i = db.interests.find(x => x.id === interestId);
    if (!i) err("That request no longer exists.");
    const opp = db.opportunities.find(o => o.id === i.oppId);
    if (!can(db, session, "org.manageOpp", opp)) err("Only members of this organization can respond.");
    if (i.initiatedBy !== "Volunteer" || i.status !== "Pending") err("This request has already been answered.");
    if (!accept) {
      i.status = "Declined"; i.decidedAt = nowStamp(db); i.decidedBy = session.id;
      notify(db, "volunteer", i.volunteerId, "Declined", `${orgOf(db, opp).name} decided “${opp.title}” isn't the right fit this time. Keep exploring your matches.`, { oppId: opp.id });
      return null;
    }
    return makeConnection(db, i, session);
  }
  function orgInvite(db, session, oppId, volId) {
    const opp = db.opportunities.find(o => o.id === oppId);
    if (!can(db, session, "org.manageOpp", opp)) err("Only members of this organization can express interest.");
    if (priorInterest(db, volId, oppId)) err("You've already been in touch with this volunteer about this need.");
    const vol = db.volunteers.find(v => v.id === volId);
    const ev = evaluate(db, vol, opp);
    if (!ev.eligible) err("This volunteer isn't eligible for this need.");
    const i = { id: uid("int"), volunteerId: volId, oppId, initiatedBy: "Organization", response: "Interested", status: "Pending", matchScore: ev.score, createdAt: nowStamp(db), decidedAt: null, decidedBy: null };
    db.interests.push(i);
    notify(db, "volunteer", volId, "Invited", `${orgOf(db, opp).name} thinks you'd be great for “${opp.title}”. Accept or decline from Connections.`, { oppId });
    return i;
  }
  function respondToInvite(db, session, interestId, accept) {
    const i = db.interests.find(x => x.id === interestId);
    if (!i || session.type !== "volunteer" || i.volunteerId !== session.id) err("That invitation isn't yours.");
    if (i.initiatedBy !== "Organization" || i.status !== "Pending") err("This invitation has already been answered.");
    const opp = db.opportunities.find(o => o.id === i.oppId);
    if (!accept) { i.status = "Declined"; i.decidedAt = nowStamp(db); i.decidedBy = session.id; notifyOrg(db, opp.orgId, "Declined", `A volunteer declined your invitation for “${opp.title}”.`, { oppId: opp.id }); return null; }
    return makeConnection(db, i, session);
  }
  function sendMessage(db, session, connectionId, text) {
    const c = db.connections.find(x => x.id === connectionId);
    if (!c) err("Connection not found.");
    const opp = db.opportunities.find(o => o.id === c.oppId);
    const okVol = session.type === "volunteer" && session.id === c.volunteerId;
    const okOrg = can(db, session, "org.manageOpp", opp);
    if (!okVol && !okOrg) err("You can only message your own connections.");
    const body = String(text || "").trim();
    if (!body) err("Write a message first.");
    if (body.length > 1000) err("Messages can be up to 1,000 characters.");
    const m = { id: uid("msg"), connectionId, fromType: session.type, fromId: session.id, text: body, at: nowStamp(db) };
    db.messages.push(m);
    if (okVol) notifyOrg(db, opp.orgId, "Message", `New message about “${opp.title}”.`, { connectionId });
    else notify(db, "volunteer", c.volunteerId, "Message", `New message from ${orgOf(db, opp).name}.`, { connectionId });
    return m;
  }

  /* ---------- Opportunities (Process 3.0) ---------- */
  function saveOpportunity(db, session, data) {
    if (!can(db, session, "org.post")) err("Your organization must be approved by PCC before you can post.");
    const m = db.members.find(x => x.id === session.id);
    const e = validateOpportunity(db, data);
    if (Object.keys(e).length) { const x = new Error("validation"); x.fields = e; throw x; }
    let o = data.id && db.opportunities.find(x => x.id === data.id);
    if (o && !can(db, session, "org.manageOpp", o)) err("You can only edit your own organization's postings.");
    const clean = {
      title: data.title.trim(), roleType: data.roleType, cause: data.cause, description: data.description.trim(), commitment: data.commitment,
      format: data.format, zip: data.format === "Remote" ? "" : data.zip, location: data.format === "Remote" ? "Remote" : (data.location || cityOf(data.zip)),
      street: data.street || "", shareAddress: !!data.shareAddress, flexible: !!data.flexible, slots: data.flexible ? [] : [...data.slots],
      whenText: data.whenText || "", startDate: data.startDate, expires: data.expires, needed: +data.needed, minAge: +data.minAge, bgCheck: !!data.bgCheck,
      skills: (data.skills || []).map(s => ({ skillId: s.skillId, required: !!s.required }))
    };
    if (o) { Object.assign(o, clean); if (o.status === "Filled" && openSpots(o) > 0) o.status = "Active"; audit(db, session, "opportunity.edit", o.title); }
    else {
      o = { id: uid("opp"), orgId: m.orgId, createdBy: m.id, ...clean, filled: 0, status: "Active", createdAt: today(db) };
      db.opportunities.push(o);
      audit(db, session, "opportunity.create", o.title);
      // Trigger 3 (Level 1 DFD 4.1): new posting -> alert strong matches
      db.volunteers.filter(v => v.status === "Active").forEach(v => { const ev = evaluate(db, v, o); if (ev.eligible && ev.score >= 80) notify(db, "volunteer", v.id, "NewMatch", `New strong match (${ev.score}): “${o.title}” at ${orgOf(db, o).name}.`, { oppId: o.id }); });
    }
    return o;
  }
  function setOppStatus(db, session, oppId, status) {
    const o = db.opportunities.find(x => x.id === oppId);
    if (!o) err("Posting not found.");
    if (!can(db, session, "org.manageOpp", o) && !can(db, session, "admin")) err("You can only change your own organization's postings.");
    if (!["Active", "Paused", "Filled", "Closed"].includes(status)) err("Unknown status.");
    if (status === "Active" && parseDate(o.expires) < parseDate(today(db))) err("This posting has expired. Change its removal date first.");
    if (status === "Active" && openSpots(o) === 0) err("All spots are filled. Raise the number needed first.");
    const was = o.status; o.status = status;
    if (status !== "Active") db.interests.filter(i => i.oppId === oppId && i.status === "Pending").forEach(i => notify(db, "volunteer", i.volunteerId, "OppChanged", `“${o.title}” is now ${status.toLowerCase()}.`, { oppId }));
    audit(db, session, "opportunity.status", `${o.title}: ${was} → ${status}`);
    return o;
  }
  /** NFR-12: expire stale postings automatically. Returns count expired. */
  function sweepExpired(db) {
    const t = today(db); let n = 0;
    db.opportunities.forEach(o => { if ((o.status === "Active" || o.status === "Paused") && parseDate(o.expires) < parseDate(t)) { o.status = "Expired"; n++; notifyOrg(db, o.orgId, "Expired", `“${o.title}” passed its removal date and was taken out of matching. Repost it if you still need help.`, { oppId: o.id }); } });
    return n;
  }

  /* ---------- Skills governance (BR-SK-01) ---------- */
  function findSkill(db, name) { return db.skills.find(s => norm(s.name) === norm(name) && s.status !== "Retired"); }
  function suggestSkill(db, session, name) {
    const nm = String(name || "").trim().replace(/\s+/g, " ");
    if (nm.length < 2 || nm.length > 40) err("Skill names should be 2 to 40 characters.");
    const ex = findSkill(db, nm);
    if (ex) return { skill: ex, existing: true };
    const s = { id: uid("skl"), name: nm, category: "Other", status: "Pending", mergedInto: null, suggestedBy: session ? session.type + ":" + session.id : null, suggestedAt: today(db) };
    db.skills.push(s);
    return { skill: s, existing: false };
  }
  function reviewSkill(db, session, skillId, decision, mergeIntoId, category) {
    if (!can(db, session, "admin")) err("Only PCC administrators can review skills.");
    const s = db.skills.find(x => x.id === skillId);
    if (!s || s.status !== "Pending") err("That suggestion was already reviewed.");
    const [kind, uidStr] = String(s.suggestedBy || ":").split(":");
    const ownerOf = () => kind === "volunteer" ? ["volunteer", uidStr] : kind === "member" ? ["member", uidStr] : null;
    if (decision === "approve") { s.status = "Active"; if (category) s.category = category; }
    else if (decision === "merge") {
      const into = db.skills.find(x => x.id === mergeIntoId && x.status === "Active");
      if (!into) err("Choose an active skill to merge into.");
      s.status = "Retired"; s.mergedInto = into.id;
      db.volunteers.forEach(v => { if (v.skills.includes(s.id)) v.skills = [...new Set(v.skills.map(x => x === s.id ? into.id : x))]; });
      db.opportunities.forEach(o => o.skills.forEach(k => { if (k.skillId === s.id) k.skillId = into.id; }));
    } else if (decision === "reject") {
      s.status = "Retired";
      db.volunteers.forEach(v => { v.skills = v.skills.filter(x => x !== s.id); });
      db.opportunities.forEach(o => { o.skills = o.skills.filter(k => k.skillId !== s.id); });
    } else err("Unknown decision.");
    const o = ownerOf();
    if (o) notify(db, o[0], o[1], "SkillReview", decision === "approve" ? `Your suggested skill “${s.name}” was added.` : decision === "merge" ? `Your suggested skill “${s.name}” was matched to “${skillName(db, s.mergedInto)}”.` : `Your suggested skill “${s.name}” wasn't added.`);
    audit(db, session, "skill." + decision, s.name);
    return s;
  }

  /* ---------- Organization approval (Process 6.0) ---------- */
  function similarOrgs(db, org) {
    const tok = s => new Set(norm(s).replace(/[^a-z0-9 ]/g, "").split(" ").filter(w => w.length > 2 && !["the", "and", "inc", "of", "for"].includes(w)));
    const a = tok(org.name);
    return db.organizations.filter(o => o.id !== org.id && o.status !== "Rejected").filter(o => {
      if (org.website && o.website && norm(o.website).replace(/^https?:\/\//, "") === norm(org.website).replace(/^https?:\/\//, "")) return true;
      if (org.ein && o.ein && o.ein.replace("-", "") === org.ein.replace("-", "")) return true;
      const b = tok(o.name); const inter = [...a].filter(w => b.has(w)).length;
      return inter && inter / Math.min(a.size, b.size) >= 0.6;
    });
  }
  function decideOrg(db, session, orgId, approve, reason) {
    if (!can(db, session, "admin")) err("Only PCC administrators can approve organizations.");
    const o = db.organizations.find(x => x.id === orgId);
    if (!o || o.status !== "Pending") err("This organization was already reviewed.");
    if (!approve && !String(reason || "").trim()) err("Give a short reason so the organization knows what to fix.");
    o.status = approve ? "Approved" : "Rejected"; o.approvedBy = session.id; o.approvedAt = today(db); o.decisionNote = reason || "";
    notifyOrg(db, o.id, approve ? "OrgApproved" : "OrgRejected", approve ? `${o.name} is approved. You can now post volunteer needs.` : `${o.name} wasn't approved: ${reason}`);
    audit(db, session, approve ? "org.approve" : "org.reject", o.name + (reason ? ` (${reason})` : ""));
    return o;
  }
  function saveWeights(db, session, weights) {
    if (!can(db, session, "admin")) err("Only PCC administrators can change matching weights.");
    const total = weights.filter(w => w.active).reduce((s, w) => s + w.weight, 0);
    if (total !== 100) err(`Active weights must add up to 100 (now ${total}).`);
    const before = db.rules.map(r => `${r.criterion} ${r.weight}`).join(", ");
    db.rules = weights.map(w => ({ ...w, updatedBy: session.id, updatedAt: nowStamp(db) }));
    audit(db, session, "rules.update", `${before} → ${db.rules.map(r => `${r.criterion} ${r.weight}`).join(", ")}`);
  }

  /* ---------- Hours (VolunteerHours, pending client confirmation) ---------- */
  function logHours(db, session, connectionId, date, hours, note) {
    const c = db.connections.find(x => x.id === connectionId);
    if (!c || session.type !== "volunteer" || c.volunteerId !== session.id) err("You can only log hours on your own connections.");
    const h = +hours;
    if (!(h > 0 && h <= 24 && Math.round(h * 4) === h * 4)) err("Hours must be between 0.25 and 24, in quarter-hour steps.");
    if (!date || parseDate(date) > parseDate(today(db))) err("Choose the date you volunteered (not in the future).");
    if (parseDate(date) < parseDate(c.createdAt)) err("That date is before you connected with this organization.");
    const r = { id: uid("hrs"), connectionId, volunteerId: c.volunteerId, date, hours: h, note: String(note || "").slice(0, 200), status: "Submitted", confirmedBy: null, confirmedAt: null };
    db.hours.push(r);
    const opp = db.opportunities.find(o => o.id === c.oppId);
    notifyOrg(db, opp.orgId, "HoursSubmitted", `Hours submitted for “${opp.title}”. Please confirm.`, { connectionId });
    return r;
  }
  function confirmHours(db, session, hoursId, ok) {
    const r = db.hours.find(x => x.id === hoursId);
    if (!r) err("Hours entry not found.");
    const c = db.connections.find(x => x.id === r.connectionId), opp = db.opportunities.find(o => o.id === c.oppId);
    if (!can(db, session, "org.manageOpp", opp)) err("Only the organization can confirm hours.");
    if (r.status !== "Submitted") err("These hours were already reviewed.");
    r.status = ok ? "Confirmed" : "Rejected"; r.confirmedBy = session.id; r.confirmedAt = today(db);
    notify(db, "volunteer", r.volunteerId, "HoursReviewed", `${orgOf(db, opp).name} ${ok ? "confirmed" : "did not confirm"} ${r.hours} hours on ${fmtDate(r.date)}.`, { connectionId: c.id });
    return r;
  }

  /* ---------- Reports (UC-ADM-03/04) ---------- */
  function lowInterest(db) {
    const t = today(db);
    return db.opportunities.filter(o => oppIsLive(db, o)).map(o => ({ opp: o, days: daysBetween(o.createdAt, t), interested: db.interests.filter(i => i.oppId === o.id && i.response === "Interested" && i.status !== "Withdrawn").length }))
      .filter(x => x.days >= LOW_INTEREST_DAYS && x.interested <= 1).sort((a, b) => b.days - a.days);
  }
  function reportStats(db, from, to) {
    const inRange = s => (!from || String(s).slice(0, 10) >= from) && (!to || String(s).slice(0, 10) <= to);
    const opps = db.opportunities.filter(o => inRange(o.createdAt));
    const conns = db.connections.filter(c => inRange(c.createdAt));
    const byCause = CAUSES.map(cause => ({ cause, needs: opps.filter(o => o.cause === cause).length, filled: opps.filter(o => o.cause === cause && (o.status === "Filled" || o.filled >= o.needed)).length })).filter(x => x.needs);
    const hours = db.hours.filter(h => h.status === "Confirmed" && inRange(h.date)).reduce((s, h) => s + h.hours, 0);
    return {
      orgs: db.organizations.filter(o => o.status === "Approved").length, orgsPending: db.organizations.filter(o => o.status === "Pending").length,
      volunteers: db.volunteers.filter(v => v.status === "Active").length, needs: opps.length, connections: conns.length,
      roleSpotsFilled: opps.reduce((s, o) => s + o.filled, 0), roleSpotsPosted: opps.reduce((s, o) => s + o.needed, 0), hours, byCause
    };
  }
  function csv(rows) {
    const cell = v => { let s = v == null ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return rows.map(r => r.map(cell).join(",")).join("\r\n");
  }
  function exportVolunteers(db) {
    return csv([["VolunteerID", "FirstName", "LastName", "Email", "Phone", "City", "Causes", "Skills", "Joined", "Status"],
      ...db.volunteers.filter(v => v.status !== "Deleted").map(v => [v.id, v.firstName, v.lastName, v.email, v.phone, cityOf(v.zip), v.causes.join("; "), v.skills.map(id => skillName(db, id)).join("; "), v.createdAt, v.status])]);
  }
  function exportConnections(db) {
    return csv([["ConnectionID", "Date", "Volunteer", "Organization", "Opportunity", "Cause", "ConfirmedHours"],
      ...db.connections.map(c => { const v = db.volunteers.find(x => x.id === c.volunteerId) || {}, o = db.opportunities.find(x => x.id === c.oppId) || {}, g = orgOf(db, o) || {};
        return [c.id, c.createdAt.slice(0, 10), `${v.firstName || ""} ${v.lastName || ""}`.trim(), g.name, o.title, o.cause, db.hours.filter(h => h.connectionId === c.id && h.status === "Confirmed").reduce((s, h) => s + h.hours, 0)]; })]);
  }

  /* ---------- Account deletion (volunteer: delete own account) ---------- */
  function deleteVolunteer(db, session, volId) {
    if (!(session.type === "volunteer" && session.id === volId) && !can(db, session, "admin")) err("You can only delete your own account.");
    const v = db.volunteers.find(x => x.id === volId);
    if (!v) err("Account not found.");
    // Retention policy: remove personal data, keep anonymous counts for reports.
    Object.assign(v, { firstName: "Deleted", lastName: "volunteer", email: `deleted+${v.id}@invalid`, phone: "", dob: "1900-01-01", skills: [], causes: [], roles: [], slots: [], status: "Deleted", pwHash: "", salt: "" });
    db.interests.filter(i => i.volunteerId === volId && i.status === "Pending").forEach(i => { i.status = "Withdrawn"; });
    db.saved = db.saved.filter(s => s.volunteerId !== volId);
    db.messages = db.messages.filter(m => !(m.fromType === "volunteer" && m.fromId === volId));
    db.notifications = db.notifications.filter(n => !(n.toType === "volunteer" && n.toId === volId));
    audit(db, session, "volunteer.delete", volId);
  }

  /* ---------- Crypto: password hashing (PBKDF2) and TOTP (RFC 6238) ---------- */
  const subtle = () => (root.crypto && root.crypto.subtle) || (typeof require === "function" ? require("crypto").webcrypto.subtle : null);
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  function randomHex(n) { const a = new Uint8Array(n); (root.crypto || require("crypto").webcrypto).getRandomValues(a); return hex(a); }
  async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const key = await subtle().importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS }, key, 256);
    return hex(bits);
  }
  async function verifyPassword(password, user) { return !!user.salt && (await hashPassword(password, user.salt)) === user.pwHash; }
  function base32Decode(s) {
    const al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
    for (const c of s.replace(/=+$/, "").toUpperCase()) { const v = al.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, "0"); }
    const out = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    return out;
  }
  function randomBase32(len = 16) { const al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; const a = new Uint8Array(len); (root.crypto || require("crypto").webcrypto).getRandomValues(a); return [...a].map(b => al[b % 32]).join(""); }
  async function totp(secret, atMs = Date.now(), step = 30) {
    const counter = Math.floor(atMs / 1000 / step);
    const msg = new ArrayBuffer(8); const dv = new DataView(msg); dv.setUint32(0, Math.floor(counter / 2 ** 32)); dv.setUint32(4, counter >>> 0);
    const key = await subtle().importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const h = new Uint8Array(await subtle().sign("HMAC", key, msg));
    const o = h[h.length - 1] & 15;
    const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
    return String(code).padStart(6, "0");
  }
  async function verifyTotp(secret, code, atMs = Date.now()) {
    const c = String(code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(c)) return false;
    for (const w of [-1, 0, 1]) if ((await totp(secret, atMs + w * 30000)) === c) return true;
    return false;
  }

  /** Login (Process 1.0/2.0/6.0 entry). Returns {session, needsMfa} or throws a user-facing error. */
  async function login(db, email, password) {
    const e = norm(email);
    db.loginAttempts = db.loginAttempts || {};
    const att = db.loginAttempts[e] || { count: 0, lockedUntil: 0 };
    if (att.lockedUntil > Date.now()) err(`Too many attempts. Try again in ${Math.ceil((att.lockedUntil - Date.now()) / 60000)} minutes, or call PCC at ${HELPLINE}.`);
    let user = db.volunteers.find(u => norm(u.email) === e), type = "volunteer";
    if (!user) { user = db.members.find(u => norm(u.email) === e); type = "member"; }
    if (!user) { user = db.administrators.find(u => norm(u.email) === e); type = "admin"; }
    const ok = user && user.status === "Active" && await verifyPassword(password, user);
    if (!ok) {
      att.count++; if (att.count >= LOCKOUT_ATTEMPTS) { att.lockedUntil = Date.now() + LOCKOUT_MIN * 60000; att.count = 0; }
      db.loginAttempts[e] = att;
      err(user && user.status === "Deactivated" ? "This account has been deactivated. Contact PCC for help." : "That email and password don't match. Check them and try again.");
    }
    delete db.loginAttempts[e];
    const s = { type, id: user.id, orgId: user.orgId || null, mfa: false, lastActive: Date.now() };
    const needsMfa = type === "admin" || (type === "member" && user.mfaEnabled);
    if (!needsMfa) s.mfa = type !== "admin";
    return { session: s, needsMfa, user };
  }

  /* ---------- Seed data (training dataset; all people are fictional) ---------- */
  async function seed(opts = {}) {
    const T = isoDate(new Date());
    const d = n => addDays(T, n);
    const db = { meta: { schema: SCHEMA_VERSION, seededOn: T }, settings: { clockOffsetDays: 0 }, administrators: [], organizations: [], members: [], volunteers: [], skills: [], opportunities: [], interests: [], connections: [], messages: [], saved: [], notifications: [], rules: [], hours: [], flags: [], audit: [], loginAttempts: {} };
    const DEMO_PW = opts.password || "Training2026!";
    const cats = { "Accounting": "Finance", "Nonprofit finance": "Finance", "Grant writing": "Communications", "Spanish": "Languages", "Social media": "Communications", "Graphic design": "Communications", "Food safety certification": "Food service", "Tutoring": "Education", "Event setup": "Events", "Customer service": "Events", "Carpentry": "Trades", "OSHA-10": "Trades", "Public speaking": "Communications", "Data entry": "Administration", "CPR / First aid": "Other", "Driving (clean record)": "Other" };
    Object.entries(cats).forEach(([name, category], i) => db.skills.push({ id: "skl_" + (i + 1), name, category, status: "Active", mergedInto: null, suggestedBy: null, suggestedAt: null }));
    const S = n => db.skills.find(s => s.name === n).id;
    db.skills.push({ id: "skl_p1", name: "Bookkeeping", category: "Other", status: "Pending", mergedInto: null, suggestedBy: "volunteer:vol_linda", suggestedAt: d(-2) });
    db.skills.push({ id: "skl_p2", name: "Forklift operation", category: "Other", status: "Pending", mergedInto: null, suggestedBy: "member:mem_renee", suggestedAt: d(-1) });
    [["skill", "Skill overlap", 30], ["role", "Role-type willingness", 20], ["cause", "Cause interest", 15], ["schedule", "Schedule availability", 15], ["commitment", "Commitment level", 10], ["distance", "Distance", 10]]
      .forEach(([id, criterion, weight]) => db.rules.push({ id, criterion, weight, active: true, updatedBy: "adm_nichole", updatedAt: d(-30) + "T09:00" }));

    const users = [];
    db.administrators.push({ id: "adm_nichole", firstName: "Nichole", lastName: "Alley", email: "nichole@pcc.example.org", mfaSecret: "JBSWY3DPEHPK3PXP", status: "Active" });
    users.push(db.administrators[0]);

    const orgs = [
      ["org_gcp", "Greenville Community Pantry", "GCP", "Weekly groceries and hot meals for Pitt County families facing food insecurity.", ["Hunger & food security"], "27858", "gcpantry.example.org", "56-1234567", "Approved", -45],
      ["org_ra", "Riley's Army", "RA", "Supporting children with cancer and their families in eastern North Carolina.", ["Health", "Youth & education"], "27834", "rileysarmy.example.org", "", "Approved", -43],
      ["org_drd", "Dr. D Project", "DD", "Mentoring and academic support that helps Pitt County students plan for college and careers.", ["Youth & education"], "28590", "drdproject.example.org", "", "Approved", -42],
      ["org_trb", "Tar River Build Crew", "TRB", "Volunteer home repairs so older homeowners can stay safely in their homes.", ["Housing", "Seniors"], "27858", "tarriverbuild.example.org", "", "Approved", -35],
      ["org_pac", "Pitt Arts Collective", "PAC", "Free arts programming and performance space for local artists and families.", ["Arts & culture"], "27858", "pittarts.example.org", "", "Approved", -34],
      ["org_elc", "Eastern NC Literacy Council", "ELC", "Free adult reading and GED tutoring in Pitt and Greene counties.", ["Youth & education"], "28513", "encliteracy.example.org", "56-7654321", "Pending", -2, "Website and 501(c)(3) letter provided."],
      ["org_gysl", "Grimesland Youth Soccer League", "GYS", "Low-cost recreational soccer for kids ages 5 to 14.", ["Youth & education", "Community spaces"], "27837", "", "", "Pending", -1, "No website listed. Verify by phone."],
      ["org_gcp2", "Greenville Community Food Pantry Inc", "GFP", "Food pantry serving Greenville families every week.", ["Hunger & food security"], "27858", "", "", "Pending", 0, "Possible duplicate of an existing organization."]
    ];
    orgs.forEach(([id, name, short, mission, causes, zip, website, ein, status, joined, note]) => db.organizations.push({ id, name, short, mission, causes, zip, city: cityOf(zip), website, ein, status, submittedAt: d(joined), approvedBy: status === "Approved" ? "adm_nichole" : null, approvedAt: status === "Approved" ? d(joined + 1) : null, note: note || "", decisionNote: "" }));
    const mem = [["mem_renee", "org_gcp", "Renee", "Batts", "renee@gcpantry.example.org", "(252) 555-0141", "Owner"], ["mem_omar", "org_gcp", "Omar", "Haddad", "omar@gcpantry.example.org", "(252) 555-0142", "Editor"],
      ["mem_leah", "org_ra", "Leah", "Brooks", "leah@rileysarmy.example.org", "(252) 555-0187", "Owner"], ["mem_marcus", "org_drd", "Marcus", "Dawson", "marcus@drdproject.example.org", "(252) 555-0112", "Owner"],
      ["mem_alan", "org_trb", "Alan", "Whitfield", "alan@tarriverbuild.example.org", "(252) 555-0163", "Owner"], ["mem_tasha", "org_pac", "Tasha", "Greene", "tasha@pittarts.example.org", "(252) 555-0199", "Owner"],
      ["mem_gloria", "org_elc", "Gloria", "Price", "gloria@encliteracy.example.org", "(252) 555-0124", "Owner"], ["mem_victor", "org_gysl", "Victor", "Ruiz", "victor@gysl.example.org", "(252) 555-0158", "Owner"],
      ["mem_dan", "org_gcp2", "Dan", "Moss", "dan.moss@example.com", "(252) 555-0170", "Owner"]];
    mem.forEach(([id, orgId, firstName, lastName, email, phone, role]) => { const m = { id, orgId, firstName, lastName, email, phone, role, mfaEnabled: false, mfaSecret: null, status: "Active", createdAt: d(-40) }; db.members.push(m); users.push(m); });

    const vols = [
      ["vol_jordan", "Jordan", "Ellis", "jordan@example.com", "(252) 555-0176", "1992-03-08", "27858", 15, ["In person", "Remote"], ["Hunger & food security", "Youth & education", "Health"], ["Board / committee service", "Event support", "Professional / pro bono expertise", "Hands-on labor", "Mentoring"], ["Accounting", "Nonprofit finance", "Spanish", "Customer service"], ["One-time", "Short-term project", "Ongoing / recurring"], true, ["Tue|Evening", "Thu|Evening", "Sat|Morning", "Sat|Afternoon"], "CPA (North Carolina)", "Busy Feb – Apr (tax season)", -30],
      ["vol_maya", "Maya", "Thompson", "maya@example.com", "(252) 555-0132", "1988-07-19", "27858", 10, ["In person"], ["Hunger & food security", "Seniors"], ["Event support", "Hands-on labor"], ["Food safety certification", "Event setup"], ["One-time", "Ongoing / recurring"], false, ["Sat|Morning", "Sun|Afternoon"], "ServSafe food handler", "", -28],
      ["vol_deshawn", "DeShawn", "Moore", "deshawn@example.com", "(252) 555-0144", "2003-11-02", "27858", 8, ["In person", "Remote"], ["Hunger & food security", "Community spaces", "Arts & culture"], ["Event support", "Hands-on labor", "Marketing or design help"], ["Event setup", "Customer service", "Social media"], ["One-time", "Short-term project"], false, ["Sat|Morning", "Sat|Afternoon", "Sun|Morning", "Fri|Evening"], "", "Exams in early May", -20],
      ["vol_priya", "Priya", "Natarajan", "priya@example.com", "(252) 555-0151", "1979-01-25", "28590", 12, ["In person", "Remote"], ["Health", "Youth & education", "Hunger & food security"], ["Mentoring", "Administrative support", "Event support"], ["Data entry", "Tutoring"], ["Ongoing / recurring", "One-time"], true, ["Tue|Afternoon", "Thu|Afternoon", "Sat|Morning"], "", "", -18],
      ["vol_carl", "Carl", "Jennings", "carl@example.com", "(252) 555-0160", "1958-05-14", "27879", 20, ["In person"], ["Seniors", "Housing", "Community spaces"], ["Hands-on labor", "Mentoring"], ["Carpentry", "OSHA-10", "Event setup"], ["One-time", "Ongoing / recurring"], true, ["Mon|Morning", "Wed|Morning", "Fri|Morning", "Sat|Morning"], "OSHA-10", "", -25],
      ["vol_linda", "Linda", "Harper", "linda@example.com", "(252) 555-0115", "1965-09-30", "27834", 10, ["In person", "Remote"], ["Seniors", "Hunger & food security"], ["Board / committee service", "Administrative support"], ["Nonprofit finance", "Data entry"], ["Ongoing / recurring"], false, ["Mon|Afternoon", "Tue|Evening", "Wed|Afternoon"], "", "", -12],
      ["vol_ana", "Ana", "Reyes", "ana@example.com", "(252) 555-0139", "1996-12-12", "27858", 15, ["Remote", "In person"], ["Arts & culture", "Youth & education"], ["Marketing or design help", "Mentoring", "Event support"], ["Graphic design", "Social media", "Spanish"], ["Short-term project", "One-time"], true, ["Tue|Evening", "Thu|Evening", "Sun|Afternoon"], "", "", -9]
    ];
    vols.forEach(([id, firstName, lastName, email, phone, dob, zip, radius, format, causes, roles, skills, commitments, bgWilling, slots, certs, season, joined]) => {
      const v = { id, firstName, lastName, email, phone, dob, zip, radius, format, causes, roles, skills: skills.map(S), commitments, bgWilling, slots, certs, languages: skills.includes("Spanish") ? "English, Spanish" : "English", physical: "No lifting limits", season, status: "Active", createdAt: d(joined) };
      db.volunteers.push(v); users.push(v);
    });

    const opps = [
      ["opp_treas", "org_gcp", "mem_renee", "Board treasurer", "Board / committee service", "Hunger & food security", "Keep the pantry's books, prepare a one-page monthly report and present it at board meetings. Our current treasurer steps down in January.", "Ongoing / recurring", "Hybrid", "27858", false, ["Tue|Evening"], "2nd Tuesday monthly, 6:00–7:30 PM", 60, 1, 0, 18, false, [["Accounting", true], ["Nonprofit finance", false]], 26, 30],
      ["opp_grant", "org_pac", "mem_tasha", "Grant budget review", "Professional / pro bono expertise", "Arts & culture", "Review the budget section of our spring arts grant and suggest fixes before the deadline. About 6 hours over three weeks.", "Short-term project", "Remote", "", true, [], "Flexible over the next three weeks", 3, 1, 0, 18, false, [["Accounting", false], ["Grant writing", false]], 25, 6],
      ["opp_food", "org_gcp", "mem_renee", "Saturday food distribution", "Hands-on labor", "Hunger & food security", "Unload the truck, pack boxes and hand groceries to families at the drive-through line. Closed-toe shoes required.", "One-time", "In person", "27858", false, ["Sat|Morning"], "Saturday, 8:00 AM – 12:00 PM", 4, 12, 7, 18, false, [["Food safety certification", false]], 3, 9],
      ["opp_5k", "org_ra", "mem_leah", "Race-day registration table", "Event support", "Health", "Check in runners, hand out bibs and answer questions at the Driving Out Cancer 5K benefiting Riley's Army.", "One-time", "In person", "27858", false, ["Sat|Morning"], "Saturday, 7:00 – 11:00 AM", 11, 8, 3, 18, false, [["Customer service", false], ["Spanish", false]], 10, 12],
      ["opp_mentor", "org_drd", "mem_marcus", "After-school homework mentor", "Mentoring", "Youth & education", "Help middle-school students with math homework and study habits. Bilingual mentors are a big help for our Spanish-speaking families.", "Ongoing / recurring", "In person", "28590", false, ["Tue|Afternoon", "Thu|Afternoon"], "Tue & Thu, 4:00 – 5:30 PM", 0, 5, 2, 21, true, [["Tutoring", false], ["Spanish", false]], 44, 15],
      ["opp_social", "org_trb", "mem_alan", "Holiday drive social posts", "Marketing or design help", "Housing", "Write and schedule eight Facebook and Instagram posts for our December repair-kit drive. We'll provide photos.", "Short-term project", "Remote", "", true, [], "Flexible over the next two weeks", 2, 1, 0, 18, false, [["Social media", true]], 14, 4],
      ["opp_roof", "org_trb", "mem_alan", "Roofing crew lead", "Hands-on labor", "Housing", "Lead a crew of four volunteers replacing shingles on a senior homeowner's roof.", "One-time", "In person", "27858", false, ["Sat|Morning"], "Saturday, 7:30 AM – 1:00 PM", 9, 1, 0, 21, false, [["OSHA-10", true], ["Carpentry", true]], 20, 8],
      ["opp_shelter", "org_gcp", "mem_omar", "Overnight warming shelter host", "Event support", "Housing", "Welcome guests, keep the space safe and calm, and help with breakfast at the winter warming shelter.", "Ongoing / recurring", "In person", "27858", false, ["Fri|Evening"], "Fridays, 10:00 PM – 6:00 AM", 7, 4, 1, 21, true, [["CPR / First aid", false]], 40, 8],
      ["opp_interp", "org_pac", "mem_tasha", "Spanish interpreter, family art night", "Professional / pro bono expertise", "Arts & culture", "Interpret for Spanish-speaking families during our monthly family art night and help with sign-in.", "Ongoing / recurring", "In person", "27858", false, ["Thu|Evening"], "Last Thursday monthly, 6:00 – 8:00 PM", 20, 2, 0, 18, false, [["Spanish", true]], 30, 14],
      ["opp_driver", "org_gcp", "mem_renee", "Meals van driver", "Hands-on labor", "Seniors", "Deliver hot meals to homebound seniors on a set weekday route. Use of the pantry van; clean driving record required.", "Ongoing / recurring", "In person", "27858", false, ["Mon|Morning", "Wed|Morning"], "Mon & Wed, 10:30 AM – 1:00 PM", 5, 3, 1, 21, true, [["Driving (clean record)", true]], 35, 7]
    ];
    opps.forEach(([id, orgId, createdBy, title, roleType, cause, description, commitment, format, zip, flexible, slots, whenText, start, needed, filled, minAge, bgCheck, skills, expires, open]) => db.opportunities.push({
      id, orgId, createdBy, title, roleType, cause, description, commitment, format, zip, location: format === "Remote" ? "Remote" : cityOf(zip), street: format === "In person" ? "403 W 5th St" : "", shareAddress: format === "In person",
      flexible, slots, whenText, startDate: d(start), expires: d(expires), needed, filled, minAge, bgCheck, skills: skills.map(([n, r]) => ({ skillId: S(n), required: r })), status: "Active", createdAt: d(-open)
    }));
    db.opportunities.push({ id: "opp_garden", orgId: "org_gcp", createdBy: "mem_renee", title: "Summer garden helpers", roleType: "Hands-on labor", cause: "Hunger & food security", description: "Weed and water the pantry's vegetable garden on weekday mornings.", commitment: "Short-term project", format: "In person", zip: "27858", location: "Greenville", street: "", shareAddress: false, flexible: false, slots: ["Wed|Morning"], whenText: "Wednesdays, 8–10 AM", startDate: d(-80), expires: d(-5), needed: 4, filled: 2, minAge: 18, bgCheck: false, skills: [], status: "Expired", createdAt: d(-90) });
    db.opportunities.push({ id: "opp_holiday", orgId: "org_gcp", createdBy: "mem_omar", title: "Holiday box sorting", roleType: "Event support", cause: "Hunger & food security", description: "Sort donated food into holiday boxes for 300 families. Families pick up the following week.", commitment: "One-time", format: "In person", zip: "27858", location: "Greenville", street: "403 W 5th St", shareAddress: true, flexible: false, slots: ["Sat|Afternoon"], whenText: "Saturday, 1:00 – 4:00 PM", startDate: d(30), expires: d(29), needed: 10, filled: 4, minAge: 18, bgCheck: false, skills: [], status: "Paused", createdAt: d(-6) });

    const I = (id, vol, opp, by, status, score, ago) => db.interests.push({ id, volunteerId: vol, oppId: opp, initiatedBy: by, response: "Interested", status, matchScore: score, createdAt: d(-ago) + "T10:00", decidedAt: status === "Pending" ? null : d(-ago + 1) + "T09:00", decidedBy: status === "Pending" ? null : (by === "Volunteer" ? "mem_renee" : vol) });
    I("int_1", "vol_maya", "opp_food", "Volunteer", "Pending", 88, 2);
    I("int_2", "vol_deshawn", "opp_food", "Volunteer", "Pending", 79, 1);
    I("int_3", "vol_jordan", "opp_5k", "Volunteer", "Accepted", 76, 8);
    I("int_4", "vol_jordan", "opp_mentor", "Volunteer", "Pending", 62, 3);
    I("int_5", "vol_ana", "opp_grant", "Organization", "Pending", 70, 1);
    I("int_6", "vol_priya", "opp_food", "Volunteer", "Accepted", 81, 6);
    db.interests.find(i => i.id === "int_3").decidedBy = "mem_leah";
    db.connections.push({ id: "con_1", interestId: "int_3", volunteerId: "vol_jordan", oppId: "opp_5k", createdAt: d(-7) + "T09:00", status: "Active" });
    db.connections.push({ id: "con_2", interestId: "int_6", volunteerId: "vol_priya", oppId: "opp_food", createdAt: d(-5) + "T09:00", status: "Active" });
    db.messages.push({ id: "msg_1", connectionId: "con_1", fromType: "member", fromId: "mem_leah", text: "Thanks for signing on, Jordan! Please meet at the blue tent by 6:45.", at: d(-7) + "T16:12" });
    db.messages.push({ id: "msg_2", connectionId: "con_1", fromType: "volunteer", fromId: "vol_jordan", text: "Will do. Should I bring anything?", at: d(-7) + "T18:40" });
    db.messages.push({ id: "msg_3", connectionId: "con_1", fromType: "member", fromId: "mem_leah", text: "Just sunscreen. We'll have shirts for everyone.", at: d(-6) + "T09:05" });
    db.hours.push({ id: "hrs_1", connectionId: "con_2", volunteerId: "vol_priya", date: d(-2), hours: 4, note: "Saturday distribution shift", status: "Submitted", confirmedBy: null, confirmedAt: null });
    db.saved.push({ id: "sav_1", volunteerId: "vol_jordan", oppId: "opp_grant", savedAt: d(-1) + "T12:00" });
    db.flags.push({ id: "flg_1", kind: "Volunteer profile", targetId: "vol_deshawn", what: "Volunteer profile: DeShawn M.", reason: "Reported for a link to a paid service (demo report)", at: d(0), status: "Open" });
    db.flags.push({ id: "flg_2", kind: "Posting", targetId: "opp_holiday", what: "Posting: Holiday box sorting", reason: "Reported as missing details (demo report)", at: d(-1), status: "Open" });
    notify(db, "volunteer", "vol_jordan", "Connected", "You're connected with Riley's Army for “Race-day registration table”. Contact details are now shared.", { oppId: "opp_5k", connectionId: "con_1" });
    notify(db, "volunteer", "vol_ana", "Invited", "Pitt Arts Collective thinks you'd be great for “Grant budget review”. Accept or decline from Connections.", { oppId: "opp_grant" });
    notifyOrg(db, "org_gcp", "NewInterest", "Maya is interested in “Saturday food distribution”. Review and accept or decline.", { oppId: "opp_food" });
    notifyOrg(db, "org_gcp", "HoursSubmitted", "Hours submitted for “Saturday food distribution”. Please confirm.", { connectionId: "con_2" });
    db.notifications.forEach(n => { n.sentAt = d(-1) + "T09:00"; });

    await Promise.all(users.map(async u => { u.salt = randomHex(16); u.pwHash = await hashPassword(DEMO_PW, u.salt); }));
    sweepExpired(db);
    return db;
  }

  function migrate(db) {
    if (!db || !db.meta || db.meta.schema !== SCHEMA_VERSION) return null;
    ["flags", "audit", "hours", "saved", "notifications", "messages"].forEach(k => { db[k] = db[k] || []; });
    db.loginAttempts = db.loginAttempts || {};
    return db;
  }

  const api = {
    SCHEMA_VERSION, PBKDF2_ITERATIONS, SESSION_IDLE_MIN, LOCKOUT_ATTEMPTS, LOW_INTEREST_DAYS, HELPLINE,
    CAUSES, ROLE_TYPES, COMMITMENTS, FORMATS, DAYS, TIMES, SKILL_CATEGORIES, ZIPS,
    isoDate, parseDate, addDays, daysBetween, fmtDate, norm, uid, today, nowStamp, ageOn, milesBetween, cityOf, slotLabel, openSpots,
    V, emailInUse, validateVolunteer, validatePreferences, validateOpportunity, validateOrgRegistration,
    activeSkillId, skillName, orgOf, oppIsLive, evaluate, volunteerFeed, candidatesFor, priorInterest, connected, volunteerPublicView, can,
    notify, notifyOrg, audit, expressInterest, notForMe, toggleSave, withdrawInterest, orgDecide, orgInvite, respondToInvite, sendMessage,
    saveOpportunity, setOppStatus, sweepExpired, findSkill, suggestSkill, reviewSkill, similarOrgs, decideOrg, saveWeights,
    logHours, confirmHours, lowInterest, reportStats, csv, exportVolunteers, exportConnections, deleteVolunteer,
    hashPassword, verifyPassword, randomHex, randomBase32, totp, verifyTotp, login, seed, migrate
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VCore = api;
})(typeof window !== "undefined" ? window : globalThis);
