from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.db.database import get_db
from app.models.auth import AuthUserOut, LoginIn, LoginOtpRequestIn, LoginOtpVerifyIn, OtpRequestIn, OtpRequestOut, SignupVerifyIn
from app.services.auth_service import AuthService

router = APIRouter()


def get_service(db=Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/signup/request-otp", response_model=OtpRequestOut, status_code=status.HTTP_200_OK, tags=["Auth"])
async def request_signup_otp(item: OtpRequestIn, service: AuthService = Depends(get_service)):
    return service.request_signup_otp(item)


@router.post("/signup/verify", response_model=AuthUserOut, status_code=status.HTTP_201_CREATED, tags=["Auth"])
async def verify_signup_otp(item: SignupVerifyIn, service: AuthService = Depends(get_service)):
    return service.verify_signup_otp(item)


@router.post("/login", response_model=AuthUserOut, status_code=status.HTTP_200_OK, tags=["Auth"])
async def login(item: LoginIn, service: AuthService = Depends(get_service)):
    return service.login(item)


@router.post("/otp/request", response_model=OtpRequestOut, status_code=status.HTTP_200_OK, tags=["Auth"])
async def request_login_otp(item: LoginOtpRequestIn, service: AuthService = Depends(get_service)):
    return service.request_login_otp(item)


@router.post("/otp/verify", response_model=AuthUserOut, status_code=status.HTTP_200_OK, tags=["Auth"])
async def verify_login_otp(item: LoginOtpVerifyIn, service: AuthService = Depends(get_service)):
    return service.verify_login_otp(item)

