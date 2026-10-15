const CURRENT_STATION_ID = 'durak_merkez';
const socket = io();

let map = null;
let taxiMarkers = {};
let stationCircle = null;
let cachedVehicles = [];
let cachedDrivers = [];
let cachedCustomers = [];
let cachedQRPoints = [];
let cachedCalls = [];

// Sayfa Başlığı Bilgileri
const tabMeta = {
  'tab-pano': { title: 'Pano (Genel Bakış)', desc: 'Durağın anlık cirosu, canlı sıralaması ve son iş emirleri' },
  'tab-sira': { title: '2. Sıra Yönetimi', desc: 'Durak içi adil sıra kuyruğu, manuel sıra değiştirme ve ceza/mola yönetimi' },
  'tab-isemirleri': { title: '3. İş Emirleri', desc: 'Sokak QR kodlarından ve telefonla gelen tüm aktif/tamamlanan çağrılar' },
  'tab-harita': { title: '4. Canlı Harita & GPS', desc: 'Tüm taksilerin anlık GPS konumları, Geofence çemberi ve QR noktaları' },
  'tab-araclar': { title: '5. Araçlar & Şoförler', desc: 'Durak filosu, araç km/muayene takibi ve şoför sefer performansları' },
  'tab-sohbet': { title: '6. Sohbet & Telsiz', desc: 'Durak operatörü ile taksiler arasında anlık çift yönlü mesajlaşma' },
  'tab-musteriler': { title: '7. Kayıtlı Müşteriler', desc: 'Müşteri rehberi, VIP yolcular, sokak adresleri ve çağrı geçmişi' },
  'tab-duyurular': { title: '8. Duyurular & Anons', desc: 'Taksilerin ekranlarında belirlenen aralıklarla otomatik çıkan duyurular' },
  'tab-ayarlar': { title: '9. Durak Ayarları', desc: 'Panel görünüm rengi, durak iletişim bilgileri ve otomasyon süreleri' },
  'tab-qrnoktalari': { title: '10. Sokak QR Noktaları & Taramalar', desc: 'Saha QR kodları, okutma sayıları, yönlendirilen taksiler ve anlık önizleme' }
};

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSocket();
  fetchStationData();

  // Telefon İşi Formu
  document.getElementById('phoneCallForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      stationId: CURRENT_STATION_ID,
      pickupAddress: document.getElementById('pcAddress').value,
      dropoffAddress: document.getElementById('pcDropoffAddress') ? document.getElementById('pcDropoffAddress').value : '',
      customerPhone: document.getElementById('pcPhone').value,
      customerName: document.getElementById('pcName').value,
      notes: document.getElementById('pcNotes').value
    };

    try {
      const res = await fetch('/api/calls/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        closeModal('phoneModal');
        document.getElementById('phoneCallForm').reset();
        alert(`✅ Telefon işi kaydedildi! Sıradaki araç: ${data.assignedTaxi ? data.assignedTaxi.plate : 'Sırada araç yok'}`);
        fetchStationData();
      }
    } catch (err) {
      alert('İş kaydedilemedi');
    }
  });

  // Yeni QR Formu
  document.getElementById('newQRForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: document.getElementById('qrTitle').value,
      neighborhood: document.getElementById('qrNeighborhood').value,
      landmark: document.getElementById('qrLandmark').value
    };

    try {
      const res = await fetch(`/api/stations/${CURRENT_STATION_ID}/qr-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.id) {
        closeModal('newQRModal');
        document.getElementById('newQRForm').reset();
        fetchStationData();
        window.open(`/api/stations/${CURRENT_STATION_ID}/qr-points/${data.id}/print`, '_blank');
      }
    } catch (err) {
      alert('QR oluşturulamadı');
    }
  });

  // Yeni Araç Formu
  document.getElementById('newVehicleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      plate: document.getElementById('vehPlate').value,
      model: document.getElementById('vehModel').value,
      totalKm: document.getElementById('vehKm').value
    };

    try {
      await fetch(`/api/stations/${CURRENT_STATION_ID}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      closeModal('newVehicleModal');
      document.getElementById('newVehicleForm').reset();
      fetchStationData();
    } catch (err) { alert('Araç eklenemedi'); }
  });

  // Yeni Şoför Formu
  document.getElementById('newDriverForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      fullName: document.getElementById('drvName').value,
      phone: document.getElementById('drvPhone').value,
      plate: document.getElementById('drvPlate').value,
      password: document.getElementById('drvPassword').value,
      licenseNo: document.getElementById('drvLicense').value
    };

    try {
      await fetch(`/api/stations/${CURRENT_STATION_ID}/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      closeModal('newDriverModal');
      document.getElementById('newDriverForm').reset();
      fetchStationData();
    } catch (err) { alert('Şoför eklenemedi'); }
  });

  // Yeni Müşteri Formu
  document.getElementById('newCustomerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      fullName: document.getElementById('custName').value,
      phone: document.getElementById('custPhone').value,
      street: document.getElementById('custStreet').value,
      tag: document.getElementById('custTag').value
    };

    try {
      await fetch(`/api/stations/${CURRENT_STATION_ID}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      closeModal('newCustomerModal');
      document.getElementById('newCustomerForm').reset();
      fetchStationData();
    } catch (err) { alert('Müşteri eklenemedi'); }
  });

  // Yeni Duyuru Formu
  document.getElementById('newAnnouncementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: document.getElementById('annTitle').value,
      content: document.getElementById('annContent').value,
      intervalMinutes: document.getElementById('annInterval').value,
      durationSeconds: document.getElementById('annDuration').value
    };

    try {
      await fetch(`/api/stations/${CURRENT_STATION_ID}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      closeModal('newAnnouncementModal');
      document.getElementById('newAnnouncementForm').reset();
      fetchStationData();
      alert('📢 Duyuru taksilere yayına alındı!');
    } catch (err) { alert('Duyuru eklenemedi'); }
  });

  // Sohbet Gönderme
  document.getElementById('chatSendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chatTextInput');
    const text = input.value.trim();
    if (!text) return;

    try {
      await fetch(`/api/stations/${CURRENT_STATION_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderType: 'operator', senderName: 'Durak Operatörü', text })
      });
      input.value = '';
    } catch (err) {}
  });

  // Ayarlar Formu
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const themeColor = document.querySelector('input[name="themeColor"]:checked').value;
    const lat = parseFloat(document.getElementById('setStationLat').value) || currentStationLocation.lat;
    const lng = parseFloat(document.getElementById('setStationLng').value) || currentStationLocation.lng;
    const body = {
      name: document.getElementById('setStationName').value,
      phone: document.getElementById('setStationPhone').value,
      address: document.getElementById('setStationAddress').value,
      geofenceRadiusMeters: document.getElementById('setGeofenceRadius').value,
      driverTimeoutSeconds: document.getElementById('setTimeoutSeconds').value,
      themeColor,
      lat,
      lng
    };

    try {
      const res = await fetch(`/api/stations/${CURRENT_STATION_ID}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        document.body.setAttribute('data-theme', themeColor);
        currentStationLocation = { lat, lng };
        if (map) {
          map.setView([lat, lng], 15);
          if (stationCircle) stationCircle.setLatLng([lat, lng]);
        }
        alert('✅ Durak ayarları, koordinatları ve tema rengi güncellendi!');
        fetchStationData();
      }
    } catch (err) { alert('Ayarlar kaydedilemedi'); }
  });

  // Araç Düzenleme Formu
  const editVehForm = document.getElementById('editVehicleForm');
  if (editVehForm) {
    editVehForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editVehId').value;
      const body = {
        plate: document.getElementById('editVehPlate').value,
        model: document.getElementById('editVehModel').value,
        totalKm: document.getElementById('editVehKm').value,
        inspectionDate: document.getElementById('editVehInspection').value
      };
      try {
        await fetch(`/api/stations/${CURRENT_STATION_ID}/vehicles/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        closeModal('editVehicleModal');
        fetchStationData();
        alert('✅ Araç bilgileri başarıyla güncellendi!');
      } catch (err) { alert('Araç güncellenemedi'); }
    });
  }

  // Şoför Düzenleme Formu
  const editDrvForm = document.getElementById('editDriverForm');
  if (editDrvForm) {
    editDrvForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editDrvId').value;
      const body = {
        fullName: document.getElementById('editDrvName').value,
        phone: document.getElementById('editDrvPhone').value,
        plate: document.getElementById('editDrvPlate').value,
        password: document.getElementById('editDrvPassword').value,
        licenseNo: document.getElementById('editDrvLicense').value,
        rating: document.getElementById('editDrvRating').value
      };
      try {
        await fetch(`/api/stations/${CURRENT_STATION_ID}/drivers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        closeModal('editDriverModal');
        fetchStationData();
        alert('✅ Şoför bilgileri başarıyla güncellendi!');
      } catch (err) { alert('Şoför güncellenemedi'); }
    });
  }

  // Müşteri Düzenleme Formu
  const editCustForm = document.getElementById('editCustomerForm');
  if (editCustForm) {
    editCustForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editCustId').value;
      const body = {
        fullName: document.getElementById('editCustName').value,
        phone: document.getElementById('editCustPhone').value,
        street: document.getElementById('editCustStreet').value,
        tag: document.getElementById('editCustTag').value,
        notes: document.getElementById('editCustNotes').value
      };
      try {
        await fetch(`/api/stations/${CURRENT_STATION_ID}/customers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        closeModal('editCustomerModal');
        fetchStationData();
        alert('✅ Müşteri bilgileri başarıyla güncellendi!');
      } catch (err) { alert('Müşteri güncellenemedi'); }
    });
  }
});

