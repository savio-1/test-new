"""Word times by forced alignment (torchaudio MMS_FA), for clips without hand/MFA alignments."""
import torch, torchaudio, soundfile as sf, numpy as np, json, sys, re
from torchaudio.pipelines import MMS_FA as bundle
model = bundle.get_model(); model.eval()
tok = bundle.get_tokenizer(); aligner = bundle.get_aligner()
import uroman as ur
U = ur.Uroman()

def norm(w, lang):
    r = U.romanize_string(w, lcode=lang) if lang != "eng" else w
    r = re.sub(r"[^a-z' ]", "", r.lower().replace("-", " "))
    return r.replace(" ", "")

def align(wav, words, lang="eng"):
    a, sr = sf.read(wav, dtype="float32")
    if a.ndim > 1: a = a.mean(1)
    x = torch.from_numpy(a)[None]
    if sr != 16000: x = torchaudio.functional.resample(x, sr, 16000)
    keep = [(i, norm(w, lang)) for i, w in enumerate(words)]
    keep = [(i, n) for i, n in keep if n]
    with torch.inference_mode():
        em, _ = model(x)
        spans = aligner(em[0], tok([n for _, n in keep]))
    ratio = x.shape[1] / em.shape[1] / 16000
    out = [None] * len(words)
    for (i, _), sp in zip(keep, spans):
        out[i] = (sp[0].start * ratio, sp[-1].end * ratio)
    return out
