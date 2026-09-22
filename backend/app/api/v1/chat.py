import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.chat import Conversation, Message
from backend.app.models.document import Document
from backend.app.schemas.chat import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
    DocumentChatQueryRequest,
    DocumentChatQueryResponse
)
from backend.app.schemas.knowledge import CitationOut, RetrievedEvidenceOut
from backend.app.services.model_router import model_router
from backend.app.services.task_classifier import task_classifier
from backend.app.services.deliverables.deliverable_service import deliverable_service
from backend.app.services.deliverables.chat_deliverable_synthesizer import (
    extract_clean_topic,
    synthesize_chat_deliverable,
)
from backend.app.services.rag.rag_pipeline import rag_pipeline
from backend.app.services.rag.retriever import grounded_retriever

router = APIRouter(prefix="/chat", tags=["Conversational AI & Document Chat"])


def _extract_clean_topic(prompt: str) -> str:
    """Backward compatibility wrapper delegating to chat_deliverable_synthesizer."""
    return extract_clean_topic(prompt)


def msg_to_out(msg: Message) -> MessageOut:
    return MessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_type=msg.sender_type,
        content=msg.content,
        model_used=msg.model_used,
        detected_intent=msg.detected_intent,
        routing_reasoning=msg.routing_reasoning,
        required_capabilities=msg.required_capabilities or [],
        attachment_name=msg.attachment_name,
        tokens_prompt=msg.tokens_prompt,
        tokens_completion=msg.tokens_completion,
        latency_ms=msg.latency_ms,
        created_at=msg.created_at.isoformat() if hasattr(msg.created_at, "isoformat") else str(msg.created_at)
    )

