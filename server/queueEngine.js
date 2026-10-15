const db = require('../data/store');

class QueueEngine {
  constructor(io) {
    this.io = io;
    this.pendingTimers = new Map(); // callId -> timeout reference
  }

  // Haversine formülü ile iki koordinat arası metre mesafesini hesapla
  getDistanceInMeters(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 99999999;
    const R = 6371e3; // Metre
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Şoförün konumunu kontrol et: Durak çemberinde değilse sıradan çıkar, girdiyse sıraya al
  processDriverLocation(shiftId, lat, lng) {
    const data = db.get();
    const shift = (data.shifts || []).find(s => s.id === shiftId);
    if (!shift) return null;

    const station = (data.stations || []).find(st => st.id === shift.station_id);
    if (!station || !station.location) return null;

    const stationRadius = station.geofenceRadiusMeters || 100;
    const distanceMeters = Math.round(this.getDistanceInMeters(lat, lng, station.location.lat, station.location.lng));
    const isInside = distanceMeters <= stationRadius;
    const isInQueue = (data.queue || []).some(q => q.shift_id === shift.id);

    let event = null; // 'entered' | 'exited' | null

    if (isInside && !isInQueue && shift.state !== 'in_trip') {
      // Durak çemberine girdi -> Otomatik sıranın sonuna ekle
      this.addToQueue(station.id, shift.id);
      event = 'entered';
    } else if (!isInside && isInQueue && shift.state !== 'in_trip') {
      // Durak çemberinden çıktı -> Otomatik sıradan çıkar
      this.removeFromQueue(station.id, shift.id, 'available_outside');
      event = 'exited';
    }

    db.update(d => {
      const sh = (d.shifts || []).find(s => s.id === shiftId);
      if (sh) {
        sh.lat = parseFloat(lat);
        sh.lng = parseFloat(lng);
        sh.distanceMeters = distanceMeters;
        sh.isInsideGeofence = isInside;
        if (isInside && sh.state !== 'in_trip') {
          sh.state = 'in_queue';
        } else if (!isInside && sh.state !== 'in_trip') {
          sh.state = 'available_outside';
        }
      }
      return d;
    });

    return {
      shiftId: shift.id,
      plate: shift.plate,
      driverName: shift.driverName,
      stationId: station.id,
      stationName: station.name,
      distanceMeters,
      radiusMeters: stationRadius,
      isInsideGeofence: isInside,
      event
    };
  }

  // Durak Geofence kurallarını mevcut tüm araçlara uygula (dışarıda olanları sıradan temizle)
  enforceGeofenceRules(stationId) {
    const data = db.get();
    const station = (data.stations || []).find(st => st.id === stationId);
    if (!station || !station.location) return;

    const stationRadius = station.geofenceRadiusMeters || 100;
    const stationShifts = (data.shifts || []).filter(s => s.station_id === stationId);

    let changed = false;
    for (const shift of stationShifts) {
      if (shift.lat && shift.lng) {
        const dist = Math.round(this.getDistanceInMeters(shift.lat, shift.lng, station.location.lat, station.location.lng));
        const isInside = dist <= stationRadius;
        const inQueue = (data.queue || []).some(q => q.shift_id === shift.id);

        if (!isInside && inQueue && shift.state !== 'in_trip') {
          this.removeFromQueue(stationId, shift.id, 'available_outside');
          changed = true;
        } else if (isInside && !inQueue && shift.state !== 'in_trip') {
          this.addToQueue(stationId, shift.id);
          changed = true;
        }
      }
    }

    if (changed) {
      this.reindexQueue(stationId);
    }
  }

  // Belirli bir durağın anlık sırasını getir (sadece Geofence içindekiler)
  getQueue(stationId) {
    this.enforceGeofenceRules(stationId);
    const data = db.get();
    return (data.queue || [])
      .filter(item => {
        const shift = (data.shifts || []).find(s => s.id === item.shift_id);
        return shift && shift.station_id === stationId;
      })
      .sort((a, b) => a.queueOrder - b.queueOrder);
  }

  // Sırayı yeniden numaralandır (1, 2, 3...)
  reindexQueue(stationId) {
    db.update(data => {
      const stationQueue = (data.queue || []).filter(item => {
        const shift = data.shifts.find(s => s.id === item.shift_id);
        return shift && shift.station_id === stationId;
      });
      
      const otherQueue = (data.queue || []).filter(item => {
        const shift = data.shifts.find(s => s.id === item.shift_id);
        return !shift || shift.station_id !== stationId;
      });

      stationQueue.sort((a, b) => a.queueOrder - b.queueOrder);
      stationQueue.forEach((item, index) => {
        item.queueOrder = index + 1;
      });

      data.queue = [...otherQueue, ...stationQueue];
      return data;
    });

    this.broadcastQueueUpdate(stationId);
  }

  // Aracı durağın sırasına ekle
  addToQueue(stationId, shiftId) {
    let alreadyInQueue = false;
    db.update(data => {
      const exists = (data.queue || []).some(q => q.shift_id === shiftId);
      if (exists) {
        alreadyInQueue = true;
        return data;
      }

      const shift = data.shifts.find(s => s.id === shiftId);
      if (!shift) return data;

      const stationQueue = (data.queue || []).filter(item => {
        const s = data.shifts.find(sh => sh.id === item.shift_id);
        return s && s.station_id === stationId;
      });

      const nextOrder = stationQueue.length + 1;

      data.queue.push({
        queueOrder: nextOrder,
        shift_id: shiftId,
        vehicle_id: shift.vehicle_id,
        driver_id: shift.driver_id,
        plate: shift.plate,
        driverName: shift.driverName,
        enteredAt: new Date().toISOString()
      });

      shift.state = 'in_queue';
      return data;
    });

    if (!alreadyInQueue) {
      this.reindexQueue(stationId);
    }
  }

  // Sıradan çıkar (İşe gittiğinde veya durak dışına çıktığında)
  removeFromQueue(stationId, shiftId, newState = 'available_outside') {
    db.update(data => {
      data.queue = (data.queue || []).filter(q => q.shift_id !== shiftId);
      const shift = data.shifts.find(s => s.id === shiftId);
      if (shift && shift.state === 'in_queue') {
        shift.state = newState;
      }
      return data;
    });

    this.reindexQueue(stationId);
  }

  // Operatör Manuel Sıra Değiştirme (Yukarı veya Aşağı taşıma)
  moveQueueItem(stationId, shiftId, direction) { // direction: 'up' | 'down'
    db.update(data => {
      const stationQueue = (data.queue || []).filter(item => {
        const s = data.shifts.find(sh => sh.id === item.shift_id);
        return s && s.station_id === stationId;
      }).sort((a, b) => a.queueOrder - b.queueOrder);

      const currentIndex = stationQueue.findIndex(q => q.shift_id === shiftId);
      if (currentIndex === -1) return data;

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= stationQueue.length) return data;

      // Yer değiştir
      const temp = stationQueue[currentIndex].queueOrder;
      stationQueue[currentIndex].queueOrder = stationQueue[targetIndex].queueOrder;
      stationQueue[targetIndex].queueOrder = temp;

      return data;
    });

    this.reindexQueue(stationId);
  }

