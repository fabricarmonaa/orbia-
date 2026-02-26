"""
ORBIA AI Service - deterministic STT + NLU parser.
"""

import os
import re
import asyncio
import json
from pathlib import Path
from difflib import SequenceMatcher
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="ORBIA AI Service", version="2.0.0")

BACKEND_URL = os.environ.get("BACKEND_URL", "")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[BACKEND_URL] if BACKEND_URL else ["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    allow_credentials=True,
)

WORKER_TIMEOUT = int(os.environ.get("AI_WORKER_TIMEOUT_SECONDS", "8"))
MAX_AUDIO_SECONDS = int(os.environ.get("STT_MAX_AUDIO_SECONDS", "15"))
MAX_AUDIO_B64_BYTES = int(os.environ.get("STT_MAX_BASE64_BYTES", "1200000"))
ALLOWED_INTENTS = {
    "customer.create", "customer.search", "customer.purchases",
    "product.create", "product.search", "sale.create", "sale.search",
}


class Example(BaseModel):
    transcript: str
    intent: str
    entities: dict[str, Any]


class STTInterpretRequest(BaseModel):
    audio: str | None = None
    text: str | None = None
    history: list[Example] = []


class STTInterpretResponse(BaseModel):
    transcript: str
    intent: str
    entities: dict[str, Any]
    confidence: float
    summary: str


@app.get("/health")
async def health():
    worker_path = Path(__file__).parent / "worker_transcribe.py"
    return {"status": "ok", "worker_available": worker_path.exists()}


async def transcribe_with_subprocess(audio_base64: str, timeout: int) -> str:
    worker_path = Path(__file__).parent / "worker_transcribe.py"
    if not worker_path.exists():
        raise HTTPException(status_code=500, detail="Worker script not found")

    if len(audio_base64) > MAX_AUDIO_B64_BYTES:
        raise HTTPException(status_code=413, detail="Audio payload too large")

    approx_seconds = int((len(audio_base64) * 3 / 4) / 3000)
    if approx_seconds > MAX_AUDIO_SECONDS:
        raise HTTPException(status_code=413, detail="Audio duration exceeds limit")

    input_data = json.dumps({"audio": audio_base64, "model_size": os.environ.get("WHISPER_MODEL", "base")})

    process = await asyncio.create_subprocess_exec(
        "python", str(worker_path),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(input=input_data.encode()), timeout=timeout)
    except asyncio.TimeoutError:
        process.kill()
        raise HTTPException(status_code=504, detail="Transcription timeout")

    if process.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Worker failed: {stderr.decode() if stderr else 'unknown'}")

    result = json.loads(stdout.decode())
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Transcription failed"))
    return str(result.get("transcription", "")).strip()


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9áéíóúñ\s]", " ", text.lower())).strip()


def parse_entities(text: str, intent: str) -> dict[str, Any]:
    entities: dict[str, Any] = {}
    dni_match = re.search(r"\b(\d{7,9})\b", text)
    if dni_match:
        entities["dni"] = dni_match.group(1)

    qty_match = re.search(r"\b(\d+)\s+(?:unidades?|u|x)\b", text.lower()) or re.search(r"\bde\s+(\d+)\b", text.lower())
    if qty_match:
        entities["quantity"] = int(qty_match.group(1))

    price_match = re.search(r"(?:precio|a)\s*(\d{2,8})", text.lower())
    if price_match:
        entities["price"] = int(price_match.group(1))

    if "cliente" in text.lower():
        m = re.search(r"cliente\s+([a-zA-Záéíóúñ\s]{3,80})", text)
        if m:
            entities["name"] = m.group(1).strip()
    if "producto" in text.lower():
        m = re.search(r"producto\s+([a-zA-Z0-9áéíóúñ\s]{2,80})", text)
        if m:
            entities["name"] = m.group(1).strip()

    if intent == "sale.create":
        pm = re.search(r"venta\s+de\s+\d+\s+([a-zA-Z0-9áéíóúñ\s]{2,80})", text.lower())
        if pm:
            entities["productName"] = pm.group(1).strip()

    return entities


