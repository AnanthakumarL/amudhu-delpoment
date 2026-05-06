from contextlib import contextmanager

import weaviate

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class WeaviateClient:
    """Weaviate client singleton"""

    _instance = None
    _client = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def connect(self):
        """Connect to Weaviate"""
        if self._client is None:
            try:
                self._client = weaviate.connect_to_local(
                    host=settings.WEAVIATE_HOST,
                    port=settings.WEAVIATE_PORT,
                )
                logger.info(f"Connected to Weaviate at {settings.WEAVIATE_HOST}:{settings.WEAVIATE_PORT}")
            except Exception as e:
                logger.error(f"Failed to connect to Weaviate: {e}")
                raise
        return self._client

    def close(self):
        """Close Weaviate connection"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info("Closed Weaviate connection")

    @property
    def client(self):
        """Get client instance"""
        if self._client is None:
            return self.connect()
        return self._client


# Global instance
weaviate_client = WeaviateClient()


def get_weaviate_client():
    """Dependency to get Weaviate client"""
    return weaviate_client.client


@contextmanager
def get_db():
    """Context manager for database operations"""
    client = get_weaviate_client()
    try:
        yield client
    except Exception as e:
        logger.error(f"Database error: {e}")
        raise
