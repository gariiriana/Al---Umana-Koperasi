const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.use(express.json());

console.log('Menginisialisasi WhatsApp Client...');

// Inisialisasi WhatsApp Client dengan strategi penyimpanan sesi lokal
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
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
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
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
