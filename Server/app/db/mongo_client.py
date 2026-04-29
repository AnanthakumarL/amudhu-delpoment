from __future__ import annotations

from pymongo import MongoClient
from pymongo.database import Database

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class MongoDBClient:
    """MongoDB client singleton."""

    _instance: "MongoDBClient | None" = None
    _client: MongoClient | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def connect(self) -> MongoClient:
        if self._client is None:
            self._client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
            logger.info("Connected to MongoDB")
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            logger.info("Closed MongoDB connection")

    @property
    def client(self) -> MongoClient:
        return self.connect()

    @property
    def db(self) -> Database:
        return self.client[settings.MONGODB_DB]


mongo_client = MongoDBClient()


def get_mongo_db() -> Database:
    """FastAPI dependency to get the MongoDB Database instance."""
    return mongo_client.db