  // 1. Sıradaki aracı bul ve işi ata
  dispatchCallToFirstInQueue(stationId, callId) {
    const queue = this.getQueue(stationId);
    if (!queue || queue.length === 0) {
      // Sırada araç yok
      db.update(data => {
        const call = data.calls.find(c => c.id === callId);
        if (call) {
          call.status = 'no_vehicle_available';
        }
        return data;
      });
      if (this.io) {
        this.io.to(`station_${stationId}`).emit('call_status_update', { callId, status: 'no_vehicle_available' });
        this.io.to(`call_${callId}`).emit('call_status_update', { callId, status: 'no_vehicle_available' });
      }
      return null;
    }

    const firstTaxi = queue[0];

    db.update(data => {
      const call = data.calls.find(c => c.id === callId);
      if (call) {
        call.status = 'dispatched';
        call.assignedShiftId = firstTaxi.shift_id;
        call.assignedPlate = firstTaxi.plate;
        call.assignedDriverName = firstTaxi.driverName;
        call.dispatchTime = new Date().toISOString();
      }
      return data;
    });

    // POS / Sürücüye ve Durak Paneline anlık alarm gönder
    if (this.io) {
      const data = db.get();
      const currentCall = data.calls.find(c => c.id === callId);
      
      this.io.to(`driver_${firstTaxi.shift_id}`).emit('new_call_alert', {
        call: currentCall,
        timeoutSeconds: 30
      });

      this.io.to(`driver_${firstTaxi.shift_id}`).emit('new_call_dispatched', currentCall);

      this.io.to(`station_${stationId}`).emit('call_dispatched', {
        call: currentCall,
        shift: firstTaxi
      });

      this.io.to(`call_${callId}`).emit('call_status_update', {
        callId,
        status: 'dispatched',
        assignedPlate: firstTaxi.plate,
        assignedDriverName: firstTaxi.driverName
      });
    }

    // 30 saniye süre sayacı (Cevap vermezse sıranın sonuna atılır, iş sonraki araca aktarılır)
    if (this.pendingTimers.has(callId)) {
      clearTimeout(this.pendingTimers.get(callId));
    }

    const timer = setTimeout(() => {
      this.handleDriverTimeout(stationId, callId, firstTaxi.shift_id);
    }, 30000);

    this.pendingTimers.set(callId, timer);
    return firstTaxi;
  }