// Mobil Menü Aç/Kapa
function toggleMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (backdrop) backdrop.classList.toggle('mobile-open');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('mobile-open');
}

// Menü Geçişi (9 Menü)
function navigateTab(tabId) {
  closeMobileSidebar();
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  const navItem = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('onclick')?.includes(tabId));
  if (navItem) navItem.classList.add('active');

  if (tabMeta[tabId]) {
    document.getElementById('pageTitleHeading').textContent = tabMeta[tabId].title;
    document.getElementById('pageSubtitleText').textContent = tabMeta[tabId].desc;
  }

  if (tabId === 'tab-harita' && map) {
    setTimeout(() => {
      map.invalidateSize();
      if (currentStationLocation) {
        map.setView([currentStationLocation.lat, currentStationLocation.lng], 15);
      }
    }, 200);
  }
}

let currentStationLocation = { lat: 40.9876, lng: 29.0267 };

// Haritayı Başlat (Ücretsiz, API Key istemeyen açık harita sağlayıcısı)
function initMap() {
  const center = [currentStationLocation.lat, currentStationLocation.lng];
  map = L.map('map').setView(center, 15);

  // Standart açık OSM haritası - Asla API KEY REQUIRED uyarısı vermez
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap Katkıcıları'
  }).addTo(map);

  stationCircle = L.circle(center, {
    color: '#7c3aed',
    fillColor: '#fbbf24',
    fillOpacity: 0.25,
    weight: 3,
    radius: 100
  }).addTo(map).bindPopup('<strong>Merkez Taksi Durağı</strong><br>Durak Sıralama Alanı (Geofence)');
}

