from __future__ import annotations

from pydantic import BaseModel, Field


class OtpRequestIn(BaseModel):
    identifier: str = Field(..., min_length=3, max_length=320)


class OtpRequestOut(BaseModel):
    request_id: str
    expires_in_seconds: int
    dev_otp: str | None = None


class SignupVerifyIn(BaseModel):
    request_id: str = Field(..., min_length=1)
    otp: str = Field(..., min_length=4, max_length=8)

    name: str = Field(..., min_length=1, max_length=200)
    identifier: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=4, max_length=200)


class LoginIn(BaseModel):
    identifier: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=4, max_length=200)


class LoginOtpRequestIn(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)


class LoginOtpVerifyIn(BaseModel):
    request_id: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=6, max_length=20)
    otp: str = Field(..., min_length=4, max_length=8)


class AuthUserOut(BaseModel):
    id: str
    name: str
    identifier: str
    is_active: bool
    created_at: str
    updated_at: str
