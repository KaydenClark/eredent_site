"""Measure each narration take: speech start and end, and word timestamps (faster-whisper).
Usage: pipeline/venv/Scripts/python.exe explainer/timings.py
Reads explainer/out/voice/beat_NN.wav, writes explainer/out/timing.json. Works on any voice, including your own
recording, because it measures the audio rather than trusting the synthesizer."""
import json, os, re, sys, wave
import numpy as np
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.path.join(HERE, 'out', 'voice')
beats = json.load(open(os.path.join(HERE, 'beats.json'), encoding='utf-8'))['beats']


def read_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        if w.getnchannels() > 1: x = x.reshape(-1, w.getnchannels()).mean(1)
    return x, sr


def speech_span(x, sr, thresh_db=-40):
    """First and last 10 ms window louder than thresh_db below the take's peak."""
    win = int(sr * 0.01); n = len(x) // win
    rms = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms / rms.max())
    on = np.nonzero(db > thresh_db)[0]
    return on[0] * 0.01, (on[-1] + 1) * 0.01


model = WhisperModel('base.en', device='cpu', compute_type='int8')
out = []
for b in beats:
    f = os.path.join(VOICE, f"beat_{b['id']:02d}.wav")
    x, sr = read_wav(f)
    s0, s1 = speech_span(x, sr)
    segs, _ = model.transcribe(f, word_timestamps=True, language='en', beam_size=5)
    words = [{'w': w.word.strip(), 't0': round(w.start, 3), 't1': round(w.end, 3)} for s in segs for w in s.words]
    bar_t = None
    if b.get('bar_word'):
        hit = [w for w in words if w['w'].lower().strip('.,:;').startswith(b['bar_word'])]
        if not hit:   # whisper writes numbers as digits ("51,000", "440"): take the first word that has one
            hit = [w for w in words if re.search(r'\d', w['w'])]
        bar_t = hit[0]['t0'] if hit else None
        if bar_t is None: print(f"beat {b['id']}: bar word '{b['bar_word']}' not heard", file=sys.stderr)
    heard = ' '.join(w['w'] for w in words)
    out.append({'id': b['id'], 'file': os.path.relpath(f, HERE), 'dur': round(len(x) / sr, 3),
                'speech0': round(s0, 3), 'speech1': round(s1, 3), 'bar_t': bar_t, 'heard': heard, 'words': words})
    print(f"beat {b['id']:2d}  speech {s0:5.2f}-{s1:5.2f}s  bar@{bar_t}  | {heard}")
json.dump(out, open(os.path.join(HERE, 'out', 'timing.json'), 'w', encoding='utf-8'), indent=1)
