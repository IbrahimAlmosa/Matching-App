/* VOLUNTR unit tests: business rules, matching engine, security helpers.
   Run: node tests/unit.js  -> prints a table and writes results/unit.json */
const C = require("../src/core.js");
const fs = require("fs");
const results = [];
async function tc(id, title, req, fn) {
  try { const detail = await fn(); results.push({ id, title, req, status: "Pass", detail: detail || "" }); }
  catch (e) { results.push({ id, title, req, status: "Fail", detail: e.message }); }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || "expected equal"}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const throwsUser = (fn, re) => { try { fn(); } catch (e) { assert(e.userFacing, "error was not user-facing: " + e.message); if (re) assert(re.test(e.message), "wrong message: " + e.message); return e.message; } throw new Error("expected an error"); };
const fresh = () => C.seed();
const sess = (type, id, extra = {}) => ({ type, id, mfa: true, lastActive: Date.now(), ...extra });
const vol = (db, id) => db.volunteers.find(v => v.id === id);
const opp = (db, id) => db.opportunities.find(o => o.id === id);

(async () => {
  await tc("TC-U01", "Seed data loads with every ERD table and valid foreign keys", "ERD, NFR-8", async () => {
    const db = await fresh();
    ["administrators", "organizations", "members", "volunteers", "skills", "opportunities", "interests", "connections", "messages", "saved", "notifications", "rules", "hours", "flags", "audit"].forEach(k => assert(Array.isArray(db[k]), "missing " + k));
    db.opportunities.forEach(o => assert(db.organizations.some(g => g.id === o.orgId), "opp without org " + o.id));
    db.members.forEach(m => assert(db.organizations.some(g => g.id === m.orgId), "member without org"));
    db.interests.forEach(i => assert(vol(db, i.volunteerId) && opp(db, i.oppId), "interest FK"));
    db.connections.forEach(c => assert(db.interests.some(i => i.id === c.interestId && i.status === "Accepted"), "connection without accepted interest"));
    return `${db.volunteers.length} volunteers, ${db.organizations.length} organizations, ${db.opportunities.length} opportunities`;
  });
  await tc("TC-U02", "Volunteers must be 18 or older (birthday edge cases)", "NFR-10, UC-VOL-01", async () => {
    const db = await fresh(), t = C.today(db), [y, m, d] = t.split("-").map(Number);
    const base = { firstName: "A", lastName: "B", email: "new@example.com", zip: "27858" };
    const turns18Today = `${y - 18}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const turns18Tomorrow = C.addDays(turns18Today, 1);
    assert(!C.validateVolunteer(db, { ...base, dob: turns18Today }).dob, "18 today should pass");
    assert(/18 and older/.test(C.validateVolunteer(db, { ...base, dob: turns18Tomorrow }).dob || ""), "17 should fail");
    assert(C.validateVolunteer(db, { ...base, dob: C.addDays(t, 1) }).dob, "future DOB should fail");
    return "18 today accepted; 17 (turns 18 tomorrow) and future dates rejected";
  });
  await tc("TC-U03", "Email must be valid and not already used by any account type", "UC-VOL-01, NFR-5", async () => {
    const db = await fresh(), base = { firstName: "A", lastName: "B", dob: "1990-01-01", zip: "27858" };
    assert(C.validateVolunteer(db, { ...base, email: "not-an-email" }).email, "bad format accepted");
    assert(/already uses/.test(C.validateVolunteer(db, { ...base, email: "JORDAN@example.com " }).email), "duplicate volunteer email (case) accepted");
    assert(/already uses/.test(C.validateVolunteer(db, { ...base, email: "renee@gcpantry.example.org" }).email), "email used by org member accepted");
    assert(!C.validateVolunteer(db, { ...base, email: "brand.new@example.com" }).email);
    return "Format, case-insensitive duplicates and cross-role duplicates caught";
  });
  await tc("TC-U04", "Password policy: 10+ characters with a letter and a number", "NFR-5", async () => {
    eq([C.V.password("short1"), C.V.password("longpassword"), C.V.password("1234567890"), C.V.password("Training2026!")], [false, false, false, true]);
  });
  await tc("TC-U05", "Location must be a Pitt County area ZIP code", "UC-VOL-01", async () => {
    eq([C.V.zip("27858"), C.V.zip("28590"), C.V.zip("90210"), C.V.zip("")], [true, true, false, false]);
  });
  await tc("TC-U06", "Match score is the weighted average of the six criteria", "FR Matching-1, UC-MAT-01", async () => {
    const db = await fresh(), ev = C.evaluate(db, vol(db, "vol_jordan"), opp(db, "opp_food"));
    const hand = Math.round(db.rules.reduce((s, r) => s + r.weight * ev.fit[r.id], 0) / 100);
    eq(ev.score, hand, "score");
    eq(ev.fit, { skill: 0, role: 100, cause: 100, schedule: 100, commitment: 100, distance: 100 }, "fit");
    return `Jordan × Saturday food distribution: fit ${JSON.stringify(ev.fit)} → ${ev.score}`;
  });
  await tc("TC-U07", "Missing a required skill excludes the pair, with the reason", "FR Matching-2, UC-MAT-02", async () => {
    const db = await fresh(), ev = C.evaluate(db, vol(db, "vol_jordan"), opp(db, "opp_social"));
    assert(!ev.eligible && /Requires Social media/.test(ev.fails.join()), ev.fails.join());
    assert(C.volunteerFeed(db, "vol_jordan").hidden.some(h => h.opp.id === "opp_social"), "not listed in hidden");
    return ev.fails[0];
  });
  await tc("TC-U08", "Background check required and volunteer unwilling → excluded", "FR Matching-2", async () => {
    const db = await fresh(), ev = C.evaluate(db, vol(db, "vol_maya"), opp(db, "opp_mentor"));
    assert(!ev.eligible && ev.fails.includes("Requires a background check"));
  });
  await tc("TC-U09", "No overlapping free time → excluded; flexible timing always fits", "FR Matching-2", async () => {
    const db = await fresh();
    const a = C.evaluate(db, vol(db, "vol_jordan"), opp(db, "opp_shelter"));
    assert(!a.eligible && /Schedule conflict/.test(a.fails.join()), "fixed slot conflict not caught");
    const b = C.evaluate(db, vol(db, "vol_linda"), opp(db, "opp_grant"));
    eq(b.fit.schedule, 100, "flexible schedule fit");
  });
  await tc("TC-U10", "Distance beyond the volunteer's travel radius → excluded", "FR Matching-1/2", async () => {
    const db = await fresh(), v = { ...vol(db, "vol_maya"), zip: "28586", radius: 5 };
    const ev = C.evaluate(db, v, opp(db, "opp_food"));
    assert(!ev.eligible && /miles away/.test(ev.fails.join()), ev.fails.join());
    return ev.fails.find(f => /miles/.test(f));
  });
  await tc("TC-U11", "Opportunity minimum age above 18 is enforced", "FR Org-2, FR Matching-2", async () => {
    const db = await fresh(), v = { ...vol(db, "vol_deshawn"), dob: C.addDays(C.today(db), -(20 * 365 + 5)) };
    const ev = C.evaluate(db, v, opp(db, "opp_roof"));
    assert(ev.fails.includes("Minimum age is 21"));
  });
  await tc("TC-U12", "Unapproved organizations' postings never reach volunteers", "FR Admin-1, BR org approval", async () => {
    const db = await fresh(), s = sess("member", "mem_gloria", { orgId: "org_elc" });
    throwsUser(() => C.saveOpportunity(db, s, {}), /approved/);
    db.organizations.find(o => o.id === "org_elc").status = "Approved";
    const o = C.saveOpportunity(db, s, { title: "Reading tutor", roleType: "Mentoring", cause: "Youth & education", description: "Tutor adult learners in reading once a week.", commitment: "Ongoing / recurring", format: "In person", zip: "28513", slots: ["Tue|Afternoon"], startDate: C.today(db), expires: C.addDays(C.today(db), 20), needed: 2, minAge: 18, skills: [] });
    db.organizations.find(x => x.id === "org_elc").status = "Suspended";
    assert(!C.volunteerFeed(db, "vol_priya").ranked.some(r => r.opp.id === o.id), "suspended org's posting shown");
    db.organizations.find(x => x.id === "org_elc").status = "Approved";
    assert(C.volunteerFeed(db, "vol_priya").ranked.some(r => r.opp.id === o.id), "approved posting missing");
    return "Pending org blocked from posting; suspended org hidden; approved org shown";
  });
  await tc("TC-U13", "Expired postings drop out of matching automatically", "NFR-12, FR Org-4", async () => {
    const db = await fresh();
    assert(C.volunteerFeed(db, "vol_jordan").ranked.some(r => r.opp.id === "opp_food"));
    db.settings.clockOffsetDays = 10;
    const n = C.sweepExpired(db);
    assert(opp(db, "opp_food").status === "Expired", "not expired");
    assert(!C.volunteerFeed(db, "vol_jordan").ranked.some(r => r.opp.id === "opp_food"), "expired still shown");
    assert(db.notifications.some(x => x.type === "Expired" && x.toId === "mem_renee"), "owner not reminded");
    return `${n} postings expired after moving the clock 10 days`;
  });
  await tc("TC-U14", "Admin weights re-rank matches and must total 100", "FR Matching-3, UC-MAT-03", async () => {
    const db = await fresh(), admin = sess("admin", "adm_nichole");
    const before = C.volunteerFeed(db, "vol_jordan").ranked.map(r => r.opp.id);
    const w = db.rules.map(r => ({ ...r, weight: { skill: 0, role: 10, cause: 10, schedule: 40, commitment: 10, distance: 30 }[r.id] }));
    const after = C.volunteerFeed(db, "vol_jordan", w).ranked.map(r => r.opp.id);
    assert(JSON.stringify(before) !== JSON.stringify(after), "order did not change");
    throwsUser(() => C.saveWeights(db, admin, db.rules.map(r => ({ ...r, weight: 10 }))), /add up to 100/);
    C.saveWeights(db, admin, w);
    assert(db.audit.some(a => a.action === "rules.update"), "no audit entry");
    return `Before: ${before.join(", ")}. After: ${after.join(", ")}`;
  });
  await tc("TC-U15", "Contact details hidden until a mutual connection exists", "FR Connect-1, NFR-4", async () => {
    const db = await fresh(), renee = sess("member", "mem_renee", { orgId: "org_gcp" });
    const pv = C.volunteerPublicView(db, vol(db, "vol_maya"), renee);
    assert(!pv.email && !pv.lastName && !pv.phone, "contact leaked before connection");
    assert(!JSON.stringify(C.candidatesFor(db, "opp_food")).includes("@"), "candidate list contains an email");
    C.orgDecide(db, renee, "int_1", true);
    const pv2 = C.volunteerPublicView(db, vol(db, "vol_maya"), renee);
    eq([pv2.lastName, pv2.email], ["Thompson", "maya@example.com"]);
    const leah = sess("member", "mem_leah", { orgId: "org_ra" });
    assert(!C.volunteerPublicView(db, vol(db, "vol_maya"), leah).email, "other org sees contact");
    return "Hidden before, released to the connected org only";
  });
  await tc("TC-U16", "Volunteer interest + organization accept creates a connection and notifies both", "FR Connect-1/2, UC-CON-01/02", async () => {
    const db = await fresh(), j = sess("volunteer", "vol_jordan"), renee = sess("member", "mem_renee", { orgId: "org_gcp" });
    const i = C.expressInterest(db, j, "opp_treas");
    throwsUser(() => C.expressInterest(db, j, "opp_treas"), /already/);
    const c = C.orgDecide(db, renee, i.id, true);
    assert(c && db.connections.includes(c));
    eq(opp(db, "opp_treas").status, "Filled", "single-spot posting should fill");
    assert(db.notifications.some(n => n.toId === "vol_jordan" && n.type === "Connected" && n.connectionId === c.id), "volunteer not notified");
    assert(db.notifications.some(n => n.toId === "mem_omar" && n.type === "Connected"), "org editor not notified");
    return "Connection made; posting filled; both sides notified";
  });
  await tc("TC-U17", "Organization can express interest first; volunteer accepts", "FR Org-3, BR matching workflow", async () => {
    const db = await fresh(), ana = sess("volunteer", "vol_ana");
    const c = C.respondToInvite(db, ana, "int_5", true);
    assert(c && c.volunteerId === "vol_ana");
    const renee = sess("member", "mem_renee", { orgId: "org_gcp" });
    const inv = C.orgInvite(db, renee, "opp_food", "vol_carl");
    eq(inv.initiatedBy, "Organization");
    throwsUser(() => C.orgInvite(db, renee, "opp_food", "vol_carl"), /already/);
  });
  await tc("TC-U18", "Declined and 'Not for me' pairs are never shown again", "FR Vol-2, Level 1 DFD 4.2", async () => {
    const db = await fresh(), renee = sess("member", "mem_renee", { orgId: "org_gcp" }), j = sess("volunteer", "vol_jordan");
    C.orgDecide(db, renee, "int_2", false);
    assert(!C.volunteerFeed(db, "vol_deshawn").ranked.some(r => r.opp.id === "opp_food"), "declined pair shown");
    assert(db.notifications.some(n => n.toId === "vol_deshawn" && n.type === "Declined"), "decline not notified");
    C.notForMe(db, j, "opp_food");
    assert(!C.volunteerFeed(db, "vol_jordan").ranked.some(r => r.opp.id === "opp_food"), "dismissed shown to volunteer");
    assert(!C.candidatesFor(db, "opp_food").some(c => c.volunteerId === "vol_jordan"), "dismissed shown to org");
  });
  await tc("TC-U19", "Role-based permissions block cross-organization and non-admin actions", "NFR-5, UC-ADM", async () => {
    const db = await fresh();
    const leah = sess("member", "mem_leah", { orgId: "org_ra" }), omar = sess("member", "mem_omar", { orgId: "org_gcp" }), j = sess("volunteer", "vol_jordan");
    throwsUser(() => C.orgDecide(db, leah, "int_1", true), /Only members/);
    throwsUser(() => C.setOppStatus(db, leah, "opp_food", "Closed"));
    assert(!C.can(db, omar, "org.manageTeam"), "Editor can manage team");
    throwsUser(() => C.decideOrg(db, j, "org_elc", true), /administrators/);
    throwsUser(() => C.decideOrg(db, { type: "admin", id: "adm_nichole", mfa: false }, "org_elc", true), /administrators/);
    throwsUser(() => C.saveWeights(db, omar, db.rules), /administrators/);
    return "Other org, Editor, volunteer and admin-without-MFA all refused";
  });
  await tc("TC-U20", "Skills: duplicates caught, suggestions pending, merge moves volunteer skills", "BR-SK-01", async () => {
    const db = await fresh(), admin = sess("admin", "adm_nichole");
    const a = C.suggestSkill(db, sess("volunteer", "vol_maya"), "  grant WRITING ");
    assert(a.existing, "case-insensitive duplicate created");
    const b = C.suggestSkill(db, sess("volunteer", "vol_maya"), "Beekeeping");
    eq(b.skill.status, "Pending");
    vol(db, "vol_linda").skills.push("skl_p1");
    const accounting = db.skills.find(s => s.name === "Accounting").id;
    C.reviewSkill(db, admin, "skl_p1", "merge", accounting);
    assert(vol(db, "vol_linda").skills.includes(accounting) && !vol(db, "vol_linda").skills.includes("skl_p1"), "merge did not move skill");
    assert(db.notifications.some(n => n.toId === "vol_linda" && n.type === "SkillReview"), "suggester not told");
    throwsUser(() => C.reviewSkill(db, sess("member", "mem_renee"), b.skill.id, "approve"), /administrators/);
    return "Bookkeeping merged into Accounting; Linda now matches Accounting roles";
  });
  await tc("TC-U21", "Possible duplicate organizations are flagged during approval", "BR org duplicates", async () => {
    const db = await fresh(), sim = C.similarOrgs(db, db.organizations.find(o => o.id === "org_gcp2"));
    eq(sim.map(o => o.id), ["org_gcp"]);
    eq(C.similarOrgs(db, db.organizations.find(o => o.id === "org_gysl")).length, 0, "false positive");
  });
  await tc("TC-U22", "Volunteer hours: validation, organization confirmation, report total", "Client Sprint 2 answer 8 (hours)", async () => {
    const db = await fresh(), p = sess("volunteer", "vol_priya"), renee = sess("member", "mem_renee", { orgId: "org_gcp" });
    throwsUser(() => C.logHours(db, p, "con_2", C.addDays(C.today(db), 1), 2), /future/);
    throwsUser(() => C.logHours(db, p, "con_2", C.today(db), 30), /between/);
    throwsUser(() => C.logHours(db, sess("volunteer", "vol_jordan"), "con_2", C.today(db), 2), /own/);
    const before = C.reportStats(db).hours;
    C.confirmHours(db, renee, "hrs_1", true);
    eq(C.reportStats(db).hours, before + 4, "report hours");
    throwsUser(() => C.confirmHours(db, renee, "hrs_1", true), /already/);
  });
  await tc("TC-U23", "Needs with little or no interest are surfaced for PCC", "FR Admin-2, UC-ADM-02", async () => {
    const db = await fresh(), li = C.lowInterest(db);
    assert(li.length > 0 && li.every(x => x.days >= C.LOW_INTEREST_DAYS && x.interested <= 1));
    assert(li.some(x => x.opp.id === "opp_treas"));
    assert(!li.some(x => x.opp.id === "opp_food"), "food distribution has 3 interests");
    return li.map(x => `${x.opp.title} (${x.days}d, ${x.interested})`).join("; ");
  });
  await tc("TC-U24", "CSV export quotes commas and neutralizes spreadsheet formulas", "FR Admin-4, NFR-5", async () => {
    const out = C.csv([["a", "b,c", '=HYPERLINK("x")', 'say "hi"']]);
    eq(out, 'a,"b,c","\'=HYPERLINK(""x"")","say ""hi"""');
    const db = await fresh(); assert(C.exportVolunteers(db).split("\r\n").length === db.volunteers.length + 1);
  });
  await tc("TC-U25", "Passwords are salted PBKDF2 hashes, never stored in plain text", "NFR-5", async () => {
    const db = await fresh(), j = vol(db, "vol_jordan");
    assert(!JSON.stringify(db).includes("Training2026!"), "plain password stored");
    assert(await C.verifyPassword("Training2026!", j) && !(await C.verifyPassword("training2026!", j)));
    assert(vol(db, "vol_maya").salt !== j.salt && vol(db, "vol_maya").pwHash !== j.pwHash, "salts reused");
  });
  await tc("TC-U26", "Two-step codes follow RFC 6238 (published test vector)", "Client: MFA for admins", async () => {
    // RFC 6238 Appendix B, SHA-1, T=59s -> 94287082 (8 digits); 6-digit truncation is 287082.
    eq(await C.totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000), "287082");
    eq(await C.totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1111111109000), "081804");
    assert(await C.verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59000));
    assert(!(await C.verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "123456", 59000)));
  });
  await tc("TC-U27", "Admin sign-in requires the second step; 5 wrong passwords lock the account", "NFR-5, client MFA answer", async () => {
    const db = await fresh();
    const r = await C.login(db, "nichole@pcc.example.org", "Training2026!");
    assert(r.needsMfa && r.session.mfa === false, "admin got in without MFA");
    const v = await C.login(db, "jordan@example.com", "Training2026!");
    assert(!v.needsMfa && v.session.mfa === true);
    for (let k = 0; k < 5; k++) { try { await C.login(db, "maya@example.com", "wrong-password1"); } catch { } }
    let msg = ""; try { await C.login(db, "maya@example.com", "Training2026!"); } catch (e) { msg = e.message; }
    assert(/Too many attempts/.test(msg), "not locked: " + msg);
  });
  await tc("TC-U28", "Deleting a volunteer account removes personal data but keeps counts", "Client answer 5, NFR-5 retention", async () => {
    const db = await fresh(), j = sess("volunteer", "vol_jordan");
    const conns = db.connections.length;
    C.deleteVolunteer(db, j, "vol_jordan");
    const v = vol(db, "vol_jordan");
    assert(v.status === "Deleted" && v.email !== "jordan@example.com" && !v.phone && v.firstName === "Deleted" && !v.pwHash);
    eq(db.connections.length, conns, "connection counts kept");
    assert(!db.messages.some(m => m.fromId === "vol_jordan"), "messages kept");
    let threw = false; try { await C.login(db, "jordan@example.com", "Training2026!"); } catch { threw = true; }
    assert(threw, "deleted account can sign in");
  });
  await tc("TC-U29", "Posting form rejects incomplete or impossible data", "FR Org-2, UC-ORG-02", async () => {
    const db = await fresh();
    const e = C.validateOpportunity(db, { title: "x", roleType: "", cause: "", description: "short", commitment: "", format: "In person", zip: "", slots: [], needed: 0, minAge: 16, startDate: "", expires: C.addDays(C.today(db), -1), shareAddress: true, street: "" });
    ["title", "roleType", "cause", "description", "commitment", "slots", "zip", "needed", "minAge", "startDate", "expires", "street"].forEach(k => assert(e[k], "no error for " + k));
    return Object.keys(e).length + " field errors returned";
  });
  await tc("TC-U30", "Only the two connected parties can message, up to 1,000 characters", "FR Connect-2", async () => {
    const db = await fresh();
    C.sendMessage(db, sess("volunteer", "vol_jordan"), "con_1", "See you Saturday!");
    throwsUser(() => C.sendMessage(db, sess("volunteer", "vol_maya"), "con_1", "hi"), /own/);
    throwsUser(() => C.sendMessage(db, sess("member", "mem_renee", { orgId: "org_gcp" }), "con_1", "hi"), /own/);
    throwsUser(() => C.sendMessage(db, sess("volunteer", "vol_jordan"), "con_1", "x".repeat(1001)), /1,000/);
  });
  await tc("TC-U31", "New posting alerts strong matches (trigger 3 in the Level 1 DFD)", "FR Connect-3, DFD 4.1", async () => {
    const db = await fresh(), renee = sess("member", "mem_renee", { orgId: "org_gcp" });
    const before = db.notifications.filter(n => n.type === "NewMatch").length;
    C.saveOpportunity(db, renee, { title: "Pantry finance committee", roleType: "Board / committee service", cause: "Hunger & food security", description: "Join the finance committee and review the monthly budget.", commitment: "Ongoing / recurring", format: "Hybrid", zip: "27858", slots: ["Tue|Evening"], startDate: C.today(db), expires: C.addDays(C.today(db), 30), needed: 2, minAge: 18, skills: [{ skillId: db.skills.find(s => s.name === "Nonprofit finance").id, required: true }] });
    const alerts = db.notifications.filter(n => n.type === "NewMatch");
    assert(alerts.length > before && alerts.some(n => n.toId === "vol_jordan"), "Jordan not alerted");
    return alerts.map(n => n.toId).join(", ") + " alerted";
  });
  await tc("TC-U32", "Matching 500 volunteers × 50 postings finishes quickly", "NFR-6 performance", async () => {
    const db = await fresh(), base = vol(db, "vol_jordan"), o0 = opp(db, "opp_food");
    for (let i = 0; i < 500; i++) db.volunteers.push({ ...base, id: "v" + i, email: `v${i}@example.com` });
    for (let i = 0; i < 50; i++) db.opportunities.push({ ...o0, id: "o" + i });
    const t = Date.now(); for (let i = 0; i < 20; i++) C.volunteerFeed(db, "v" + i); C.candidatesFor(db, "o1");
    const ms = Date.now() - t; assert(ms < 1500, ms + "ms");
    return `20 volunteer feeds + 1 candidate list in ${ms} ms`;
  });

  fs.mkdirSync(__dirname + "/results", { recursive: true });
  fs.writeFileSync(__dirname + "/results/unit.json", JSON.stringify({ ranAt: new Date().toISOString(), node: process.version, results }, null, 1));
  results.forEach(r => console.log(`${r.status === "Pass" ? "PASS" : "FAIL"} ${r.id} ${r.title}${r.status === "Fail" || r.detail ? " :: " + r.detail : ""}`));
  console.log(`\n${results.filter(r => r.status === "Pass").length}/${results.length} passed`);
  process.exitCode = results.some(r => r.status === "Fail") ? 1 : 0;
})();
