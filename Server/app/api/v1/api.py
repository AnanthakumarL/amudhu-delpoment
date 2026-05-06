from fastapi import APIRouter

from app.api.v1.endpoints import (
    accounts,
    applications,
    auth,
    categories,
    delivery_managements,
    delivery_users,
    health,
    jobs,
    orders,
    payments,
    products,
    production_managements,
    production_users,
    sections,
    site_config,
    users,
)

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(health.router, prefix="", tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Admin - Users"])
api_router.include_router(site_config.router, prefix="/site-config", tags=["Admin - Site Config"])
api_router.include_router(sections.router, prefix="/sections", tags=["Admin - Sections"])
api_router.include_router(categories.router, prefix="/categories", tags=["Admin - Categories"])
api_router.include_router(products.router, prefix="/products", tags=["Admin - Products"])
api_router.include_router(orders.router, prefix="/orders", tags=["Admin - Orders"])
api_router.include_router(payments.router, prefix="/payments", tags=["Payments"])
api_router.include_router(production_managements.router, prefix="/production-managements", tags=["Admin - Production Management"])
api_router.include_router(production_users.router, prefix="/production-users", tags=["Admin - Production Users"])
api_router.include_router(delivery_managements.router, prefix="/delivery-managements", tags=["Admin - Delivery Management"])
api_router.include_router(delivery_users.router, prefix="/delivery-users", tags=["Admin - Delivery Users"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["Admin - Accounts"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Admin - Jobs"])
api_router.include_router(applications.router, prefix="/applications", tags=["Admin - Applications"])
