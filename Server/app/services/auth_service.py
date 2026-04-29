from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ConflictException, DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.db.orm_models import DeliveryUserORM, OtpRequestORM, ProductionUserORM, UserORM
from app.models.auth import AuthUserOut, LoginIn, LoginOtpRequestIn, LoginOtpVerifyIn, OtpRequestIn, OtpRequestOut, SignupVerifyIn

logger = get_logger(__name__)
settings = get_settings()


def _now_dt():
    return datetime.utcnow()

def _normalize_identifier(v: str) -> str:
    return v.strip().lower()

def _normalize_phone(phone: str) -> str:
    phone = phone.strip()
    phone = re.sub(r"[\s-]", "", phone)
    return phone

def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def _user_out(row, id_override=None) -> AuthUserOut:
    return AuthUserOut(
        id=id_override or str(row.id),
        name=row.name,
        identifier=row.identifier,
        is_active=row.is_active,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def request_signup_otp(self, item: OtpRequestIn) -> OtpRequestOut:
        try:
            identifier = _normalize_identifier(item.identifier)
            otp = "000000" if settings.DEBUG else f"{secrets.randbelow(1_000_000):06d}"
            now_dt = _now_dt()
            expires_dt = now_dt + timedelta(minutes=5)
            row = OtpRequestORM(purpose="signup", identifier=identifier,
                                otp_hash=_sha256(otp), attempts=0, is_used=False,
                                expires_at=expires_dt)
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            resp = OtpRequestOut(request_id=str(row.id), expires_in_seconds=300)
            if settings.DEBUG:
                resp.dev_otp = otp
            return resp
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error requesting OTP: {e}")
            raise DatabaseException(f"Failed to request OTP: {e!s}")

    def _ensure_phone_user(self, phone: str) -> UserORM:
        row = self.db.query(UserORM).filter(UserORM.identifier == phone).first()
        if row:
            return row
        row = UserORM(name="User", identifier=phone,
                      password_hash=hash_password(secrets.token_urlsafe(16)), is_active=True)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def request_login_otp(self, item: LoginOtpRequestIn) -> OtpRequestOut:
        try:
            phone = _normalize_phone(item.phone)
            self._ensure_phone_user(phone)
            otp = "0000" if settings.DEBUG else f"{secrets.randbelow(10_000):04d}"
            now_dt = _now_dt()
            expires_dt = now_dt + timedelta(minutes=5)
            row = OtpRequestORM(purpose="login", identifier=phone,
                                otp_hash=_sha256(otp), attempts=0, is_used=False,
                                expires_at=expires_dt)
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            resp = OtpRequestOut(request_id=str(row.id), expires_in_seconds=300)
            if settings.DEBUG:
                resp.dev_otp = otp
            return resp
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error requesting login OTP: {e}")
            raise DatabaseException(f"Failed to request OTP: {e!s}")

    def verify_login_otp(self, item: LoginOtpVerifyIn) -> AuthUserOut:
        phone = _normalize_phone(item.phone)
        req = self.db.query(OtpRequestORM).filter(
            OtpRequestORM.id == item.request_id, OtpRequestORM.purpose == "login"
        ).first()
        if not req:
            raise NotFoundException("OTP request not found")
        if req.is_used:
            raise BadRequestException("OTP already used")
        if req.expires_at < _now_dt():
            raise BadRequestException("OTP expired")
        if _normalize_phone(req.identifier) != phone:
            raise BadRequestException("OTP request does not match phone")
        if _sha256(item.otp.strip()) != req.otp_hash:
            req.attempts += 1
            req.updated_at = _now_dt()
            self.db.commit()
            raise BadRequestException("Invalid OTP")
        req.is_used = True
        req.verified_at = _now_dt()
        req.updated_at = _now_dt()
        self.db.commit()
        user = self._ensure_phone_user(phone)
        return _user_out(user)

    def verify_signup_otp(self, item: SignupVerifyIn) -> AuthUserOut:
        identifier = _normalize_identifier(item.identifier)
        req = self.db.query(OtpRequestORM).filter(
            OtpRequestORM.id == item.request_id, OtpRequestORM.purpose == "signup"
        ).first()
        if not req:
            raise NotFoundException("OTP request not found")
        if req.is_used:
            raise BadRequestException("OTP already used")
        if req.expires_at < _now_dt():
            raise BadRequestException("OTP expired")
        if _normalize_identifier(req.identifier) != identifier:
            raise BadRequestException("OTP request does not match identifier")
        if _sha256(item.otp.strip()) != req.otp_hash:
            req.attempts += 1
            req.updated_at = _now_dt()
            self.db.commit()
            raise BadRequestException("Invalid OTP")
        existing = self.db.query(UserORM).filter(UserORM.identifier == identifier).first()
        if existing:
            raise ConflictException("User already exists")
        user = UserORM(name=item.name.strip(), identifier=identifier,
                       password_hash=hash_password(item.password), is_active=True)
        self.db.add(user)
        req.is_used = True
        req.verified_at = _now_dt()
        req.updated_at = _now_dt()
        self.db.commit()
        self.db.refresh(user)
        return _user_out(user)

    def login(self, item: LoginIn) -> AuthUserOut:
        try:
            identifier = _normalize_identifier(item.identifier)
            user_row = self.db.query(UserORM).filter(UserORM.identifier == identifier).first()
            prod_row = self.db.query(ProductionUserORM).filter(ProductionUserORM.identifier == identifier).first()
            del_row = self.db.query(DeliveryUserORM).filter(DeliveryUserORM.identifier == identifier).first()

            if not user_row and not prod_row and not del_row:
                raise BadRequestException("Invalid credentials")

            disabled_found = False
            for kind, doc in (("user", user_row), ("production", prod_row), ("delivery", del_row)):
                if not doc:
                    continue
                if not doc.is_active:
                    disabled_found = True
                    continue
                if not doc.password_hash:
                    continue
                try:
                    if not verify_password(item.password, doc.password_hash):
                        continue
                except Exception:
                    continue
                return _user_out(doc)

            if disabled_found:
                raise BadRequestException("Account is disabled")
            raise BadRequestException("Invalid credentials")
        except BadRequestException:
            raise
        except Exception as e:
            logger.error(f"Error logging in: {e}")
            raise DatabaseException(f"Failed to login: {e!s}")
