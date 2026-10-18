import numpy as np, numba, json, glob
from rom import rom
from proto import make_cues
LABELS=('-','a','i','e','n','o','u','t','s','r','m','k','l','d','g','h','y','b','p','w','c','v','j','z','f',"'",'q','x')
IDX={c:i for i,c in enumerate(LABELS)}
FR=0.02

@numba.njit(cache=True)
def viterbi(lp, toks, gpen):
    T,V=lp.shape; n=len(toks); S=2*n+3
    NEG=-1e30
    gar=np.empty(T)
    for t in range(T):
        m=NEG
        for v in range(V):
            if lp[t,v]>m: m=lp[t,v]
        gar[t]=m-gpen
    def em(t,s):
        if s==0 or s==S-1: return gar[t]
        k=s-1
        if k%2==0: return lp[t,0]
        return lp[t,toks[k//2]]
    D=np.full((T,S),NEG); B=np.zeros((T,S),np.int32)
    D[0,0]=em(0,0); D[0,1]=em(0,1)
    if n>0: D[0,2]=em(0,2)
    for t in range(1,T):
        for s in range(S):
            best=D[t-1,s]; bs=s
            if s>=1 and D[t-1,s-1]>best: best=D[t-1,s-1]; bs=s-1
            # skip blank between different tokens
            if s>=3 and s<=S-2 and (s-1)%2==1:
                k=(s-1)//2
                if k>=1 and toks[k]!=toks[k-1] and D[t-1,s-2]>best: best=D[t-1,s-2]; bs=s-2
            if s==2 and D[t-1,0]>best: best=D[t-1,0]; bs=0   # garbage -> first token
            if s==S-1 and n>0 and D[t-1,S-3]>best: best=D[t-1,S-3]; bs=S-3  # last token -> garbage
            D[t,s]=best+em(t,s); B[t,s]=bs
    # end
    s=S-1
    if D[T-1,S-2]>D[T-1,s]: s=S-2
    if n>0 and D[T-1,S-3]>D[T-1,s]: s=S-3
    path=np.zeros(T,np.int32)
    for t in range(T-1,-1,-1):
        path[t]=s; s=B[t,s]
    return path

def align_track(lp, cues, gpen=1.0, pad=1.0, offset=0.0, clamp=None):
    T=lp.shape[0]; out=[]; prev_end=0
    for ci,c in enumerate(cues):
        ws=c["words"]; rs=[rom(w) for w in ws]
        toks=[]; owner=[]
        for wi,r in enumerate(rs):
            for ch in r:
                if ch in IDX: toks.append(IDX[ch]); owner.append(wi)
        pe=prev_end if clamp is None else min(prev_end,int((c["start"]-clamp)/FR))
        a=max(pe,int((c["start"]-pad)/FR)); b=min(T,int((c["end"]+pad)/FR)+1)
        if b-a<len(toks)+2 or not toks:
            out+= [None]*len(ws); continue
        path=viterbi(lp[a:b],np.array(toks,np.int64),gpen)
        starts=[None]*len(ws); last=a
        for t,s in enumerate(path):
            if s>=1 and s<=2*len(toks)+1 and (s-1)%2==1:
                k=(s-1)//2; w=owner[k]
                if starts[w] is None: starts[w]=(a+t)*FR+offset
                last=a+t
        prev_end=last+1
        out+=starts
    # fill gaps by interpolation
    tt=np.array([np.nan if x is None else x for x in out],float)
    idx=np.arange(len(tt)); ok=~np.isnan(tt)
    if ok.any(): tt[~ok]=np.interp(idx[~ok],idx[ok],tt[ok])
    return list(tt)