// Durağa Odaklan Butonu
function locateStationOnMap() {
  if (map && currentStationLocation) {
    map.flyTo([currentStationLocation.lat, currentStationLocation.lng], 16, { animate: true, duration: 1.2 });
    if (stationCircle) stationCircle.openPopup();
  }
}

// Durak Adresinden Otomatik Koordinat Bul (Nominatim OpenStreetMap Geocoding)
async function geocodeStationAddress() {
  const address = document.getElementById('setStationAddress').value.trim();
  if (!address) {
    alert('Lütfen önce bir açık adres giriniz.');
    return;
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Türkiye')}`);
    const results = await res.json();
    if (results && results.length > 0) {
      const first = results[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      document.getElementById('setStationLat').value = lat.toFixed(6);
      document.getElementById('setStationLng').value = lng.toFixed(6);

      currentStationLocation = { lat, lng };
      if (map) {
        map.setView([lat, lng], 16);
        if (stationCircle) stationCircle.setLatLng([lat, lng]);
      }
      alert(`📍 Adres haritada başarıyla bulundu!\nEnlem: ${lat.toFixed(5)}, Boylam: ${lng.toFixed(5)}`);
    } else {
      alert('Adres koordinatları otomatik bulunamadı. Lütfen il/ilçe belirterek tekrar deneyin veya enlem/boylamı elle giriniz.');
    }
  } catch (err) {
    alert('Konum arama servisine bağlanılamadı.');
  }
}

// Socket Bağlantısı
function initSocket() {
  socket.emit('join_station', CURRENT_STATION_ID);

  socket.on('queue_updated', () => fetchStationData());
  socket.on('call_dispatched', () => fetchStationData());
  socket.on('call_completed', () => fetchStationData());
  socket.on('new_chat_message', (msg) => appendChatMessage(msg));
  socket.on('driver_location_update', (data) => updateMapTaxi(data));
}

// Tüm Verileri Getir ve Arayüzü Besle
async function fetchStationData() {
  try {
    const res = await fetch(`/api/stations/${CURRENT_STATION_ID}/overview`);
    const data = await res.json();

    cachedVehicles = data.vehicles || [];
    cachedDrivers = data.drivers || [];
    cachedCustomers = data.customers || [];
    cachedQRPoints = data.qrPoints || [];
    cachedCalls = data.recentCalls || [];

    // Üst & Yan Başlıklar
    document.getElementById('sideStationName').textContent = data.station.name;
    document.getElementById('sideStationCity').textContent = `${data.station.district}, ${data.station.city}`;
    document.getElementById('sideInQueueBadge').textContent = data.stats.inQueueCount;
    document.getElementById('sideActiveCallsBadge').textContent = data.stats.activeCallsCount;
    if (document.getElementById('sideQRBadge')) document.getElementById('sideQRBadge').textContent = data.stats.totalQRPoints || (data.qrPoints || []).length;

    // 1. PANO İSTATİSTİKLERİ
    document.getElementById('dashTodayRevenue').textContent = `${data.stats.todayRevenue.toLocaleString()} ₺`;
    document.getElementById('dashAvgFare').textContent = `${data.stats.avgFare} ₺`;
    document.getElementById('dashInQueueCount').textContent = data.stats.inQueueCount;
    document.getElementById('dashTotalVehicles').textContent = data.stats.totalVehicles;
    document.getElementById('dashCompletedCalls').textContent = data.stats.completedCallsCount;
    document.getElementById('dashActiveCalls').textContent = data.stats.activeCallsCount;
    document.getElementById('dashTotalScans').textContent = data.stats.totalQRScans;
    document.getElementById('dashQRCount').textContent = data.stats.totalQRPoints;

    // Pano 1. Sıradaki Taksi Kartı
    if (data.queue && data.queue.length > 0) {
      document.getElementById('dashFirstPlate').textContent = data.queue[0].plate;
      document.getElementById('dashFirstDriver').textContent = `👤 ${data.queue[0].driverName}`;
    } else {
      document.getElementById('dashFirstPlate').textContent = 'Sırada Yok';
      document.getElementById('dashFirstDriver').textContent = 'Durakta araç bekleniyor';
    }

    // Pano Canlı İş Akışı
    renderRecentCallsTable(data.recentCalls);

    // 2. SIRA LİSTESİ
    renderFullQueue(data.queue);

    // 3. İŞ EMİRLERİ LİSTESİ
    renderAllCallsTable(data.recentCalls);

    // 4. HARİTA PINLERİ
    renderMapVehicles(data.shifts);

    // 5. ARAÇLAR & ŞOFÖRLER
    renderFleetTables(data.vehicles, data.drivers);

    // 6. SOHBET MESAJLARI
    renderChatMessages(data.messages);

    // 7. KAYITLI MÜŞTERİLER
    renderCustomersTable(data.customers);

    // 8. DUYURULAR
    renderAnnouncementsTable(data.announcements);

    // 9. AYARLARI DOLDUR
    fillSettingsForm(data.station);

    // 10. QR NOKTALARI TABLOSU
    renderQRPointsTable(data.qrPoints);

  } catch (err) {
    console.error('Veri yüklenemedi:', err);
  }
}

// 1. PANO: Son Çağrılar
function renderRecentCallsTable(calls) {
  const tbody = document.getElementById('dashRecentCallsBody');
  if (!calls || calls.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Henüz çağrı kaydı yok.</td></tr>`;
    return;
  }

  tbody.innerHTML = calls.slice(0, 6).map(c => {
    const time = new Date(c.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    let badge = `<span class="badge badge-success">Tamamlandı</span>`;
    if (c.status === 'pending' || c.status === 'dispatched') badge = `<span class="badge badge-warning">Aranıyor</span>`;
    if (c.status === 'accepted') badge = `<span class="badge badge-info">Yolda</span>`;

    return `
      <tr>
        <td>${c.source === 'qr' ? '📱 QR' : '📞 Tel'}</td>
        <td><strong>${c.pickupAddress}</strong></td>
        <td>${c.assignedPlate || '-'}</td>
        <td>${badge}</td>
        <td>${time}</td>
      </tr>
    `;
  }).join('');
}

// 2. SIRA: İnteraktif Liste
function renderFullQueue(queue) {
  const container = document.getElementById('fullQueueList');
  if (!queue || queue.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;">Durakta sırada araç yok.</div>`;
    return;
  }

  container.innerHTML = queue.map((item, index) => {
    const isFirst = index === 0;
    return `
      <div class="queue-item ${isFirst ? 'first-in-line' : ''}">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="queue-number">${item.queueOrder}</div>
          <div>
            <div style="font-size: 16px; font-weight: 900; color: #0f172a;">
              ${item.plate} ${isFirst ? '⭐ (İş Sırası Onda)' : ''}
            </div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text-muted);">
              👤 Şoför: <strong style="color: #0f172a;">${item.driverName}</strong>
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <button class="btn btn-secondary btn-sm" onclick="moveQueueItem('${item.shift_id}', 'up')" title="Yukarı Taşı">▲ Yukarı</button>
          <button class="btn btn-secondary btn-sm" onclick="moveQueueItem('${item.shift_id}', 'down')" title="Aşağı Taşı">▼ Aşağı</button>
          <button class="btn btn-danger btn-sm" onclick="removeQueueItem('${item.shift_id}')" title="Sıradan Çıkar">Sıradan Çıkar</button>
        </div>
      </div>
    `;
  }).join('');
}

async function moveQueueItem(shiftId, direction) {
  await fetch(`/api/stations/${CURRENT_STATION_ID}/queue/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shiftId, direction })
  });
  fetchStationData();
}

async function removeQueueItem(shiftId) {
  if (!confirm('Aracı sıradan çıkarmak istediğinize emin misiniz?')) return;
  await fetch(`/api/stations/${CURRENT_STATION_ID}/queue/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shiftId })
  });
  fetchStationData();
}