@router.get("/conversations", response_model=List[ConversationOut])
async def list_conversations(
    current_user: User = Depends(require_permission("ai.chat")),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve all conversation threads owned by the current operator.
    """
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(desc(Conversation.updated_at))
    )
    convs = (await db.execute(stmt)).scalars().all()
    out = []
    for c in convs:
        m_stmt = (
            select(Message)
            .where(Message.conversation_id == c.id)
            .order_by(Message.created_at.asc())
        )
        msgs = (await db.execute(m_stmt)).scalars().all()

        doc_title = None
        doc_status = None
        if c.document_id:
            d_stmt = select(Document).where(Document.id == c.document_id)
            doc = (await db.execute(d_stmt)).scalar_one_or_none()
            if doc:
                doc_title = doc.title
                doc_status = doc.status

        out.append(ConversationOut(
            id=c.id,
            title=c.title,
            user_id=c.user_id,
            model_id=c.model_id,
            document_id=c.document_id,
            document_title=doc_title,
            document_status=doc_status,
            created_at=c.created_at.isoformat() if hasattr(c.created_at, "isoformat") else str(c.created_at),
            updated_at=c.updated_at.isoformat() if hasattr(c.updated_at, "isoformat") and c.updated_at else None,
            messages=[msg_to_out(m) for m in msgs]
        ))
    return out

@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    current_user: User = Depends(require_permission("ai.chat")),
    db: AsyncSession = Depends(get_db)
):
    """
    Initiate a new conversation thread, optionally bound to an on-premises document.
    """
    doc_title = None
    doc_status = None

    if payload.document_id:
        d_stmt = select(Document).where(Document.id == payload.document_id)
        doc = (await db.execute(d_stmt)).scalar_one_or_none()
        from backend.app.core.tenant import authorize_tenant_access
        authorize_tenant_access(doc, current_user)
        doc_title = doc.title
        doc_status = doc.status

    conv = Conversation(
        title=payload.title or "New Sovereign Conversation",
        user_id=current_user.id,
        company_code=getattr(current_user, "company_code", None),
        model_id=payload.model_id or "auto",
        document_id=payload.document_id
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)

    await record_audit_log(
        db,
        action="CHAT_CONVERSATION_CREATE",
        resource_type="conversation",
        actor=current_user,
        resource_id=conv.id,
        details={"title": conv.title, "document_id": conv.document_id}
    )
    await db.commit()

    return ConversationOut(
        id=conv.id,
        title=conv.title,
        user_id=conv.user_id,
        model_id=conv.model_id,
        document_id=conv.document_id,
        document_title=doc_title,
        document_status=doc_status,
        created_at=conv.created_at.isoformat() if hasattr(conv.created_at, "isoformat") else str(conv.created_at),
        messages=[]
    )

@router.get("/conversations/{conv_id}", response_model=ConversationOut)
async def get_conversation(
    conv_id: str,
    current_user: User = Depends(require_permission("ai.chat")),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve single conversation by identifier with full message history.
    """
    stmt = select(Conversation).where(Conversation.id == conv_id)
    conv = (await db.execute(stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    from backend.app.core.tenant import authorize_tenant_access
    authorize_tenant_access(conv, current_user)
    if conv.user_id != current_user.id and current_user.role not in ["Super Admin", "SUPER_ADMIN"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to conversation denied")

    m_stmt = (
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.asc())
    )
    msgs = (await db.execute(m_stmt)).scalars().all()

    doc_title = None
    doc_status = None
    if conv.document_id:
        d_stmt = select(Document).where(Document.id == conv.document_id)
        doc = (await db.execute(d_stmt)).scalar_one_or_none()
        if doc:
            doc_title = doc.title
            doc_status = doc.status

    return ConversationOut(
        id=conv.id,
        title=conv.title,
        user_id=conv.user_id,
        model_id=conv.model_id,
        document_id=conv.document_id,
        document_title=doc_title,
        document_status=doc_status,
        created_at=conv.created_at.isoformat() if hasattr(conv.created_at, "isoformat") else str(conv.created_at),
        updated_at=conv.updated_at.isoformat() if hasattr(conv.updated_at, "isoformat") and conv.updated_at else None,
        messages=[msg_to_out(m) for m in msgs]
    )

@router.post("/conversations/{conv_id}/messages", response_model=MessageOut)
async def send_message(
    conv_id: str,
    payload: MessageCreate,
    current_user: User = Depends(require_permission("ai.chat")),
    db: AsyncSession = Depends(get_db)
):
    """
    Real local conversational inference pipeline:
    1. Authenticate and check RBAC clearance.
    2. Enforce document status gating (no hallucination on unready documents).
    3. Route prompt through TaskClassifier and ModelRouter to capable on-premises engine.
    4. Commit user & assistant messages to local database with routing transparency metadata.
    5. Emit audit event.
    """
    stmt = select(Conversation).where(Conversation.id == conv_id)
    conv = (await db.execute(stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    from backend.app.core.tenant import authorize_tenant_access
    authorize_tenant_access(conv, current_user)
    if conv.user_id != current_user.id and current_user.role not in ["Super Admin", "SUPER_ADMIN"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to conversation denied")

    # 1. Document grounding verification
    system_context = (
        "You are KELVRIN, a sovereign agentic AI workbench assistant operating strictly on-premises.\n"
        "Confidential enterprise documents, prompts, and inference data remain in the organization's controlled infrastructure."
    )
    if conv.document_id:
        d_stmt = select(Document).where(Document.id == conv.document_id)
        doc = (await db.execute(d_stmt)).scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bound sovereign document missing from repository"
            )

        # GATING: Verify document processing status
        if doc.status != "READY":
            raise HTTPException(
                status_code=getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422),
                detail=f"Document '{doc.title}' is currently {doc.status}. Grounded conversational synthesis is locked until document processing is READY."
            )

        # Retrieve relevant chunks for grounded conversation context
        rel_chunks = await grounded_retriever.retrieve(
            query=payload.content,
            current_user=current_user,
            db=db,
            top_k=3,
            similarity_threshold=0.2,
            document_ids=[doc.id]
        )
        if rel_chunks:
            chunk_excerpts = "\n\n".join(f"[Page {c.page_number} Chunk #{c.chunk_index}]:\n{c.content}" for c in rel_chunks)
            system_context += (
                f"\n\n[GROUNDED SOVEREIGN CONTEXT]\n"
                f"Document Title: {doc.title}\n"
                f"Filename: {doc.filename}\n"
                f"Relevant Passages:\n{chunk_excerpts}"
            )
        else:
            system_context += (
                f"\n\n[GROUNDED SOVEREIGN CONTEXT]\n"
                f"Document Title: {doc.title}\n"
                f"Filename: {doc.filename}\n"
                f"Classification: {doc.classification}\n"
                f"Extracted Content:\n{doc.content_preview or 'No excerpt available.'}"
            )

    # 2. Record incoming user message
    user_msg = Message(
        conversation_id=conv.id,
        sender_type="user",
        content=payload.content,
        model_used=payload.model_id if payload.model_id and payload.model_id != "auto" else conv.model_id,
        attachment_name=payload.attachment_name
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    # 3. Task Classification & Deliverable Generation / Model routing
    start_time = time.perf_counter()
    cls_res = task_classifier.classify(payload.content)
    
    if cls_res.task_type == "FILE_GENERATION" and cls_res.target_file_type:
        chat_text = await synthesize_chat_deliverable(
            content=payload.content,
            target_file_type=cls_res.target_file_type,
            user=current_user,
            db=db,
            deliverable_svc=deliverable_service,
        )
        exec_time = (time.perf_counter() - start_time) * 1000.0
        router_res = {
            "text": chat_text,
            "model_id": payload.model_id if payload.model_id and payload.model_id != "auto" else "local-general",
            "detected_intent": cls_res.detected_intent,
            "routing_reasoning": cls_res.reasoning,
            "required_capabilities": [c.value for c in cls_res.required_capabilities],
            "prompt_tokens": len(payload.content.split()),
            "completion_tokens": len(chat_text.split()),
            "execution_time_ms": round(exec_time, 2)
        }
    else:
        # Standard conversational model routing & local execution
        model_override = payload.model_id if payload.model_id and payload.model_id != "auto" else (
            conv.model_id if conv.model_id != "auto" else None
        )

        router_res = await model_router.route_and_execute(
            prompt=payload.content,
            system_prompt=system_context,
            override_model_id=model_override,
            has_image=bool(payload.attachment_name and any(ext in payload.attachment_name.lower() for ext in [".png", ".jpg", ".jpeg"])),
            db=db,
            current_user=current_user
        )

    # 4. Save assistant response with routing transparency metadata
    assistant_msg = Message(
        conversation_id=conv.id,
        sender_type="assistant",
        content=router_res["text"],
        model_used=router_res["model_id"],
        detected_intent=router_res["detected_intent"],
        routing_reasoning=router_res["routing_reasoning"],
        required_capabilities=router_res["required_capabilities"],
        tokens_prompt=router_res["prompt_tokens"],
        tokens_completion=router_res["completion_tokens"],
        latency_ms=router_res["execution_time_ms"]
    )
    db.add(assistant_msg)

    # Update conversation title if first exchange
    if conv.title == "New Sovereign Conversation":
        snippet = payload.content[:40].strip()
        conv.title = snippet.capitalize() if snippet else "Sovereign Query"

    await db.commit()
    await db.refresh(assistant_msg)

    # 5. Audit log
    await record_audit_log(
        db,
        action="CHAT_MESSAGE",
        resource_type="chat",
        actor=current_user,
        resource_id=assistant_msg.id,
        details={
            "conversation_id": conv.id,
            "model_used": assistant_msg.model_used,
            "detected_intent": assistant_msg.detected_intent,
            "latency_ms": assistant_msg.latency_ms
        }
    )
    await db.commit()

    return msg_to_out(assistant_msg)

@router.delete("/conversations/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: str,
    current_user: User = Depends(require_permission("ai.chat")),
    db: AsyncSession = Depends(get_db)
):
    """
    Purge a conversation thread and its associated messages.
    """
    stmt = select(Conversation).where(Conversation.id == conv_id)
    conv = (await db.execute(stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    from backend.app.core.tenant import authorize_tenant_access
    authorize_tenant_access(conv, current_user)
    if conv.user_id != current_user.id and current_user.role not in ["Super Admin", "SUPER_ADMIN"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await db.delete(conv)
    await db.commit()

@router.post("/document/{doc_id}/query", response_model=DocumentChatQueryResponse)
async def query_document(
    doc_id: str,
    payload: DocumentChatQueryRequest,
    current_user: User = Depends(require_permission("ai.chat")),
    db: AsyncSession = Depends(get_db)
):
    """
    Direct single-turn grounded Document Chat Q&A.
    Verifies document existence, permissions, and READY processing status.
    Guarantees zero hallucination on unready documents.
    """
    start_time = time.perf_counter()

    d_stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(d_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    from backend.app.core.tenant import authorize_tenant_access
    authorize_tenant_access(doc, current_user)

    # Check document status
    if doc.status != "READY":
        raise HTTPException(
            status_code=getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422),
            detail=f"Document '{doc.title}' is in state {doc.status}. Grounded Q&A is locked until document processing is READY."
        )

    model_override = payload.model_id if payload.model_id and payload.model_id != "auto" else None

    rag_res = await rag_pipeline.search_and_answer(
        query=payload.query,
        current_user=current_user,
        db=db,
        top_k=3,
        similarity_threshold=0.2,
        hybrid_search=True,
        document_ids=[doc.id],
        model_override=model_override
    )

    exec_time = (time.perf_counter() - start_time) * 1000.0

    await record_audit_log(
        db,
        action="DOCUMENT_CHAT_QUERY",
        resource_type="document",
        actor=current_user,
        resource_id=doc.id,
        details={
            "query": payload.query[:100],
            "model_used": rag_res.model_used,
            "status": rag_res.status,
            "latency_ms": rag_res.latency_ms
        }
    )
    await db.commit()

    citation_snippet = rag_res.citations[0].excerpt if rag_res.citations else (doc.content_preview[:200] if doc.content_preview else None)

    citations_out = [
        CitationOut(
            document_id=c.document_id,
            document_title=c.document_title,
            filename=c.filename,
            page_number=c.page_number,
            chunk_index=c.chunk_index,
            similarity_score=c.similarity_score,
            excerpt=c.excerpt
        ) for c in rag_res.citations
    ] if rag_res.citations else []

    evidence_out = [
        RetrievedEvidenceOut(
            chunk_id=e["chunk_id"],
            document_id=e["document_id"],
            document_title=e["document_title"],
            filename=e["filename"],
            page_number=e["page_number"],
            chunk_index=e["chunk_index"],
            similarity_score=e["similarity_score"],
            content=e["content"],
            classification=e["classification"]
        ) for e in rag_res.evidence
    ] if rag_res.evidence else []

    return DocumentChatQueryResponse(
        answer=rag_res.answer,
        document_id=doc.id,
        document_title=doc.title,
        model_used=rag_res.model_used,
        detected_intent="DOCUMENT_GROUNDED_RETRIEVAL_QA",
        routing_reasoning=rag_res.routing_reasoning,
        citation_snippet=citation_snippet,
        citations=citations_out,
        evidence=evidence_out,
        latency_ms=round(exec_time, 2)
    )
