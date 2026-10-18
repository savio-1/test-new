"""Small on-device acoustic model distilled from MMS_FA: 40 log-mel at 10 ms -> 28 CTC tokens at 20 ms."""
import torch, torch.nn as nn, torch.nn.functional as F, numpy as np, math
SR=16000; NFFT=512; HOP=160; NMEL=40
def mel_fb(n=NMEL,fmin=60,fmax=7600):
    hz2m=lambda f: 2595*np.log10(1+f/700); m2hz=lambda m: 700*(10**(m/2595)-1)
    pts=m2hz(np.linspace(hz2m(fmin),hz2m(fmax),n+2)); f=np.arange(NFFT//2+1)*SR/NFFT
    fb=np.zeros((n,NFFT//2+1),np.float32)
    for i in range(n):
        l,c,r=pts[i],pts[i+1],pts[i+2]
        fb[i]=np.clip(np.minimum((f-l)/(c-l),(r-f)/(r-c)),0,None)
    return fb
FB=torch.from_numpy(mel_fb())
WIN=torch.hann_window(NFFT,periodic=True)
def features(a):  # a: (B, N) float -> (B, NMEL, frames)
    # frames start at 0 with hop 160, each NFFT long (zero padded at end), like the app
    n=a.shape[1]; T=n//HOP
    pad=F.pad(a,(0,NFFT))
    fr=pad.unfold(1,NFFT,HOP)[:, :T]
    P=torch.fft.rfft(fr*WIN,dim=-1).abs()**2
    M=torch.log(P@FB.T+1e-6)
    M=M-M.mean(1,keepdim=True)   # per-utterance mean (the app has the whole clip)
    return M.transpose(1,2)
class Block(nn.Module):
    def __init__(s,C,k=9):
        super().__init__(); s.dw=nn.Conv1d(C,C,k,padding=k//2,groups=C); s.pw=nn.Conv1d(C,C,1); s.g=nn.Parameter(torch.ones(C)); s.b=nn.Parameter(torch.zeros(C))
    def forward(s,x):
        h=x.transpose(1,2); h=F.layer_norm(h,(h.shape[-1],))*s.g+s.b; h=h.transpose(1,2)
        return x+F.relu(s.pw(s.dw(h)))
class Student(nn.Module):
    def __init__(s,C=160,N=8,V=28):
        super().__init__()
        s.c1=nn.Conv1d(NMEL,C,5,padding=2); s.c2=nn.Conv1d(C,C,3,stride=2,padding=1)
        s.blocks=nn.ModuleList([Block(C) for _ in range(N)]); s.out=nn.Conv1d(C,V,1)
    def forward(s,m):  # m: (B,NMEL,T10) -> (B,T20,V) log-probs
        x=F.relu(s.c1(m)); x=F.relu(s.c2(x))
        for b in s.blocks: x=b(x)
        return F.log_softmax(s.out(x).transpose(1,2),-1)
