"""
ORBIA AI Service - deterministic STT + NLU parser.
"""

import os
import re
import asyncio
import json
import math
import uuid
import tempfile
import subprocess
from pathlib import Path
from difflib import SequenceMatcher
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from faster_whisper import WhisperModel

app = FastAPI(title="ORBIA AI Service", version="2.1.0")

BACKEND_URL = os.environ.get("BACKEND_URL", "")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[BACKEND_URL] if BACKEND_URL else ["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-request-id"],
    allow_credentials=True,
)

WORKER_TIMEOUT = int(os.environ.get("AI_WORKER_TIMEOUT_SECONDS", "20"))
MAX_AUDIO_SECONDS = int(os.environ.get("MAX_AUDIO_SECONDS", os.environ.get("STT_MAX_AUDIO_SECONDS", "20")))
ALLOWED_INTENTS = {
    "customer.create", "customer.search", "customer.purchases",
    "product.create", "product.search", "sale.create", "sale.search",
}


class Example(BaseModel):
    transcript: str
    intent: str
    entities: dict[str, Any]


class STTInterpretResponse(BaseModel):
    success: bool
    transcript: str
    durationSeconds: float | None = None
    detectedLanguage: str | None = None
    intent: dict[str, Any]


whisper_model: WhisperModel | None = None


def get_whisper_model() -> WhisperModel:
    global whisper_model
    if whisper_model is None:
        model_size = os.environ.get("WHISPER_MODEL", "base")
        whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
    return whisper_model


def fail(status_code: int, error_code: str, request_id: str):
    raise HTTPException(status_code=status_code, detail={"success": False, "error": error_code, "requestId": request_id})


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


async def convert_to_wav(input_path: str, output_path: str):
    process = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", input_path, "-ac", "1", "-ar", "16000", output_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=WORKER_TIMEOUT)
    if process.returncode != 0:
        raise RuntimeError((stderr or stdout or b"ffmpeg_failed").decode(errors="ignore"))


async def probe_duration_seconds(wav_path: str) -> float | None:
    process = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", wav_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await asyncio.wait_for(process.communicate(), timeout=WORKER_TIMEOUT)
    if process.returncode != 0:
        return None

    try:
        payload = json.loads((stdout or b"{}").decode())
        duration_raw = payload.get("format", {}).get("duration")
        duration = float(duration_raw)
        if math.isnan(duration) or duration <= 0:
            return None
        return duration
    except Exception:
        return None


async def transcribe_wav(wav_path: str) -> tuple[str, str | None]:
    model = get_whisper_model()

    def _run() -> tuple[str, str | None]:
        segments, info = model.transcribe(wav_path, language="es", beam_size=5)
        text = " ".join(segment.text for segment in segments).strip()
        lang = getattr(info, "language", None)
        return text, lang

    return await asyncio.to_thread(_run)


@app.get("/health")
async def health():
    worker_path = Path(__file__).parent / "worker_transcribe.py"
    return {"status": "ok", "worker_available": worker_path.exists()}


@app.post("/api/stt/interpret", response_model=STTInterpretResponse)
async def stt_interpret(
    audio: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    history: str | None = Form(default="[]"),
    x_request_id: str | None = Header(default=None),
):
    request_id = x_request_id or str(uuid.uuid4())

    try:
        parsed_history_raw = json.loads(history or "[]")
        parsed_history = [Example(**item) for item in parsed_history_raw if isinstance(item, dict)]
    except Exception:
        fail(400, "AI_INVALID_HISTORY", request_id)

    transcript = (text or "").strip()
    duration_seconds: float | None = None
    detected_language: str | None = None

    temp_input = None
    temp_wav = None
    try:
        if not transcript:
            if not audio:
                fail(400, "AI_INVALID_AUDIO", request_id)

            suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                content = await audio.read()
                if not content:
                    fail(400, "AI_INVALID_AUDIO", request_id)
                f.write(content)
                temp_input = f.name

            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as fw:
                temp_wav = fw.name

            try:
                await convert_to_wav(temp_input, temp_wav)
            except Exception:
                fail(400, "AI_INVALID_AUDIO", request_id)

            duration_seconds = await probe_duration_seconds(temp_wav)
            if duration_seconds is None:
                fail(400, "AI_INVALID_AUDIO", request_id)
            if duration_seconds > MAX_AUDIO_SECONDS:
                fail(413, "AI_AUDIO_TOO_LONG", request_id)

            transcript, detected_language = await transcribe_wav(temp_wav)
            if not transcript:
                fail(400, "AI_INVALID_AUDIO", request_id)

        learned_intent, learned_entities, learned_conf = maybe_learned_override(transcript, parsed_history)
        if learned_intent:
            intent_name = learned_intent
            entities = learned_entities
            confidence = learned_conf
        else:
            intent_name, entities, confidence = parse_intent(transcript)

        if intent_name == "blocked":
            fail(403, "AI_INTENT_BLOCKED", request_id)
        if intent_name == "provider.purchases":
            fail(400, "AI_PROVIDER_PURCHASES_NOT_SUPPORTED", request_id)
        if intent_name not in ALLOWED_INTENTS:
            fail(400, "AI_INTENT_NOT_ALLOWED", request_id)

        return STTInterpretResponse(
            success=True,
            transcript=transcript,
            durationSeconds=duration_seconds,
            detectedLanguage=detected_language,
            intent={
                "name": intent_name,
                "entities": entities,
                "confidence": confidence,
                "summary": summary_for(intent_name, entities),
            },
        )
    except HTTPException:
        raise
    except Exception:
        fail(500, "AI_SERVICE_UNAVAILABLE", request_id)
    finally:
        for tmp in [temp_input, temp_wav]:
            if tmp and os.path.exists(tmp):
                try:
                    os.unlink(tmp)
                except Exception:
                    pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", os.environ.get("AI_SERVICE_PORT", "8000")))
    uvicorn.run(app, host="0.0.0.0", port=port)
