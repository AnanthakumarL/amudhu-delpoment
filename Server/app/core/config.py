from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""

    # Application
    APP_NAME: str = "E-Commerce Admin Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    PORT: int = 7999

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "product-images"

    # PostgreSQL (Supabase connection string)
    # Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/amudhu"

    # CORS - Use string in .env, will be split by comma
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:7999,https://amudhu.click,https://www.amudhu.click,https://server.amudhu.click"
    # Optional regex (Starlette) to allow matching origins, useful for Vite dev ports
    CORS_ORIGIN_REGEX: str | None = (
        r"^https?://(localhost|127\.0\.0\.1|"
        r"10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|"
        r"172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})"
        r"(?::\d+)?$"
        r"|^https://([a-z0-9-]+\.)?amudhu\.click$"
    )

    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # Razorpay
    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None
    RAZORPAY_WEBHOOK_SECRET: str | None = None
    RAZORPAY_STATIC_QR_ID: str | None = None
    # Currency for Razorpay orders
    RAZORPAY_CURRENCY: str = "INR"
    # Client base URL used to build redirect URLs after payment
    CLIENT_URL: str = "http://localhost:5173"

    def get_cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string"""
        if isinstance(self.CORS_ORIGINS, str):
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        return self.CORS_ORIGINS

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
