# LERP Registration & Export Readiness Portal

Local registration portal for the LoveWorld Global Trade & Export Readiness Program, scheduled for October 15, 2026.

## Run locally

This project uses only Node.js built-ins. Node 22.5+ is required for its built-in SQLite support; Node 26 is installed in this workspace.

```sh
LERP_ADMIN_PASSWORD='choose-a-long-unique-password' \
LERP_SESSION_SECRET='choose-a-separate-long-random-secret' \
npm start
```

Open http://localhost:3000. Select **Organiser sign in** and use the password configured in `LERP_ADMIN_PASSWORD` to access registrations and download the CSV.

`data/lerp.db` is created automatically on first run and is intentionally ignored by Git. Keep a backup of that file while running locally.

## Production note

The current SQLite database is deliberate for the local launch. Before deploying to Vercel or another serverless platform, replace the local database adapter with a hosted database and add the same environment secrets in the hosting provider.
