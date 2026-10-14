"""
Body and hand landmarks of the people in a reference image (MediaPipe, Apache-2.0), for make_people.py to pose the
statues from. The image should be taken in the same camera as one of the empty-room renders.

    pip install mediapipe            # plus libegl1 on Linux
    python3 pose_landmarks.py refs/plane_close.png refs/plane_close.json

Writes, per person: 33 pose landmarks in image coordinates (x, y in 0..1, z depth, visibility) and in metric 3D
(hip-centred; x right, y down, z away from the camera), and per hand: 21 landmarks the same way, each matched to
the nearest body wrist. The models are downloaded once to assets/mediapipe/.
"""

import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, 'assets', 'mediapipe')
URLS = {
    'pose_landmarker_heavy.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
    'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
}


def model(name):
    path = os.path.join(MODELS, name)
    if not os.path.exists(path):
        os.makedirs(MODELS, exist_ok=True)
        urllib.request.urlretrieve(URLS[name], path + '.part')
        os.replace(path + '.part', path)
    return path


def main(img_path, out):
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    img = mp.Image.create_from_file(img_path)
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=model('pose_landmarker_heavy.task')), num_poses=6,
        min_pose_detection_confidence=0.3, min_pose_presence_confidence=0.3))
    hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=model('hand_landmarker.task')), num_hands=12,
        min_hand_detection_confidence=0.3))
    r, h = pose.detect(img), hands.detect(img)
    res = {'image': os.path.basename(img_path), 'size': [img.width, img.height], 'people': []}
    for lm, wl in zip(r.pose_landmarks, r.pose_world_landmarks):
        res['people'].append({'img': [[p.x, p.y, p.z, p.visibility] for p in lm], 'world': [[p.x, p.y, p.z] for p in wl],
                              'hands': {}})
    # attach each detected hand to the closest body wrist (MediaPipe's own left/right label assumes a mirrored selfie)
    for lm, wl in zip(h.hand_landmarks, h.hand_world_landmarks):
        wx, wy = lm[0].x, lm[0].y
        best = None
        for pi, person in enumerate(res['people']):
            for side, k in (('L', 15), ('R', 16)):
                px, py = person['img'][k][:2]
                d = (px - wx) ** 2 + (py - wy) ** 2
                if best is None or d < best[0]:
                    best = (d, pi, side)
        if best and best[0] < 0.004:
            res['people'][best[1]]['hands'][best[2]] = {'img': [[p.x, p.y, p.z] for p in lm], 'world': [[p.x, p.y, p.z] for p in wl]}
    with open(out, 'w') as fh:
        json.dump(res, fh)
    print(f'{img_path}: {len(res["people"])} people, {sum(len(p["hands"]) for p in res["people"])} hands -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
