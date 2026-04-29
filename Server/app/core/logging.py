import logging
import sys
from pathlib import Path

# Create logs directory
Path("logs").mkdir(exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/app.log"),
        logging.StreamHandler(sys.stdout),
    ],
)

def get_logger(name: str) -> logging.Logger:
    """Get logger instance"""
    return logging.getLogger(name)
