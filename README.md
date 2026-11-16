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

## API

Interactive API docs: http://127.0.0.1:8010/docs

| Endpoint | What it does |
|---|---|
| `POST /api/upload` | Upload a `.pdf` / `.pptx`; extracts, cleans and chunks the text |
| `GET /api/documents` | List uploaded documents |
| `POST /api/episodes` | `{documentId, pageStart?, pageEnd?, targetMinutes}` → Alex & Sam episode with audio |
| `GET /api/episodes/{id}` | Playback manifest (used by `/listen/{id}`) |
| `POST /api/ask` | "Interrupt & Ask": spoken question → Alex's spoken answer |
| `POST /api/defense/questions` | 5 defense questions for a document or text (rubrics hidden) |
| `POST /api/defense/evaluate` | Grade a typed (JSON) or spoken (audio) answer against the rubric |

## Tests

```powershell
npm run test:backend
```
Runs on a temporary SQLite database with Groq and ElevenLabs faked, so no keys or MySQL are needed.

## Groq free tier

The free tier allows 8,000 tokens per minute, roughly 10 pages of text per request. Choose a page range of about 10 pages for episodes and defense questions. If you upgrade, set `GROQ_TPM_LIMIT` in `.env.local` to your new limit (or `0` for no limit).
