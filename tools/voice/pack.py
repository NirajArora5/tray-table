"""Generate the recorded voice pack and inject it into index.html.

  pip install piper-tts                      # neural TTS, runs offline (needs ffmpeg on PATH)
  curl -L -o v.tgz https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-ryan-high.tar.gz && tar xzf v.tgz
  node phrases.js                            # lists every phrase the game can say -> phrases.json
  python3 pack.py en-us-ryan-high            # synthesize, trim, mp3, base64 -> injected into ../../index.html

Other voices from the same release: en-us-lessac-medium, en-us-amy-low, en-us-libritts-high (multi-speaker: pack.py en-us-libritts-high 3).
After changing index.html, bump CACHE in sw.js so installed copies refresh.
"""
import json, wave, subprocess, base64, os, sys, time, re
from piper import PiperVoice
from piper.config import SynthesisConfig
here = os.path.dirname(os.path.abspath(__file__))
voice = sys.argv[1]; speaker = int(sys.argv[2]) if len(sys.argv) > 2 else None
P = json.load(open(os.path.join(here, 'phrases.json')))
v = PiperVoice.load(f"{voice}.onnx", config_path=f"{voice}.onnx.json")
cfg = SynthesisConfig(length_scale=1.08, speaker_id=speaker)   # a touch slower than default, for clarity
out, total, t0 = {}, 0, time.time()
for cid, text in P.items():
    w = '/tmp/clip.wav'
    with wave.open(w, 'wb') as f: v.synthesize_wav(text, f, syn_config=cfg)
    mp3 = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w,
        '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_threshold=-45dB,apad=pad_dur=0.05',
        '-ac', '1', '-ar', '22050', '-b:a', '48k', '-f', 'mp3', 'pipe:1'], capture_output=True).stdout
    out[cid] = base64.b64encode(mp3).decode(); total += len(mp3)
packed = json.dumps(out, separators=(',', ':'))
html_path = os.path.join(here, '..', '..', 'index.html'); html = open(html_path).read()
html2 = re.sub(r'(<script id="clips" type="application/json">).*?(</script>)', lambda m: m.group(1) + packed + m.group(2), html, count=1, flags=re.S)
assert html2 != html or packed in html, 'clips block not found in index.html'
open(html_path, 'w').write(html2)
print(voice, speaker, len(out), 'clips,', round(total / 1024), 'KB of mp3, injected in', round(time.time() - t0), 's')
