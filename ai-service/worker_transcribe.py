#!/usr/bin/env python3
"""
Orbia STT Worker - Subprocess for zero-RAM persistence
Loads Whisper, transcribes, outputs JSON, and exits immediately.
This ensures the model does NOT stay in memory after transcription.

RECEIVES DATA VIA STDIN (JSON) to avoid argv length limits.
"""

import sys
import json
import os
import tempfile
import base64
import subprocess
from faster_whisper import WhisperModel

def convert_to_wav(input_path: str, output_path: str, timeout: int = 15) -> bool:
    """Convert audio to WAV format using ffmpeg."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", output_path],
            capture_output=True,
            timeout=timeout,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False

def detect_audio_format(audio_bytes: bytes) -> str:
    """Detect audio format from magic bytes."""
    if audio_bytes[:4] == b"RIFF":
        return "wav"
    if audio_bytes[:4] == b"\x1aE\xdf\xa3":
        return "webm"
    if audio_bytes[:3] == b"ID3" or audio_bytes[:2] == b"\xff\xfb":
        return "mp3"
    if audio_bytes[:4] == b"OggS":
        return "ogg"
    if audio_bytes[:4] == b"fLaC":
        return "flac"
    return "unknown"

def transcribe_worker(audio_base64: str, model_size: str = "base") -> dict:
    """
    Load model, transcribe audio, return result.
    Model is loaded ONLY for this execution and released on exit.
    """
    input_path = None
    wav_path = None
    
    try:
        # Load model (only for this subprocess)
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        
        # Decode audio
        audio_bytes = base64.b64decode(audio_base64)
        fmt = detect_audio_format(audio_bytes)
        
        # Write temp file
        suffix = f".{fmt}" if fmt != "unknown" else ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            input_path = tmp.name
        
        transcribe_path = input_path
        
        # Convert if needed
        if fmt != "wav":
            wav_path = input_path.rsplit(".", 1)[0] + ".wav"
            if convert_to_wav(input_path, wav_path):
                transcribe_path = wav_path
        
        # Transcribe
        segments, info = model.transcribe(transcribe_path, language="es", beam_size=5)
        text = " ".join(segment.text for segment in segments).strip()
        
        return {"success": True, "transcription": text}
        
    except Exception as e:
        return {"success": False, "error": str(e)}
        
    finally:
        # Cleanup temp files (always executed)
        if input_path and os.path.exists(input_path):
            try:
                os.unlink(input_path)
            except:
                pass
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except:
                pass

if __name__ == "__main__":
    # Read input from STDIN (JSON) to avoid argv length limits
    try:
        input_data = json.loads(sys.stdin.read())
        audio_b64 = input_data["audio"]
        model_size = input_data.get("model_size", os.environ.get("WHISPER_MODEL", "base"))
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid input: {str(e)}"}))
        sys.exit(1)
    
    result = transcribe_worker(audio_b64, model_size)
    print(json.dumps(result))
    
    # Exit immediately - model is released from RAM
    sys.exit(0 if result["success"] else 1)
