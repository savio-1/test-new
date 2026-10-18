import numpy as np, json, glob, sys
from ctcal import align_track
from proto import make_cues
E=np.load(sys.argv[1] if len(sys.argv)>1 else "test_student.npz")
data=[]
for st in ("ls","ps","te"):
    for j in sorted(glob.glob(f"clips/{st}_*.json")):
        gt=json.load(open(j))["words"]
        if len(gt)>=4: data.append((st,j,gt))
def run(gpen,clamp,pad=1.0,offset=-0.04,jits=(0.0,0.15,0.3)):
    res={}
    for jit in jits:
        rng=np.random.default_rng(7)
        for st,j,gt in data:
            cues=make_cues(gt,jit,rng)
            lp=E[j.replace(".json",".wav").replace("/","_")].astype(np.float64)
            p=align_track(lp,cues,gpen,pad,offset,clamp)
            res.setdefault(st,[]).extend(list(np.array(p)-[w["start"] for w in gt]))
    return {k:np.array(v) for k,v in res.items()}
if __name__=="__main__":
    for gpen in (1.0,2.0,3.0,5.0):
        for clamp in (None,0.0,0.3):
            r=run(gpen,clamp)
            print("gpen %.0f clamp %-4s "%(gpen,clamp)+"  ".join("%s <100 %3.0f%% p90 %3.0f bias %+3.0f"%(k,(abs(v)<.1).mean()*100,np.percentile(abs(v),90)*1e3,np.median(v)*1e3) for k,v in r.items()),flush=True)
