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

5. Add a disk for audio, uploads and decks: right-click the API service, choose **Attach Volume**, and set the mount path to `/data`. The Dockerfile already stores files in `/data/media`.
6. Go to **Settings → Networking → Generate Domain**. Railway gives you a domain like `https://study-mate-api-production.up.railway.app`.
7. Open `<that domain>/api/health`. You should see `"database": "ok"`. The tables are created automatically on first start.

## 2. Vercel: website

1. Go to <https://vercel.com/new> and import **Harriet2025/Digi-Study-Mate**. Keep Framework = Next.js and Root Directory = `./`.
2. Under **Environment Variables**, add `BACKEND_URL` and set it to the Railway domain from step 1.6, with no slash at the end.
3. Click **Deploy**.

Every push to `main` redeploys both sites automatically.

## Notes

- Keys go only in the Railway and Vercel dashboards, never in the repo.
- Data in your local MySQL database is **not** copied over. The hosted app starts empty.
- Long jobs (lessons, podcasts, decks) run in the background on Railway, and the website checks their progress, so Vercel's request time limits don't affect them.
