const express = require('express');
const fetch = require('node-fetch'); 
const cors = require('cors'); 
const app = express();

// Middleware
app.use(cors()); 
app.use(express.json());

// Helper: Jeda untuk stabilitas request ke server PusatWA
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Headers boilerplate
const getHeaders = () => ({
    'accept': '*/*',
    'authorization': process.env.WA_TOKEN, 
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
});

// Root path buat cek status API
app.get('/', (req, res) => {
    res.json({ status: "API Online", message: "PusatWA Bridge is active on Vercel" });
});

// ==========================================
// ENDPOINT 1: MINTA KODE PAIRING
// ==========================================
app.get('/api/pair', async (req, res) => {
    const nomor = req.query.no;
    const deviceName = req.query.name || 'WACUAN-WA-' + nomor; 
    const modePilihan = req.query.mode || 'off'; 

    if (!nomor) return res.status(400).json({ error: "Nomor WhatsApp tidak terdeteksi." });
    if (!process.env.WA_TOKEN) return res.status(500).json({ error: "Token WA_TOKEN belum diset di Vercel" });

    try {
        // 1. DAFTAR DEVICE KE PUSATWA
        const reqCreate = await fetch('https://responwa.com/api/user/devices', {
            method: 'POST', 
            headers: getHeaders(),
            body: JSON.stringify({ name: deviceName })
        });
        const createData = await reqCreate.json();
        const deviceId = createData.id || createData.data?.id;

        if (!deviceId) return res.status(400).json({ error: "Gagal membuat sesi", detail: createData });

        await delay(1000); 

        // 2. BYPASS QR SEBELUM PAIRING
        await fetch(`https://responwa.com/api/user/devices/${deviceId}/scan-qr`, { 
            method: 'POST', headers: getHeaders() 
        }).catch(() => {});

        await delay(800);

        // 3. SET MODE AWAL
        await fetch(`https://responwa.com/api/user/devices/${deviceId}/mode`, {
            method: 'PUT', headers: getHeaders(), 
            body: JSON.stringify({ mode: modePilihan })
        }).catch(() => {});

        await delay(1000);

        // 4. EKSEKUSI AMBIL KODE PAIRING
        const reqPair = await fetch(`https://responwa.com/api/user/devices/${deviceId}/pair`, {
            method: 'POST', headers: getHeaders(), 
            body: JSON.stringify({ phone: nomor })
        });
        const pairData = await reqPair.json();

        res.json({ ...pairData, device_id: deviceId });

    } catch (error) {
        res.status(500).json({ error: "Gangguan Gateway API", detail: error.message });
    }
});

// ==========================================
// ENDPOINT 2: GENERATE QR CODE
// ==========================================
app.get('/api/qr', async (req, res) => {
    const deviceName = req.query.name || 'WACUAN-QR-Session';

    try {
        const reqCreate = await fetch('https://responwa.com/api/user/devices', {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ name: deviceName })
        });
        const createData = await reqCreate.json();
        const deviceId = createData.id || createData.data?.id;

        if (!deviceId) return res.status(400).json({ error: "Gagal membuat sesi perangkat" });

        await delay(1000);

        // Trigger QR session
        await fetch(`https://responwa.com/api/user/devices/${deviceId}/scan-qr`, {
            method: 'POST', headers: getHeaders()
        }).catch(() => {});

        await delay(1500); 

        const reqQr = await fetch(`https://responwa.com/api/user/devices/${deviceId}/qr`, {
            method: 'GET', headers: getHeaders()
        });
        const qrData = await reqQr.json();

        res.json({ ...qrData, device_id: deviceId });

    } catch (error) {
        res.status(500).json({ error: "Gagal generate QR", detail: error.message });
    }
});

// =======================================================
// ENDPOINT 3: GET DEVICES STATS
// =======================================================
app.get('/api/devices', async (req, res) => {
    try {
        const response = await fetch('https://responwa.com/api/user/devices', {
            method: 'GET',
            headers: getHeaders()
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Gagal mengambil data perangkat" });
    }
});

// =======================================================
// ENDPOINT 4: UBAH MODE
// =======================================================
app.get('/api/mode', async (req, res) => {
    const { id, mode } = req.query;
    if (!id || !mode) return res.status(400).json({ error: "ID dan Mode wajib ada" });

    try {
        const response = await fetch(`https://responwa.com/api/user/devices/${id}/mode`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ mode: mode })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Gagal mengubah mode" });
    }
});

// =======================================================
// ENDPOINT 5: CHECK STATUS
// =======================================================
app.get('/api/check-status', async (req, res) => {
    const deviceName = req.query.id; 
    if (!deviceName) return res.status(400).json({ error: "Nama Device kosong" });

    try {
        const response = await fetch('https://responwa.com/api/user/devices', {
            method: 'GET',
            headers: getHeaders()
        });
        const data = await response.json();
        const devices = data.data || data; 
        
        if (!Array.isArray(devices)) return res.json({ status: 'pending' });

        const matchedDevice = devices.find(d => d.name === deviceName);
        if (matchedDevice && matchedDevice.status === 'connected') {
            res.json({ status: 'connected', real_id: matchedDevice.id });
        } else {
            res.json({ status: 'pending' });
        }
    } catch (error) {
        res.status(500).json({ error: "Gagal cek status" });
    }
});

// Export untuk Vercel
module.exports = app;
