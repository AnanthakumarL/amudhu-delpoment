from fastapi import HTTPException, status


class NotFoundException(HTTPException):
    """Resource not found exception"""

    def __init__(self, detail: str = "Resource not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class BadRequestException(HTTPException):
    """Bad request exception"""

    def __init__(self, detail: str = "Bad request"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class ConflictException(HTTPException):
    """Resource conflict exception"""

    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class DatabaseException(HTTPException):
    """Database operation exception"""

    def __init__(self, detail: str = "Database operation failed"):
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)
