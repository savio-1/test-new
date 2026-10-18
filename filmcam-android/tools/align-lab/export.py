"""Writes student.pt as the app's float16 weight file, test emissions for a clip, and the student's test-set emissions."""
import torch, numpy as np, glob, soundfile as sf, sys, json
from student import *
m=Student(); m.load_state_dict(torch.load("student.pt")); m.eval()
ws=[m.c1.weight,m.c1.bias,m.c2.weight,m.c2.bias]
for b in m.blocks: ws+=[b.dw.weight,b.dw.bias,b.pw.weight,b.pw.bias,b.g,b.b]
ws+=[m.out.weight,m.out.bias]
buf=b"".join(w.detach().numpy().astype("<f2").tobytes() for w in ws)
open(sys.argv[1],"wb").write(buf); print("weights",len(buf))
# fp16-rounded model for emissions (as the app runs it)
with torch.no_grad():
    for w in ws: w.copy_(w.half().float())
out={}
for p in sorted(glob.glob("clips/*.wav")):
    a,sr=sf.read(p,dtype="float32")
    if sr!=16000:
        import scipy.signal as ss; a=ss.resample_poly(a,16000,sr).astype(np.float32)
    with torch.no_grad(): lp=m(features(torch.from_numpy(a)[None]))[0].numpy()
    out[p.replace("/","_")]=lp
np.savez("test_student.npz",**out)
print("emissions",len(out))
