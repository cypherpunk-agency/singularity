#!/usr/bin/env python3
"""Transcription service using faster-whisper with GPU acceleration."""

import os
import tempfile
from faster_whisper import WhisperModel
from fastapi import FastAPI, File, UploadFile, HTTPException
import uvicorn

app = FastAPI(title="Transcription Service")

# Lazy load model
_model = None


def get_model():
    """Load Whisper model on first use."""
    global _model
    if _model is None:
        model_name = os.environ.get('WHISPER_MODEL', 'large-v3-turbo')
        device = os.environ.get('WHISPER_DEVICE', 'cuda')
        compute_type = 'float16' if device == 'cuda' else 'int8'
        print(f"Loading {model_name} on {device} with {compute_type}...")
        _model = WhisperModel(model_name, device=device, compute_type=compute_type)
        print("Model loaded!")
    return _model


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Transcribe audio file to text."""
    try:
        # Save uploaded file to temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix='.ogg') as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            model = get_model()
            segments, info = model.transcribe(tmp_path, beam_size=5)
            text = " ".join(segment.text for segment in segments)
            return {
                "text": text.strip(),
                "language": info.language,
                "duration": info.duration
            }
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Pre-load model on startup
    get_model()
    uvicorn.run(app, host="0.0.0.0", port=5001)
