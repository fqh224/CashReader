// ==========================================
// 1. REGISTRASI SERVICE WORKER & INISIALISASI
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA Service Worker berhasil didaftarkan:', reg.scope))
            .catch(err => console.error('PWA Service Worker gagal didaftarkan:', err));
    });
}

// Variabel penampung elemen
let views = {};
let mainHeader, headerText, video, canvas, predictionResult;

// Inisialisasi setelah DOM siap
window.addEventListener('DOMContentLoaded', () => {
    views = {
        splash: document.getElementById('view-splash'),
        menu: document.getElementById('view-menu'),
        camera: document.getElementById('view-camera')
    };

    mainHeader = document.getElementById('main-header');
    headerText = document.getElementById('header-text');
    video = document.getElementById('camera-stream');
    canvas = document.getElementById('capture-canvas');
    predictionResult = document.getElementById('prediction-result');

    // Event Listener Navigasi setelah DOM siap
    document.getElementById('btn-mulai-deteksi')?.addEventListener('click', () => switchView('camera'));
    document.getElementById('btn-global-keluar')?.addEventListener('click', () => {
        if(confirm("Keluar dari CashReader?")) window.close();
    });
    document.getElementById('btn-camera-back')?.addEventListener('click', () => switchView('menu'));

    // Pindah ke fungsi selamat datang
    setTimeout(ucapkanSelamatDatangDanPindah, 500);
});

// ==========================================
// 2. BACKEND CONFIG
// ==========================================
const BACKEND_URL = 'https://cashreader.my.id/predict';
let streamInstance = null;
let poolInterval = null;

// ==========================================
// 3. FUNGSI SUARA & TRANSISI
// ==========================================
function ucapkanSelamatDatangDanPindah() {
    const pesan = "Selamat datang di aplikasi CashReader, platform deteksi nominal uang rupiah.";
    const utterance = new SpeechSynthesisUtterance(pesan);
    utterance.lang = 'id-ID';
    utterance.onend = () => switchView('menu');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 4. MEKANISME NAVIGASI
// ==========================================
function switchView(viewName) {
    Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
    
    if (viewName === 'menu') {
        if (mainHeader) mainHeader.style.display = 'none';
        stopCamera();
        setTimeout(() => speakAccessibility("Menu Utama. Tekan tombol mulai deteksi."), 500);
    } else if (viewName === 'camera') {
        if (mainHeader) mainHeader.style.display = 'flex';
        if (headerText) headerText.innerText = 'Deteksi Uang';
        startCamera();
    }
    
    if (views[viewName]) views[viewName].classList.add('active');
}

// ==========================================
// 5. KONTROL KAMERA & PREDIKSI
// ==========================================
function startCamera() {
    if (predictionResult) predictionResult.innerText = "Mencari Objek...";
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(stream => {
        streamInstance = stream;
        if (video) video.srcObject = stream;
        poolInterval = setInterval(captureAndPredict, 1000); 
    }).catch(() => { if (predictionResult) predictionResult.innerText = "Kamera Gagal"; });
}

function stopCamera() {
    if (poolInterval) clearInterval(poolInterval);
    if (streamInstance) streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
}

function captureAndPredict() {
    if (!streamInstance || !canvas || !video) return;
    
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');
        
        fetch(BACKEND_URL, { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.detected && data.nominal) {
                if (predictionResult.innerText !== data.nominal) {
                    predictionResult.innerText = data.nominal;
                    speakAccessibility(data.nominal, true);
                    if (navigator.vibrate) navigator.vibrate(150);
                }
            } else {
                predictionResult.innerText = "Mencari Objek...";
            }
        })
        .catch(() => {
            predictionResult.innerText = "Mencari Objek...";
        });
    }, 'image/jpeg', 0.8);
}

// ==========================================
// 6. FUNGSI AKSESIBILITAS SUARA
// ==========================================
let lastSpoken = "";
let lastSpokenTime = 0;
function speakAccessibility(text, limit = false) {
    if (!text) return;
    const now = Date.now();
    if (limit && text === lastSpoken && (now - lastSpokenTime < 4000)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    window.speechSynthesis.speak(utterance);
    
    lastSpoken = text;
    lastSpokenTime = now;
}
