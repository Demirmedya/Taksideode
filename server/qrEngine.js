const QRCode = require('qrcode');
const db = require('../data/store');

class QREngine {
  // Dinamik QR Linki Üret
  static getQRUrl(code, baseUrl = 'http://localhost:3000') {
    return `${baseUrl}/cagri/${code}`;
  }

  // QR Görselini DataURL (Base64 PNG) Olarak Oluştur
  static async generateQRCodeDataUrl(text) {
    try {
      return await QRCode.toDataURL(text, {
        width: 320,
        margin: 2,
        color: {
          dark: '#111827',
          light: '#FFFFFF'
        }
      });
    } catch (err) {
      console.error('QR Oluşturma Hatası:', err);
      return null;
    }
  }

  // QR Okutma Kaydı (İstatistikleri güncelle)
  static recordScan(code) {
    let point = null;
    db.update(data => {
      point = (data.qrPoints || []).find(p => p.code === code);
      if (point) {
        point.totalScans = (point.totalScans || 0) + 1;
        point.lastScannedAt = new Date().toISOString();
      }
      return data;
    });
    return point;
  }

  // Başarılı Taksi Çağrısı Kaydı
  static recordSuccessfulCall(code) {
    db.update(data => {
      const point = (data.qrPoints || []).find(p => p.code === code);
      if (point) {
        point.successfulCalls = (point.successfulCalls || 0) + 1;
      }
      return data;
    });
  }

  // Yazdırılabilir A4 / Etiket Baskı Şablonu HTML Üret
  static async generatePrintTemplate(qrPoint, station, baseUrl) {
    const targetUrl = this.getQRUrl(qrPoint.code, baseUrl);
    const qrDataUrl = await this.generateQRCodeDataUrl(targetUrl);

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>TaksideÖde QR Baskı - ${qrPoint.title}</title>
  <style>
    @page { size: A4 portrait; margin: 20mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #111827;
      background: #f9fafb;
    }
    .print-card {
      background: #ffffff;
      border: 4px solid #7c3aed;
      border-radius: 28px;
      padding: 40px 30px;
      width: 480px;
      text-align: center;
      box-shadow: 0 12px 30px rgba(124, 58, 237, 0.12);
    }
    .badge {
      display: inline-block;
      background: #f5f3ff;
      color: #7c3aed;
      border: 1px solid #ddd6fe;
      font-weight: 800;
      font-size: 13px;
      padding: 6px 18px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 32px;
      font-weight: 900;
      color: #0f172a;
      margin: 0 0 6px 0;
    }
    .station-name {
      font-size: 20px;
      font-weight: 700;
      color: #7c3aed;
      margin: 0 0 24px 0;
    }
    .qr-frame {
      background: #ffffff;
      border: 2px dashed #cbd5e1;
      border-radius: 20px;
      padding: 20px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .qr-frame img {
      width: 260px;
      height: 260px;
      display: block;
    }
    .instruction {
      font-size: 22px;
      font-weight: 800;
      color: #111827;
      margin: 0 0 8px 0;
    }
    .sub-instruction {
      font-size: 15px;
      color: #6b7280;
      margin: 0 0 20px 0;
    }
    .location-box {
      background: #faf5ff;
      border: 1px solid #ede9fe;
      border-radius: 14px;
      padding: 14px 18px;
      margin-top: 10px;
      text-align: left;
    }
    .location-label {
      font-size: 11px;
      font-weight: 800;
      color: #7c3aed;
      text-transform: uppercase;
    }
    .location-value {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }
    .print-actions {
      margin-top: 24px;
    }
    @media print {
      body { background: #fff; }
      .print-actions { display: none !important; }
      .print-card { box-shadow: none; border-color: #7c3aed; width: 100%; max-width: 520px; }
    }
    .btn-print {
      background: linear-gradient(135deg, #7c3aed, #5b21b6);
      color: #ffffff;
      border: none;
      font-size: 16px;
      font-weight: 800;
      padding: 14px 32px;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
    }
  </style>
</head>
<body>
  <div class="print-card">
    <div style="margin-bottom: 12px;">
      <img src="${baseUrl}/images/logo.png" alt="TaksideÖde" style="height: 56px; object-fit: contain;">
    </div>
    <div class="badge">🚖 Akıllı Durak QR Çağrı</div>
    <h1 class="brand-title">TAKSİ ÇAĞIR</h1>
    <h2 class="station-name">${station.name}</h2>
    
    <div class="qr-frame">
      <img src="${qrDataUrl}" alt="QR Kod" />
    </div>

    <div class="instruction">Telefon Kamerasıyla Okutun</div>
    <div class="sub-instruction">Uygulama indirmeden saniyeler içinde taksiniz kapınıza gelsin.</div>

    <div class="location-box">
      <div class="location-label">ÇAĞRI NOKTASI / SOKAK</div>
      <div class="location-value">${qrPoint.title} (${qrPoint.neighborhood || ''})</div>
      <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">${qrPoint.landmark || ''} • Kod: ${qrPoint.code}</div>
    </div>
  </div>

  <div class="print-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Yazıcıdan Çıkar (A4 / Etiket)</button>
  </div>
</body>
</html>
    `;
  }
}

module.exports = QREngine;
