// ==========================================
// 1. REGISTRASI SERVICE WORKER
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .catch(err => console.error('SW Registration Failed:', err));
    });
}

// ==========================================
// 2. INISIALISASI & STATE
// ==========================================
let views = {};
let mainHeader, headerText, video, canvas, predictionResult;
const BACKEND_URL = 'https://cashreader.my.id/predict'; 
let streamInstance = null;
let poolInterval = null;

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

    // Event Navigasi Aman
    document.getElementById('btn-mulai-deteksi')?.addEventListener('click', () => switchView('camera'));
    document.getElementById('btn-global-keluar')?.addEventListener('click', () => window.close());
    document.getElementById('btn-camera-back')?.addEventListener('click', () => switchView('menu'));

    // Inisialisasi otomatis setelah delay pendek
    setTimeout(prepareApp, 800);
});

// ==========================================
// 3. FUNGSI LOGIKA UTAMA
// ==========================================
function prepareApp() {
    // Membuka kunci audio secara paksa jika browser memblokir (autostart)
    window.speechSynthesis.cancel();
    ucapkanSelamatDatangDanPindah();
}

function switchView(viewName) {
    if (!views[viewName]) return;
    
    // Sembunyikan semua
    Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
    
    // Tampilkan target
    views[viewName].classList.add('active');
    
    if (viewName === 'menu') {
        if (mainHeader) mainHeader.style.display = 'none';
        stopCamera();
    } else if (viewName === 'camera') {
        if (mainHeader) mainHeader.style.display = 'flex';
        if (headerText) headerText.innerText = 'Deteksi Uang';
        startCamera();
    }
}

// ==========================================
// 4. KONTROL KAMERA & PREDIKSI (DENGAN TIMEOUT)
// ==========================================
function startCamera() {
    if (predictionResult) predictionResult.innerText = "Mencari Objek...";
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(stream => {
        streamInstance = stream;
        if (video) video.srcObject = stream;
        poolInterval = setInterval(captureAndPredict, 1500); // Diperlambat untuk stabilitas
    }).catch(err => { 
        console.error("Camera Error:", err);
        if (predictionResult) predictionResult.innerText = "Kamera Tidak Tersedia"; 
    });
}

function stopCamera() {
    if (poolInterval) clearInterval(poolInterval);
    if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
    }
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
        
        // Timeout 5 detik agar tidak hang
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch(BACKEND_URL, { method: 'POST', body: formData, signal: controller.signal })
        .then(res => res.json())
        .then(data => {
            clearTimeout(timeoutId);
            if (data.detected && data.nominal) {
                if (predictionResult.innerText !== data.nominal) {
                    predictionResult.innerText = data.nominal;
                    speakAccessibility(data.nominal, true);
                    if (navigator.vibrate) navigator.vibrate(150);
                }
            }
        })
        .catch(() => { clearTimeout(timeoutId); });
    }, 'image/jpeg', 0.7);
}

// ==========================================
// 5. AKSESIBILITAS SUARA (ROBUST)
// ==========================================
function speakAccessibility(text, isDetection = false, onEndCallback = null) {
    if (!text || (isDetection && window.speechSynthesis.speaking)) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.1;
    if (onEndCallback) utterance.onend = onEndCallback;
    window.speechSynthesis.speak(utterance);
}

function ucapkanSelamatDatangDanPindah() {
    const pesan = "Selamat datang di aplikasi CashReader. Aplikasi siap digunakan.";
    speakAccessibility(pesan, false, () => switchView('menu'));
}
