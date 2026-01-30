from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import parselmouth
import parselmouth.praat as praat
import subprocess
import os
import math
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def analyze_with_praat(wav_path: str):
    time.sleep(0.4)
    if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 1000:
        return None

    try:
        sound = parselmouth.Sound(wav_path)
        praat.call(sound, "Scale intensity", 75.0)

        # Ekstraksi Pitch
        pitch = praat.call(sound, "To Pitch", 0.0, 50, 1000) # Range diperluas sampai 1000Hz
        f0_mean = praat.call(pitch, "Get mean", 0, 0, "Hertz")
        f0_min = praat.call(pitch, "Get minimum", 0, 0, "Hertz", "Parabolic")
        f0_max = praat.call(pitch, "Get maximum", 0, 0, "Hertz", "Parabolic")
        
        if math.isnan(f0_mean) or f0_mean <= 0:
            return None

        # Hitung Range F0
        range_f0 = f0_max - f0_min

        # Jitter & Shimmer
        point_process = praat.call(sound, "To PointProcess (periodic, cc)", 50, 1000)
        jitter = praat.call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3) * 100
        
        # HNR (Harmonicity)
        hnr = praat.call(sound, "To Harmonicity (cc)", 0.01, 50, 0.1, 1.0)
        hnr_mean = praat.call(hnr, "Get mean", 0, 0)

        # --- LOGIKA SKORING SESUAI PANDUAN ---
        ai_points = 0
        
        # 1. Cek F0 Mean (AI biasanya di luar 100-250Hz untuk suara robot/extreme)
        # Note: Panduan lu bilang 100-250 manusia, jadi kalau di luar itu +1 Poin AI
        if f0_mean < 100 or f0_mean > 250:
            ai_points += 1
        
        # 2. Cek Range F0 (AI > 400Hz karena glitch/extreme)
        if range_f0 > 400:
            ai_points += 1
            
        # 3. Jitter Local (AI TTS lu > 45%)
        if jitter > 45:
            ai_points += 1
            
        # 4. HNR Mean (AI Terlalu bersih > 8 dB)
        if hnr_mean > 8:
            ai_points += 1

        # Final Decision
        # 0-2: Manusia, 3-4: AI
        status = "AI Detected" if ai_points >= 3 else "Human Voice"
        
        # Confidence Score (Konversi poin ke persen)
        # 0 poin = 0%, 1 = 25%, 2 = 50%, 3 = 75%, 4 = 100%
        confidence = (ai_points / 4)

        return {
            "status": status,
            "score": confidence,
            "F0_mean": round(f0_mean, 2),
            "F0_min": round(f0_min, 2),
            "F0_max": round(f0_max, 2),
            "rangeF0": round(range_f0, 2),
            "jitter_local": round(jitter, 2),
            "HNR_mean": round(hnr_mean, 2),
            "ai_points": ai_points
        }
    except Exception as e:
        logger.error(f"Analisis Gagal: {e}")
        return None

@app.post("/api/detect_voice")
async def detect_voice(file: UploadFile = File(...)):
    ts = int(time.time() * 1000)
    in_file = f"raw_{ts}.webm"
    out_wav = f"fix_{ts}.wav"

    try:
        content = await file.read()
        with open(in_file, "wb") as f:
            f.write(content)

        subprocess.run([
            "ffmpeg", "-y", "-i", in_file,
            "-ac", "1", "-ar", "44100", "-sample_fmt", "s16", 
            out_wav
        ], capture_output=True, check=True)
        
        if hasattr(os, 'sync'): os.sync()

        result = analyze_with_praat(out_wav)
        
        if not result:
            return {"status": "Error", "message": "Suara tidak terdeteksi."}

        return result

    finally:
        for f in [in_file, out_wav]:
            if os.path.exists(f): os.remove(f)

@app.get("/")
def root():
    return {"message": "AI Voice Detector v15 Ready"}