# CasinoCheck Phase 2

A responsive social-game review directory with Supabase authentication, public review submission, admin-only game management, and admin moderation. It is intentionally scoped to non-money / free-to-play social games. No real-money gambling, deposits, cash-outs, affiliate links, or betting features are included.

## What's included

- Existing dark, responsive CasinoCheck directory UI
- Supabase database schema with row-level security (RLS)
- Email/password sign-up and sign-in
- Google OAuth sign-in
- Signed-in users can submit one review per game
- New reviews remain `pending` until the admin approves them
- Only the database-designated admin can add/archive games and approve/reject reviews
- Public visitors see published games and approved reviews only
- Fictional sample games are clearly marked as demos

## Free services

- Supabase Free: database + authentication (subject to current quotas and inactivity limits)
- GitHub: source repository
- Cloudflare Pages: static hosting

No payment method is required for the code itself. A custom domain is optional and usually paid. Third-party email delivery and usage may have limits.

## Setup — do these steps in order

### 1. Create a Supabase project

1. Open https://supabase.com/ and create a free account/project.
2. Choose a strong database password and save it privately.
3. In **Project Settings → API** (or **Data API** depending on dashboard version), copy the **Project URL** and the **anon/public key**.
4. Open `config.js` and replace `YOUR_SUPABASE_PROJECT_URL` and `YOUR_SUPABASE_ANON_PUBLIC_KEY` with those two values.
5. Never put the `service_role` key or any secret key in `config.js`, GitHub, or browser code.

### 2. Create the database and security policies

1. In Supabase, open **SQL Editor → New query**.
2. Paste the complete contents of `supabase-schema.sql` and run it.
3. The schema creates profiles, games and reviews; enables RLS; and applies policies so ordinary users cannot publish games or approve reviews.

### 3. Configure email login

1. In Supabase, open **Authentication → URL Configuration**.
2. Set the Site URL to your eventual Cloudflare Pages URL (for local testing, `http://localhost:8000`).
3. Add the same URL under Redirect URLs. After deploying, add the deployed `https://<project>.pages.dev` URL too.
4. Under **Authentication → Providers → Email**, keep email/password enabled. Email confirmation can remain enabled; users must confirm before signing in if enabled.
5. For reliable production email delivery, configure a custom SMTP provider. Supabase's default email service is limited and intended for testing.

### 4. Configure Google login

1. In Google Cloud Console, create/select a project and configure the OAuth consent screen.
2. Create an OAuth Client ID of type **Web application**.
3. In Supabase **Authentication → Providers → Google**, enable Google and copy the Supabase callback URL shown there.
4. Add that callback URL to Google's **Authorized redirect URIs**. Add your deployed site origin to **Authorized JavaScript origins** where requested.
5. Paste the Google Client ID and Client Secret into Supabase's Google provider settings and save.
6. Add your local and deployed URLs to Supabase Auth Redirect URLs.
7. Test sign-in with a Google account you control.

### 5. Make your own account the only admin

1. Deploy or run the site and create an account using the email address you control.
2. Confirm the email if confirmation is enabled, then sign in once so the profile row is created.
3. In Supabase SQL Editor, replace the example email and run:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('YOUR-EMAIL@example.com');
```

4. Refresh CasinoCheck. The Admin link should appear.
5. Do not create a public admin-signup flow. Do not share your account. If you need to change the admin later, do it directly in the Supabase SQL Editor.

### 6. Test locally

Because OAuth redirects and browser modules work best over HTTP, run a local server from the project folder:

```bash
python -m http.server 8000
```

Open http://localhost:8000. Do not open the HTML file directly as `file://`.

### 7. Deploy on Cloudflare Pages

1. Create a GitHub repository named `casinocheck` and upload every file in this folder to the repository root.
2. In Cloudflare Dashboard, open **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository. Framework preset: **None**. Build command: leave blank. Build output directory: `.`.
4. Deploy. Add the generated `https://<project>.pages.dev` URL to Supabase Auth URL Configuration and Google OAuth redirect settings.
5. Test email sign-up, Google sign-in, user review submission, admin approval and public visibility in a private/incognito browser.

## Important security and product notes

- Only the Supabase anon/public key belongs in frontend config. Never expose a service-role key.
- Admin access is enforced by database RLS, not by hiding a button in the UI.
- Public users can submit reviews only while signed in; each account can submit one review per game. Reviews are not visible publicly until approved.
- The starter includes fictional demo game entries, marked `DEMO`. They are not real endorsements. Replace them only with researched listings and evidence.
- Before public launch, add a real Privacy Policy, Terms, contact route, moderation/appeal process, abuse-report workflow, and review authenticity guidelines. Do not collect sensitive personal information in reviews.
- This site is for non-money social games only. Do not add real-money casino, betting, cash-out, deposit or affiliate promotion features without qualified legal review in every target jurisdiction.
- Supabase Free quotas, Google OAuth setup requirements, and Cloudflare limits can change. Check each provider's current dashboard and terms.

## Troubleshooting

- **Setup needed notice stays visible:** verify `config.js` contains the exact Supabase Project URL and anon/public key.
- **Game list empty / permission error:** run `supabase-schema.sql` fully and inspect Supabase Logs.
- **Google sign-in returns URL error:** check Supabase Site URL/Redirect URLs and Google authorized redirect URI.
- **No Admin link:** sign in with the email promoted to `admin`, then refresh. Confirm the profile role in Supabase Table Editor.
- **Review not appearing:** it is pending until the admin approves it. Public visitors only see approved reviews.
