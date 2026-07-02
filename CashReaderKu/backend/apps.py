import os
import cv2
import numpy as np
from collections import Counter, deque
from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

# ── Konstanta Filter Sinkronisasi ──────────────────────────────────────────────
MODEL_PATH       = "runs/detect/train/weights/best.pt"
IOU_THRESHOLD    = 0.45

CONF_RUPIAH      = 0.75
CONF_KOIN        = 0.65
CONF_KOIN_100    = 0.55   # Khusus koin 100 — fisiknya paling kecil

MIN_COVERAGE_PCT = 2.5

# DIUBAH: Diperkecil agar scanning jauh lebih cepat (responsif dalam 1-2 detik)
HISTORY_SIZE   = 3
REQUIRED_AGREE = 2

MIN_CONF_GAP_RUPIAH = 0.10
MIN_CONF_GAP_KOIN   = 0.05

TOP_K_BOXES = 3

VALID_CLASSES = {
    "100000_rupiah", "10000_rupiah", "1000_rupiah",
    "20000_rupiah",  "2000_rupiah",  "50000_rupiah",
    "5000_rupiah",   "1000_koin",    "100_koin",
    "200_koin",      "500_koin",
}

NOMINAL_MAP = {
    "100"   : "seratus",
    "200"   : "dua ratus",
    "500"   : "lima ratus",
    "1000"  : "seribu",
    "2000"  : "dua ribu",
    "5000"  : "lima ribu",
    "10000" : "sepuluh ribu",
    "20000" : "dua puluh ribu",
    "50000" : "lima puluh ribu",
    "100000": "seratus ribu",
}

# ── Load Model ─────────────────────────────────────────────────────────────────
if os.path.exists(MODEL_PATH):
    print(f"Memuat model dari: {MODEL_PATH}...")
    model = YOLO(MODEL_PATH)
    for cid, cname in model.names.items():
        if cname not in VALID_CLASSES:
            print(f"[PERINGATAN] '{cname}' tidak ada di VALID_CLASSES!")
else:
    print(f"[PERINGATAN] Model tidak ditemukan: {MODEL_PATH}")
    model = None

detection_history: deque = deque(maxlen=HISTORY_SIZE)
# Tambahkan history khusus untuk mencatat seberapa sering objek asing terdeteksi secara berturut-turut
foreign_object_counter = 0


# ── Helpers ────────────────────────────────────────────────────────────────────
def format_label_to_speech(label_name: str) -> str:
    """Mengubah format nama class menjadi teks ucapan alami"""
    if label_name == "BUKAN_UANG":
        return "Bukan uang rupiah"
        
    parts = label_name.split("_")
    nominal_text = NOMINAL_MAP.get(parts[0], parts[0])
    jenis = parts[1] if len(parts) > 1 else ""
    
    if jenis == "koin":
        return f"{nominal_text} koin"
    else:
        return f"{nominal_text} rupiah"


def is_koin(label: str) -> bool:
    return label.endswith("_koin")


def get_conf_threshold(label: str) -> float:
    if label == "100_koin":
        return CONF_KOIN_100
    elif is_koin(label):
        return CONF_KOIN
    else:
        return CONF_RUPIAH


def analyze_boxes(boxes, model_names: dict, total_area: int) -> dict | str | None:
    """
    Mengembalikan dict kandidat jika valid, 
    mengembalikan string "BUKAN_UANG" jika terdeteksi objek asing,
    atau None jika frame kosong.
    """
    candidates = []
    has_any_box = False

    for box in boxes:
        has_any_box = True
        class_name = model_names[int(box.cls[0])]
        conf       = float(box.conf[0])

        # L1 & L3 Gabungan: Jika objek terdeteksi tapi bukan di whitelist ATAU conf terlalu rendah
        if class_name not in VALID_CLASSES:
            continue

        # L2: ukuran objek di frame
        xyxy     = box.xyxy[0].tolist()
        box_area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
        coverage = (box_area / total_area) * 100
        if coverage < MIN_COVERAGE_PCT:
            continue

        # L3: threshold dinamis per kelas
        min_conf = get_conf_threshold(class_name)
        if conf < min_conf:
            continue

        candidates.append({
            "label"   : class_name,
            "conf"    : conf,
            "coverage": coverage,
        })

    # TAMBAHAN: Jika ada objek fisik di kamera (buku/kertas/tangan) tapi tidak lolos filter uang valid
    if has_any_box and not candidates:
        return "BUKAN_UANG"

    if not candidates:
        return None

    # Urutkan kandidat berdasarkan tingkat confidence tertinggi
    candidates.sort(key=lambda x: x["conf"], reverse=True)
    top1 = candidates[0]

    # L4: cek gap ambiguitas jika ada kelas saingan
    other_class = [x for x in candidates[1:] if x["label"] != top1["label"]]
    if other_class:
        gap     = top1["conf"] - other_class[0]["conf"]
        min_gap = MIN_CONF_GAP_KOIN if is_koin(top1["label"]) else MIN_CONF_GAP_RUPIAH
        if gap < min_gap:
            return "BUKAN_UANG"  # Model ragu/ambigu berat dianggap objek asing/tidak valid

    # Majority vote dari top-K kandidat terkuat
    top_k     = candidates[:TOP_K_BOXES]
    winner, _ = Counter(x["label"] for x in top_k).most_common(1)[0]
    best      = max((x for x in top_k if x["label"] == winner), key=lambda x: x["conf"])

    return best


