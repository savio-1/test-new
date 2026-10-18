import numpy as np, json, glob, sys
from ctcal import align_track
from proto import make_cues, baseline
def evaluate(emfile, gpen=1.0, offset=0.0, pad=1.0, jits=(0.0,0.15,0.3), sets=("ls","ps","te"), quiet=False):
    E=np.load(emfile); res={}
    for st in sets:
        for jit in jits:
            rng=np.random.default_rng(7); ea=[]; eb=[]
            for j in sorted(glob.glob(f"clips/{st}_*.json")):
                d=json.load(open(j)); gt=d["words"]
                if len(gt)<4: continue
                cues=make_cues(gt,jit,rng)
                lp=E[j.replace(".json",".wav").replace("/","_")].astype(np.float64)
                p=align_track(lp,cues,gpen,pad,offset)
                g=np.array([w["start"] for w in gt])
                ea+=list(np.array(p)-g); eb+=list(np.array(baseline(cues))-g)
            ea=np.array(ea); eb=np.array(eb); res[(st,jit)]=ea
            f=lambda e: "med %3.0f p90 %4.0f <100ms %3.0f%% <200 %3.0f%% bias %+4.0f"%(np.median(abs(e))*1e3,np.percentile(abs(e),90)*1e3,(abs(e)<.1).mean()*100,(abs(e)<.2).mean()*100,np.median(e)*1e3)
            if not quiet: print(f"{st} jit{jit:.2f} base: {f(eb)}\n          align: {f(ea)}",flush=True)
    return res
if __name__=="__main__":
    evaluate(sys.argv[1], float(sys.argv[2]) if len(sys.argv)>2 else 1.0, float(sys.argv[3]) if len(sys.argv)>3 else 0.0)
