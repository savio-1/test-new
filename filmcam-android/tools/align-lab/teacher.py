"""Teacher pass: MMS_FA log-probabilities (20 ms frames, 28 tokens) for training audio."""
import torch, numpy as np, io, sys, tarfile, csv, soundfile as sf, pyarrow.parquet as pq, random, os, time
from torchaudio.pipelines import MMS_FA as b
from huggingface_hub import hf_hub_download
torch.set_num_threads(4)
m=b.get_model(with_star=False); m.eval()
os.makedirs("train",exist_ok=True)
def run(name, gen, limit_s):
    if os.path.exists(f"train/{name}.npz"): print("have",name); return
    auds=[];ems=[];tot=0;t0=time.time()
    for a in gen:
        if len(a)<16000*2 or len(a)>16000*25: continue
        x=torch.from_numpy(a)[None]
        with torch.inference_mode(): em,_=m(x)
        em=torch.log_softmax(em[0],-1).numpy().astype(np.float16)
        auds.append((np.clip(a,-1,1)*32767).astype(np.int16)); ems.append(em)
        tot+=len(a)/16000
        if len(auds)%100==0: print(name,len(auds),"%.0fmin"%(tot/60),"%.0fs"%(time.time()-t0),flush=True)
        if tot>limit_s: break
    al=np.array([len(x) for x in auds]); el=np.array([len(x) for x in ems])
    np.savez(f"train/{name}.npz",audio=np.concatenate(auds),alen=al,em=np.concatenate(ems),elen=el)
    print("saved",name,len(auds),tot/3600,"h",flush=True)
def parquet_audio(path, rows=None):
    pf=pq.ParquetFile(path)
    for g in range(pf.num_row_groups):
        for r in pf.read_row_group(g,columns=["audio"]).to_pylist():
            a,sr=sf.read(io.BytesIO(r["audio"]["bytes"]),dtype="float32")
            if a.ndim>1: a=a.mean(1)
            if sr!=16000:
                import scipy.signal as ss; a=ss.resample_poly(a,16000,sr).astype(np.float32)
            yield a
def fleurs(lang, split):
    p=hf_hub_download("google/fleurs",f"data/{lang}/audio/{split}.tar.gz",repo_type="dataset",local_dir="data")
    tf=tarfile.open(p,"r|gz")
    for mbr in tf:
        if not mbr.isfile(): continue
        a,sr=sf.read(io.BytesIO(tf.extractfile(mbr).read()),dtype="float32")
        if a.ndim>1: a=a.mean(1)
        yield a
which=sys.argv[1]
if which=="ls":
    p=hf_hub_download("gilkeyio/librispeech-alignments","data/dev_other-00000-of-00001.parquet",repo_type="dataset",local_dir="data")
    run("ls_dev_other", parquet_audio(p), 0.75*3600)
elif which=="ps":
    p=hf_hub_download("MLCommons/peoples_speech","clean/test-00001-of-00009.parquet",repo_type="dataset",local_dir="data")
    run("ps_test1", parquet_audio(p), 0.75*3600)
elif which=="te":
    run("te_train", fleurs("te_in","train"), 1.5*3600)
