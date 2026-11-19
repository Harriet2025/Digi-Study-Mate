"""App settings, read from the project's .env.local (shared with the Next.js app) and backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Later files override earlier ones. Unknown keys (e.g. Next.js-only ones) are ignored.
        env_file=(PROJECT_DIR / ".env.local", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- MySQL ---------------------------------------------------------------
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "study_mate"
    #: Full SQLAlchemy URL; overrides the MYSQL_* settings when set (tests use SQLite).
    database_url: str | None = None

    # --- Groq (all AI text + speech-to-text) ---------------------------------
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_whisper_model: str = "whisper-large-v3-turbo"
    #: Your Groq plan's tokens-per-minute limit for the model (free tier: 8000). 0 = don't limit requests.
    groq_tpm_limit: int = 8_000

    # --- ElevenLabs (voices) -------------------------------------------------
    elevenlabs_api_key: str = ""
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    elevenlabs_voice_alex: str = "JBFqnCBsd6RMkjVDRZzb"  # "George": warm, mature narrator
    elevenlabs_voice_sam: str = "TX3LPaxmHKxFdv7VOQHJ"  # "Liam": young, energetic
    tts_concurrency: int = Field(default=2, ge=1, le=20)

    # --- YouTube (optional) ---------------------------------------------------
    #: With a YouTube Data API key, resources show real videos; without one, YouTube search links.
    youtube_api_key: str = ""

    # --- Accounts -------------------------------------------------------------
    #: The website's public address (no trailing slash). Used for the Google redirect and secure cookies.
    app_url: str = "http://localhost:3000"
    #: "Continue with Google" appears when both are set (Google Cloud console → OAuth client, type "Web application").
    google_client_id: str = ""
    google_client_secret: str = ""
    session_days: int = Field(default=30, ge=1, le=365)

    # --- Email (password reset) ------------------------------------------------
    #: Gmail: smtp.gmail.com / 587, SMTP_USER = your Gmail address, SMTP_PASSWORD = a Google "app password".
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    #: The sender shown in the inbox; defaults to "Study Mate <SMTP_USER>".
    email_from: str = ""

    # --- Guest trial ------------------------------------------------------------
    #: Pages a guest's first lesson covers (keeps the free trial quick and cheap).
    guest_max_pages: int = Field(default=15, ge=1, le=100)
    guest_days: int = Field(default=7, ge=1, le=90)

    # --- Files & web ---------------------------------------------------------
    media_dir: Path = BACKEND_DIR / "media"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    def sqlalchemy_url(self, *, with_database: bool = True) -> URL | str:
        """Connection URL. with_database=False connects to the server only (used to create the database)."""
        if self.database_url:
            return _normalize_database_url(self.database_url)
        # URL.create escapes special characters in the password safely.
        return URL.create(
            "mysql+pymysql",
            username=self.mysql_user,
            password=self.mysql_password or None,
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_database if with_database else None,
            query={"charset": "utf8mb4"},
        )


def _normalize_database_url(url: str) -> str:
    """Hosts like Railway give `mysql://user:pass@host:port/db`; SQLAlchemy needs the PyMySQL driver and utf8mb4."""
    if url.startswith("mysql://"):
        url = "mysql+pymysql://" + url.removeprefix("mysql://")
    if url.startswith("mysql+pymysql://") and "charset=" not in url:
        url += ("&" if "?" in url else "?") + "charset=utf8mb4"
    return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
