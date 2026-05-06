"""Main entry point for the application"""

if __name__ == "__main__":
    import uvicorn

    from app.core.config import get_settings

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG,
    )
