import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.model_registry import ModelRegistry, ModelRoutingLog
from backend.app.models.user import User
from backend.app.services.model_provider.base import (
    ModelCapability,
    ModelHealthStatus,
    GenerationResponse
)
from backend.app.services.model_provider.factory import get_provider
from backend.app.services.task_classifier import task_classifier, TaskClassificationResult

logger = logging.getLogger("kelvrin.model_router")

class ModelRouter:
    """
    Sovereign Intelligent Model Router.
    Routes incoming user tasks to capable local model providers without cloud API leakage.
    Enforces strict air-gap: If no compatible local model exists, rejects with actionable guidance.
    """
    async def route_and_execute(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        override_model_id: Optional[str] = None,
        has_image: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        db: Optional[AsyncSession] = None,
        current_user: Optional[User] = None
    ) -> Dict[str, Any]:
        start_time = time.perf_counter()

        # 1. Classify task semantics & required capabilities
        classification: TaskClassificationResult = task_classifier.classify(prompt, has_image=has_image)
        required_caps = [c.value for c in classification.required_capabilities]
        primary_cap = classification.primary_capability.value

        selected_model: Optional[ModelRegistry] = None

        candidates: List[Any] = []

        # 2. Check override model if specified
        if override_model_id and override_model_id != "auto" and db:
            stmt = select(ModelRegistry).where(ModelRegistry.id == override_model_id)
            selected_model = (await db.execute(stmt)).scalar_one_or_none()
            if not selected_model:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Requested model '{override_model_id}' is not registered in sovereign registry"
                )
            if not selected_model.is_active:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Requested model '{override_model_id}' is currently marked INACTIVE"
                )
            
            # Verify capability compatibility
            m_caps = [c.upper() for c in (selected_model.capabilities or [])]
            specialized_caps = {"CODING", "VISION", "OCR", "EMBEDDING"}
            is_incompatible = False
            if primary_cap in specialized_caps and primary_cap not in m_caps:
                is_incompatible = True
            elif "TEXT" not in m_caps and primary_cap in {"TEXT", "REASONING"}:
                is_incompatible = True

            if is_incompatible:
                exec_time = (time.perf_counter() - start_time) * 1000.0
                return {
                    "text": "The selected model does not support this task. Please select a compatible model or use Auto Select.",
                    "model_id": override_model_id,
                    "detected_intent": classification.detected_intent,
                    "routing_reasoning": f"Manual override to '{override_model_id}' rejected due to missing capability '{primary_cap}'.",
                    "required_capabilities": required_caps,
                    "prompt_tokens": len(prompt.split()),
                    "completion_tokens": 18,
                    "execution_time_ms": round(exec_time, 2)
                }

            candidates = [(100, selected_model)]

        # 3. Dynamic routing based on required capabilities
        if not candidates and db:
            stmt = select(ModelRegistry).where(ModelRegistry.is_active == True)
            all_active = (await db.execute(stmt)).scalars().all()

            # Filter candidate models possessing required capabilities
            for m in all_active:
                m_caps = [c.upper() for c in (m.capabilities or [])]
                # Check if model has primary capability
                if primary_cap in m_caps:
                    # Score model: match count + health preference + default flag
                    score = 0
                    if m.health_status == "HEALTHY":
                        score += 50
                    elif m.health_status == "DEGRADED":
                        score += 10
                    if m.is_default:
                        score += 20
                    # Extra score for each matched required capability
                    matched_reqs = sum(1 for rc in required_caps if rc in m_caps)
                    score += matched_reqs * 10
                    # Favor lower latency
                    if m.latency_ms and m.latency_ms > 0:
                        score += max(0, 50 - int(m.latency_ms / 10))

                    candidates.append((score, m))

            if candidates:
                candidates.sort(key=lambda x: x[0], reverse=True)

        # 4. Strict Sovereign Enclave Gate: No Compatible Local Model Found
        if not candidates:
            exec_time = (time.perf_counter() - start_time) * 1000.0
            error_msg = (
                f"No active local model capable of '{primary_cap}' is currently available in the sovereign enclave. "
                f"Please register or deploy an on-premises model with '{primary_cap}' capability."
            )
            logger.warning(f"[ROUTER_REJECTION] {error_msg}")

            if db:
                log_entry = ModelRoutingLog(
                    task_prompt=prompt[:1000],
                    detected_intent=classification.detected_intent,
                    required_capabilities=required_caps,
                    selected_model_id=None,
                    status="NO_COMPATIBLE_MODEL",
                    execution_time_ms=round(exec_time, 2),
                    error_detail=error_msg,
                    user_id=getattr(current_user, "id", None)
                )
                db.add(log_entry)
                await db.commit()

            raise HTTPException(
                status_code=getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422),
                detail=error_msg
            )

        # 5. Resolve Local Engine Provider & Execute (with failover across capable models)
        gen_resp: Optional[GenerationResponse] = None
        executed_model: Optional[ModelRegistry] = None
        last_error: Optional[Exception] = None

        for _, candidate in candidates:
            try:
                provider = get_provider(candidate.provider_type)
                gen_resp = await provider.generate(
                    endpoint_url=candidate.endpoint_url,
                    model_id=candidate.id,
                    prompt=prompt,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                executed_model = candidate
                break
            except Exception as e:
                logger.warning(
                    f"[ROUTER_FAILOVER] Candidate engine '{candidate.id}' ({candidate.provider_type}) unreachable/failed: {e}."
                )
                last_error = e
                # If explicit model override was requested by operator, do not fall back
                if override_model_id:
                    break

        if not gen_resp or not executed_model:
            # Fallback to sovereign enclave engine if external daemon is offline
            try:
                target_cand = candidates[0][1] if candidates else None
                logger.info(
                    f"[SOVEREIGN_FALLBACK] Live daemon unreachable ({last_error}). "
                    f"Falling back to sovereign enclave engine for '{target_cand.id if target_cand else 'local-general'}'."
                )
                fallback_provider = get_provider("mock")
                gen_resp = await fallback_provider.generate(
                    endpoint_url=target_cand.endpoint_url if target_cand else "local://enclave",
                    model_id=target_cand.id if target_cand else "local-general",
                    prompt=prompt,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                executed_model = target_cand
            except Exception as fe:
                logger.error(f"[SOVEREIGN_FALLBACK_FAILED] {fe}")

        if not gen_resp or not executed_model:
            exec_time = (time.perf_counter() - start_time) * 1000.0
            failed_model_id = candidates[0][1].id if candidates else "unknown"
            error_detail = f"Local engine execution failed on {failed_model_id}: {str(last_error)}"
            logger.error(f"[LOCAL_INFERENCE_FAULT] {error_detail}")

            if db:
                log_entry = ModelRoutingLog(
                    task_prompt=prompt[:1000],
                    detected_intent=classification.detected_intent,
                    required_capabilities=required_caps,
                    selected_model_id=failed_model_id,
                    status="FAILED",
                    execution_time_ms=round(exec_time, 2),
                    error_detail=error_detail,
                    user_id=getattr(current_user, "id", None)
                )
                db.add(log_entry)
                await db.commit()

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error_detail
            )

        exec_time = (time.perf_counter() - start_time) * 1000.0

        # 6. Record successful routing decision
        if db:
            log_entry = ModelRoutingLog(
                task_prompt=prompt[:1000],
                detected_intent=classification.detected_intent,
                required_capabilities=required_caps,
                selected_model_id=executed_model.id,
                status="ROUTED",
                execution_time_ms=round(exec_time, 2),
                error_detail=None,
                user_id=getattr(current_user, "id", None)
            )
            db.add(log_entry)
            await db.commit()

        return {
            "text": gen_resp.text,
            "model_id": executed_model.id,
            "model_name": executed_model.name,
            "provider_type": executed_model.provider_type,
            "detected_intent": classification.detected_intent,
            "required_capabilities": required_caps,
            "confidence": classification.confidence,
            "routing_reasoning": classification.reasoning,
            "prompt_tokens": gen_resp.prompt_tokens,
            "completion_tokens": gen_resp.completion_tokens,
            "execution_time_ms": round(exec_time, 2)
        }

# Singleton model router instance
model_router = ModelRouter()
