import numpy as np, soundfile as sf, json, glob, re, random, sys
from scipy.signal import resample_poly

HOP=160; WIN=512; SR=16000
def load(p):
    a,sr=sf.read(p,dtype="float32")
    if a.ndim>1: a=a.mean(1)
    if sr!=SR: a=resample_poly(a,SR,sr).astype(np.float32)
    return a

def mel_fb(n=40,fmin=80,fmax=7600):
    def hz2m(f): return 2595*np.log10(1+f/700)
    def m2hz(m): return 700*(10**(m/2595)-1)
    pts=m2hz(np.linspace(hz2m(fmin),hz2m(fmax),n+2))
    bins=np.floor((WIN+1)*pts/SR).astype(int)
    fb=np.zeros((n,WIN//2+1))
    for i in range(n):
        l,c,r=bins[i],bins[i+1],bins[i+2]
        for k in range(l,c): fb[i,k]=(k-l)/max(1,c-l)
        for k in range(c,r): fb[i,k]=(r-k)/max(1,r-c)
    return fb
FB=mel_fb()

def features(a):
    n=1+max(0,(len(a)-WIN))//HOP
    w=np.hanning(WIN).astype(np.float32)
    idx=np.arange(WIN)[None,:]+HOP*np.arange(n)[:,None]
    fr=a[idx]*w
    P=np.abs(np.fft.rfft(fr,axis=1))**2
    f=np.fft.rfftfreq(WIN,1/SR)
    band=(f>=250)&(f<=4000)
    E=10*np.log10(P[:,band].sum(1)+1e-9)
    M=np.log(FB@P.T+1e-6).T  # frames x mel
    return E,M

def prof(a):
    E,M=features(a)
    nf=np.percentile(E,8)
    peak=np.percentile(E,97)
    span=max(peak-nf,12)
    sp=np.clip((E-nf-0.12*span)/(0.35*span),0,1)  # speechness 0..1
    # smooth
    k=np.ones(3)/3; sp=np.convolve(sp,k,'same')
    flux=np.maximum(np.diff(M,axis=0,prepend=M[:1]),0).sum(1)
    flux=np.convolve(flux,[0.25,0.5,0.25],'same')
    o=np.clip(flux/ (np.percentile(flux,95)+1e-6),0,1.5)
    return dict(E=E,sp=sp,o=o,nf=nf,span=span)

VOW=set("aeiouyAEIOUY")
def units(w):
    t=re.sub(r"[^\w']","",w)
    if not t: return 1.0
    if any('ఀ'<=c<='౿' for c in t):
        # Telugu: aksharas = consonants/independent vowels not followed by virama
        n=0
        for i,c in enumerate(t):
            o=ord(c)
            if (0x0C05<=o<=0x0C14) or (0x0C15<=o<=0x0C39):
                if i+1<len(t) and ord(t[i+1])==0x0C4D: continue
                n+=1
        return max(1.0,n)
    if t.isdigit(): return 1.5*len(t)
    g=re.findall(r"[aeiouy]+",t.lower())
    n=len(g)
    if t.lower().endswith("e") and n>1 and not t.lower().endswith(("le","ee")): n-=1
    return max(1.0,n)+0.15*len(t)/4

def baseline(cues):
    out=[]
    for c in cues:
        ws=c["words"]
        wts=[1.5+max(1,len(re.sub(r"[^\w']","",w)))+ (2.5 if w[-1] in ",.;:!?" else 0) for w in ws]
        tot=sum(wts); acc=0
        for w in wts:
            out.append(c["start"]+(c["end"]-c["start"])*acc/tot); acc+=w
    return out

def make_cues(gt, jit, rng):
    cues=[]; cur=[]
    for i,w in enumerate(gt):
        cur.append(w)
        chars=sum(len(x["word"])+1 for x in cur)
        nxt=gt[i+1] if i+1<len(gt) else None
        pause = nxt is not None and nxt["start"]-w["end"]>0.35
        dur=w["end"]-cur[0]["start"]
        if nxt is None or pause or chars>60 or dur>4.5:
            cues.append(cur); cur=[]
    out=[]
    for c in cues:
        s=c[0]["start"]+rng.normal(0,jit); e=c[-1]["end"]+rng.normal(0,jit)
        out.append({"words":[x["word"] for x in c],"start":s,"end":max(e,s+0.3)})
    # keep in order, no overlap
    for a,b in zip(out,out[1:]):
        if b["start"]<a["end"]: m=(a["end"]+b["start"])/2; a["end"]=m; b["start"]=m
    for c in out: c["start"]=max(0,c["start"])
    return out
