#!/usr/bin/env python3
"""Convert RNNoise v0.1.1 weights (src/rnn_data.c) to the compact model.bin asset read by
app.filmcam.audio.RnNoiseModel.

Usage: convert_weights.py <path/to/rnn_data.c> <out/model.bin>

Format (all integers little-endian int32, weights int8 exactly as in rnn_data.c):
  magic "RNNM", version (1), layer count (6)
  then per layer, in model order (input_dense, vad_gru, noise_gru, denoise_gru,
  denoise_output, vad_output):
    kind (0 = dense, 1 = GRU), nb_inputs, nb_neurons, activation (0 tanh, 1 sigmoid, 2 relu)
    bias            int8[N]   (dense)  | int8[3N]   (GRU)
    input_weights   int8[M*N] (dense)  | int8[M*3N] (GRU)   C layout: [j*stride + i]
    recurrent       --                 | int8[N*3N] (GRU)   C layout: [j*stride + i]
Weights are scaled by 1/256 at run time (WEIGHTS_SCALE in rnn.h).
"""
import re
import struct
import sys

ACT = {"ACTIVATION_TANH": 0, "ACTIVATION_SIGMOID": 1, "ACTIVATION_RELU": 2}
ORDER = ["input_dense", "vad_gru", "noise_gru", "denoise_gru", "denoise_output", "vad_output"]


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src = open(sys.argv[1]).read()
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)

    arrays = {}
    for m in re.finditer(r"static const rnn_weight (\w+)\[(\d+)\]\s*=\s*\{(.*?)\};", src, re.S):
        name, n, body = m.group(1), int(m.group(2)), m.group(3)
        vals = [int(v) for v in body.replace("\n", " ").split(",") if v.strip()]
        if len(vals) != n:
            sys.exit(f"{name}: expected {n} values, got {len(vals)}")
        if any(v < -128 or v > 127 for v in vals):
            sys.exit(f"{name}: value out of int8 range")
        arrays[name] = vals

    layers = {}
    for m in re.finditer(r"static const (DenseLayer|GRULayer) (\w+)\s*=\s*\{(.*?)\};", src, re.S):
        kind, name, body = m.group(1), m.group(2), [t.strip() for t in m.group(3).split(",") if t.strip()]
        if kind == "DenseLayer":
            bias, w, nin, nout, act = body
            layers[name] = (0, int(nin), int(nout), ACT[act], [arrays[bias], arrays[w]])
        else:
            bias, w, rw, nin, nout, act = body
            layers[name] = (1, int(nin), int(nout), ACT[act], [arrays[bias], arrays[w], arrays[rw]])

    model = re.search(r"const struct RNNModel \w+\s*=\s*\{(.*?)\};", src, re.S).group(1)
    refs = re.findall(r"&(\w+)", model)
    if refs != ORDER:
        sys.exit(f"unexpected model layer order {refs}")

    out = bytearray(b"RNNM")
    out += struct.pack("<ii", 1, len(ORDER))
    for name in ORDER:
        kind, nin, nout, act, arrs = layers[name]
        g = 3 if kind == 1 else 1
        expect = [g * nout, nin * g * nout] + ([nout * g * nout] if kind == 1 else [])
        if [len(a) for a in arrs] != expect:
            sys.exit(f"{name}: size mismatch {[len(a) for a in arrs]} vs {expect}")
        out += struct.pack("<iiii", kind, nin, nout, act)
        for a in arrs:
            out += struct.pack(f"<{len(a)}b", *a)
        print(f"{name:15s} kind={kind} in={nin:3d} out={nout:3d} act={act}")
    with open(sys.argv[2], "wb") as f:
        f.write(out)
    print(f"wrote {len(out)} bytes to {sys.argv[2]}")


if __name__ == "__main__":
    main()
