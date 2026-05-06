"""
Main FastAPI Application for Ice Cream AI Agent
"""

import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.core.config import get_settings
from src.api import (
    users_router,
    orders_router,
    sessions_router,
    flow_router,
    webhook_router,
    collected_data_router,
    bot_control_router,
)
from src.services.mongo_service import get_mongo_service

settings = get_settings()

_bridge_process: subprocess.Popen | None = None


def _start_bridge() -> subprocess.Popen | None:
    bridge_dir = Path(__file__).resolve().parent.parent / "bridge"
    bot_script = bridge_dir / "src" / "bot.js"
    if not bot_script.exists():
        print(f"⚠️  Bridge not found at {bot_script} — WhatsApp disabled.")
        return None
    env = {**os.environ, "AGENT_URL": f"http://localhost:{settings.PORT}"}
    proc = subprocess.Popen(
        ["node", str(bot_script)],
        cwd=str(bridge_dir),
        env=env,
        stdout=sys.stderr,
        stderr=sys.stderr,
    )
    print(f"[Bridge] WhatsApp bridge started (PID {proc.pid})")
    return proc


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bridge_process

    print("Starting Ice Cream AI Agent...")

    mongo = get_mongo_service()
    mongo.connect()
    print("Connected to MongoDB")

    try:
        steps = mongo.get_flow_steps()
        if not steps:
            mongo.reset_flow_to_default()
            print("Initialized default flow steps")
    except Exception as e:
        print(f"⚠️ Could not initialize flow steps: {e}")

    _bridge_process = _start_bridge()

    yield

    print("Shutting down Ice Cream AI Agent...")
    if _bridge_process and _bridge_process.poll() is None:
        _bridge_process.terminate()
        try:
            _bridge_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _bridge_process.kill()
        print("[Bridge] WhatsApp bridge stopped.")
    mongo.close()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="AI-powered WhatsApp ordering agent for ice cream business",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users_router)
app.include_router(orders_router)
app.include_router(sessions_router)
app.include_router(flow_router)
app.include_router(webhook_router)
app.include_router(collected_data_router)
app.include_router(bot_control_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        mongo = get_mongo_service()
        mongo.connect()
        mongo.db.command("ping")
        return {"status": "healthy", "mongodb": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
