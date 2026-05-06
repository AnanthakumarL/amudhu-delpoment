from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Agent settings"""

    # Application
    APP_NAME: str = "Ice Cream AI Agent"
    DEBUG: bool = True
    PORT: int = 7998

    # MongoDB for Agent (separate database)
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "icecream_agent"

    # DeepSeek
    DEEPSEEK_API_KEY: str = "sk-3540895271e64f88abfc99029bd6d6b0"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    # Claude fallback
    CLAUDE_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-haiku-4-5-20251001"

    # OpenAI
    OPENAI_API_KEY: str = "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"
    OPENAI_TEXT_MODEL: str = "gpt-4.1-nano"
    OPENAI_TRANSCRIPTION_MODEL: str = "whisper-1"

    # WhatsApp Webhook
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = "whatsapp_verify_token_123"
    WHATSAPP_WEBHOOK_PORT: int = 3000

    # Backend API
    BACKEND_API_URL: str = "http://localhost:8000"

    # Flow Steps
    DEFAULT_FLOW_STEPS: list[str] = [
        "product",
        "variant",
        "quantity",
        "addons",
        "scooper",
        "address",
        "delivery_date",
        "delivery_time",
        "name",
        "email",
        "order_type",
        "gst",
        "summary",
        "confirmation"
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