// 3. İŞ EMİRLERİ
function renderAllCallsTable(calls) {
  const tbody = document.getElementById('allCallsTableBody');
  if (!calls || calls.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center;">Çağrı kaydı yok.</td></tr>`;
    return;
  }

  tbody.innerHTML = calls.map(c => {
    const time = new Date(c.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    let badge = `<span class="badge badge-success">Tamamlandı</span>`;
    if (c.status === 'pending' || c.status === 'dispatched') badge = `<span class="badge badge-warning">Atandı / Bekliyor</span>`;
    if (c.status === 'accepted') badge = `<span class="badge badge-info">Sürücü Yolda</span>`;

    return `
      <tr>
        <td><strong>#${c.id.slice(-5)}</strong></td>
        <td>${c.source === 'qr' ? '📱 Sokak QR' : '📞 Telefon İşi'}</td>
        <td>${c.customerName || 'Müşteri'} <br><small style="color: var(--text-muted);">${c.customerPhone || '-'}</small></td>
        <td><strong>${c.pickupAddress}</strong></td>
        <td>${c.dropoffAddress ? `<span style="color: #7c3aed; font-weight: 700;">${c.dropoffAddress}</span>` : '<span style="color: #94a3b8;">-</span>'}</td>
        <td>${c.assignedPlate || '-'} (${c.assignedDriverName || '-'})</td>
        <td style="font-weight: 800; color: #34d399;">${c.fare || 180} ₺</td>
        <td>${badge}</td>
        <td>${time}</td>
      </tr>
    `;
  }).join('');
}

// 4. HARİTA
function renderMapVehicles(shifts) {
  (shifts || []).forEach(shift => {
    if (!shift.lat || !shift.lng) return;

    if (taxiMarkers[shift.id]) {
      taxiMarkers[shift.id].setLatLng([shift.lat, shift.lng]);
    } else {
      const isTrip = shift.state === 'in_trip';
      const customIcon = L.divIcon({
        className: 'custom-taxi-marker',
        html: `<div class="taxi-marker-icon ${isTrip ? 'taxi-marker-in-trip' : ''}">🚖 ${shift.plate}</div>`,
        iconSize: [80, 24],
        iconAnchor: [40, 12]
      });

      const marker = L.marker([shift.lat, shift.lng], { icon: customIcon }).addTo(map);
      marker.bindPopup(`<strong>${shift.plate}</strong><br>Şoför: ${shift.driverName}<br>Durum: ${shift.state}`);
      taxiMarkers[shift.id] = marker;
    }
  });
}

function updateMapTaxi(data) {
  if (taxiMarkers[data.shiftId]) {
    taxiMarkers[data.shiftId].setLatLng([data.lat, data.lng]);
  }
}

// 5. FİLO & ŞOFÖRLER
function renderFleetTables(vehicles, drivers) {
  document.getElementById('fleetVehiclesBody').innerHTML = (vehicles || []).map(v => `
    <tr>
      <td><strong>${v.plate}</strong></td>
      <td>${v.model} (${v.year})</td>
      <td>${v.totalKm ? v.totalKm.toLocaleString() + ' km' : '-'}</td>
      <td>${v.inspectionDate || '-'}</td>
      <td>
        <button class="btn btn-secondary btn-sm" style="margin-right: 6px;" onclick="openEditVehicleModal('${v.id}')">✏️ Düzenle</button>
        <button class="btn btn-danger btn-sm" onclick="deleteVehicle('${v.id}')">Sil</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('fleetDriversBody').innerHTML = (drivers || []).map(d => `
    <tr>
      <td><strong>${d.fullName}</strong></td>
      <td>${d.phone}</td>
      <td><span class="badge" style="background: #fef3c7; color: #92400e; font-weight: 800; font-family: monospace; font-size: 13px;">🚕 ${d.plate || '-'}</span></td>
      <td><span class="badge" style="background: #ede9fe; color: #6b21a8; font-weight: 800; font-family: monospace; font-size: 13px;">🔑 ${d.password || '123'}</span></td>
      <td>⭐ ${d.rating}</td>
      <td>${d.totalTrips || 0} sefer (${(d.monthlyRevenue || 0).toLocaleString()} ₺)</td>
      <td>
        <button class="btn btn-primary btn-sm" style="margin-right: 6px;" onclick="openDriverPerfModal('${d.id}')">📊 Performans</button>
        <button class="btn btn-secondary btn-sm" style="margin-right: 6px;" onclick="openEditDriverModal('${d.id}')">✏️ Düzenle</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDriver('${d.id}')">Sil</button>
      </td>
    </tr>
  `).join('');
}

async function deleteVehicle(id) {
  if (!confirm('Aracı silmek istediğinize emin misiniz?')) return;
  await fetch(`/api/stations/${CURRENT_STATION_ID}/vehicles/${id}`, { method: 'DELETE' });
  fetchStationData();
}

async function deleteDriver(id) {
  if (!confirm('Şoförü silmek istediğinize emin misiniz?')) return;
  await fetch(`/api/stations/${CURRENT_STATION_ID}/drivers/${id}`, { method: 'DELETE' });
  fetchStationData();
}

// 6. SOHBET
function renderChatMessages(messages) {
  const box = document.getElementById('chatMessagesBox');
  box.innerHTML = (messages || []).map(m => {
    const isOp = m.senderType === 'operator';
    const time = new Date(m.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="chat-bubble ${isOp ? 'operator' : 'driver'}">
        <div class="chat-sender">${m.senderName}</div>
        <div>${m.text}</div>
        <div class="chat-time">${time}</div>
      </div>
    `;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function appendChatMessage(msg) {
  const box = document.getElementById('chatMessagesBox');
  const isOp = msg.senderType === 'operator';
  const time = new Date(msg.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `chat-bubble ${isOp ? 'operator' : 'driver'}`;
  div.innerHTML = `
    <div class="chat-sender">${msg.senderName}</div>
    <div>${msg.text}</div>
    <div class="chat-time">${time}</div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// 7. MÜŞTERİLER
function renderCustomersTable(customers) {
  const tbody = document.getElementById('customersTableBody');
  if (!customers || customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Kayıtlı müşteri yok.</td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><strong>${c.fullName}</strong></td>
      <td>${c.phone}</td>
      <td>${c.street || '-'}</td>
      <td><span class="badge badge-info">${c.totalCalls || 1} kez</span></td>
      <td>${c.lastCallAt ? new Date(c.lastCallAt).toLocaleDateString('tr-TR') : '-'}</td>
      <td><span class="badge badge-success">${c.tag || 'Müşteri'}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" style="margin-right: 6px;" onclick="openEditCustomerModal('${c.id}')">✏️ Düzenle</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCustomer('${c.id}')">Sil</button>
      </td>
    </tr>
  `).join('');
}

async function deleteCustomer(id) {
  if (!confirm('Müşteriyi silmek istediğinize emin misiniz?')) return;
  await fetch(`/api/stations/${CURRENT_STATION_ID}/customers/${id}`, { method: 'DELETE' });
  fetchStationData();
}

// 8. DUYURULAR
function renderAnnouncementsTable(announcements) {
  const tbody = document.getElementById('announcementsTableBody');
  if (!announcements || announcements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Aktif duyuru yok.</td></tr>`;
    return;
  }

  tbody.innerHTML = announcements.map(a => `
    <tr>
      <td><strong>${a.title}</strong></td>
      <td>${a.content}</td>
      <td>Her <strong>${a.intervalMinutes} dakikada</strong> bir</td>
      <td><strong>${a.durationSeconds} saniye</strong> ekranda kalır</td>
      <td>
        <span class="badge ${a.isActive ? 'badge-success' : 'badge-danger'}">
          ${a.isActive ? '🟢 Yayında' : '⚪ Pasif'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="toggleAnnouncement('${a.id}')">
          ${a.isActive ? 'Durdur' : 'Yayınla'}
        </button>
        <button class="btn btn-danger btn-sm" style="margin-left: 6px;" onclick="deleteAnnouncement('${a.id}')">Sil</button>
      </td>
    </tr>
  `).join('');
}

async function toggleAnnouncement(id) {
  await fetch(`/api/stations/${CURRENT_STATION_ID}/announcements/${id}/toggle`, { method: 'POST' });
  fetchStationData();
}

async function deleteAnnouncement(id) {
  if (!confirm('Duyuruyu silmek istediğinize emin misiniz?')) return;
  await fetch(`/api/stations/${CURRENT_STATION_ID}/announcements/${id}`, { method: 'DELETE' });
  fetchStationData();
}

// 9. AYARLAR FORMU
function fillSettingsForm(station) {
  if (!station) return;
  document.getElementById('setStationName').value = station.name || '';
  document.getElementById('setStationPhone').value = station.phone || '';
  document.getElementById('setStationAddress').value = station.address || '';
  document.getElementById('setGeofenceRadius').value = station.geofenceRadiusMeters || 100;

  const lat = (station.location && station.location.lat) ? station.location.lat : (station.lat || currentStationLocation.lat);
  const lng = (station.location && station.location.lng) ? station.location.lng : (station.lng || currentStationLocation.lng);
  document.getElementById('setStationLat').value = lat;
  document.getElementById('setStationLng').value = lng;
  currentStationLocation = { lat, lng };

  if (station.settings) {
    document.getElementById('setTimeoutSeconds').value = station.settings.driverTimeoutSeconds || 30;
    if (station.settings.themeColor) {
      document.body.setAttribute('data-theme', station.settings.themeColor);
      const radio = document.querySelector(`input[name="themeColor"][value="${station.settings.themeColor}"]`);
      if (radio) radio.checked = true;
    }
  }
}

// Düzenleme Fonksiyonları (Modalları Verilerle Açma)
function openEditVehicleModal(id) {
  const v = cachedVehicles.find(x => x.id === id);
  if (!v) return;
  document.getElementById('editVehId').value = v.id;
  document.getElementById('editVehPlate').value = v.plate || '';
  document.getElementById('editVehModel').value = `${v.model || ''} ${v.year || ''}`.trim();
  document.getElementById('editVehKm').value = v.totalKm || '';
  document.getElementById('editVehInspection').value = v.inspectionDate || '';
  document.getElementById('editVehicleModal').classList.add('open');
}

function openEditDriverModal(id) {
  const d = cachedDrivers.find(x => x.id === id);
  if (!d) return;
  document.getElementById('editDrvId').value = d.id;
  document.getElementById('editDrvName').value = d.fullName || '';
  document.getElementById('editDrvPhone').value = d.phone || '';
  document.getElementById('editDrvPlate').value = d.plate || '';
  document.getElementById('editDrvPassword').value = d.password || '123';
  document.getElementById('editDrvLicense').value = d.licenseNo || '';
  document.getElementById('editDrvRating').value = d.rating || 5.0;
  document.getElementById('editDriverModal').classList.add('open');
}

function openEditCustomerModal(id) {
  const c = cachedCustomers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('editCustId').value = c.id;
  document.getElementById('editCustName').value = c.fullName || '';
  document.getElementById('editCustPhone').value = c.phone || '';
  document.getElementById('editCustStreet').value = c.street || '';
  document.getElementById('editCustTag').value = c.tag || 'VIP Müşteri';
  document.getElementById('editCustNotes').value = c.notes || '';
  document.getElementById('editCustomerModal').classList.add('open');
}

function openGpsInfoModal() {
  document.getElementById('gpsInfoModal').classList.add('open');
}

// Modallar
function openPhoneModal() { document.getElementById('phoneModal').classList.add('open'); }
function openNewQRModal() { document.getElementById('newQRModal').classList.add('open'); }
function openNewVehicleModal() { document.getElementById('newVehicleModal').classList.add('open'); }
function openNewDriverModal() { document.getElementById('newDriverModal').classList.add('open'); }
function openNewCustomerModal() { document.getElementById('newCustomerModal').classList.add('open'); }
function openNewAnnouncementModal() { document.getElementById('newAnnouncementModal').classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Anlık Test İşi Gönder (Durak Paneli)
async function sendInstantTestJob() {
  try {
    const res = await fetch('/api/test/create-test-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationId: CURRENT_STATION_ID,
        pickupAddress: 'Moda Sahil Cafe Önü (Sokak QR)',
        dropoffAddress: 'Kadıköy Rıhtım Metro & İskele',
        fare: 165
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`⚡ Test İşi Başarıyla Gönderildi!\n\nAraç: ${data.call.assignedPlate}\nAlış Noktası: ${data.call.pickupAddress}\nVarış Noktası: ${data.call.dropoffAddress}\nTutar: ${data.call.fare} ₺\n\nSürücünün ekranında 30 saniyelik sayaç ve sesli alarm başladı!`);
      fetchStationData();
    } else {
      alert(data.message || 'Sırada bekleyen araç bulunamadı!');
    }
  } catch (err) {
    alert('Test işi gönderilirken hata: ' + err.message);
  }
}

// Şoför Performansı ve Sefer Geçmişi Modal
async function openDriverPerfModal(driverId) {
  const d = (cachedDrivers || []).find(x => x.id === driverId);
  document.getElementById('driverPerfModalTitle').innerText = `📊 ${d ? d.fullName : 'Şoför'} (${d ? d.plate : ''}) — Performans & Sefer Raporu`;
  document.getElementById('driverPerfModal').classList.add('open');
  
  const listEl = document.getElementById('panelDriverHistoryList');
  listEl.innerHTML = '<div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 20px;">Yükleniyor...</div>';
  
  try {
    const perfRes = await fetch(`/api/drivers/${driverId}/performance`);
    const perf = await perfRes.json();
    if (perf.success || perf.stats) {
      const stats = perf.stats || {};
      document.getElementById('panelPerfRating').innerText = `⭐ ${stats.rating || 5.0}`;
      document.getElementById('panelPerfRate').innerText = `%${stats.acceptanceRate != null ? stats.acceptanceRate : 100}`;
      document.getElementById('panelPerfTrips').innerText = `${stats.totalTrips || 0}`;
      document.getElementById('panelPerfRevenue').innerText = `${(stats.todayRevenue || stats.totalRevenue || stats.monthlyRevenue || 0).toLocaleString()} ₺`;
    }

    // Bu şoförün tamamlanan seferleri (backend'den gelen recentTrips veya cache)
    const driverCalls = (perf.recentTrips && perf.recentTrips.length > 0) 
      ? perf.recentTrips 
      : (cachedCalls || []).filter(c => c.assignedDriverId === driverId || (d && c.assignedPlate === d.plate));
    
    if (!driverCalls || driverCalls.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 20px;">Henüz bu şoföre ait kayıtlı sefer bulunmuyor.</div>';
    } else {
      listEl.innerHTML = driverCalls.map(c => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 13px; font-weight: 800; color: #0f172a;">📍 ${c.pickupAddress || 'Konum'}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">🏁 ${c.dropoffAddress || 'Varış Belirtilmemiş'}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${c.completedAt ? new Date(c.completedAt).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : (c.createdAt ? new Date(c.createdAt).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : '')} • ${c.customerName || 'Yolcu'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 14px; font-weight: 900; color: #059669;">${c.fare || 180} ₺</div>
            <span class="badge ${c.status === 'completed' ? 'badge-success' : 'badge-warning'}" style="font-size: 10px;">${c.status === 'completed' ? 'Tamamlandı' : c.status}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Driver perf error:', err);
    listEl.innerHTML = '<div style="text-align: center; color: #ef4444; font-size: 13px; padding: 15px;">Veriler alınamadı.</div>';
  }
}

// 10. QR Noktaları Tablosunu Doldur
function renderQRPointsTable(points) {
  cachedQRPoints = points || [];
  const tbody = document.getElementById('qrPointsTableBody');
  if (!tbody) return;

  const totalScans = cachedQRPoints.reduce((s, q) => s + (q.totalScans || 0), 0);
  const totalCalls = cachedQRPoints.reduce((s, q) => s + (q.successfulCalls || 0), 0);
  const convRate = totalScans > 0 ? Math.round((totalCalls / totalScans) * 100) : 0;

  if (document.getElementById('qrStatTotalPoints')) document.getElementById('qrStatTotalPoints').innerText = cachedQRPoints.length;
  if (document.getElementById('qrStatTotalScans')) document.getElementById('qrStatTotalScans').innerText = totalScans;
  if (document.getElementById('qrStatTotalCalls')) document.getElementById('qrStatTotalCalls').innerText = totalCalls;
  if (document.getElementById('qrStatConversionRate')) document.getElementById('qrStatConversionRate').innerText = `%${convRate}`;
  if (document.getElementById('sideQRBadge')) document.getElementById('sideQRBadge').innerText = cachedQRPoints.length;

  if (cachedQRPoints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">Henüz tanımlı QR noktası yok. Yukarıdaki butondan yeni bir tane ekleyebilirsiniz.</td></tr>`;
    return;
  }

  tbody.innerHTML = cachedQRPoints.map(q => {
    const rate = q.totalScans > 0 ? Math.round(((q.successfulCalls || 0) / q.totalScans) * 100) : 0;
    const lastScan = q.lastScannedAt ? new Date(q.lastScannedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Henüz Yok';
    return `
      <tr>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 800; background: #f3e8ff; color: #6b21a8; padding: 4px 10px; border-radius: 8px; font-size: 12px;">
            <span>📍</span> <strong>${q.code}</strong>
          </span>
        </td>
        <td>
          <div style="font-weight: 700; color: #0f172a;">${q.title}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${q.notes || 'Açıklama belirtilmemiş'}</div>
        </td>
        <td>
          <div>${q.neighborhood || '-'}</div>
          <small style="color: var(--text-muted);">${q.landmark || '-'}</small>
        </td>
        <td style="font-weight: 800; color: #0284c7; text-align: center;">${q.totalScans || 0}</td>
        <td style="font-weight: 800; color: #059669; text-align: center;">${q.successfulCalls || 0} araç</td>
        <td style="text-align: center;">
          <span class="badge ${rate >= 70 ? 'badge-success' : (rate >= 40 ? 'badge-warning' : 'badge-neutral')}" style="font-size: 11px;">
            %${rate}
          </span>
        </td>
        <td style="font-size: 12px; color: #64748b;">${lastScan}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-primary btn-sm" onclick="openQRPreviewModal('${q.id}')" title="Örnek QR Görselini ve Detaylarını Gör">
              🔍 Gör
            </button>
            <a href="/api/stations/${CURRENT_STATION_ID}/qr-points/${q.id}/print" target="_blank" class="btn btn-secondary btn-sm" title="A4 Baskı Şablonunu Aç">
              🖨️ Yazdır
            </a>
            <a href="/cagri/${q.code}" target="_blank" class="btn btn-accent btn-sm" title="Müşteri Çağrı Ekranını Aç">
              📱 Yolcu Ekranı
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// QR Önizleme Modalı
async function openQRPreviewModal(qrId) {
  let q = (cachedQRPoints || []).find(x => x.id === qrId || x.code === qrId);
  if (!q && cachedQRPoints.length > 0) q = cachedQRPoints[0];

  const modal = document.getElementById('qrPreviewModal');
  if (modal) modal.classList.add('open');

  try {
    const idParam = q ? (q.id || q.code) : qrId;
    const res = await fetch(`/api/stations/${CURRENT_STATION_ID}/qr-points/${idParam}/preview`);
    const data = await res.json();
    if (data.success) {
      const point = data.qrPoint;
      document.getElementById('prevModalTitle').innerText = `📍 QR Noktası: ${point.title} (${point.code})`;
      document.getElementById('prevModalBadge').innerText = point.code;
      document.getElementById('prevModalStreet').innerText = point.title;
      document.getElementById('prevModalNeighborhood').innerText = `${point.neighborhood || ''} • ${point.landmark || ''}`;
      document.getElementById('prevModalNotes').innerText = point.notes || 'Sokak panosu veya aydınlatma direği';
      document.getElementById('prevModalScans').innerText = `${data.stats.totalScans} Defa Okutuldu`;
      document.getElementById('prevModalCalls').innerText = `${data.stats.successfulCalls} Taksi Seferi Yapıldı`;
      document.getElementById('prevModalRate').innerText = `%${data.stats.conversionRate} Başarı`;
      
      const img = document.getElementById('prevModalQrImg');
      if (img && data.qrDataUrl) {
        img.src = data.qrDataUrl;
      }

      const testBtn = document.getElementById('prevModalTestBtn');
      if (testBtn) testBtn.href = data.targetUrl || `/cagri/${point.code}`;

      const printBtn = document.getElementById('prevModalPrintBtn');
      if (printBtn) printBtn.href = `/api/stations/${CURRENT_STATION_ID}/qr-points/${point.id}/print`;
    }
  } catch (err) {
    console.error('QR preview error:', err);
  }
}


