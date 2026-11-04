/* VOLUNTR end-to-end tests in Chromium (Playwright).
   Run: node tests/e2e.js  -> writes results/e2e.json and screenshots to results/shots */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const URL = "file://" + path.resolve(__dirname, "../voluntr.html");
const SHOTS = path.join(__dirname, "results/shots"); fs.mkdirSync(SHOTS, { recursive: true });
const PW = "Training2026!";
const results = [];
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

let browser;
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, ...(opts.ctx || {}) });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(URL); await page.waitForSelector("#screen h2");
  return page;
}
async function tc(id, title, req, fn) {
  let page;
  try { const r = await fn(p => (page = p)); if (page && page.errors.length) throw new Error("Console errors: " + page.errors.join(" | ")); results.push({ id, title, req, status: "Pass", detail: r || "" }); }
  catch (e) { if (page) await page.screenshot({ path: path.join(SHOTS, id + "-fail.png") }).catch(() => {}); results.push({ id, title, req, status: "Fail", detail: e.message.split("\n")[0] }); }
  finally { if (page) await page.context().close(); }
}
const toastText = p => p.textContent("#toast");
async function signIn(p, email, pw = PW) {
  if (await p.$("[data-act=signOut]")) await p.click("[data-act=signOut] >> nth=0");
  if (!(await p.$("#si-email"))) await p.click("[data-act=goSignin] >> nth=0");
  await p.fill("#si-email", email); await p.fill("#si-pw", pw); await p.click("form[data-form=signin] button");
  if (email.startsWith("nichole")) {
    await p.waitForSelector("#code");
    const code = await p.evaluate(() => window.__voluntr.C.totp(window.__voluntr.db.administrators[0].mfaSecret));
    await p.fill("#code", code); await p.click("form[data-form=mfa] button");
  }
  await p.waitForSelector("#tabs:not([hidden])");
}
const tab = (p, t) => p.click(`#tabs [data-tab=${t}]`);