def parse_intent(transcript: str) -> tuple[str, dict[str, Any], float]:
    t = normalize(transcript)

    if any(x in t for x in ["export", "dump", "todos los dni", "dame todos"]):
        return "blocked", {}, 1.0

    if any(x in t for x in ["crear cliente", "crea cliente", "registrar cliente"]):
        intent = "customer.create"
    elif any(x in t for x in ["compras a proveedor", "compra a proveedor", "compras de proveedor"]):
        intent = "provider.purchases"
    elif any(x in t for x in ["compras", "que compro", "qué compras hizo"]):
        intent = "customer.purchases"
    elif any(x in t for x in ["buscar cliente", "busca cliente", "encontrar cliente"]):
        intent = "customer.search"
    elif any(x in t for x in ["crear producto", "crea producto"]):
        intent = "product.create"
    elif any(x in t for x in ["buscar producto", "busca producto"]):
        intent = "product.search"
    elif any(x in t for x in ["hace una venta", "crear venta", "vender", "venta de"]):
        intent = "sale.create"
    elif any(x in t for x in ["buscar venta", "busca venta", "ventas"]):
        intent = "sale.search"
    else:
        intent = "customer.search"

    entities = parse_entities(transcript, intent)
    confidence = 0.65 if intent == "customer.search" else 0.82
    return intent, entities, confidence


def maybe_learned_override(transcript: str, history: list[Example]) -> tuple[str | None, dict[str, Any], float]:
    best = None
    best_score = 0.0
    nt = normalize(transcript)
    for h in history:
        score = SequenceMatcher(None, nt, normalize(h.transcript)).ratio()
        if score > best_score:
            best_score = score
            best = h
    if best and best_score >= 0.86 and best.intent in ALLOWED_INTENTS:
        return best.intent, best.entities, min(0.98, best_score)
    return None, {}, 0.0


def summary_for(intent: str, entities: dict[str, Any]) -> str:
    if intent == "customer.purchases":
        return f"Voy a buscar el cliente {entities.get('name', '')} {entities.get('dni', '')} y listar sus compras.".strip()
    if intent == "customer.create":
        return f"Voy a crear el cliente {entities.get('name', '')} DNI {entities.get('dni', '')}.".strip()
    if intent == "product.create":
        return f"Voy a crear el producto {entities.get('name', '')} con precio {entities.get('price', '')}.".strip()
    if intent == "sale.create":
        return f"Voy a crear una venta de {entities.get('quantity', 1)} {entities.get('productName', entities.get('name', 'producto'))}.".strip()
    return f"Voy a ejecutar {intent}."


@app.post("/api/stt/interpret", response_model=STTInterpretResponse)
async def stt_interpret(request: STTInterpretRequest):
    transcript = request.text.strip() if request.text else ""
    if not transcript:
      if not request.audio:
          raise HTTPException(status_code=400, detail="audio or text required")
      transcript = await transcribe_with_subprocess(request.audio, WORKER_TIMEOUT)

    learned_intent, learned_entities, learned_conf = maybe_learned_override(transcript, request.history)
    if learned_intent:
        intent = learned_intent
        entities = learned_entities
        confidence = learned_conf
    else:
        intent, entities, confidence = parse_intent(transcript)

    if intent == "blocked":
        raise HTTPException(status_code=403, detail="Intent blocked by privacy policy")

    if intent == "provider.purchases":
        raise HTTPException(status_code=400, detail="Compras a proveedor no soportado por voz en este flujo")

    if intent not in ALLOWED_INTENTS:
        raise HTTPException(status_code=400, detail="Intent not allowed")

    return STTInterpretResponse(
        transcript=transcript,
        intent=intent,
        entities=entities,
        confidence=confidence,
        summary=summary_for(intent, entities),
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", os.environ.get("AI_SERVICE_PORT", "8001")))
    uvicorn.run(app, host="0.0.0.0", port=port)
