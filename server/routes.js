const express = require('express');
const router = express.Router();
const db = require('../data/store');
const QREngine = require('./qrEngine');

module.exports = function(queueEngine, io) {
  // ==========================================
  // AUTH (DURAK & SÜPER ADMİN GİRİŞİ)
  // ==========================================
  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    const data = db.get();

    // 1. Süper Admin Kontrolü
    const admin = data.admin || { username: 'taksideode', password: 'Doguhan2001' };
    if (admin.username === username && admin.password === password) {
      return res.json({
        success: true,
        role: 'admin',
        user: { name: admin.name || 'Demir Medya Admin', username: admin.username },
        redirectUrl: '/admin'
      });
    }

    // 2. Durak Girişi Kontrolü
    const station = (data.stations || []).find(s => 
      (s.username && s.username.toLowerCase() === (username || '').toLowerCase().trim()) ||
      s.id === username
    );

    if (station) {
      if (station.password !== password) {
        return res.status(401).json({ success: false, error: 'Durak şifresi hatalı!' });
      }
      if (station.status === 'passive') {
        return res.status(403).json({ success: false, error: 'Bu durak hesabı pasife alınmıştır. Lütfen sistem yöneticisi ile iletişime geçiniz.' });
      }

      return res.json({
        success: true,
        role: 'station',
        station: {
          id: station.id,
          name: station.name,
          city: station.city,
          district: station.district,
          username: station.username
        },
        redirectUrl: `/panel?stationId=${station.id}`
      });
    }

    return res.status(401).json({ success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
  });

  // ==========================================
  // SÜPER ADMİN (TÜM DURAKLARIN YÖNETİMİ)
  // ==========================================
  router.get('/admin/overview', (req, res) => {
    const data = db.get();
    const stations = data.stations || [];
    const vehicles = data.vehicles || [];
    const drivers = data.drivers || [];
    const calls = data.calls || [];

    const detailedStations = stations.map(st => {
      const stVehicles = vehicles.filter(v => v.station_id === st.id);
      const stDrivers = drivers.filter(d => d.station_id === st.id);
      const stCalls = calls.filter(c => c.station_id === st.id);
      const completedCalls = stCalls.filter(c => c.status === 'completed');
      const totalRevenue = completedCalls.reduce((sum, c) => sum + (c.fare || 0), 0);
      
      const createdTime = st.createdAt ? new Date(st.createdAt).getTime() : Date.now();
      const diffDays = Math.max(1, Math.round((Date.now() - createdTime) / (1000 * 60 * 60 * 24)));
      const durationText = diffDays > 30 ? `${Math.round(diffDays / 30)} Aydır Bizimle` : `${diffDays} Gündür Bizimle`;

      return {
        ...st,
        vehicleCount: stVehicles.length,
        driverCount: stDrivers.length,
        totalCallsCount: stCalls.length,
        completedCallsCount: completedCalls.length,
        totalRevenue,
        durationDays: diffDays,
        durationText
      };
    });

    const totalSystemRevenue = calls.filter(c => c.status === 'completed').reduce((sum, c) => sum + (c.fare || 0), 0);

    res.json({
      success: true,
      stats: {
        totalStations: stations.length,
        activeStations: stations.filter(s => s.status === 'active').length,
        trialStations: stations.filter(s => s.status === 'trial').length,
        totalVehicles: vehicles.length,
        totalDrivers: drivers.length,
        totalCalls: calls.length,
        totalRevenue: totalSystemRevenue
      },
      stations: detailedStations
    });
  });

  // Yeni Durak Ekle
  router.post('/admin/stations', (req, res) => {
    const { name, username, password, officerName, phone, city, district, address, lat, lng, geofenceRadiusMeters, status } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, error: 'Durak adı, kullanıcı adı ve şifre zorunludur.' });
    }

    const newId = 'durak_' + Date.now();
    const newStation = {
      id: newId,
      name,
      username: username.toLowerCase().trim(),
      password,
      officerName: officerName || '',
      phone: phone || '',
      city: city || 'İstanbul',
      district: district || '',
      address: address || '',
      status: status || 'active',
      location: {
        lat: lat ? parseFloat(lat) : 40.9876,
        lng: lng ? parseFloat(lng) : 29.0267
      },
      geofenceRadiusMeters: geofenceRadiusMeters ? parseInt(geofenceRadiusMeters) : 100,
      settings: {
        driverTimeoutSeconds: 30,
        autoQueueOnEnter: true,
        allowOperatorManualReorder: true,
        themeColor: 'amber'
      },
      createdAt: new Date().toISOString()
    };

    db.update(d => {
      d.stations = d.stations || [];
      d.stations.push(newStation);
      return d;
    });

    res.json({ success: true, station: newStation });
  });

  // Durak Düzenle
  router.put('/admin/stations/:id', (req, res) => {
    const { id } = req.params;
    const { name, username, password, officerName, phone, city, district, address, status, lat, lng } = req.body;
    let updated = null;

    db.update(d => {
      const st = (d.stations || []).find(s => s.id === id);
      if (st) {
        if (name) st.name = name;
        if (username) st.username = username.toLowerCase().trim();
        if (password) st.password = password;
        if (officerName !== undefined) st.officerName = officerName;
        if (phone !== undefined) st.phone = phone;
        if (city !== undefined) st.city = city;
        if (district !== undefined) st.district = district;
        if (address !== undefined) st.address = address;
        if (status !== undefined) st.status = status;
        if (lat) st.location.lat = parseFloat(lat);
        if (lng) st.location.lng = parseFloat(lng);
        updated = st;
      }
      return d;
    });

    if (!updated) return res.status(404).json({ success: false, error: 'Durak bulunamadı.' });
    res.json({ success: true, station: updated });
  });

  // Durak Durumu Değiştir (Aktif / Pasif)
  router.post('/admin/stations/:id/toggle-status', (req, res) => {
    const { id } = req.params;
    let updated = null;

    db.update(d => {
      const st = (d.stations || []).find(s => s.id === id);
      if (st) {
        st.status = st.status === 'active' ? 'passive' : 'active';
        updated = st;
      }
      return d;
    });

    if (!updated) return res.status(404).json({ success: false, error: 'Durak bulunamadı.' });
    res.json({ success: true, station: updated });
  });

  // Durak Sil
  router.delete('/admin/stations/:id', (req, res) => {
    const { id } = req.params;
    db.update(d => {
      d.stations = (d.stations || []).filter(s => s.id !== id);
      d.vehicles = (d.vehicles || []).filter(v => v.station_id !== id);
      d.drivers = (d.drivers || []).filter(drv => drv.station_id !== id);
      d.shifts = (d.shifts || []).filter(sh => sh.station_id !== id);
      d.qrPoints = (d.qrPoints || []).filter(q => q.station_id !== id);
      return d;
    });
    res.json({ success: true, message: 'Durak ve ilişkili verileri silindi.' });
  });

  // 1. Durak Genel Bakış & Finansal/Operasyon Verisi (Pano İstatistikleri)
  router.get('/stations/:id/overview', (req, res) => {
    const stationId = req.params.id;
    const data = db.get();

    const station = (data.stations || []).find(s => s.id === stationId);
    if (!station) return res.status(404).json({ error: 'Durak bulunamadı' });

    const vehicles = (data.vehicles || []).filter(v => v.station_id === stationId);
    const drivers = (data.drivers || []).filter(d => d.station_id === stationId);
    const shifts = (data.shifts || []).filter(s => s.station_id === stationId);
    const queue = queueEngine.getQueue(stationId);
    const qrPoints = (data.qrPoints || []).filter(q => q.station_id === stationId);
    const customers = (data.customers || []).filter(c => c.station_id === stationId);
    const announcements = (data.announcements || []).filter(a => a.station_id === stationId);
    const messages = (data.messages || []).filter(m => m.station_id === stationId);

    const allCalls = (data.calls || []).filter(c => c.station_id === stationId);
    const activeCalls = allCalls.filter(c => ['pending', 'dispatched', 'accepted', 'in_trip'].includes(c.status));
    const completedCalls = allCalls.filter(c => c.status === 'completed');

    // Ciro Hesaplamaları
    const totalRevenue = completedCalls.reduce((sum, c) => sum + (c.fare || 180), 0);
    const todayRevenue = totalRevenue; // demo amaçlı bugün/aylık
    const avgFare = completedCalls.length > 0 ? Math.round(totalRevenue / completedCalls.length) : 0;

    res.json({
      station,
      stats: {
        totalVehicles: vehicles.length,
        totalDrivers: drivers.length,
        activeShifts: shifts.length,
        inQueueCount: queue.length,
        totalQRPoints: qrPoints.length,
        totalQRScans: qrPoints.reduce((acc, curr) => acc + (curr.totalScans || 0), 0),
        activeCallsCount: activeCalls.length,
        completedCallsCount: completedCalls.length,
        totalCustomers: customers.length,
        totalRevenue,
        todayRevenue,
        avgFare
      },
      vehicles,
      drivers,
      shifts,
      queue,
      qrPoints,
      activeCalls,
      recentCalls: allCalls.slice(-20).reverse(),
      customers,
      announcements,
      messages
    });
  });

  // 2. Sıra Yönetimi
  router.get('/stations/:id/queue', (req, res) => {
    res.json(queueEngine.getQueue(req.params.id));
  });

  router.post('/stations/:id/queue/move', (req, res) => {
    const { shiftId, direction } = req.body;
    queueEngine.moveQueueItem(req.params.id, shiftId, direction);
    res.json({ success: true, queue: queueEngine.getQueue(req.params.id) });
  });

  router.post('/stations/:id/queue/add', (req, res) => {
    const { shiftId } = req.body;
    queueEngine.addToQueue(req.params.id, shiftId);
    res.json({ success: true, queue: queueEngine.getQueue(req.params.id) });
  });

  router.post('/stations/:id/queue/remove', (req, res) => {
    const { shiftId } = req.body;
    queueEngine.removeFromQueue(req.params.id, shiftId);
    res.json({ success: true });
  });

  // 3. QR Noktaları & Baskı
  router.get('/stations/:id/qr-points', (req, res) => {
    const data = db.get();
    res.json((data.qrPoints || []).filter(q => q.station_id === req.params.id));
  });

  router.post('/stations/:id/qr-points', async (req, res) => {
    const { title, neighborhood, landmark, notes, lat, lng } = req.body;
    const stationId = req.params.id;
    const code = 'QR-' + Math.floor(1000 + Math.random() * 9000);
    const newQR = {
      id: 'qr_' + Date.now(),
      code,
      station_id: stationId,
      title: title || 'Yeni QR Noktası',
      neighborhood: neighborhood || '',
      landmark: landmark || '',
      notes: notes || '',
      lat: lat ? parseFloat(lat) : 40.9876,
      lng: lng ? parseFloat(lng) : 29.0267,
      totalScans: 0,
      successfulCalls: 0,
      lastScannedAt: null,
      createdAt: new Date().toISOString()
    };

    db.update(data => {
      data.qrPoints.push(newQR);
      return data;
    });
    res.json(newQR);
  });

  router.get('/stations/:id/qr-points/:qrId/print', async (req, res) => {
    const data = db.get();
    const station = (data.stations || []).find(s => s.id === req.params.id);
    const qrPoint = (data.qrPoints || []).find(q => q.id === req.params.qrId || q.code === req.params.qrId);
    if (!station || !qrPoint) return res.status(404).send('Kayıt bulunamadı');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const html = await QREngine.generatePrintTemplate(qrPoint, station, baseUrl);
    res.send(html);
  });

  // QR Noktası Görseli & Canlı Önizleme Bilgisi
  router.get('/stations/:id/qr-points/:qrId/preview', async (req, res) => {
    const data = db.get();
    const station = (data.stations || []).find(s => s.id === req.params.id);
    const qrPoint = (data.qrPoints || []).find(q => q.id === req.params.qrId || q.code === req.params.qrId);
    if (!qrPoint) return res.status(404).json({ error: 'QR Noktası bulunamadı' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const targetUrl = QREngine.getQRUrl(qrPoint.code, baseUrl);
    const qrDataUrl = await QREngine.generateQRCodeDataUrl(targetUrl);

    const qrCalls = (data.calls || []).filter(c => c.qr_code === qrPoint.code);
    const completedCalls = qrCalls.filter(c => c.status === 'completed');

    res.json({
      success: true,
      qrPoint,
      station,
      targetUrl,
      qrDataUrl,
      stats: {
        totalScans: qrPoint.totalScans || 0,
        successfulCalls: qrPoint.successfulCalls || completedCalls.length,
        conversionRate: qrPoint.totalScans > 0 ? Math.round(((qrPoint.successfulCalls || completedCalls.length) / qrPoint.totalScans) * 100) : 0,
        totalRevenue: completedCalls.reduce((sum, c) => sum + (c.fare || 0), 0)
      },
      recentCalls: qrCalls.slice(-5).reverse()
    });
  });

  // 4. İş Emirleri / Çağrılar
  router.post('/calls/phone', (req, res) => {
    const { stationId, pickupAddress, dropoffAddress, customerPhone, customerName, notes, fare } = req.body;
    const data = db.get();
    const station = data.stations.find(s => s.id === stationId);
    if (!station) return res.status(404).json({ error: 'Durak bulunamadı' });

    const newCall = {
      id: 'call_' + Date.now(),
      station_id: stationId,
      source: 'phone',
      qr_code: null,
      pickupAddress: pickupAddress || 'Telefonla Adres Belirtildi',
      dropoffAddress: dropoffAddress || 'Şehir İçi Varış Noktası',
      customerPhone: customerPhone || 'Gizli/Telefon',
      customerName: customerName || 'Telefon Müşterisi',
      customerNote: notes || '',
      lat: station.location.lat + (Math.random() - 0.5) * 0.005,
      lng: station.location.lng + (Math.random() - 0.5) * 0.005,
      status: 'pending',
      stage: 'heading_to_pickup',
      assignedShiftId: null,
      assignedPlate: null,
      assignedDriverName: null,
      createdAt: new Date().toISOString(),
      fare: fare ? parseInt(fare) : Math.floor(180 + Math.random() * 220)
    };

    db.update(d => {
      d.calls.push(newCall);
      // Müşteri kayıtlı değilse müşterilere otomatik ekle/güncelle
      if (customerPhone && customerPhone.length > 5) {
        let existingCust = d.customers.find(c => c.phone === customerPhone);
        if (existingCust) {
          existingCust.totalCalls = (existingCust.totalCalls || 0) + 1;
          existingCust.lastCallAt = new Date().toISOString();
        } else {
          d.customers.push({
            id: 'cust_' + Date.now(),
            station_id: stationId,
            fullName: customerName || 'Telefon Müşterisi',
            phone: customerPhone,
            street: pickupAddress,
            neighborhood: '',
            totalCalls: 1,
            lastCallAt: new Date().toISOString(),
            tag: 'Yeni Müşteri',
            notes: notes || ''
          });
        }
      }
      return d;
    });

    const assigned = queueEngine.dispatchCallToFirstInQueue(stationId, newCall.id);
    res.json({ success: true, call: newCall, assignedTaxi: assigned });
  });

  router.post('/calls/qr', (req, res) => {
    const { qrCode, customerPhone, customerNote, dropoffAddress } = req.body;
    const data = db.get();
    const qrPoint = (data.qrPoints || []).find(q => q.code === qrCode);
    if (!qrPoint) return res.status(404).json({ error: 'Geçersiz QR Kod' });

    QREngine.recordSuccessfulCall(qrCode);

    const newCall = {
      id: 'call_' + Date.now(),
      station_id: qrPoint.station_id,
      source: 'qr',
      qr_code: qrPoint.code,
      pickupAddress: `${qrPoint.title} (${qrPoint.landmark || qrPoint.neighborhood})`,
      dropoffAddress: dropoffAddress || 'Şehir İçi / Yolcu Belirtecek',
      customerPhone: customerPhone || '',
      customerNote: customerNote || '',
      lat: qrPoint.lat,
      lng: qrPoint.lng,
      status: 'pending',
      stage: 'heading_to_pickup',
      assignedShiftId: null,
      assignedPlate: null,
      assignedDriverName: null,
      createdAt: new Date().toISOString(),
      fare: Math.floor(200 + Math.random() * 180)
    };

    db.update(d => {
      d.calls.push(newCall);
      return d;
    });

    const assigned = queueEngine.dispatchCallToFirstInQueue(qrPoint.station_id, newCall.id);
    res.json({ success: true, call: newCall, assignedTaxi: assigned });
  });

  router.get('/calls/:id', (req, res) => {
    const data = db.get();
    const call = (data.calls || []).find(c => c.id === req.params.id);
    if (!call) return res.status(404).json({ error: 'Çağrı bulunamadı' });
    res.json(call);
  });

  router.post('/calls/:id/accept', (req, res) => {
    const { stationId, shiftId } = req.body;
    queueEngine.acceptCall(stationId, req.params.id, shiftId);
    res.json({ success: true });
  });

  router.post('/calls/:id/reject', (req, res) => {
    const { stationId, shiftId } = req.body;
    queueEngine.rejectCall(stationId, req.params.id, shiftId);
    res.json({ success: true });
  });

  // 1. Aşamadan 2. Aşamaya Geçiş: "Müşteriyi Aldım" (Yolculuk Başladı)
  router.post('/calls/:id/pickup', (req, res) => {
    let updatedCall = null;
    db.update(data => {
      const call = (data.calls || []).find(c => c.id === req.params.id);
      if (call) {
        call.status = 'in_trip';
        call.stage = 'heading_to_dropoff';
        call.pickedUpAt = new Date().toISOString();
        updatedCall = call;
      }
      return data;
    });

    if (updatedCall && io) {
      io.to(`station_${updatedCall.station_id}`).emit('call_pickup_completed', updatedCall);
      io.to(`driver_${updatedCall.assignedShiftId}`).emit('call_stage_update', {
        call: updatedCall,
        stage: 'heading_to_dropoff'
      });
      io.to(`call_${updatedCall.id}`).emit('call_status_update', {
        callId: updatedCall.id,
        status: 'in_trip',
        message: 'Müşteri taksiye bindi, varış adresine gidiliyor!'
      });
    }
    res.json({ success: true, call: updatedCall });
  });

  router.post('/calls/:id/complete', (req, res) => {
    const { fare } = req.body;
    let completedCall = null;
    db.update(data => {
      const call = (data.calls || []).find(c => c.id === req.params.id);
      if (call) {
        call.status = 'completed';
        call.stage = 'completed';
        call.completedAt = new Date().toISOString();
        call.fare = fare ? parseInt(fare) : (call.fare || 240);
        completedCall = call;

        const shift = (data.shifts || []).find(s => s.id === call.assignedShiftId);
        if (shift) {
          shift.state = 'available_outside';
          const drv = (data.drivers || []).find(d => d.id === shift.driver_id);
          if (drv) {
            drv.totalTrips = (drv.totalTrips || 0) + 1;
            drv.monthlyRevenue = (drv.monthlyRevenue || 0) + call.fare;
            drv.todayRevenue = (drv.todayRevenue || 0) + call.fare;
          }
        }
      }
      return data;
    });

    if (completedCall && io) {
      io.to(`station_${completedCall.station_id}`).emit('call_completed', completedCall);
      io.to(`driver_${completedCall.assignedShiftId}`).emit('call_completed_confirm', completedCall);
      io.to(`call_${completedCall.id}`).emit('call_status_update', { callId: completedCall.id, status: 'completed' });
    }
    res.json({ success: true, call: completedCall });
  });

  // Şoförün Geçmiş Seferleri
  router.get('/drivers/:shiftId/history', (req, res) => {
    const data = db.get();
    const shiftId = req.params.shiftId;
    const shift = (data.shifts || []).find(s => s.id === shiftId || s.driver_id === shiftId);
    const targetShiftId = shift ? shift.id : shiftId;
    const driver = shift ? (data.drivers || []).find(d => d.id === shift.driver_id) : null;
    const plate = shift ? shift.plate : null;

    const calls = (data.calls || [])
      .filter(c => {
        if (c.status !== 'completed') return false;
        return c.assignedShiftId === targetShiftId || (plate && c.assignedPlate === plate);
      })
      .reverse();
    res.json({ calls });
  });

  // Şoför Performans ve İstatistik Dökümü (A'dan Z'ye)
  router.get('/drivers/:driverId/performance', (req, res) => {
    const data = db.get();
    const driver = (data.drivers || []).find(d => d.id === req.params.driverId);
    if (!driver) return res.status(404).json({ success: false, error: 'Şoför bulunamadı' });

    const shift = (data.shifts || []).find(s => s.driver_id === driver.id);
    const driverCalls = (data.calls || []).filter(c => 
      (shift && c.assignedShiftId === shift.id) ||
      (driver.plate && c.assignedPlate === driver.plate) ||
      (c.assignedDriverId === driver.id)
    );
    const completedCalls = driverCalls.filter(c => c.status === 'completed');

    const totalEarnings = completedCalls.reduce((sum, c) => sum + (c.fare || 0), 0);
    const acceptedCount = driver.acceptedCalls || completedCalls.length;
    const rejectedCount = driver.rejectedCalls || 0;
    const totalOffered = acceptedCount + rejectedCount;
    const acceptanceRate = totalOffered > 0 ? Math.round((acceptedCount / totalOffered) * 100) : 100;

    res.json({
      success: true,
      driver,
      stats: {
        totalTrips: completedCalls.length,
        acceptedCalls: acceptedCount,
        rejectedCalls: rejectedCount,
        acceptanceRate,
        totalRevenue: totalEarnings || driver.monthlyRevenue || 0,
        todayRevenue: driver.todayRevenue || totalEarnings || 0,
        rating: driver.rating || 5.0,
        activeHours: Math.round(((completedCalls.length || 1) * 25) / 60 * 10) / 10
      },
      recentTrips: completedCalls.slice(-20).reverse()
    });
  });

  // Sürücünün Devam Eden Aktif Çağrısı (Haritadan dönünce veya sayfa yenilenince kaybolmasın)
  router.get('/drivers/:shiftId/active-call', (req, res) => {
    const { shiftId } = req.params;
    const data = db.get();
    const shift = (data.shifts || []).find(s => s.id === shiftId);
    if (!shift) return res.json({ success: true, hasActiveCall: false, call: null });

    const activeCall = (data.calls || []).find(c => 
      (c.assignedShiftId === shiftId || (shift.plate && c.assignedPlate === shift.plate)) &&
      (c.status === 'dispatched' || c.status === 'accepted' || c.status === 'in_trip')
    );

    if (activeCall) {
      return res.json({ success: true, hasActiveCall: true, call: activeCall });
    }
    res.json({ success: true, hasActiveCall: false, call: null });
  });

  // TEST MODU 1: Durağa Işınlan (Kadıköy Merkez - 1. Sıraya Geç)
  router.post('/test/teleport-to-station', (req, res) => {
    const { shiftId } = req.body;
    const data = db.get();
    const shift = (data.shifts || []).find(s => s.id === shiftId);
    if (!shift) return res.status(404).json({ error: 'Vardiya bulunamadı' });
    const station = (data.stations || []).find(st => st.id === shift.station_id);

    db.update(d => {
      const s = (d.shifts || []).find(x => x.id === shiftId);
      if (s) s.isTestSimulated = true;
      return d;
    });

    const stationLat = station && station.location ? station.location.lat : 40.9876;
    const stationLng = station && station.location ? station.location.lng : 29.0267;

    const geofenceResult = queueEngine.processDriverLocation(shiftId, stationLat, stationLng);

    // Test aracını kesin olarak 1. Sıraya al
    db.update(d => {
      d.queue = d.queue || [];
      const existingIdx = d.queue.findIndex(q => q.shift_id === shiftId);
      let item = null;
      if (existingIdx > -1) {
        [item] = d.queue.splice(existingIdx, 1);
      } else {
        item = {
          queueOrder: 0,
          shift_id: shift.id,
          vehicle_id: shift.vehicle_id,
          driver_id: shift.driver_id,
          plate: shift.plate,
          driverName: shift.driverName,
          enteredAt: new Date().toISOString()
        };
      }
      item.queueOrder = 0;
      d.queue.unshift(item);
      return d;
    });

    queueEngine.reindexQueue(shift.station_id);
    const updatedQueue = queueEngine.getQueue(shift.station_id);
    io.to(`driver_${shiftId}`).emit('queue_position', { rank: 1, total: updatedQueue.length });

    res.json({
      success: true,
      simulated: true,
      mode: 'station_inside',
      lat: stationLat,
      lng: stationLng,
      geofence: geofenceResult
    });
  });

  // TEST MODU 2: Durak Dışına Çık (İzmir / Dışarıda)
  router.post('/test/teleport-outside', (req, res) => {
    const { shiftId } = req.body;
    db.update(d => {
      const s = (d.shifts || []).find(x => x.id === shiftId);
      if (s) s.isTestSimulated = false;
      return d;
    });

    const outLat = 38.4093522; // İzmir
    const outLng = 27.1232601;

    const geofenceResult = queueEngine.processDriverLocation(shiftId, outLat, outLng);
    res.json({
      success: true,
      simulated: true,
      mode: 'outside_izmir',
      lat: outLat,
      lng: outLng,
      geofence: geofenceResult
    });
  });

  // TEST MODU 3: Test Çağrısı Gönder (1. Sıradaki Araca veya Belirtilen Şoföre)
  router.post('/test/create-test-job', (req, res) => {
    const { stationId, shiftId, pickupAddress, dropoffAddress, fare, customerName, customerPhone } = req.body;
    const stId = stationId || 'durak_merkez';
    const data = db.get();
    const station = data.stations.find(s => s.id === stId);

    const testCall = {
      id: 'call_test_' + Date.now(),
      station_id: stId,
      source: 'test_simulation',
      qr_code: null,
      pickupAddress: pickupAddress || 'Moda Caddesi No:42 (Tarihi Tramvay Durağı)',
      dropoffAddress: dropoffAddress || 'Sabiha Gökçen Havalimanı Dış Hatlar',
      customerPhone: customerPhone || '0532 999 00 11',
      customerName: customerName || 'Caner Test Müşterisi',
      customerNote: '2 adet büyük valiz var, bagaj temiz olsun.',
      lat: station ? station.location.lat : 40.9876,
      lng: station ? station.location.lng : 29.0267,
      status: 'pending',
      stage: 'heading_to_pickup',
      assignedShiftId: null,
      assignedPlate: null,
      assignedDriverName: null,
      createdAt: new Date().toISOString(),
      fare: fare ? parseInt(fare) : 480
    };

    db.update(d => {
      d.calls.push(testCall);
      return d;
    });

    let assigned = null;
    if (shiftId) {
      db.update(d => {
        const call = d.calls.find(c => c.id === testCall.id);
        const shift = d.shifts.find(s => s.id === shiftId);
        if (call && shift) {
          call.status = 'dispatched';
          call.assignedShiftId = shift.id;
          call.assignedPlate = shift.plate;
          call.assignedDriverName = shift.driverName;
          call.dispatchTime = new Date().toISOString();
        }
        return d;
      });

      const updatedCall = db.get().calls.find(c => c.id === testCall.id);
      if (io) {
        io.to(`driver_${shiftId}`).emit('new_call_alert', { call: updatedCall, timeoutSeconds: 30 });
        io.to(`driver_${shiftId}`).emit('new_call_dispatched', updatedCall);
        io.to(`station_${stId}`).emit('call_dispatched', { call: updatedCall, shift: { shift_id: shiftId } });
      }
      assigned = { shift_id: shiftId };
    } else {
      assigned = queueEngine.dispatchCallToFirstInQueue(stId, testCall.id);
    }

    res.json({ success: true, call: testCall, assignedTaxi: assigned });
  });

  // 5. Araçlar (CRUD)
  router.post('/stations/:id/vehicles', (req, res) => {
    const { plate, model, year, totalKm, inspectionDate } = req.body;
    const newVehicle = {
      id: 'v_' + Date.now(),
      station_id: req.params.id,
      plate: (plate || '').toUpperCase().trim(),
      model: model || 'Fiat Egea',
      year: parseInt(year) || 2023,
      color: 'Sarı',
      status: 'active',
      totalKm: parseInt(totalKm) || 50000,
      inspectionDate: inspectionDate || '2027-01-01'
    };

    // Otomatik vardiya/konum bağla (araç eklenince haritada da anında takip edilsin)
    const shift = {
      id: 'sh_' + Date.now(),
      station_id: req.params.id,
      vehicle_id: newVehicle.id,
      driver_id: 'd_1',
      plate: newVehicle.plate,
      driverName: 'Ahmet Yılmaz',
      startTime: new Date().toISOString(),
      status: 'active',
      state: 'in_queue',
      lat: 40.9876 + (Math.random() - 0.5) * 0.003,
      lng: 29.0267 + (Math.random() - 0.5) * 0.003
    };

    db.update(d => {
      d.vehicles.push(newVehicle);
      if (!d.shifts) d.shifts = [];
      d.shifts.push(shift);
      return d;
    });

    // Haritaya anlık yayınla
    io.to(`station_${req.params.id}`).emit('driver_location_update', {
      shiftId: shift.id,
      plate: shift.plate,
      lat: shift.lat,
      lng: shift.lng,
      state: shift.state
    });

    res.json(newVehicle);
  });

  // Araç Düzenleme (PUT)
  router.put('/stations/:id/vehicles/:vehId', (req, res) => {
    const { plate, model, year, totalKm, inspectionDate } = req.body;
    let updatedVehicle = null;
    db.update(d => {
      const v = (d.vehicles || []).find(veh => veh.id === req.params.vehId);
      if (v) {
        if (plate) v.plate = plate.toUpperCase().trim();
        if (model) v.model = model;
        if (year) v.year = parseInt(year);
        if (totalKm) v.totalKm = parseInt(totalKm);
        if (inspectionDate) v.inspectionDate = inspectionDate;
        updatedVehicle = v;

        // İlgili vardiya ve sıradaki plakayı da güncelle
        const shift = (d.shifts || []).find(s => s.vehicle_id === v.id);
        if (shift && plate) shift.plate = v.plate;
        const qItem = (d.queue || []).find(q => q.vehicle_id === v.id);
        if (qItem && plate) qItem.plate = v.plate;
      }
      return d;
    });
    res.json({ success: true, vehicle: updatedVehicle });
  });

  router.delete('/stations/:id/vehicles/:vehId', (req, res) => {
    db.update(d => {
      d.vehicles = (d.vehicles || []).filter(v => v.id !== req.params.vehId);
      d.shifts = (d.shifts || []).filter(s => s.vehicle_id !== req.params.vehId);
      d.queue = (d.queue || []).filter(q => q.vehicle_id !== req.params.vehId);
      return d;
    });
    res.json({ success: true });
  });

  // 5. Şoförler (CRUD)
  router.post('/stations/:id/drivers', (req, res) => {
    const { fullName, phone, licenseNo, plate, password } = req.body;
    const cleanPlate = (plate || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const newDriverId = 'd_' + Date.now();
    const newDriver = {
      id: newDriverId,
      station_id: req.params.id,
      fullName,
      phone,
      plate: cleanPlate,
      password: password || '123',
      licenseNo: licenseNo || 'TR-000000',
      status: 'approved',
      avatar: '👨‍✈️',
      rating: 5.0,
      totalTrips: 0,
      monthlyRevenue: 0
    };

    db.update(d => {
      d.drivers.push(newDriver);

      // Plaka girilmişse araç var mı kontrol et, yoksa oluştur
      if (cleanPlate) {
        let vehicle = (d.vehicles || []).find(v => v.plate === cleanPlate);
        if (!vehicle) {
          vehicle = {
            id: 'v_' + Date.now(),
            station_id: req.params.id,
            plate: cleanPlate,
            model: 'Fiat Egea',
            year: 2023,
            color: 'Sarı',
            status: 'active',
            totalKm: 10000
          };
          if (!d.vehicles) d.vehicles = [];
          d.vehicles.push(vehicle);
        }

        // Aktif vardiya aç
        const station = (d.stations || []).find(s => s.id === req.params.id);
        const shiftId = 'sh_' + Date.now();
        const newShift = {
          id: shiftId,
          station_id: req.params.id,
          vehicle_id: vehicle.id,
          driver_id: newDriverId,
          plate: cleanPlate,
          driverName: fullName,
          startTime: new Date().toISOString(),
          status: 'active',
          state: 'available_outside',
          lat: station && station.location ? station.location.lat : 40.9876,
          lng: station && station.location ? station.location.lng : 29.0267
        };
        if (!d.shifts) d.shifts = [];
        d.shifts.push(newShift);
      }

      return d;
    });
    res.json(newDriver);
  });

  // Şoför Düzenleme (PUT)
  router.put('/stations/:id/drivers/:drvId', (req, res) => {
    const { fullName, phone, licenseNo, rating, plate, password } = req.body;
    let updatedDriver = null;
    db.update(d => {
      const drv = (d.drivers || []).find(dr => dr.id === req.params.drvId);
      if (drv) {
        if (fullName) drv.fullName = fullName;
        if (phone) drv.phone = phone;
        if (licenseNo !== undefined) drv.licenseNo = licenseNo;
        if (rating !== undefined) drv.rating = parseFloat(rating);
        if (plate !== undefined) drv.plate = plate.toUpperCase().replace(/\s+/g, ' ').trim();
        if (password !== undefined) drv.password = String(password).trim();
        updatedDriver = drv;

        // İlgili vardiya ve sıradaki bilgileri de senkronize et
        const shift = (d.shifts || []).find(s => s.driver_id === drv.id);
        if (shift) {
          if (fullName) shift.driverName = fullName;
          if (drv.plate) shift.plate = drv.plate;
        }
        const qItem = (d.queue || []).find(q => q.driver_id === drv.id);
        if (qItem) {
          if (fullName) qItem.driverName = fullName;
          if (drv.plate) qItem.plate = drv.plate;
        }
      }
      return d;
    });
    res.json({ success: true, driver: updatedDriver });
  });

  router.delete('/stations/:id/drivers/:drvId', (req, res) => {
    db.update(d => {
      d.drivers = (d.drivers || []).filter(drv => drv.id !== req.params.drvId);
      d.shifts = (d.shifts || []).filter(s => s.driver_id !== req.params.drvId);
      d.queue = (d.queue || []).filter(q => q.driver_id !== req.params.drvId);
      return d;
    });
    res.json({ success: true });
  });

  // Sürücü POS Plaka & Şifre ile Giriş (Authentication)
  router.post('/drivers/login', (req, res) => {
    const { plate, password } = req.body;
    if (!plate || !password) {
      return res.status(400).json({ error: 'Lütfen plaka ve şifrenizi girin' });
    }

    const cleanPlate = plate.toUpperCase().replace(/\s+/g, ' ').trim();
    const cleanPass = String(password).trim();
    const data = db.get();

    // 1. Plakaya ait şoförü bul
    let driver = (data.drivers || []).find(d => {
      if (d.plate && d.plate.toUpperCase().replace(/\s+/g, ' ').trim() === cleanPlate) return true;
      return false;
    });

    // Bulunamadıysa vardiyalar üzerinden bak
    if (!driver) {
      const shift = (data.shifts || []).find(s => s.plate && s.plate.toUpperCase().replace(/\s+/g, ' ').trim() === cleanPlate);
      if (shift) {
        driver = (data.drivers || []).find(d => d.id === shift.driver_id);
      }
    }

    if (!driver) {
      return res.status(401).json({ error: 'Bu plakaya ait kayıtlı şoför bulunamadı' });
    }

    // 2. Şifre doğrulama (varsayılan: 123)
    const expectedPass = String(driver.password || '123').trim();
    if (cleanPass !== expectedPass) {
      return res.status(401).json({ error: 'Girdiğiniz şifre hatalıdır' });
    }

    // 3. Vardiya kontrolü
    let shift = (data.shifts || []).find(s => s.driver_id === driver.id);
    let vehicle = (data.vehicles || []).find(v => v.plate && v.plate.toUpperCase().replace(/\s+/g, ' ').trim() === cleanPlate);

    if (!shift) {
      const newShiftId = 'sh_' + Date.now();
      const stationId = driver.station_id || 'durak_merkez';
      const station = (data.stations || []).find(s => s.id === stationId);
      const newShift = {
        id: newShiftId,
        station_id: stationId,
        vehicle_id: vehicle ? vehicle.id : ('v_' + Date.now()),
        driver_id: driver.id,
        plate: cleanPlate,
        driverName: driver.fullName,
        startTime: new Date().toISOString(),
        status: 'active',
        state: 'available_outside',
        lat: station && station.location ? station.location.lat : 40.9876,
        lng: station && station.location ? station.location.lng : 29.0267
      };
      db.update(d => {
        if (!d.shifts) d.shifts = [];
        d.shifts.push(newShift);
        return d;
      });
      shift = newShift;
    }

    const station = (data.stations || []).find(s => s.id === (shift.station_id || driver.station_id));

    res.json({
      success: true,
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        plate: cleanPlate,
        avatar: driver.avatar || '👨‍✈️',
        rating: driver.rating || 5.0
      },
      shift: {
        id: shift.id,
        station_id: shift.station_id,
        plate: cleanPlate,
        state: shift.state
      },
      station: station || { id: 'durak_merkez', name: 'Merkez Taksi Durağı' }
    });
  });

  // 6. Sohbet / Mesajlaşma
  router.get('/stations/:id/messages', (req, res) => {
    const data = db.get();
    res.json((data.messages || []).filter(m => m.station_id === req.params.id));
  });

  router.post('/stations/:id/messages', (req, res) => {
    const { senderType, senderName, text } = req.body;
    const newMsg = {
      id: 'msg_' + Date.now(),
      station_id: req.params.id,
      senderType: senderType || 'operator',
      senderName: senderName || 'Durak Operatörü',
      text,
      timestamp: new Date().toISOString()
    };

    db.update(d => {
      if (!d.messages) d.messages = [];
      d.messages.push(newMsg);
      return d;
    });

    // Anlık yayınla
    io.to(`station_${req.params.id}`).emit('new_chat_message', newMsg);
    io.emit('global_chat_message', newMsg);

    res.json(newMsg);
  });

  // 7. Kayıtlı Müşteriler (CRM)
  router.get('/stations/:id/customers', (req, res) => {
    const data = db.get();
    res.json((data.customers || []).filter(c => c.station_id === req.params.id));
  });

  router.post('/stations/:id/customers', (req, res) => {
    const { fullName, phone, street, neighborhood, notes, tag } = req.body;
    const newCust = {
      id: 'cust_' + Date.now(),
      station_id: req.params.id,
      fullName,
      phone,
      street: street || '',
      neighborhood: neighborhood || '',
      totalCalls: 1,
      lastCallAt: new Date().toISOString(),
      tag: tag || 'Kayıtlı Müşteri',
      notes: notes || ''
    };

    db.update(d => {
      if (!d.customers) d.customers = [];
      d.customers.push(newCust);
      return d;
    });
    res.json(newCust);
  });

  // Müşteri Düzenleme (PUT)
  router.put('/stations/:id/customers/:custId', (req, res) => {
    const { fullName, phone, street, neighborhood, notes, tag } = req.body;
    let updatedCustomer = null;
    db.update(d => {
      const c = (d.customers || []).find(cust => cust.id === req.params.custId);
      if (c) {
        if (fullName) c.fullName = fullName;
        if (phone) c.phone = phone;
        if (street !== undefined) c.street = street;
        if (neighborhood !== undefined) c.neighborhood = neighborhood;
        if (notes !== undefined) c.notes = notes;
        if (tag) c.tag = tag;
        updatedCustomer = c;
      }
      return d;
    });
    res.json({ success: true, customer: updatedCustomer });
  });

  router.delete('/stations/:id/customers/:custId', (req, res) => {
    db.update(d => {
      d.customers = (d.customers || []).filter(c => c.id !== req.params.custId);
      return d;
    });
    res.json({ success: true });
  });

  // 8. Duyurular (Anlık Telsiz / Anons)
  router.get('/stations/:id/announcements', (req, res) => {
    const data = db.get();
    res.json((data.announcements || []).filter(a => a.station_id === req.params.id));
  });

  router.post('/stations/:id/announcements', (req, res) => {
    const { title, content, intervalMinutes, durationSeconds } = req.body;
    const newAnn = {
      id: 'ann_' + Date.now(),
      station_id: req.params.id,
      title,
      content,
      intervalMinutes: parseInt(intervalMinutes) || 1,
      durationSeconds: parseInt(durationSeconds) || 5,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    db.update(d => {
      if (!d.announcements) d.announcements = [];
      d.announcements.push(newAnn);
      return d;
    });

    // Tüm şoförlerin ekranına anında anons fırlat!
    io.to(`station_${req.params.id}`).emit('new_announcement_broadcast', newAnn);

    res.json(newAnn);
  });

  router.post('/stations/:id/announcements/:annId/toggle', (req, res) => {
    let updated = null;
    db.update(d => {
      const ann = (d.announcements || []).find(a => a.id === req.params.annId);
      if (ann) {
        ann.isActive = !ann.isActive;
        updated = ann;
      }
      return d;
    });
    res.json({ success: true, announcement: updated });
  });

  router.delete('/stations/:id/announcements/:annId', (req, res) => {
    db.update(d => {
      d.announcements = (d.announcements || []).filter(a => a.id !== req.params.annId);
      return d;
    });
    res.json({ success: true });
  });

  // 9. Durak Ayarları Güncelleme
  router.post('/stations/:id/settings', (req, res) => {
    const { name, phone, address, geofenceRadiusMeters, driverTimeoutSeconds, themeColor, lat, lng } = req.body;
    let station = null;
    db.update(d => {
      station = (d.stations || []).find(s => s.id === req.params.id);
      if (station) {
        if (name) station.name = name;
        if (phone) station.phone = phone;
        if (address) station.address = address;
        if (geofenceRadiusMeters) station.geofenceRadiusMeters = parseInt(geofenceRadiusMeters);
        if (lat && lng) {
          station.location = { lat: parseFloat(lat), lng: parseFloat(lng) };
        }
        if (station.settings) {
          if (driverTimeoutSeconds) station.settings.driverTimeoutSeconds = parseInt(driverTimeoutSeconds);
          if (themeColor) station.settings.themeColor = themeColor;
        }
      }
      return d;
    });

    io.to(`station_${req.params.id}`).emit('settings_updated', station);
    res.json({ success: true, station });
  });

  // Vardiya ve Geofence Durumu Sorgula
  router.get('/drivers/shift/:id', (req, res) => {
    const data = db.get();
    const shift = (data.shifts || []).find(s => s.id === req.params.id);
    if (!shift) return res.status(404).json({ error: 'Vardiya bulunamadi' });
    const station = (data.stations || []).find(st => st.id === shift.station_id);
    let distanceMeters = null;
    let isInsideGeofence = false;
    let radiusMeters = 100;
    if (station && station.location && shift.lat && shift.lng) {
      radiusMeters = station.geofenceRadiusMeters || 100;
      distanceMeters = Math.round(queueEngine.getDistanceInMeters(shift.lat, shift.lng, station.location.lat, station.location.lng));
      isInsideGeofence = distanceMeters <= radiusMeters;
    }
    res.json({
      shift,
      station,
      geofence: {
        isInsideGeofence,
        distanceMeters,
        radiusMeters,
        stationName: station ? station.name : ''
      }
    });
  });

  // Konum Güncellemesi & Geofence Otomasyonu
  router.post('/drivers/location', (req, res) => {
    const { shiftId, lat, lng } = req.body;
    if (!shiftId || !lat || !lng) {
      return res.status(400).json({ error: 'Eksik parametre' });
    }

    const initialData = db.get();
    const currentShift = (initialData.shifts || []).find(s => s.id === shiftId);
    if (currentShift && currentShift.isTestSimulated) {
      return res.json({ success: true, isTestSimulated: true, message: 'Test modunda gerçek GPS yoksayıldı' });
    }

    const geofenceResult = queueEngine.processDriverLocation(shiftId, parseFloat(lat), parseFloat(lng));
    const data = db.get();
    const updatedShift = (data.shifts || []).find(s => s.id === shiftId);

    if (updatedShift) {
      io.to(`station_${updatedShift.station_id}`).emit('driver_location_update', {
        shiftId: updatedShift.id,
        plate: updatedShift.plate,
        lat: updatedShift.lat,
        lng: updatedShift.lng,
        state: updatedShift.state,
        distanceMeters: geofenceResult ? geofenceResult.distanceMeters : null,
        isInsideGeofence: geofenceResult ? geofenceResult.isInsideGeofence : false
      });

      if (geofenceResult) {
        io.to(`driver_${updatedShift.id}`).emit('geofence_status', {
          isInsideGeofence: geofenceResult.isInsideGeofence,
          distanceMeters: geofenceResult.distanceMeters,
          radiusMeters: geofenceResult.radiusMeters,
          stationName: geofenceResult.stationName,
          event: geofenceResult.event
        });
      }
    }

    res.json({
      success: true,
      geofence: geofenceResult || null
    });
  });


  return router;
};
