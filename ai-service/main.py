"""
ORBIA AI Service - deterministic STT + NLU parser.
"""

import os
import re
import asyncio
import math
import uuid
import json
import dateparser
import tempfile
import subprocess
from pathlib import Path
from difflib import SequenceMatcher
from dateparser.search import search_dates
from typing import Any
from datetime import datetime, date
from uuid import uuid4
from fastapi import FastAPI, BackgroundTasks, File, Form, UploadFile, Header, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="ORBIA AI Service", version="2.1.1")

@app.on_event("startup")
async def startup_event():
    print(json.dumps({"event":"ai_startup","workerTimeout":WORKER_TIMEOUT,"maxAudioSeconds":MAX_AUDIO_SECONDS,"maxConcurrent":AI_MAX_CONCURRENT_JOBS}))

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
AI_MAX_CONCURRENT_JOBS = int(os.environ.get("AI_MAX_CONCURRENT_JOBS", "2"))
ai_semaphore = asyncio.Semaphore(max(1, AI_MAX_CONCURRENT_JOBS))
ALLOWED_INTENTS = {
    "customer.create", "customer.search", "customer.purchases",
    "product.create", "product.search", "sale.create", "sale.search",
    "agenda.create", "note.create",
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


from typing import Any as _Any

whisper_model: _Any | None = None

def patch_ctranslate_execstack_once() -> None:
    if os.environ.get("CTRANSLATE_EXECSTACK_PATCHED") == "1":
        return

    try:
        import glob
        import site

        patched = 0
        candidates: list[str] = []
        for root in site.getsitepackages():
            candidates.extend(glob.glob(os.path.join(root, "ctranslate2", "**", "*.so*"), recursive=True))
            candidates.extend(glob.glob(os.path.join(root, "**", "libctranslate2*.so*"), recursive=True))

        seen = set()
        unique_candidates: list[str] = []
        for so_path in candidates:
            if so_path in seen:
                continue
            seen.add(so_path)
            unique_candidates.append(so_path)

        for so_path in unique_candidates:
            try:
                subprocess.run(
                    ["patchelf", "--clear-execstack", so_path],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                patched += 1
            except Exception:
                continue

        os.environ["CTRANSLATE_EXECSTACK_PATCHED"] = "1"
        print(json.dumps({"event": "ctranslate_patch", "patched": patched, "candidates": len(unique_candidates)}))
    except Exception as err:
        print(json.dumps({"event": "ctranslate_patch_error", "message": str(err)}))


def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        patch_ctranslate_execstack_once()
        from faster_whisper import WhisperModel
        model_size = os.environ.get("WHISPER_MODEL", "base")
        whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
    return whisper_model


def fail(status_code: int, error_code: str, request_id: str):
    raise HTTPException(status_code=status_code, detail={"success": False, "error": error_code, "requestId": request_id})


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9áéíóúñ\s]", " ", text.lower())).strip()


def parse_entities(text: str, intent: str) -> dict[str, Any]:
    entities: dict[str, Any] = {}
    normalized = text.lower()

    dni_match = re.search(r"\b(\d{7,9})\b", text)
    if dni_match:
        entities["dni"] = dni_match.group(1)

    # Captura flexible si el usuario dice documento/documentos/dni con un número corto o largo.
    explicit_doc = re.search(r"(?:dni|documento|documentos|nro\.?\s*de\s*documento|numero\s*de\s*documento)\s*(?:es|:)?\s*((?:\d[\s,.-]*){1,15})", normalized)
    if explicit_doc:
        entities["dni"] = re.sub(r"\D", "", explicit_doc.group(1))

    qty_match = re.search(r"\b(\d+)\s+(?:unidades?|u|x)\b", normalized) or re.search(r"\bde\s+(\d+)\b", normalized)
    if qty_match:
        entities["quantity"] = int(qty_match.group(1))

    price_match = re.search(r"(?:precio|a)\s*(\d{2,8})", normalized)
    if price_match:
        entities["price"] = int(price_match.group(1))

    # Nombre de cliente por diferentes formas coloquiales.
    name_patterns = [
        r"nombre\s+([a-zA-Záéíóúñ\s]{3,80})",
        r"cliente\s+([a-zA-Záéíóúñ\s]{3,80})",
        r"usuario\s+([a-zA-Záéíóúñ\s]{3,80})",
        r"se\s+llama\s+([a-zA-Záéíóúñ\s]{3,80})",
    ]
    for pattern in name_patterns:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m:
            candidate = re.sub(r"\s+(con|dni|documento|documentos|telefono|teléfono|que|tiene|tienen|tenés|tenéis|teneis|y|mail|correo|email|para).*$", "", m.group(1).strip(), flags=re.IGNORECASE).strip()
            if len(candidate) >= 3:
                entities["name"] = candidate
                break

    # Teléfono: acepta dictado con espacios/comas/puntos, ej: "2, 3, 5, 0, 0, 7, 8, 3"
    phone_match = re.search(r"(?:telefono|teléfono|celular|whatsapp|me llaman al|llamame al|llámame al)\s*(?:es|:|al)?\s*((?:\d[\s,.-]*){6,20})", normalized)
    if phone_match:
        phone_digits = re.sub(r"\D", "", phone_match.group(1))
        if len(phone_digits) >= 6:
            entities["phone"] = phone_digits

    if "producto" in normalized:
        m = re.search(r"producto\s+([a-zA-Z0-9áéíóúñ\s]{2,80})", text, flags=re.IGNORECASE)
        if m:
            entities["name"] = m.group(1).strip()

    if intent == "sale.create":
        pm = re.search(r"venta\s+de\s+\d+\s+([a-zA-Z0-9áéíóúñ\s]{2,80})", normalized)
        if pm:
            entities["productName"] = pm.group(1).strip()

    if intent in ("agenda.create", "note.create"):
        # Tratamos de buscar de qué fecha habla ("para el martes", "el 8 de marzo", "a las 5", "mañana")
        # Un enfoque simple es capturar el texto luego de "para el|para|el dia|el día|el|a las|mañana|hoy|pasado mañana" y pasar todo a dateparser
        # search_dates es más tolerante a oraciones completas
        found_dates = search_dates(
            text, 
            languages=['es'], 
            settings={'TIMEZONE': 'America/Argentina/Buenos_Aires', 'RETURN_AS_TIMEZONE_AWARE': False, 'PREFER_DATES_FROM': 'future'}
        )
        if found_dates and len(found_dates) > 0:
            entities["parsed_date"] = found_dates[0][1].isoformat()
            
        cmd_words = r"agendame|agendar|agenda|creame|crear|crea\s+una\s+nota|anota|anotar|recordame|recordatorio|agregar\s+nota|cita|turno|evento|reunión|reunion"
        stripped = re.sub(rf"\b({cmd_words})\b", "", text, flags=re.IGNORECASE)
        time_words = r"para\s+el\s+martes|para\s+el\s+lunes|para\s+el\s+miercoles|para\s+el\s+jueves|para\s+el\s+viernes|para\s+el\s+sabado|para\s+el\s+domingo|para\s+las|a\s+las|el\s+dia|el\s+día|mañana|hoy|pasado\s+mañana|para\s+hoy|para\s+mañana|el\s+\d{1,2}\s+de\s+[a-z]+|el\s+\d{1,2}"
        stripped = re.sub(time_words, "", stripped, flags=re.IGNORECASE)
        
        # Limpiar preposiciones y artículos residuales al inicio
        stripped = re.sub(r"^(un|una|para|el|la|los|las|de|que)\b", " ", stripped, flags=re.IGNORECASE)
        candidate = re.sub(r"\s+", " ", stripped).strip()
        if candidate:
            # Capitalizar la primera letra
            candidate = candidate[0].upper() + candidate[1:]
            entities["title"] = candidate
        else:
            entities["title"] = "Nuevo evento" if intent == "agenda.create" else "Nueva nota"

    return entities


def parse_intent(transcript: str) -> tuple[str, dict[str, Any], float]:
    t = normalize(transcript)

    if any(x in t for x in ["export", "dump", "todos los dni", "dame todos"]):
        return "blocked", {}, 1.0

    scores = {
        "customer.create": 0, "customer.search": 0, "customer.purchases": 0,
        "provider.purchases": 0, "product.create": 0, "product.search": 0,
        "sale.create": 0, "sale.search": 0, "agenda.create": 0, "note.create": 0,
    }

    keywords = {
        "customer.create": ["crear cliente", "crea cliente", "crea un cliente", "crear un cliente", "registrar cliente", "crear usuario", "crea usuario", "crea un usuario", "crear un usuario", "registrar usuario", "cargar cliente", "alta cliente", "agregar cliente", "ingresar cliente", "nuevo cliente", "creame", "creame un", "creame un usuario", "creame cliente", "creame un cliente"],
        "customer.search": ["buscar cliente", "busca un cliente", "busca cliente", "buscar un cliente", "buscar un usuario", "busca un usuario", "encontrar cliente", "mostrar cliente", "traer cliente", "consultar cliente", "quien es", "datos de", "buscame al cliente", "traeme a"],
        "customer.purchases": ["compras", "que compro", "qué compras hizo", "historial", "compras de", "que llevo", "que facturo"],
        "provider.purchases": ["compras a proveedor", "compra a proveedor", "compras de proveedor", "historial proveedor", "facturas proveedor"],
        "product.create": ["crear producto", "crea producto", "nuevo producto", "dar de alta un producto", "cargar producto"],
        "product.search": ["buscar producto", "busca producto", "precio de", "cuanto sale", "cuanto cuesta", "buscame el producto", "consultar producto"],
        "sale.create": ["hace una venta", "crear venta", "vender", "venta de", "cobrar", "vendido", "vendí", "facturar", "cobrar a", "vendiendo", "hacer un recibo de", "ingresar venta", "nueva venta"],
        "sale.search": ["buscar venta", "busca venta", "ventas de", "ver facturas", "mostrar facturas de", "mostrar ventas"],
        "agenda.create": ["agendar", "agenda", "calendario", "turno", "cita", "evento", "reunión", "reunion", "agendame", "programar cita", "programar reunión", "reserva un turno", "reservar turno"],
        "note.create": ["nota", "notas", "anotar", "anota", "apuntar", "recordatorio", "recordame", "acordarme", "haceme acordar", "crear nota", "escribir nota", "nueva nota", "añadir nota", "añadir recordatorio"],
    }

    for intent_name, kw_list in keywords.items():
        for kw in kw_list:
            if kw in t:
                # Más peso a las frases más precisas
                scores[intent_name] += len(kw.split()) * 2

    # Heurística estricta de desempate
    # Si dijo explícitamente "nota" o "notas", pero también dijo "agendame" (ej. "agendame una nota")
    # Python por defecto resolvería el empate a favor de agenda.create por el orden. Le damos bonus:
    t_words = [w.strip() for w in re.split(r'\W+', t) if w.strip()]
    if "nota" in t_words or "notas" in t_words:
        scores["note.create"] += 3
        scores["agenda.create"] -= 2

    # Si hay solapamiento (ej: "anota una venta de"), note.create vs sale.create. 'venta de' capta más.
    best_intent = max(scores.items(), key=lambda x: x[1])
    intent = best_intent[0] if best_intent[1] > 0 else "customer.search"

    entities = parse_entities(transcript, intent)
    confidence = 0.65 if intent == "customer.search" and best_intent[1] == 0 else 0.85
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
    if intent == "agenda.create":
        return f"Voy a agendar: {entities.get('title', 'nuevo evento')}...".strip()
    if intent == "note.create":
        return f"Voy a crear la nota: {entities.get('title', 'nuevo recordatorio')}...".strip()
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
    return {"ok": True, "service": "ai", "status": "ok", "worker_available": worker_path.exists()}




async def _stt_interpret_internal(
    audio: UploadFile | None,
    text: str | None,
    history: str | None,
    request_id: str,
):
    acquired_slot = False
    try:
        await asyncio.wait_for(ai_semaphore.acquire(), timeout=0.05)
        acquired_slot = True
    except TimeoutError:
        fail(429, "AI_BUSY", request_id)

    try:
        print(json.dumps({"event":"stt_request","requestId":request_id,"hasAudio":bool(audio),"hasText":bool((text or "").strip())}))
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
                while True:
                    chunk = await audio.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                if f.tell() <= 0:
                    fail(400, "AI_INVALID_AUDIO", request_id)
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
    except Exception as err:
        print(json.dumps({"event":"stt_error","requestId":request_id,"message":str(err)}))
        fail(500, "AI_SERVICE_UNAVAILABLE", request_id)
    finally:
        if acquired_slot:
            ai_semaphore.release()
        for tmp in [temp_input, temp_wav]:
            if tmp and os.path.exists(tmp):
                try:
                    os.unlink(tmp)
                except Exception:
                    pass

@app.post("/api/stt/interpret", response_model=STTInterpretResponse)
async def stt_interpret(
    audio: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    history: str | None = Form(default="[]"),
    x_request_id: str | None = Header(default=None),
):
    request_id = x_request_id or str(uuid.uuid4())
    return await _stt_interpret_internal(audio, text, history, request_id)


@app.post("/stt", response_model=STTInterpretResponse)
async def stt_alias(
    audio: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    history: str | None = Form(default="[]"),
    x_request_id: str | None = Header(default=None),
):
    request_id = x_request_id or str(uuid.uuid4())
    return await _stt_interpret_internal(audio, text, history, request_id)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", os.environ.get("AI_SERVICE_PORT", "8000")))
    uvicorn.run(app, host="0.0.0.0", port=port)
