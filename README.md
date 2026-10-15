# LERP Registration & Export Readiness Portal

Registration portal for the LoveWorld Global Trade & Export Readiness Program, scheduled for October 15, 2026.

## Database (Supabase + Local SQLite Backup)

The portal connects directly to **Supabase** for persistent, cloud-hosted participant registration and dashboard analytics, with automated local SQLite backup.

### Supabase Setup

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your project: `https://cnkqolytyehkvgzjkgvn.supabase.co`
3. Go to the **SQL Editor** on the left navigation.
4. Paste and execute the contents of [supabase/schema.sql](file:///Users/christembassyabujazone1/projects/LERP/supabase/schema.sql).
5. Environment variables are configured in `.env`:
   ```env
   SUPABASE_URL=https://cnkqolytyehkvgzjkgvn.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   LERP_ADMIN_PASSWORD=your-admin-password
   LERP_SESSION_SECRET=your-session-secret
   PORT=3000
   ```

## Run locally

```sh
npm start
```

Open http://localhost:3000. Select **Organiser sign in** and use the password configured in `LERP_ADMIN_PASSWORD` to access registrations and download the CSV.
