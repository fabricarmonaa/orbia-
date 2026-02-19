"""
ORBIA AI Service - FastAPI microservice for STT and intent parsing.
Uses subprocess pattern for zero-RAM persistence.
No model stays in memory after transcription.
"""

import os
import subprocess
import asyncio
import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from parsers.orders import parse_order_intent
from parsers.cash import parse_cash_intent
from parsers.products import parse_product_intent

app = FastAPI(title="ORBIA AI Service", version="1.0.0")

# CORS - restrict to backend only (not public-facing)
BACKEND_URL = os.environ.get("BACKEND_URL", "")
if BACKEND_URL:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[BACKEND_URL],
        allow_methods=["POST", "GET", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        allow_credentials=True,
    )
else:
    # Development fallback
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["POST", "GET", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        allow_credentials=True,
    )


class STTRequest(BaseModel):
    audio: str
    context: str


class STTResponse(BaseModel):
    transcription: str
    intent: dict


class HealthResponse(BaseModel):
    status: str
    worker_available: bool


INTENT_PARSERS = {
    "orders": parse_order_intent,
    "cash": parse_cash_intent,
    "products": parse_product_intent,
}

WORKER_TIMEOUT = int(os.environ.get("AI_WORKER_TIMEOUT_SECONDS", "25"))
STT_DEBUG = os.environ.get("STT_DEBUG", "false").lower() == "true"


def stt_log(message: str, **data):
    if not STT_DEBUG:
        return
    print(f"[ai-stt] {message}", data)


@app.get("/health", response_model=HealthResponse)
async def health():
    worker_available = True
    try:
        # Test if worker script exists
        worker_path = Path(__file__).parent / "worker_transcribe.py"
        if not worker_path.exists():
            worker_available = False
    except Exception:
        worker_available = False
    
    return HealthResponse(
        status="ok",
        worker_available=worker_available,
    )


async def transcribe_with_subprocess(audio_base64: str, timeout: int) -> str:
    """
    Run transcription in subprocess with strict timeout.
    Model loads ONLY in subprocess and is released when it exits.
    
    CRITICAL: Uses STDIN to pass audio (not argv) to avoid length limits.
    """
    worker_path = Path(__file__).parent / "worker_transcribe.py"
    
    if not worker_path.exists():
        raise HTTPException(status_code=500, detail="Worker script not found")
    
    model_size = os.environ.get("WHISPER_MODEL", "base")
    input_data = json.dumps({
        "audio": audio_base64,
        "model_size": model_size
    })
    
    try:
        # Run subprocess with stdin (not argv) to avoid length limits
        process = await asyncio.create_subprocess_exec(
            "python",
            str(worker_path),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(input=input_data.encode()),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            # Kill process tree on timeout (including any ffmpeg children)
            try:
                process.kill()
            except:
                pass
            
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                # Force kill if still alive
                try:
                    process.terminate()
                except:
                    pass
            
            raise HTTPException(
                status_code=504,
                detail=f"Transcription timeout after {timeout}s. Audio may be too long."
            )
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise HTTPException(status_code=500, detail=f"Worker failed: {error_msg}")
        
        # Parse result
        result = json.loads(stdout.decode())
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Transcription failed"))
        
        return result["transcription"]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Subprocess error: {str(e)}")


@app.post("/api/stt", response_model=STTResponse)
async def stt(request: STTRequest):
    stt_log("request_received", context=request.context, audio_base64_bytes=len(request.audio))
    if request.context not in INTENT_PARSERS:
        raise HTTPException(status_code=400, detail="Contexto inválido")

    try:
        transcription = await transcribe_with_subprocess(request.audio, WORKER_TIMEOUT)
        stt_log("transcription_ok", transcription_len=len(transcription))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en transcripción: {str(e)}")

    if not transcription or transcription.strip() == "":
        raise HTTPException(status_code=400, detail="No se pudo transcribir el audio")

    parser = INTENT_PARSERS[request.context]
    intent = parser(transcription)
    stt_log("intent_parsed", intent_keys=list(intent.keys()) if isinstance(intent, dict) else [])

    return STTResponse(transcription=transcription, intent=intent)


if __name__ == "__main__":
    import uvicorn
    
    # Railway compatibility: use PORT env var
    port = int(os.environ.get("PORT", os.environ.get("AI_SERVICE_PORT", "8001")))
    
    uvicorn.run(app, host="0.0.0.0", port=port)