# ── Route API ──────────────────────────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    global foreign_object_counter
    
    if 'image' not in request.files:
        return jsonify({'detected': False, 'message': 'Tidak ada file gambar'}), 400

    file = request.files['image']
    if not file or file.filename == '':
        return jsonify({'detected': False, 'message': 'File tidak valid'}), 400

    try:
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img        = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'detected': False, 'message': 'Format gambar tidak valid'}), 400

        h, w, _    = img.shape
        total_area = h * w

        if model is None:
            return jsonify({
                'detected'  : True,
                'nominal'   : 'lima puluh ribu rupiah',
                'confidence': '95%',
                'note'      : 'dummy — model tidak ditemukan'
            })

        # Scanning dasar menggunakan batas bawah terendah
        results = model(img, conf=0.40, iou=IOU_THRESHOLD, verbose=False)

        # Antisipasi frame benar-benar kosong
        if len(results) == 0 or len(results[0].boxes) == 0:
            detection_history.append(None)
            foreign_object_counter = max(0, foreign_object_counter - 1)
            return jsonify({'detected': False, 'message': 'Tidak ada objek terdeteksi'})

        # Filter ketat menggunakan aturan analyze_boxes
        res = analyze_boxes(results[0].boxes, model.names, total_area)
        
        if res == "BUKAN_UANG":
            detection_history.append("BUKAN_UANG")
            foreign_object_counter += 1
        elif res is not None:
            detection_history.append(res["label"])
            foreign_object_counter = 0
        else:
            detection_history.append(None)
            foreign_object_counter = max(0, foreign_object_counter - 1)

        # Filter nilai None dari history
        non_none = [x for x in detection_history if x is not None]
        if not non_none:
            return jsonify({'detected': False, 'message': 'Menunggu objek stabil...'})

        top_label, agree_count = Counter(non_none).most_common(1)[0]

        # Logika temporal smoothing yang dipercepat
        if agree_count < REQUIRED_AGREE:
            return jsonify({
                'detected': False,
                'message' : f'Memindai... ({agree_count}/{REQUIRED_AGREE})'
            })

        # Eksekusi hasil akhir berdasarkan label teratas yang disepakati history
        nominal_text = format_label_to_speech(top_label)
        
        if top_label == "BUKAN_UANG":
            return jsonify({
                'detected'  : False,
                'nominal'   : nominal_text,
                'message'   : 'Bukan uang rupiah',
                'confidence': '—'
            })
        
        # Jika lolos sebagai uang valid
        conf_str = "—"
        if isinstance(res, dict) and res['label'] == top_label:
            conf_str = f"{res['conf'] * 100:.0f}%"

        return jsonify({
            'detected'  : True,
            'nominal'   : nominal_text,
            'confidence': conf_str,
        })

    except Exception as e:
        print(f"[ERROR SYSTEM] {str(e)}")
        return jsonify({'detected': False, 'message': 'Terjadi kesalahan sistem'}), 500


@app.route('/reset', methods=['POST'])
def reset_history():
    global foreign_object_counter
    detection_history.clear()
    foreign_object_counter = 0
    print("[RESET] History deteksi dikosongkan")
    return jsonify({'message': 'History direset'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)