import math

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.database import get_db
from app.models.account import Account, AccountCreate, AccountUpdate
from app.models.common import MessageResponse, PaginatedResponse
from app.services.account_service import AccountService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return AccountService(db)


@router.post("", response_model=Account, status_code=status.HTTP_201_CREATED, tags=["Admin - Accounts"])
async def create_account(
    item: AccountCreate,
    service: AccountService = Depends(get_service),
):
    return service.create(item)


@router.get("", response_model=PaginatedResponse[Account], tags=["Admin - Accounts"])
async def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: bool | None = None,
    service: AccountService = Depends(get_service),
):
    items, total = service.list(page=page, page_size=page_size, is_active=is_active)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )


@router.get("/by-phone/{phone}", response_model=Account, tags=["Admin - Accounts"])
async def get_account_by_phone(
    phone: str,
    service: AccountService = Depends(get_service),
):
    """Look up a WhatsApp customer account by phone number (stored in attributes.phone)."""
    account = service.get_by_phone(phone)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{account_id}", response_model=Account, tags=["Admin - Accounts"])
async def get_account(
    account_id: str,
    service: AccountService = Depends(get_service),
):
    return service.get(account_id)


@router.put("/{account_id}", response_model=Account, tags=["Admin - Accounts"])
async def update_account(
    account_id: str,
    item: AccountUpdate,
    service: AccountService = Depends(get_service),
):
    return service.update(account_id, item)


@router.delete("/{account_id}", response_model=MessageResponse, tags=["Admin - Accounts"])
async def delete_account(
    account_id: str,
    service: AccountService = Depends(get_service),
):
    service.delete(account_id)
    return MessageResponse(message="Account deleted successfully", id=account_id)

