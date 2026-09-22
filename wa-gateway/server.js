const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

const gatewayApiKey = process.env.WA_GATEWAY_API_KEY;
if (!gatewayApiKey) {
    throw new Error('WA_GATEWAY_API_KEY wajib diatur sebelum menjalankan gateway.');
}

const requestTimestamps = new Map();
const MAX_REQUESTS_PER_MINUTE = 30;

function requireGatewayApiKey(req, res, next) {
    if (req.get('x-api-key') !== gatewayApiKey) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const now = Date.now();
    const requester = req.ip || 'unknown';
    const recent = (requestTimestamps.get(requester) || []).filter((timestamp) => now - timestamp < 60_000);
    if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
        return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan' });
    }
    recent.push(now);
    requestTimestamps.set(requester, recent);
    next();
}

console.log('Menginisialisasi WhatsApp Client...');

// Auto-detect browser lokal (Chrome / Edge) agar tidak perlu download chromium terpisah
const candidatePaths = [
    process.env.CHROME_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium'
];
const detectedExecutable = candidatePaths.find(p => p && fs.existsSync(p));
if (detectedExecutable) {
    console.log(`Menggunakan browser: ${detectedExecutable}`);
}

// Inisialisasi WhatsApp Client dengan strategi penyimpanan sesi lokal
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        ...(detectedExecutable ? { executablePath: detectedExecutable } : {}),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Event ketika QR Code digenerate (Tampil di Terminal)
client.on('qr', (qr) => {
    console.log('\n==================================================');
    console.log('SCAN QR CODE DI BAWAH INI DENGAN WHATSAPP BOT ANDA');
    console.log('Nomor Bot Target: 085723375324');
    console.log('==================================================\n');
    qrcode.generate(qr, { small: true });
});

// Event ketika WhatsApp bot berhasil terhubung
client.on('ready', () => {
    console.log('\n==================================================');
    console.log('✅ WhatsApp Bot Siap & Terkoneksi (085723375324)!');
    console.log('==================================================\n');
});

// Event auth_failure
client.on('auth_failure', (msg) => {
    console.error('Gagal autentikasi:', msg);
});

// Event disconnected
client.on('disconnected', (reason) => {
    console.log('WhatsApp Bot terputus:', reason);
});

// Endpoint API untuk mengirim pesan WhatsApp
app.post('/send-message', requireGatewayApiKey, async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message || typeof message !== 'string' || message.length > 4096) {
        return res.status(400).json({ success: false, error: 'Nomor HP dan pesan wajib diisi!' });
    }

    try {
        let formattedNumber = number.toString().trim();
        
        // Bersihkan karakter non-digit
        formattedNumber = formattedNumber.replace(/\D/g, '');

        // Ubah awalan 08 menjadi 628
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.slice(1);
        }

        const chatId = formattedNumber + '@c.us';
        
        // Kirim pesan WhatsApp
        await client.sendMessage(chatId, message);

        console.log(`✉️ Pesan terkirim ke ${formattedNumber}: "${message}"`);
        return res.json({ success: true, status: 'Pesan berhasil dikirim!' });
    } catch (err) {
        console.error('Gagal mengirim pesan:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Jalankan WhatsApp Client
client.initialize();

// Jalankan Express Server di Port 8000
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`🚀 WA Gateway local server berjalan di http://localhost:${PORT}`);
});
