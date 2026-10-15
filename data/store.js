const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');

// Varsayılan zengin veri modeli
const defaultData = {
  stations: [
    {
      id: "durak_merkez",
      name: "Merkez Taksi Durağı",
      city: "İstanbul",
      district: "Kadıköy",
      address: "Moda Caddesi No:45 Kadıköy/İstanbul",
      phone: "0216 345 67 89",
      location: { lat: 40.9876, lng: 29.0267 },
      geofenceRadiusMeters: 100,
      settings: {
        driverTimeoutSeconds: 30,
        autoQueueOnEnter: true,
        allowOperatorManualReorder: true,
        themeColor: "amber", // amber | emerald | blue | purple | cyan
        nightMode: true,
        notificationSound: true
      },
      createdAt: new Date().toISOString()
    }
  ],
  vehicles: [
    { id: "v_1", station_id: "durak_merkez", plate: "34 TKS 01", model: "Fiat Egea", year: 2023, color: "Sarı", status: "active", totalKm: 84520, inspectionDate: "2027-04-15" },
    { id: "v_2", station_id: "durak_merkez", plate: "34 TKS 02", model: "Renault Megane", year: 2024, color: "Sarı", status: "active", totalKm: 42100, inspectionDate: "2027-09-20" },
    { id: "v_3", station_id: "durak_merkez", plate: "34 TKS 03", model: "Toyota Corolla", year: 2022, color: "Sarı", status: "active", totalKm: 112000, inspectionDate: "2026-11-05" },
    { id: "v_4", station_id: "durak_merkez", plate: "34 TKS 04", model: "Fiat Egea", year: 2023, color: "Sarı", status: "active", totalKm: 67300, inspectionDate: "2027-01-10" }
  ],
  drivers: [
    { id: "d_1", station_id: "durak_merkez", fullName: "Ahmet Yılmaz", phone: "0532 111 22 33", plate: "34 TKS 01", password: "123", licenseNo: "TR-894120", status: "approved", avatar: "👨‍✈️", rating: 4.9, totalTrips: 184, monthlyRevenue: 34500 },
    { id: "d_2", station_id: "durak_merkez", fullName: "Mehmet Demir", phone: "0533 222 33 44", plate: "34 TKS 02", password: "123", licenseNo: "TR-771239", status: "approved", avatar: "👨‍✈️", rating: 4.8, totalTrips: 156, monthlyRevenue: 28900 },
    { id: "d_3", station_id: "durak_merkez", fullName: "Ali Kaya", phone: "0535 333 44 55", plate: "34 TKS 03", password: "123", licenseNo: "TR-554190", status: "approved", avatar: "👨‍✈️", rating: 4.7, totalTrips: 142, monthlyRevenue: 26400 },
    { id: "d_4", station_id: "durak_merkez", fullName: "Burak Çelik", phone: "0542 444 55 66", plate: "34 TKS 04", password: "123", licenseNo: "TR-998231", status: "approved", avatar: "👨‍✈️", rating: 5.0, totalTrips: 210, monthlyRevenue: 41200 }
  ],
  shifts: [
    { id: "sh_1", station_id: "durak_merkez", vehicle_id: "v_1", driver_id: "d_1", plate: "34 TKS 01", driverName: "Ahmet Yılmaz", startTime: new Date().toISOString(), status: "active", state: "in_queue", lat: 40.9876, lng: 29.0267 },
    { id: "sh_2", station_id: "durak_merkez", vehicle_id: "v_2", driver_id: "d_2", plate: "34 TKS 02", driverName: "Mehmet Demir", startTime: new Date().toISOString(), status: "active", state: "in_queue", lat: 40.9875, lng: 29.0268 },
    { id: "sh_3", station_id: "durak_merkez", vehicle_id: "v_3", driver_id: "d_3", plate: "34 TKS 03", driverName: "Ali Kaya", startTime: new Date().toISOString(), status: "active", state: "in_queue", lat: 40.9877, lng: 29.0266 },
    { id: "sh_4", station_id: "durak_merkez", vehicle_id: "v_4", driver_id: "d_4", plate: "34 TKS 04", driverName: "Burak Çelik", startTime: new Date().toISOString(), status: "active", state: "available_outside", lat: 40.9910, lng: 29.0310 }
  ],
  queue: [
    { queueOrder: 1, shift_id: "sh_1", vehicle_id: "v_1", driver_id: "d_1", plate: "34 TKS 01", driverName: "Ahmet Yılmaz", enteredAt: new Date(Date.now() - 3600000).toISOString() },
    { queueOrder: 2, shift_id: "sh_2", vehicle_id: "v_2", driver_id: "d_2", plate: "34 TKS 02", driverName: "Mehmet Demir", enteredAt: new Date(Date.now() - 2400000).toISOString() },
    { queueOrder: 3, shift_id: "sh_3", vehicle_id: "v_3", driver_id: "d_3", plate: "34 TKS 03", driverName: "Ali Kaya", enteredAt: new Date(Date.now() - 1200000).toISOString() }
  ],
  qrPoints: [
    {
      id: "qr_1",
      code: "KR-101",
      station_id: "durak_merkez",
      title: "Karanfil Sokak No:12",
      neighborhood: "Caferağa Mah.",
      landmark: "Köşem Kafe Karşısı",
      notes: "Sokak aydınlatma direğinde",
      lat: 40.9855,
      lng: 29.0290,
      totalScans: 64,
      successfulCalls: 51,
      lastScannedAt: new Date(Date.now() - 15 * 60000).toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: "qr_2",
      code: "MD-204",
      station_id: "durak_merkez",
      title: "Moda Caddesi Meydan",
      neighborhood: "Moda Mah.",
      landmark: "Tarihi Tramvay Durağı",
      notes: "Meydan panosuna asıldı",
      lat: 40.9830,
      lng: 29.0250,
      totalScans: 112,
      successfulCalls: 89,
      lastScannedAt: new Date(Date.now() - 40 * 60000).toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: "qr_3",
      code: "HS-305",
      station_id: "durak_merkez",
      title: "Kadıköy Acil Önü",
      neighborhood: "Osmanağa Mah.",
      landmark: "Acil Poliklinik Çıkışı",
      notes: "Hastane güvenlik kulübesi yanı",
      lat: 40.9915,
      lng: 29.0285,
      totalScans: 158,
      successfulCalls: 139,
      lastScannedAt: new Date(Date.now() - 5 * 60000).toISOString(),
      createdAt: new Date().toISOString()
    }
  ],
  calls: [
    {
      id: "call_101",
      station_id: "durak_merkez",
      source: "qr",
      qr_code: "HS-305",
      pickupAddress: "Kadıköy Acil Önü (Acil Poliklinik Çıkışı)",
      customerPhone: "0532 999 88 77",
      customerName: "Ayşe Hanım",
      customerNote: "Tekerlekli sandalye var",
      lat: 40.9915,
      lng: 29.0285,
      status: "completed",
      assignedShiftId: "sh_4",
      assignedPlate: "34 TKS 04",
      assignedDriverName: "Burak Çelik",
      createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 20 * 60000).toISOString(),
      fare: 245
    },
    {
      id: "call_102",
      station_id: "durak_merkez",
      source: "phone",
      qr_code: null,
      pickupAddress: "Moda Cad. No:82 (Eczane önü)",
      customerPhone: "0533 444 55 66",
      customerName: "Caner Bey",
      customerNote: "Sabiha Gökçen Havalimanı yönü",
      lat: 40.9840,
      lng: 29.0260,
      status: "completed",
      assignedShiftId: "sh_1",
      assignedPlate: "34 TKS 01",
      assignedDriverName: "Ahmet Yılmaz",
      createdAt: new Date(Date.now() - 110 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 70 * 60000).toISOString(),
      fare: 680
    },
    {
      id: "call_103",
      station_id: "durak_merkez",
      source: "qr",
      qr_code: "KR-101",
      pickupAddress: "Karanfil Sokak No:12 (Köşem Kafe)",
      customerPhone: "0544 555 66 77",
      customerName: "Zeynep Hanım",
      customerNote: "Kapı önündeyim",
      lat: 40.9855,
      lng: 29.0290,
      status: "completed",
      assignedShiftId: "sh_2",
      assignedPlate: "34 TKS 02",
      assignedDriverName: "Mehmet Demir",
      createdAt: new Date(Date.now() - 180 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 150 * 60000).toISOString(),
      fare: 190
    }
  ],
  // 7. Menü: Kayıtlı Müşteriler (CRM & Rehber)
  customers: [
    {
      id: "cust_1",
      station_id: "durak_merkez",
      fullName: "Serkan Yılmaz",
      phone: "0532 555 44 33",
      street: "Karanfil Sokak No:14 D:5",
      neighborhood: "Caferağa Mah.",
      totalCalls: 34,
      lastCallAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      tag: "VIP Müşteri",
      notes: "Sabah 08:30 düzenli işe gidiş"
    },
    {
      id: "cust_2",
      station_id: "durak_merkez",
      fullName: "Fatma Güneş",
      phone: "0533 111 99 88",
      street: "Moda Caddesi No:90",
      neighborhood: "Moda Mah.",
      totalCalls: 19,
      lastCallAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      tag: "Düzenli",
      notes: "Kedisi var, kutuda biner"
    },
    {
      id: "cust_3",
      station_id: "durak_merkez",
      fullName: "Hakan Öztürk (Avukat)",
      phone: "0542 333 22 11",
      street: "Bahariye Cad. No:28",
      neighborhood: "Osmanağa Mah.",
      totalCalls: 48,
      lastCallAt: new Date(Date.now() - 12 * 3600000).toISOString(),
      tag: "VIP Müşteri",
      notes: "Fiş ister, havalimanı sık yolcu"
    }
  ],
  // 8. Menü: Duyurular (Taksilere Anlık Anons)
  announcements: [
    {
      id: "ann_1",
      station_id: "durak_merkez",
      title: "Hava Durumu Uyarısı",
      content: "Bölgede şiddetli yağış başladı. Güzergahlarda takip mesafesini koruyalım, merkez durak önünde tıkanıklık yapmayalım.",
      intervalMinutes: 1, // 1 dakikada bir tekrarlasın
      durationSeconds: 5, // 5 saniye görünsün
      isActive: true,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString()
    },
    {
      id: "ann_2",
      station_id: "durak_merkez",
      title: "Haftalık Durak Toplantısı",
      content: "Pazartesi günü saat 10:00'da durak çay ocağında genel toplantı yapılacaktır.",
      intervalMinutes: 5,
      durationSeconds: 5,
      isActive: false,
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString()
    }
  ],
  // 6. Menü: Sohbet & Mesajlaşma
  messages: [
    {
      id: "msg_1",
      station_id: "durak_merkez",
      senderType: "driver", // driver | operator | customer
      senderName: "Ahmet Yılmaz (34 TKS 01)",
      text: "Reis, Kadıköy rıhtımda yoğun trafik var, dönüş biraz uzayabilir.",
      timestamp: new Date(Date.now() - 15 * 60000).toISOString()
    },
    {
      id: "msg_2",
      station_id: "durak_merkez",
      senderType: "operator",
      senderName: "Durak Operatörü",
      text: "Tamam Ahmet abi, sıranı koruyoruz, dikkatli gel.",
      timestamp: new Date(Date.now() - 12 * 60000).toISOString()
    }
  ]
};

function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    
    // Eksik alanları varsayılanla tamamla (geriye dönük uyumluluk)
    let dirty = false;
    ['customers', 'announcements', 'messages'].forEach(k => {
      if (!parsed[k]) {
        parsed[k] = defaultData[k];
        dirty = true;
      }
    });
    if (!parsed.stations[0].settings.themeColor) {
      parsed.stations[0].settings.themeColor = "amber";
      dirty = true;
    }
    if (dirty) {
      fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    }
    return parsed;
  } catch (err) {
    console.error("DB Okuma Hatası:", err);
    return defaultData;
  }
}

function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("DB Yazma Hatası:", err);
  }
}

const db = {
  get: () => loadDb(),
  update: (modifierFn) => {
    const current = loadDb();
    const updated = modifierFn(current);
    saveDb(updated || current);
    return updated || current;
  }
};

module.exports = db;
