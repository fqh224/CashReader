// ==========================================
// 1. REGISTRASI SERVICE WORKER (UNTUK PWA)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Membaca file sw.js yang berada di root folder yang sama
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA Service Worker berhasil didaftarkan:', reg.scope))
            .catch(err => console.error('PWA Service Worker gagal didaftarkan:', err));
    });
}

// --- KOORDINASI ELEMENT DENGAN HTML ---
const views = {
    splash: document.getElementById('view-splash'),
    menu: document.getElementById('view-menu'),
    camera: document.getElementById('view-camera'),
    panduan: document.getElementById('view-panduan')
};

const mainHeader = document.getElementById('main-header');
const mainFooter = document.getElementById('main-footer');
const headerText = document.getElementById('header-text');

const video = document.getElementById('camera-stream');
const canvas = document.getElementById('capture-canvas');
const predictionResult = document.getElementById('prediction-result');

// ==========================================
// 2. PERBAIKAN ALAMAT BACKEND FLASK
// ==========================================
// PENTING: Saat dideploy/tunneling menggunakan Ngrok, 
// ganti URL http://127.0.0.1:5000 ini dengan URL HTTPS dari Ngrok kamu!
// Contoh: const BACKEND_URL = 'https://xxxx-xxxx.ngrok-free.app/predict';
const BACKEND_URL = 'http://127.0.0.1:5000/predict';

let streamInstance = null;
let poolInterval = null;

// Durasi Tampilan Splash Screen (3 Detik)
setTimeout(() => { switchView('menu'); }, 3000);

// Mekanisme Pindah Halaman/Fitur
function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    
    if (viewName === 'splash') {
        mainHeader.style.display = 'none';
        mainFooter.style.display = 'none';
    } else if (viewName === 'menu') {
        mainHeader.style.display = 'flex';
        mainFooter.style.display = 'flex';
        headerText.innerText = 'CashReader';
        stopCamera();
    } else if (viewName === 'camera') {
        mainHeader.style.display = 'flex';
        mainFooter.style.display = 'none'; 
        headerText.innerText = 'CashReader';
        startCamera();
    } else if (viewName === 'panduan') {
        mainHeader.style.display = 'flex';
        mainFooter.style.display = 'flex';
        headerText.innerText = 'Panduan';
        stopCamera();
    }
    
    views[viewName].classList.add('active');
    speakAccessibility(viewName === 'menu' ? 'Menu Utama' : viewName === 'camera' ? 'Kamera Pemindai Aktif' : viewName === 'panduan' ? 'Halaman Panduan' : '');
}

// Event Klik Tombol Navigasi Sesuai Mockup
document.getElementById('btn-mulai-deteksi').addEventListener('click', () => switchView('camera'));
document.getElementById('btn-menu-panduan').addEventListener('click', () => switchView('panduan'));
document.getElementById('btn-camera-back').addEventListener('click', () => switchView('menu'));
document.getElementById('btn-header-back').addEventListener('click', () => switchView('menu'));
document.getElementById('btn-header-help').addEventListener('click', () => switchView('panduan'));
document.getElementById('btn-global-keluar').addEventListener('click', () => {
    if(confirm("Keluar dari CashReader?")) window.close();
});

// Kontrol Kamera & Pengiriman Frame Otomatis (Interval 600ms)
function startCamera() {
    predictionResult.innerText = "Mencari Objek...";
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(stream => {
        streamInstance = stream;
        video.srcObject = stream;
        poolInterval = setInterval(captureAndPredict, 600);
    }).catch(err => {
        predictionResult.innerText = "Kamera Terbuka Gagal";
    });
}

function stopCamera() {
    if (poolInterval) clearInterval(poolInterval);
    if (streamInstance) streamInstance.getTracks().forEach(track => track.stop());
}

function captureAndPredict() {
    if (!streamInstance) return;
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
                predictionResult.innerText = data.nominal;
                if (navigator.vibrate) navigator.vibrate(150); // Getar HP
                speakAccessibility(data.nominal, true);       // Suara Android/iOS
            } else {
                predictionResult.innerText = "Mencari Objek...";
            }
        }).catch(() => { predictionResult.innerText = "Koneksi Bermasalah"; });
    }, 'image/jpeg', 0.8);
}

// Mengatur Suara agar Tidak Tumpang Tindih
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