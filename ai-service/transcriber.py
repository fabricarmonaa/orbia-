import base64
import os
import subprocess
import tempfile

whisper_model = None


def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        from faster_whisper import WhisperModel
        model_size = os.environ.get("WHISPER_MODEL", "base")
        whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
        print(f"Loaded faster-whisper model: {model_size}")
    return whisper_model


def convert_to_wav(input_path: str, output_path: str) -> bool:
    """Convert audio to WAV format using ffmpeg if available."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", output_path],
            capture_output=True,
            timeout=15,
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


def transcribe_audio(audio_base64: str) -> str:
    """Transcribe base64-encoded audio using faster-whisper.
    Handles webm/ogg/mp3 by converting to wav via ffmpeg first.
    """
    model = get_whisper_model()

    audio_bytes = base64.b64decode(audio_base64)
    fmt = detect_audio_format(audio_bytes)

    suffix = f".{fmt}" if fmt != "unknown" else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        input_path = tmp.name

    wav_path = None
    transcribe_path = input_path

    try:
        if fmt != "wav":
            wav_path = input_path.rsplit(".", 1)[0] + ".wav"
            if convert_to_wav(input_path, wav_path):
                transcribe_path = wav_path
            else:
                print(f"Warning: ffmpeg conversion failed for {fmt}, trying direct transcription")

        segments, info = model.transcribe(transcribe_path, language="es", beam_size=5)
        text = " ".join(segment.text for segment in segments).strip()
        return text
    finally:
        os.unlink(input_path)
        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)
