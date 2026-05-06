"""Initialize Weaviate database schema"""
import sys

sys.path.insert(0, ".")

from app.core.logging import get_logger
from app.db.schema import create_schema, initialize_default_config
from app.db.weaviate_client import weaviate_client

logger = get_logger(__name__)


def main():
    """Initialize database"""
    logger.info("Initializing Weaviate database...")

    try:
        client = weaviate_client.connect()
        logger.info("Connected to Weaviate")

        create_schema(client)
        logger.info("Schema created successfully")

        initialize_default_config(client)
        logger.info("Default configuration initialized")

        logger.info("Database initialization complete!")

    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        sys.exit(1)
    finally:
        weaviate_client.close()


if __name__ == "__main__":
    main()