  // Sürücü zaman aşımı (30 sn cevap vermedi - Ceza olarak son sıraya at & sonraki araca devret)
  handleDriverTimeout(stationId, callId, shiftId) {
    this.pendingTimers.delete(callId);

    // Sürücüyü sıranın en sonuna at & performans sayacını güncelle
    db.update(data => {
      const queueItem = (data.queue || []).find(q => q.shift_id === shiftId);
      if (queueItem) {
        queueItem.queueOrder = 9999; // En sona taşı
      }
      const shift = (data.shifts || []).find(s => s.id === shiftId);
      if (shift) {
        const drv = (data.drivers || []).find(d => d.id === shift.driver_id);
        if (drv) {
          drv.rejectedCalls = (drv.rejectedCalls || 0) + 1;
        }
      }
      return data;
    });

    this.reindexQueue(stationId);

    if (this.io) {
      this.io.to(`driver_${shiftId}`).emit('call_timed_out', {
        callId,
        message: '⏱️ 30 saniye içinde yanıt vermediğiniz için çağrı sıradaki araca aktarıldı ve sıranın sonuna alındınız.'
      });
    }

    // Sıradaki sonraki araca işi devret
    this.dispatchCallToFirstInQueue(stationId, callId);
  }

  // Sürücü İşi Kabul Etti
  acceptCall(stationId, callId, shiftId) {
    if (this.pendingTimers.has(callId)) {
      clearTimeout(this.pendingTimers.get(callId));
      this.pendingTimers.delete(callId);
    }

    // Sıradan düşür (Yolculuk başladı)
    this.removeFromQueue(stationId, shiftId, 'in_trip');

    db.update(data => {
      const call = data.calls.find(c => c.id === callId);
      if (call) {
        call.status = 'accepted';
        call.stage = 'heading_to_pickup';
        call.acceptedAt = new Date().toISOString();
        if (shiftId) {
          call.assignedShiftId = shiftId;
        }
      }
      const shift = (data.shifts || []).find(s => s.id === shiftId);
      if (shift) {
        if (call) {
          call.assignedPlate = shift.plate;
          call.assignedDriverName = shift.driverName;
        }
        const drv = (data.drivers || []).find(d => d.id === shift.driver_id);
        if (drv) {
          drv.acceptedCalls = (drv.acceptedCalls || 0) + 1;
        }
      }
      return data;
    });

    if (this.io) {
      const data = db.get();
      const currentCall = data.calls.find(c => c.id === callId);
      this.io.to(`station_${stationId}`).emit('call_accepted', currentCall);
      this.io.to(`driver_${shiftId}`).emit('call_accepted_details', currentCall);
      this.io.to(`call_${callId}`).emit('call_status_update', {
        callId,
        status: 'accepted',
        assignedPlate: currentCall.assignedPlate,
        assignedDriverName: currentCall.assignedDriverName,
        message: 'Taksi kabul etti, yola çıkıyor!'
      });
    }
  }

  // Sürücü İşi Reddetti (Ceza kuralı: son sıraya at & sonraki araca devret)
  rejectCall(stationId, callId, shiftId) {
    if (this.pendingTimers.has(callId)) {
      clearTimeout(this.pendingTimers.get(callId));
      this.pendingTimers.delete(callId);
    }

    // Sürücüyü sıranın sonuna at
    db.update(data => {
      const queueItem = (data.queue || []).find(q => q.shift_id === shiftId);
      if (queueItem) {
        queueItem.queueOrder = 9999;
      }
      const shift = (data.shifts || []).find(s => s.id === shiftId);
      if (shift) {
        const drv = (data.drivers || []).find(d => d.id === shift.driver_id);
        if (drv) {
          drv.rejectedCalls = (drv.rejectedCalls || 0) + 1;
        }
      }
      return data;
    });

    this.reindexQueue(stationId);

    if (this.io) {
      this.io.to(`driver_${shiftId}`).emit('call_rejected_confirm', {
        callId,
        message: '❌ Çağrıyı reddettiniz. Sıranın sonuna alındınız.'
      });
    }

    // Sonraki araca devret
    this.dispatchCallToFirstInQueue(stationId, callId);
  }

  // Tüm abonelere sıra güncellemesini yayınla
  broadcastQueueUpdate(stationId) {
    if (!this.io) return;
    const currentQueue = this.getQueue(stationId);
    this.io.to(`station_${stationId}`).emit('queue_updated', currentQueue);
  }
}

module.exports = QueueEngine;