(async () => {
  browser = await chromium.launch();

  await tc("TC-E01", "New volunteer completes sign-up and sees ranked matches", "UC-VOL-01/02, FR Vol-1/2, NFR-2", async set => {
    const p = set(await newPage());
    const t0 = Date.now();
    await p.click("text=Start sign-up");
    await p.fill("#wf", "Taylor"); await p.fill("#wl", "Nguyen"); await p.fill("#we", "taylor.nguyen@example.com"); await p.fill("#wpw", "Volunteer2026");
    await p.fill("#wb", "2010-05-05"); await p.selectOption("#wz", "27858"); await p.check("#wt");
    await p.click("form[data-form=wizard] button.solid");
    assert(/18 and older/.test(await p.textContent("#errsum")), "under-18 error not shown");
    await p.fill("#wb", "1990-05-05"); await p.click("form[data-form=wizard] button.solid");
    await p.click("form[data-form=wizard] button.solid");
    assert(/at least one cause/.test(await p.textContent("#errsum")), "empty causes allowed");
    await p.click("[data-act=pick][data-val='Hunger & food security']"); await p.click("form[data-form=wizard] button.solid");
    await p.click("[data-act=pick][data-val='Hands-on labor']"); await p.click("[data-act=pick][data-val='Event support']"); await p.click("form[data-form=wizard] button.solid");
    await p.fill("#skq", "event"); await p.click("[data-act=pickSkill]:has-text('Event setup')"); await p.click("form[data-form=wizard] button.solid");
    await p.click("[data-act=slot][data-val='Sat|Morning']"); await p.click("[data-act=pick][data-key=commitments][data-val='One-time']"); await p.click("[data-act=pick][data-key=format][data-val='In person']");
    await p.click("form[data-form=wizard] button.solid");
    assert(/Hunger & food security/.test(await p.textContent(".sum")), "review step missing causes");
    await p.screenshot({ path: path.join(SHOTS, "E01-review.png") });
    await p.click("text=Create my profile");
    await p.waitForSelector("article.opp");
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const title = await p.textContent("article.opp h2");
    await p.screenshot({ path: path.join(SHOTS, "E01-discover.png") });
    await p.reload(); await p.waitForSelector("#tabs:not([hidden])");
    assert(/Taylor/.test(await p.textContent("#who")), "session/data not kept after reload");
    return `Top match: “${title}”. Scripted sign-up took ${secs}s; data and session survived a reload.`;
  });

  await tc("TC-E02", "Interest → organization accepts → contacts released → messages both ways", "UC-CON-01/02/04, FR Connect-1/2, NFR-4", async set => {
    const p = set(await newPage());
    await signIn(p, "jordan@example.com"); await tab(p, "discover");
    const first = await p.textContent("article.opp h2");
    assert(first === "Board treasurer", "unexpected top card " + first);
    await p.click("[data-act=interest]");
    assert(/Interest sent/.test(await toastText(p)));
    await signIn(p, "renee@gcpantry.example.org"); await tab(p, "review");
    await p.selectOption("#rf", { label: "Board treasurer (Active)" });
    const card = p.locator(".card", { hasText: "Jordan" }).first();
    assert(!(await card.textContent()).includes("jordan@example.com"), "email visible before accept");
    await card.locator("[data-act=accept]").click();
    await p.click("[data-act=openConn]");
    assert((await p.textContent(".facts")).includes("jordan@example.com"), "email not released to org after accept");
    await p.fill("#msgIn", "Welcome aboard, Jordan!"); await p.click("form[data-form=msg] button");
    await signIn(p, "jordan@example.com"); await tab(p, "connections");
    await p.click("[data-act=openConn]:has-text('Board treasurer')");
    const facts = await p.textContent(".facts");
    assert(facts.includes("renee@gcpantry.example.org") && /Welcome aboard/.test(await p.textContent(".msg >> nth=-1")), "volunteer can't see contact or message");
    await p.fill("#msgIn", "Thanks! See you at the January meeting."); await p.click("form[data-form=msg] button");
    await p.screenshot({ path: path.join(SHOTS, "E02-conversation.png") });
    const unread = await p.evaluate(() => window.__voluntr.db.notifications.filter(n => n.toId === "mem_renee" && n.type === "Message").length);
    assert(unread >= 1, "org not notified of message");
    return "Contact hidden before accept, shown to both after; 2 messages exchanged; notifications sent";
  });

  await tc("TC-E03", "Organization registers, waits for PCC approval, then posts a need that reaches volunteers", "UC-ORG-01/02, UC-ADM-01, FR Admin-1", async set => {
    const p = set(await newPage());
    await p.click("text=Register an organization");
    await p.fill("#rn", "Pitt County Animal Rescue Friends"); await p.fill("#rm", "Foster and adoption support for rescued cats and dogs in Pitt County.");
    await p.click("[data-act=pick][data-scope=reg][data-val='Community spaces']"); await p.selectOption("#rz", "27834");
    await p.fill("#rf", "Sam"); await p.fill("#rl", "Patel"); await p.fill("#rem", "sam@pcarf.example.org"); await p.fill("#rpw", "Rescue2026pets"); await p.check("form[data-form=orgreg] input[type=checkbox]");
    await p.click("text=Submit for PCC approval");
    await p.waitForSelector("text=PCC is reviewing your organization");
    await tab(p, "post"); assert(/needs PCC approval/.test(await p.textContent("#screen")), "unapproved org could open the form");
    await signIn(p, "nichole@pcc.example.org"); await tab(p, "approvals");
    await p.locator(".card", { hasText: "Pitt County Animal Rescue Friends" }).locator("[data-act=approveOrg]").click();
    await signIn(p, "sam@pcarf.example.org", "Rescue2026pets"); await tab(p, "post");
    await p.fill("#pt", "Weekend adoption event helpers");
    await p.click("[data-act=one][data-key=roleType][data-val='Event support']");
    await p.selectOption("#pc", "Community spaces");
    await p.fill("#pd", "Greet visitors, walk dogs between meet-and-greets and help families fill out forms.");
    await p.click("[data-act=one][data-key=commitment][data-val='One-time']");
    await p.click("[data-act=slot][data-val='Sat|Morning']");
    await p.click("text=Publish need");
    const t = await toastText(p);
    assert(/is live/.test(t), "post failed: " + t);
    await signIn(p, "deshawn@example.com"); await tab(p, "discover");
    const titles = await p.evaluate(() => window.__voluntr.C.volunteerFeed(window.__voluntr.db, "vol_deshawn").ranked.map(r => r.opp.title));
    assert(titles.includes("Weekend adoption event helpers"), "new posting not in DeShawn's matches: " + titles);
    return t + ` DeShawn's matches now include it (rank ${titles.indexOf("Weekend adoption event helpers") + 1} of ${titles.length}).`;
  });

  await tc("TC-E04", "Admin sign-in rejects a wrong code and accepts the current one", "Client: MFA required for admins", async set => {
    const p = set(await newPage());
    await p.click("[data-act=goSignin] >> nth=0"); await p.fill("#si-email", "nichole@pcc.example.org"); await p.fill("#si-pw", PW); await p.click("form[data-form=signin] button");
    await p.fill("#code", "000000"); await p.click("form[data-form=mfa] button");
    assert(/didn't work/.test(await p.textContent("#errsum")), "wrong code accepted");
    assert(await p.$("#tabs[hidden]"), "admin tabs shown before MFA");
    const code = await p.evaluate(() => window.__voluntr.C.totp(window.__voluntr.db.administrators[0].mfaSecret));
    await p.fill("#code", code); await p.click("form[data-form=mfa] button");
    await p.waitForSelector("#tabs [data-tab=approvals]");
    await p.click("[data-act=signOut] >> nth=0"); await p.click("[data-act=goSignin] >> nth=0"); await p.fill("#si-email", "maya@example.com");
    for (let i = 0; i < 5; i++) { await p.fill("#si-pw", "wrongpass99"); await p.click("form[data-form=signin] button"); }
    await p.fill("#si-pw", PW); await p.click("form[data-form=signin] button");
    assert(/Too many attempts/.test(await p.textContent("#errsum")), "no lockout after 5 tries");
    return "Wrong code refused; correct code accepted; lockout after 5 wrong passwords";
  });

  await tc("TC-E05", "Admin changes matching weights with a live preview and audit trail", "UC-MAT-03, FR Matching-3", async set => {
    const p = set(await newPage());
    await signIn(p, "nichole@pcc.example.org"); await tab(p, "matching");
    await p.fill("#w0", "0"); await p.dispatchEvent("#w0", "input");
    assert(await p.isDisabled("[data-act=saveWeights]"), "save enabled when total is 70");
    await p.fill("#w3", "45"); await p.dispatchEvent("#w3", "input");
    const total = await p.textContent("#wtotal"); assert(total.startsWith("100"), total);
    const cols = await p.$$eval(".grid-2 ol", ols => ols.map(o => o.textContent));
    assert(cols[0] !== cols[1], "preview did not change");
    await p.click("[data-act=saveWeights]");
    await tab(p, "people");
    assert(/rules\.update/.test(await p.textContent(".tbl >> nth=-1")), "no audit entry");
    return "Preview re-ranked Jordan's list; save blocked at 70/100; change logged";
  });

  await tc("TC-E06", "Volunteer suggests a new skill; admin merges it into an existing one", "BR-SK-01", async set => {
    const p = set(await newPage());
    await signIn(p, "maya@example.com"); await tab(p, "profile");
    await p.click("[data-act=editProfile][data-step='3']");
    await p.fill("#skq", "Forklift driving"); await p.click("[data-act=suggestSkill]");
    assert(/PCC will review/.test(await toastText(p)));
    for (let i = 0; i < 2; i++) await p.click("form[data-form=wizard] button.solid");
    await p.click("text=Save preferences");
    assert(/pending review/.test(await p.textContent("#screen")), "pending label missing");
    await signIn(p, "nichole@pcc.example.org"); await tab(p, "approvals");
    const card = p.locator(".card", { hasText: "Forklift driving" });
    await card.locator("select[id^=mg-]").selectOption({ label: "Event setup" });
    await card.locator("[data-act=skillMerge]").click();
    const ok = await p.evaluate(() => { const db = window.__voluntr.db, v = db.volunteers.find(x => x.id === "vol_maya"); return v.skills.map(id => db.skills.find(s => s.id === id).name); });
    assert(ok.includes("Event setup") && !ok.includes("Forklift driving"), ok.join());
    return "Maya's skills after merge: " + ok.join(", ");
  });

  await tc("TC-E07", "Volunteer logs hours, organization confirms, admin report updates", "Client Sprint 2 answer 8", async set => {
    const p = set(await newPage());
    await signIn(p, "nichole@pcc.example.org"); await tab(p, "reports");
    const before = +(await p.textContent(".kpi:has-text('Confirmed volunteer hours') b"));
    await signIn(p, "priya@example.com"); await tab(p, "connections"); await p.click("[data-act=openConn]");
    await p.fill("#hh", "3.5"); await p.click("form[data-form=hours] button");
    await signIn(p, "renee@gcpantry.example.org"); await tab(p, "review");
    await p.selectOption("#rf", { label: "Saturday food distribution (Active)" });
    await p.click(".card:has-text('Priya') [data-act=openConn]");
    const n = await p.locator("[data-act=hrsOk]").count();
    for (let i = 0; i < n; i++) await p.locator("[data-act=hrsOk]").first().click();
    await signIn(p, "nichole@pcc.example.org"); await tab(p, "reports");
    const after = +(await p.textContent(".kpi:has-text('Confirmed volunteer hours') b"));
    assert(after === before + 7.5, `hours ${before} → ${after}`);
    return `Confirmed hours ${before} → ${after}`;
  });

  await tc("TC-E08", "Accessibility basics: field labels, button names, visible keyboard focus", "NFR-1 (WCAG 2.1 AA)", async set => {
    const p = set(await newPage());
    const checkScreen = async label => {
      const issues = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll("#app input:not([type=hidden]), #app select, #app textarea").forEach(el => {
          const ok = (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label") || el.getAttribute("aria-label");
          if (!ok) out.push("unlabelled " + el.outerHTML.slice(0, 60));
        });
        document.querySelectorAll("#app button").forEach(b => { if (!(b.textContent.trim() || b.getAttribute("aria-label"))) out.push("nameless button " + b.outerHTML.slice(0, 60)); });
        return out;
      });
      if (issues.length) throw new Error(label + ": " + issues.join("; "));
    };
    await checkScreen("landing"); await p.click("text=Start sign-up"); for (let s = 0; s < 1; s++) await checkScreen("wizard");
    await signIn(p, "renee@gcpantry.example.org"); for (const t of ["postings", "review", "post", "organization"]) { await tab(p, t); await checkScreen(t); }
    await signIn(p, "nichole@pcc.example.org"); for (const t of ["approvals", "attention", "reports", "matching", "people"]) { await tab(p, t); await checkScreen(t); }
    await p.keyboard.press("Tab"); const focused = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert(focused !== "none", "no visible focus outline");
    return "No unlabelled fields or nameless buttons on 11 screens; visible focus ring";
  });

  await tc("TC-E09", "Phone layout: no sideways scrolling, bottom tabs, 44px+ tap targets", "NFR-1 mobile-first, NFR-6", async set => {
    const p = set(await newPage({ viewport: { width: 375, height: 740 }, ctx: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }));
    await signIn(p, "jordan@example.com");
    const report = [];
    assert(await p.getAttribute("#app", "data-device") === "phone", "phone shell not used at 375px");
    for (const t of ["home", "discover", "saved", "connections", "profile"]) {
      await tab(p, t);
      const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, scr: document.querySelector("#screen").scrollWidth - document.querySelector("#screen").clientWidth }));
      if (o.sw > o.cw + 1 || o.scr > 1) report.push(`${t} overflows by ${Math.max(o.sw - o.cw, o.scr)}px`);
    }
    await tab(p, "discover"); await p.screenshot({ path: path.join(SHOTS, "E09-phone-discover.png") });
    const small = await p.$$eval("article.opp .actions button", bs => bs.filter(b => b.getBoundingClientRect().height < 44).length);
    if (small) report.push(small + " action buttons under 44px");
    const tabsAtBottom = await p.evaluate(() => { const r = document.querySelector("#tabs").getBoundingClientRect(); return r.bottom >= document.querySelector("#app").getBoundingClientRect().bottom - 2; });
    if (!tabsAtBottom) report.push("tabs not at bottom");
    if (report.length) throw new Error(report.join("; "));
    return "5 volunteer screens fit 375px wide";
  });

  await tc("TC-E10", "Text-size control enlarges content for older users", "NFR-1 readable for older users", async set => {
    const p = set(await newPage());
    const h = () => p.evaluate(() => document.querySelector("#screen h2").getBoundingClientRect().height);
    const a = await h(); await p.click("[data-size='1.3']"); const b = await h();
    assert(b > a * 1.2, `${a} → ${b}`);
    return `Heading height ${a.toFixed(0)}px → ${b.toFixed(0)}px`;
  });

  await tc("TC-E11", "Sign-out and 30-minute idle timeout end the session", "NFR-5", async set => {
    const p = set(await newPage());
    await signIn(p, "jordan@example.com");
    await p.evaluate(() => { window.__voluntr.S.session.lastActive = Date.now() - 31 * 60000; });
    await p.click("#tabs [data-tab=saved]");
    await p.waitForSelector("text=signed out after 30 minutes");
    assert(await p.$("#tabs[hidden]"), "still signed in");
    await signIn(p, "jordan@example.com"); await p.click("[data-act=signOut] >> nth=0");
    await p.reload(); await p.waitForSelector("#screen h2");
    assert(await p.$("#tabs[hidden]"), "session survived sign-out");
  });

  await tc("TC-E12", "Typed HTML is shown as text, never run (XSS)", "NFR-5", async set => {
    const p = set(await newPage());
    await signIn(p, "renee@gcpantry.example.org"); await tab(p, "post");
    const evil = `<img src=x onerror="window.__pwned=1">Pantry night`;
    await p.fill("#pt", evil); await p.click("[data-act=one][data-key=roleType][data-val='Event support']");
    await p.fill("#pd", `<script>window.__pwned=2</script> Help us sort donations on Friday night.`);
    await p.click("[data-act=one][data-key=commitment][data-val='One-time']"); await p.click("[data-act=slot][data-val='Fri|Evening']");
    await p.click("text=Publish need");
    await tab(p, "postings");
    const shown = await p.textContent("#screen");
    assert(shown.includes("<img src=x"), "title not shown as text");
    assert(!(await p.evaluate(() => window.__pwned)), "script executed");
    return "Markup displayed literally; no script ran";
  });

  await tc("TC-E13", "Practice clock expires postings; Reset restores training data", "NFR-12, training support", async set => {
    const p = set(await newPage());
    await p.click("[data-act=training]"); await p.click("[data-act=clock][data-id='30']");
    const expired = await p.evaluate(() => window.__voluntr.db.opportunities.filter(o => o.status === "Expired").length);
    assert(expired > 1, "nothing expired");
    await p.click("[data-act=training]"); await p.click("[data-act=resetAsk]"); await p.click("[data-act=reset]");
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => ({ e: window.__voluntr.db.opportunities.filter(o => o.status === "Expired").length, off: window.__voluntr.db.settings.clockOffsetDays }));
    assert(after.e === 1 && after.off === 0, JSON.stringify(after));
    return `${expired} postings expired at +30 days; reset brought back the original data`;
  });

  await tc("TC-E14", "First load on a slow connection", "NFR-6 older phones, modest connections", async set => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 } });
    const p = set(await ctx.newPage()); p.errors = [];
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const t = Date.now(); await p.goto(URL); await p.waitForSelector("#screen h2"); const ms = Date.now() - t;
    assert(ms < 4000, ms + "ms");
    const kb = Math.round(fs.statSync(path.resolve(__dirname, "../voluntr.html")).size / 1024);
    return `Usable in ${ms} ms with 4× CPU slowdown (page is ${kb} KB, one file; fonts load separately)`;
  });

  await tc("TC-E15", "Organization Owner adds an Editor; Editor can post but can't manage the team", "BR org accounts (Owner/Editor)", async set => {
    const p = set(await newPage());
    await signIn(p, "renee@gcpantry.example.org"); await tab(p, "organization");
    await p.click("text=Add a team member");
    await p.fill("#amf", "Kim"); await p.fill("#aml", "Lee"); await p.fill("#ame", "kim@gcpantry.example.org"); await p.fill("#amp", PW);
    await p.click("form[data-form=addMember] button");
    await signIn(p, "kim@gcpantry.example.org"); await tab(p, "organization");
    assert(!(await p.$("text=Add a team member")) && !(await p.$("[data-act=deactivateMember]")), "Editor sees team controls");
    await tab(p, "post"); assert(await p.$("#pt"), "Editor can't post");
    return "Editor created and limited to postings";
  });

  await browser.close();
  fs.writeFileSync(path.join(__dirname, "results/e2e.json"), JSON.stringify({ ranAt: new Date().toISOString(), browser: "Chromium (Playwright)", results }, null, 1));
  results.forEach(r => console.log(`${r.status === "Pass" ? "PASS" : "FAIL"} ${r.id} ${r.title}${r.detail ? " :: " + r.detail : ""}`));
  console.log(`\n${results.filter(r => r.status === "Pass").length}/${results.length} passed`);
})();
