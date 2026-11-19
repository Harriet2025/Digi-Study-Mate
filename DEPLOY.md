# Deploying Study Mate

- **Website (Next.js):** Vercel
- **API (Python FastAPI), MySQL and file storage:** Railway

The website forwards `/api/*` and `/media/*` to the API, so the only thing linking them is one setting, `BACKEND_URL`.

## 1. Railway: database and API

1. Sign in at <https://railway.com> with GitHub, then choose **New Project → Deploy from GitHub repo → Harriet2025/Digi-Study-Mate**.
2. Open the new service, then go to **Settings → Source → Root Directory** and set it to `/backend`. The service then builds from `backend/Dockerfile`. If Railway asks for a config file, use `/backend/railway.json`.
3. In the project, choose **+ Create → Database → MySQL**.
4. In the API service, open **Variables** and add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` (Railway fills this in) |
   | `GROQ_API_KEY` | your Groq key |
   | `ELEVENLABS_API_KEY` | your ElevenLabs key |
   | `YOUTUBE_API_KEY` | optional |
   | `GROQ_TPM_LIMIT` | `8000` on Groq's free tier |
   | `APP_URL` | your Vercel address, e.g. `https://study-mate.vercel.app` (needed for secure logins and Google) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional, for "Continue with Google" (see below) |

5. Add a disk for audio, uploads and decks: right-click the API service, choose **Attach Volume**, and set the mount path to `/data`. The Dockerfile already stores files in `/data/media`.
6. Go to **Settings → Networking → Generate Domain**. Railway gives you a domain like `https://study-mate-api-production.up.railway.app`.
7. Open `<that domain>/api/health`. You should see `"database": "ok"`. The tables are created automatically on first start.

## 2. Vercel: website

1. Go to <https://vercel.com/new> and import **Harriet2025/Digi-Study-Mate**. Keep Framework = Next.js and Root Directory = `./`.
2. Under **Environment Variables**, add `BACKEND_URL` and set it to the Railway domain from step 1.6, with no slash at the end.
3. Click **Deploy**.

Every push to `main` redeploys both sites automatically.

## 3. "Continue with Google" (optional)

1. Go to <https://console.cloud.google.com/apis/credentials> and create a project if asked.
2. Open **OAuth consent screen**. Choose **External**, enter the app name "Study Mate" and your email, and save.
3. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorised redirect URIs**, add:
   - `http://localhost:3000/api/auth/google/callback` (on your laptop)
   - `https://<your-vercel-address>/api/auth/google/callback` (live site)
5. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`:
   - on your laptop, in `.env.local`;
   - for the live site, in the Railway variables.
6. Restart the backend. A "Continue with Google" button appears on the login and sign-up pages.

While the consent screen is in **Testing** mode, only the Google accounts you add as test users can sign in. Click **Publish app** to open it to everyone.

## 4. "Forgot password?" emails (Gmail)

1. Turn on **2-Step Verification** for the Gmail account that will send the emails: <https://myaccount.google.com/security>.
2. Create an **app password** at <https://myaccount.google.com/apppasswords>. Name it "Study Mate" and copy the 16-character password.
3. Add these variables, in Railway for the live site and in `.env.local` on your laptop:
   - `SMTP_USER`: that Gmail address
   - `SMTP_PASSWORD`: the app password, without spaces
4. Restart the backend.

Until these are set, reset emails aren't sent. On your laptop only, the reset link is printed in the backend's log instead.

## Notes

- The **first account** created takes over any lessons made before accounts existed.
- Keys go only in the Railway and Vercel dashboards, never in the repo.
- Data in your local MySQL database is **not** copied over. The hosted app starts empty.
- Long jobs (lessons, podcasts, decks) run in the background on Railway, and the website checks their progress, so Vercel's request time limits don't affect them.
