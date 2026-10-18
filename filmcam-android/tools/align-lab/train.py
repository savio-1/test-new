import torch, numpy as np, glob, time, sys, math
from student import *
torch.set_num_threads(4); torch.manual_seed(0)
utts=[]
for f in sorted(glob.glob("train/*.npz")):
    z=np.load(f); a=z["audio"]; al=z["alen"]; e=z["em"]; el=z["elen"]
    ao=np.concatenate([[0],np.cumsum(al)]); eo=np.concatenate([[0],np.cumsum(el)])
    for i in range(len(al)): utts.append((a[ao[i]:ao[i+1]], e[eo[i]:eo[i+1]]))
    print(f,len(al))
rng=np.random.default_rng(0)
print("utterances",len(utts),"hours",sum(len(u[0]) for u in utts)/16000/3600)
CROP=6*16000
def noise(kind,n):
    w=rng.normal(size=n)
    if kind==0: return w
    f=np.fft.rfft(w); k=np.arange(len(f))+1
    if kind==1: return np.fft.irfft(f/np.sqrt(k),n)
    if kind==2: return np.fft.irfft(f/k,n)
    t=np.arange(n)/16000; base=rng.choice([50,60,100,120])
    return sum(np.sin(2*np.pi*base*h*t+h)/h for h in range(1,6))+0.3*np.fft.irfft(f/np.sqrt(k),n)
def batch(B=16):
    X=[];Y=[]
    for _ in range(B):
        a,e=utts[rng.integers(len(utts))]
        n=len(a)
        if n>CROP+320:
            s0=int(rng.integers(0,(n-CROP)//320+1))*320; a=a[s0:s0+CROP]; e=e[s0//320:]
        else: a=a[:CROP]
        x=a.astype(np.float32)/32767
        if rng.random()<0.6:   # noise like a phone in a room
            k=int(rng.integers(0,4)); nz=noise(k,len(x))
            if rng.random()<0.3:   # babble
                b,_=utts[rng.integers(len(utts))]; b=np.resize(b.astype(np.float32)/32767,len(x)); nz=nz*0.3+b/np.sqrt(np.mean(b**2)+1e-9)
            snr=rng.uniform(3,30)
            nz=nz*np.sqrt(np.mean(x**2)/(np.mean(nz**2)+1e-12))*10**(-snr/20); x=x+nz
        if rng.random()<0.3:   # tilt (different mics)
            X_=np.fft.rfft(x); f=np.linspace(0,1,len(X_)); X_*=np.exp(rng.uniform(-1,1)*(f-0.3)); x=np.fft.irfft(X_,len(x))
        x=x*10**(rng.uniform(-20,6)/20)
        X.append(torch.from_numpy(np.pad(x,(0,CROP-len(x))).astype(np.float32))); Y.append((len(x),e))
    return torch.stack(X),Y
model=Student()
print("params",sum(p.numel() for p in model.parameters()))
steps=int(sys.argv[1]) if len(sys.argv)>1 else 6000
opt=torch.optim.AdamW(model.parameters(),lr=2e-3,weight_decay=1e-4)
sched=torch.optim.lr_scheduler.OneCycleLR(opt,max_lr=2e-3,total_steps=steps,pct_start=0.05)
t0=time.time(); avg=None
for st in range(steps):
    X,Y=batch()
    lp=model(features(X))
    loss=0; cnt=0
    for i,(n,e) in enumerate(Y):
        T=min(lp.shape[1],len(e),(n-400)//320+1)
        tgt=torch.from_numpy(e[:T].astype(np.float32))
        p=tgt.exp()
        loss=loss+(p*(tgt-lp[i,:T])).sum(); cnt+=T
    loss=loss/cnt
    opt.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),5.0); opt.step(); sched.step()
    avg=loss.item() if avg is None else 0.98*avg+0.02*loss.item()
    if st%200==0: print(st,"kl %.3f"%avg,"%.0fs"%(time.time()-t0),flush=True)
    if st%2000==1999: torch.save(model.state_dict(),"student.pt")
torch.save(model.state_dict(),"student.pt")
