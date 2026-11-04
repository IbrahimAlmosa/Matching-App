# VOLUNTR (Matching-App)

VOLUNTR matches volunteers with Pitt County nonprofits for **Pitt County Cares (PCC)**. This is the MIS 4173 Team 5 **Sprint 4 training build**, based on Prototype D "Together". It supports three roles: volunteer, organization member, and PCC admin.

> Training copy only. All people and organizations are fictional. Data is saved in the browser running the page, and email is shown as in-app notifications.

## Run it

Open `voluntr.html` in any modern browser. It needs no server and no install. It works on a phone, or use the Phone/Desktop switch at the top.

### Demo accounts

All demo accounts use the password `Training2026!`. Open **Training tools** on the page to see:

- the account list,
- the current admin two-step code,
- the practice clock, which moves dates forward to show posting expiry,
- backup and restore,
- **Reset**, which restores the starting data.

## Project layout

| Path | What it is |
| --- | --- |
| `voluntr.html` | The built app, one self-contained file |
| `src/core.js` | Business rules, matching, security, data (no UI). Also runs in Node for unit tests |
| `src/app.js` | Screens for each role |
| `src/styles.css` | Styles from Prototype D |
| `build.sh` | Combines `src/` into `voluntr.html` |
| `tests/unit.js` | 32 unit test cases (rules, matching, security) |
| `tests/e2e.js` | 15 browser test cases (full workflows, phone layout, accessibility basics) |
| `tests/results/` | Latest results (JSON) and screenshots |

## Build and test

You need Node 18 or newer.

```bash
npm install          # installs Playwright
npx playwright install chromium   # first time only
npm test             # build, then unit and browser tests
```

Latest run: 32/32 unit tests and 15/15 browser tests passed.

## How matching works

1. **Hard rules** remove a posting that fails any of these:
   - the organization isn't approved,
   - the posting is expired or full,
   - the volunteer is under the age limit or is missing a required skill,
   - a background check is required and the volunteer is unwilling,
   - the format, distance or schedule doesn't fit.
2. **Weighted score** ranks what's left. The default weights are:
   - skill 30
   - role 20
   - cause 15
   - schedule 15
   - commitment 10
   - distance 10

   PCC admins can change the weights.
3. Each match shows its top three reasons in plain language.

## Security in this build

- Passwords are stored as salted PBKDF2-SHA256 hashes.
- Admins must use two-step sign-in (TOTP, RFC 6238).
- An account locks after 5 failed sign-in attempts.
- A session signs out after 30 minutes idle.
- Contact details are hidden until both sides agree to connect.
- All output is HTML-escaped.
- CSV exports are guarded against formula injection.
- Admin actions are audit-logged.

## Production plan

The planned production setup is:

- **Database and sign-in:** Supabase (Postgres with row-level security, Auth with MFA).
- **Email:** Resend or Brevo.
- **Hosting:** Netlify or GitHub Pages.

The estimated cost is about $12 to $20 a year, within PCC's budget of under $300 a year. The full details are in the team's Sprint 4 Specification document.
