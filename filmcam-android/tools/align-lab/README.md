# Word timing lab

Builds the small on-device model that times subtitle words (`app/src/main/assets/align/model.bin`,
used by `sub/WordAligner.kt`).

1. `gt_mms.py`: reference word times by forced alignment with torchaudio's MMS_FA, for test
   clips that have no hand alignment.
2. `teacher.py te|ls|ps`: MMS_FA letter log-probabilities (20 ms frames) for about 3 hours of
   training speech: FLEURS Telugu train, LibriSpeech dev-other and a People's Speech shard. All
   are kept apart from the test clips.
3. `train.py 8000`: distils them into `student.py`'s model (335k weights). The input has noise,
   level and tone augmentation; the targets come from the clean audio. Takes about 35 minutes
   on 4 CPU cores.
4. `export.py out.bin`: writes the app's float16 weights, and the student's letter
   probabilities for the test clips.
5. `sweep.py` / `evalctc.py`: windowed CTC alignment (`ctcal.py`, the same algorithm as the
   Kotlin one) against the reference times. Line times get Gemini-like errors (`proto.make_cues`).

`rom.py` is the romaniser (Telugu by sound, numbers in words). It is mirrored by `Romanizer` in
Kotlin and agrees with uroman on 355 of 358 Telugu test words.

Licence: MMS is CC-BY-NC 4.0, and the distilled weights carry those terms.
