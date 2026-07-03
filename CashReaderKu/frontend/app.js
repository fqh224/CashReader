// ==========================================
// 1. REGISTRASI SERVICE WORKER (DENGAN REFRESH OTOMATIS)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                // Mengecek apakah ada update terbaru secara otomatis
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                console.log('Update baru tersedia, memuat ulang...');
                                window.location.reload();
                            }
                        }
                    };
                };
            })
            .catch(err => console.error('PWA Service Worker gagal:', err));
    });
}

// ==========================================
// 2. INISIALISASI & PENGAMANAN ELEMEN
// ==========================================
let views = {};
let mainHeader, headerText, video, canvas, predictionResult;

window.addEventListener('DOMContentLoaded', () => {
    // Memastikan elemen ada sebelum diakses
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

    // Event Listeners dengan pengecekan null
    document.getElementById('btn-mulai-deteksi')?.addEventListener('click', () => switchView('camera'));
    document.getElementById('btn-global-keluar')?.addEventListener('click', () => {
        if(confirm("Keluar dari CashReader?")) window.close();
    });
    document.getElementById('btn-camera-back')?.addEventListener('click', () => switchView('menu'));

    setTimeout(ucapkanSelamatDatangDanPindah, 500);
});

// ==========================================
// 3. BACKEND & KAMERA
// ==========================================
const BACKEND_URL = 'https://cashreader.my.id/predict';
let streamInstance = null;
let poolInterval = null;

function startCamera() {
    if (predictionResult) predictionResult.innerText = "Mencari Objek...";
    
    // Memastikan constraints untuk HP
    const constraints = { video: { facingMode: { exact: 'environment' } }, audio: false };
    
    navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        streamInstance = stream;
        if (video) video.srcObject = stream;
        if (poolInterval) clearInterval(poolInterval);
        poolInterval = setInterval(captureAndPredict, 1000); 
    }).catch(err => {
        console.error("Kamera error:", err);
        if (predictionResult) predictionResult.innerText = "Izin Kamera Diperlukan";
    });
}

function stopCamera() {
    if (poolInterval) clearInterval(poolInterval);
    if (streamInstance) streamInstance.getTracks().forEach(track => track.stop());
    streamInstance = null;
}

// ==========================================
// 4. LOGIKA DETEKSI (PENTING)
// ==========================================
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
            if (data && data.nominal && predictionResult) {
                if (predictionResult.innerText !== data.nominal) {
                    predictionResult.innerText = data.nominal;
                    speakAccessibility(data.nominal, true);
                    if (navigator.vibrate) navigator.vibrate(150);
                }
            }
        })
        .catch(err => console.error("Koneksi ke backend gagal:", err));
    }, 'image/jpeg', 0.7);
}

// ==========================================
// 5. NAVIGASI & SUARA
// ==========================================
function switchView(viewName) {
    Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
    
    if (viewName === 'menu') {
        if (mainHeader) mainHeader.style.display = 'none';
        stopCamera();
    } else if (viewName === 'camera') {
        if (mainHeader) mainHeader.style.display = 'flex';
        startCamera();
    }
    if (views[viewName]) views[viewName].classList.add('active');
}

function ucapkanSelamatDatangDanPindah() {
    const msg = new SpeechSynthesisUtterance("Selamat datang di CashReader.");
    msg.lang = 'id-ID';
    msg.onend = () => switchView('menu');
    window.speechSynthesis.speak(msg);
}

function speakAccessibility(text, limit = false) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'id-ID';
    window.speechSynthesis.speak(msg);
}
