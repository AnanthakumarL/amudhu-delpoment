"""
Flow Configuration API Routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.mongo_service import get_mongo_service

router = APIRouter(prefix="/api/flow", tags=["Flow"])


class FlowStepCreate(BaseModel):
    step_key: str
    step_name: str
    question: str
    is_required: bool = True
    is_active: bool = True
    order: int


class FlowStepUpdate(BaseModel):
    step_name: Optional[str] = None
    question: Optional[str] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None
    order: Optional[int] = None


@router.get("/steps")
async def get_flow_steps():
    """Get all flow steps"""
    mongo = get_mongo_service()
    steps = mongo.get_flow_steps()

    result = []
    for step in steps:
        step_data = {
            "step_key": step.get("step_key"),
            "step_name": step.get("step_name"),
            "question": step.get("question"),
            "is_required": step.get("is_required", True),
            "is_active": step.get("is_active", True),
            "order": step.get("order", 0),
        }
        if "_id" in step:
            step_data["_id"] = str(step["_id"])
        result.append(step_data)

    # Sort by order
    result.sort(key=lambda x: x["order"])

    return {"steps": result, "count": len(result)}


@router.post("/steps")
async def create_flow_step(step_data: FlowStepCreate):
    """Add a new flow step"""
    mongo = get_mongo_service()

    step = {
        "step_key": step_data.step_key,
        "step_name": step_data.step_name,
        "question": step_data.question,
        "is_required": step_data.is_required,
        "is_active": step_data.is_active,
        "order": step_data.order,
    }

    collection = mongo.db["flow_config"]
    collection.insert_one(step)

    return {"status": "success", "message": "Step created"}


@router.put("/steps/{step_key}")
async def update_flow_step(step_key: str, update_data: FlowStepUpdate):
    """Update a flow step"""
    mongo = get_mongo_service()

    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}

    if not update_dict:
        raise HTTPException(status_code=400, detail="No data to update")

    collection = mongo.db["flow_config"]
    result = collection.update_one(
        {"step_key": step_key},
        {"$set": update_dict}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")

    return {"status": "success", "message": "Step updated"}


@router.delete("/steps/{step_key}")
async def delete_flow_step(step_key: str):
    """Delete a flow step"""
    mongo = get_mongo_service()

    collection = mongo.db["flow_config"]
    result = collection.delete_one({"step_key": step_key})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")

    return {"status": "success", "message": "Step deleted"}


@router.post("/steps/reset")
async def reset_flow_steps():
    """Reset flow steps to default"""
    mongo = get_mongo_service()
    mongo.reset_flow_to_default()

    return {"status": "success", "message": "Flow steps reset to default"}


@router.post("/steps/reorder")
async def reorder_flow_steps(steps_order: list[str]):
    """Reorder flow steps"""
    mongo = get_mongo_service()
    collection = mongo.db["flow_config"]

    for idx, step_key in enumerate(steps_order):
        collection.update_one(
            {"step_key": step_key},
            {"$set": {"order": idx + 1}}
        )

    return {"status": "success", "message": "Steps reordered"}
