const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('../data/store');
const QueueEngine = require('./queueEngine');
const QREngine = require('./qrEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const queueEngine = new QueueEngine(io);
const routes = require('./routes')(queueEngine, io);

// Ön Bellekleme Engelleme (Her zaman en güncel sürüm açılsın)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  maxAge: 0,
  lastModified: false
}));

// API Rotaları
app.use('/api', routes);

// Doğrudan APK İndirme & Güncelleme Rotaları
app.get(['/indir', '/apk', '/indir/apk', '/TaksideOde_POS.apk'], (req, res) => {
  const apkPath = path.join(__dirname, '../android_outputs/TaksideOde_POS_v1.0.apk');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="TaksideOde_POS_Guncel.apk"');
  res.sendFile(apkPath);
});

// Müşteri QR Çağrı Sayfası Dinamik Yönlendirme
app.get('/cagri/:qrCode', (req, res) => {
  const { qrCode } = req.params;
  // QR Okutulma İstatistiğini Güncelle
  QREngine.recordScan(qrCode);
  res.sendFile(path.join(__dirname, '../public/cagri.html'));
});

// Sayfa Rotaları
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/panel.html'));
});

app.get('/surucu', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/surucu.html'));
});

// Socket.io Gerçek Zamanlı Bağlantılar
io.on('connection', (socket) => {
  // Durak Paneli Odaya Katılma
  socket.on('join_station', (stationId) => {
    socket.join(`station_${stationId}`);
  });

  // Sürücü / POS Odaya Katılma
  socket.on('join_driver', (shiftId) => {
    socket.join(`driver_${shiftId}`);
  });

  // Müşteri Çağrı Odasına Katılma
  socket.on('join_call', (callId) => {
    socket.join(`call_${callId}`);
  });

  // Sürücüden Anlık GPS Konum Bildirimi
  socket.on('driver_gps_ping', (data) => {
    const { shiftId, stationId, lat, lng, speed, state } = data;
    
    // Durak paneline anlık canlı yayınla
    io.to(`station_${stationId}`).emit('live_taxi_marker', {
      shiftId,
      lat,
      lng,
      speed,
      state
    });
  });

  socket.on('disconnect', () => {
    // Bağlantı koptu
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚕 TaksideÖde Platformu Çalışıyor: http://localhost:${PORT}`);
  console.log(`   • Tanıtım Sitesi:        http://localhost:${PORT}/`);
  console.log(`   • Durak Yönetim Paneli:  http://localhost:${PORT}/panel`);
  console.log(`   • Sürücü / POS Ekranı:   http://localhost:${PORT}/surucu`);
  console.log(`   • Müşteri QR Çağrısı:    http://localhost:${PORT}/cagri/KR-101`);
  console.log(`====================================================`);
});
