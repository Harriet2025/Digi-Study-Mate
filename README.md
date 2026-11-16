# Study Mate

An audio-native AI learning companion. Upload lecture slides or notes, and two AI hosts, Alex (tutor) and Sam (student), turn them into a conversation you can listen to, with quiz checkpoints, an "Interrupt & Ask" voice button, and exam/defense practice with graded answers.

## How it's built

| Part | Tech | Folder |
|---|---|---|
| Screens and audio player | Next.js 16, React, Tailwind CSS | `app/`, `components/` |
| API, document processing, AI | Python, FastAPI | `backend/app/` |
| Database | MySQL 8 (SQLAlchemy) | `backend/app/models.py`, `backend/schema.sql` |
| AI text + speech-to-text | Groq (`openai/gpt-oss-120b`, Whisper) | `backend/app/ai/` |
| Voices | ElevenLabs | `backend/app/tts/` |
| Audio files | Local folder `backend/media/` | |

The browser only talks to Next.js (port 3000). Next.js forwards `/api/*` and `/media/*` to the Python API (port 8010).

## First-time setup

1. **Install packages**
   ```powershell
   npm install
   cd backend
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   cd ..
   ```
2. **Fill in `.env.local`** (copy `.env.example` if you don't have one): your MySQL password, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`.
3. **Create the database and tables**
   ```powershell
   npm run db:init
   ```

## Running it

Open two terminals in the project folder:

```powershell
npm run dev:backend   # Python API on http://127.0.0.1:8010
```
```powershell
npm run dev           # Website on http://localhost:3000
```

Check everything is connected: http://localhost:3000/api/health should show `"database": "ok"`.

## Screens

| Page | What it does |
|---|---|
| `/` | Homepage |
| `/upload` | Upload a PDF/PPTX, pick pages, length, style (standard, quick recap, deep dive, exam cram), level and language |
| `/listen/{id}` | Live progress while a lesson is made, then the player: transcript, speed, resume, Interrupt & Ask, download, share |
| `/library` | Documents with their lessons and practice sets, "continue listening", delete |
| `/flashcards` | Spaced-repetition review of cards made from each lesson (`?episodeId=` for one lesson) |
| `/practice`, `/practice/{id}` | Generate 5 defense questions, answer typed or spoken, see the graded rubric |
| `/progress` | Study streak, 12-week activity calendar, totals and weak spots |

## API

Interactive API docs: http://127.0.0.1:8010/docs

| Endpoint | What it does |
|---|---|
| `POST /api/upload` | Upload a `.pdf` / `.pptx`; extracts, cleans and chunks the text |
| `GET/DELETE /api/documents/{id}` | One document (delete removes its lessons, cards and practice sets) |
| `POST /api/episodes` | Start a lesson (`documentId, pageStart, pageEnd, targetMinutes, style, level, language`); made in the background |
| `GET /api/episodes/{id}` | Status/progress, then the playback manifest |
| `PUT /api/episodes/{id}/progress` | Save listening position and time listened |
| `GET /api/episodes/{id}/download` | The whole lesson as one MP3 |
| `GET /api/flashcards`, `POST /api/flashcards/{id}/review` | Due cards; rate again/hard/good/easy |
| `POST /api/ask` | "Interrupt & Ask": spoken question → Alex's spoken answer |
| `POST /api/defense/questions`, `GET /api/defense/sets[/{id}]` | Create and load practice sets |
| `POST /api/defense/evaluate` | Grade a typed (JSON) or spoken (audio) answer |
| `GET /api/library`, `GET /api/insights` | Library overview; streaks, calendar, weak spots |

The database schema upgrades itself on startup (new tables and columns are added; nothing is dropped).

## Tests

```powershell
npm run test:backend
```
Runs on a temporary SQLite database with Groq and ElevenLabs faked, so no keys or MySQL are needed.

## Groq free tier

The free tier allows 8,000 tokens per minute, roughly 10 pages of text per request. Choose a page range of about 10 pages for episodes and defense questions. If you upgrade, set `GROQ_TPM_LIMIT` in `.env.local` to your new limit (or `0` for no limit).
