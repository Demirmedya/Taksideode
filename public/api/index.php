<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dbFile = __DIR__ . '/database.json';
if (!file_exists($dbFile)) {
    // If not in api folder, try parent data/database.json
    $parentDb = dirname(__DIR__, 2) . '/data/database.json';
    if (file_exists($parentDb)) {
        $dbFile = $parentDb;
    }
}

function getDb($file) {
    if (!file_exists($file)) return [];
    $content = file_get_contents($file);
    return json_decode($content, true) ?: [];
}

function saveDb($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function saveData($data) {
    global $dbFile;
    saveDb($dbFile, $data);
}

// Request path parsing
$requestUri = $_SERVER['REQUEST_URI'];
$basePath = '/api';
$endpoint = '';

if (isset($_GET['endpoint'])) {
    $endpoint = trim($_GET['endpoint'], '/');
} else {
    $parsed = parse_url($requestUri, PHP_URL_PATH);
    $pos = strpos($parsed, $basePath);
    if ($pos !== false) {
        $endpoint = trim(substr($parsed, $pos + strlen($basePath)), '/');
    }
}
if (strpos($endpoint, '?') !== false) {
    $endpoint = explode('?', $endpoint)[0];
}
$endpoint = trim($endpoint, '/');

$method = $_SERVER['REQUEST_METHOD'];
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?: $_POST;

$data = getDb($dbFile);

// ==========================================
// 1. AUTH (LOGIN)
// ==========================================
if ($endpoint === 'auth/login' && $method === 'POST') {
    $username = trim($input['username'] ?? '');
    $password = trim($input['password'] ?? '');

    // Süper Admin Kontrolü
    $admin = $data['admin'] ?? ['username' => 'taksideode', 'password' => 'Doguhan2001', 'name' => 'Demir Medya Admin'];
    if ($admin['username'] === $username && $admin['password'] === $password) {
        echo json_encode([
            'success' => true,
            'role' => 'admin',
            'user' => ['name' => $admin['name'] ?? 'Demir Medya Admin', 'username' => $admin['username']],
            'redirectUrl' => '/panel'
        ]);
        exit;
    }

    // Durak Kontrolü
    $stations = $data['stations'] ?? [];
    foreach ($stations as $st) {
        if ((strtolower($st['username'] ?? '') === strtolower($username)) || ($st['id'] === $username)) {
            if (($st['password'] ?? '') !== $password) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Durak şifresi hatalı!']);
                exit;
            }
            if (($st['status'] ?? '') === 'passive') {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Bu durak hesabı pasife alınmıştır. Lütfen Demir Medya ile iletişime geçiniz.']);
                exit;
            }

            echo json_encode([
                'success' => true,
                'role' => 'station',
                'station' => [
                    'id' => $st['id'],
                    'name' => $st['name'],
                    'city' => $st['city'] ?? '',
                    'district' => $st['district'] ?? '',
                    'username' => $st['username'] ?? ''
                ],
                'redirectUrl' => 'https://demodurak.taksideode.com.tr?stationId=' . $st['id']
            ]);
            exit;
        }
    }

    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Kullanıcı adı veya şifre hatalı!']);
    exit;
}

// ==========================================
// 2. SÜPER ADMİN GENEL BAKIŞ & DURAK LİSTESİ
// ==========================================
if ($endpoint === 'admin/overview' && $method === 'GET') {
    $stations = $data['stations'] ?? [];
    $vehicles = $data['vehicles'] ?? [];
    $drivers = $data['drivers'] ?? [];
    $calls = $data['calls'] ?? [];

    $detailedStations = [];
    $now = time();

    foreach ($stations as $st) {
        $stId = $st['id'];
        $stVehicles = array_filter($vehicles, fn($v) => ($v['station_id'] ?? '') === $stId);
        $stDrivers = array_filter($drivers, fn($d) => ($d['station_id'] ?? '') === $stId);
        $stCalls = array_filter($calls, fn($c) => ($c['station_id'] ?? '') === $stId);
        $completedCalls = array_filter($stCalls, fn($c) => ($c['status'] ?? '') === 'completed');

        $totalRevenue = 0;
        foreach ($completedCalls as $c) {
            $totalRevenue += ($c['fare'] ?? 0);
        }

        $createdTime = isset($st['createdAt']) ? strtotime($st['createdAt']) : $now;
        $diffDays = max(1, round(($now - $createdTime) / 86400));
        $durationText = $diffDays > 30 ? round($diffDays / 30) . ' Aydır Bizimle' : $diffDays . ' Gündür Bizimle';

        $stCopy = $st;
        $stCopy['vehicleCount'] = count($stVehicles);
        $stCopy['driverCount'] = count($stDrivers);
        $stCopy['totalCallsCount'] = count($stCalls);
        $stCopy['completedCallsCount'] = count($completedCalls);
        $stCopy['totalRevenue'] = $totalRevenue;
        $stCopy['durationDays'] = $diffDays;
        $stCopy['durationText'] = $durationText;

        $detailedStations[] = $stCopy;
    }

    $totalSystemRevenue = 0;
    foreach ($calls as $c) {
        if (($c['status'] ?? '') === 'completed') {
            $totalSystemRevenue += ($c['fare'] ?? 0);
        }
    }

    $activeCount = count(array_filter($stations, fn($s) => ($s['status'] ?? '') === 'active'));
    $trialCount = count(array_filter($stations, fn($s) => ($s['status'] ?? '') === 'trial'));

    echo json_encode([
        'success' => true,
        'stats' => [
            'totalStations' => count($stations),
            'activeStations' => $activeCount,
            'trialStations' => $trialCount,
            'totalVehicles' => count($vehicles),
            'totalDrivers' => count($drivers),
            'totalCalls' => count($calls),
            'totalRevenue' => $totalSystemRevenue
        ],
        'stations' => $detailedStations
    ]);
    exit;
}

// ==========================================
// 3. YENİ DURAK EKLE
// ==========================================
if ($endpoint === 'admin/stations' && $method === 'POST') {
    $name = trim($input['name'] ?? '');
    $username = strtolower(trim($input['username'] ?? ''));
    $password = trim($input['password'] ?? '');
    $subdomain = strtolower(preg_replace('/[^a-z0-9]/', '', $input['subdomain'] ?? $username));

    if (!$name || !$username || !$password) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Durak adı, kullanıcı adı ve şifre zorunludur.']);
        exit;
    }

    $newId = 'durak_' . time();
    $newStation = [
        'id' => $newId,
        'name' => $name,
        'subdomain' => $subdomain,
        'username' => $username,
        'password' => $password,
        'officerName' => $input['officerName'] ?? '',
        'phone' => $input['phone'] ?? '',
        'officerEmail' => $input['officerEmail'] ?? '',
        'city' => $input['city'] ?? 'İzmir',
        'district' => $input['district'] ?? '',
        'address' => $input['address'] ?? '',
        'vehicleCount' => intval($input['vehicleCount'] ?? 0),
        'driverCount' => intval($input['driverCount'] ?? 0),
        'startDate' => $input['startDate'] ?? date('Y-m-d'),
        'status' => $input['status'] ?? 'active',
        'location' => [
            'lat' => floatval($input['lat'] ?? 38.4382),
            'lng' => floatval($input['lng'] ?? 27.1428)
        ],
        'geofenceRadiusMeters' => intval($input['geofenceRadiusMeters'] ?? 150),
        'settings' => [
            'driverTimeoutSeconds' => 30,
            'autoQueueOnEnter' => true,
            'allowOperatorManualReorder' => true,
            'themeColor' => 'purple'
        ],
        'createdAt' => date('c')
    ];

    if (!isset($data['stations'])) $data['stations'] = [];
    $data['stations'][] = $newStation;
    saveDb($dbFile, $data);

    echo json_encode(['success' => true, 'station' => $newStation]);
    exit;
}

// ==========================================
// 4. DURUM DEĞİŞTİR (AKTİF/PASİF)
// ==========================================
if (preg_match('#^admin/stations/([^/]+)/toggle-status$#', $endpoint, $m) && $method === 'POST') {
    $targetId = $m[1];
    $found = false;
    foreach ($data['stations'] as &$st) {
        if ($st['id'] === $targetId) {
            $st['status'] = ($st['status'] ?? 'active') === 'active' ? 'passive' : 'active';
            $found = $st;
            break;
        }
    }
    if ($found) {
        saveDb($dbFile, $data);
        echo json_encode(['success' => true, 'station' => $found]);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Durak bulunamadı']);
    }
    exit;
}

// ==========================================
// 5. DURAK DÜZENLE (PUT)
// ==========================================
if (preg_match('#^admin/stations/([^/]+)$#', $endpoint, $m) && ($method === 'PUT' || $method === 'POST')) {
    $targetId = $m[1];
    $found = false;
    foreach ($data['stations'] as &$st) {
        if ($st['id'] === $targetId) {
            if (!empty($input['name'])) $st['name'] = $input['name'];
            if (!empty($input['subdomain'])) $st['subdomain'] = strtolower(preg_replace('/[^a-z0-9]/', '', $input['subdomain']));
            if (!empty($input['username'])) $st['username'] = strtolower(trim($input['username']));
            if (!empty($input['password'])) $st['password'] = $input['password'];
            if (isset($input['officerName'])) $st['officerName'] = $input['officerName'];
            if (isset($input['phone'])) $st['phone'] = $input['phone'];
            if (isset($input['officerEmail'])) $st['officerEmail'] = $input['officerEmail'];
            if (isset($input['city'])) $st['city'] = $input['city'];
            if (isset($input['district'])) $st['district'] = $input['district'];
            if (isset($input['address'])) $st['address'] = $input['address'];
            if (isset($input['vehicleCount'])) $st['vehicleCount'] = intval($input['vehicleCount']);
            if (isset($input['driverCount'])) $st['driverCount'] = intval($input['driverCount']);
            if (isset($input['startDate'])) $st['startDate'] = $input['startDate'];
            if (isset($input['status'])) $st['status'] = $input['status'];
            $found = $st;
            break;
        }
    }
    if ($found) {
        saveDb($dbFile, $data);
        echo json_encode(['success' => true, 'station' => $found]);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Durak bulunamadı']);
    }
    exit;
}

// ==========================================
// 6. DURAK SİL (DELETE)
// ==========================================
if (preg_match('#^admin/stations/([^/]+)$#', $endpoint, $m) && $method === 'DELETE') {
    $targetId = $m[1];
    $data['stations'] = array_values(array_filter($data['stations'] ?? [], fn($s) => $s['id'] !== $targetId));
    $data['vehicles'] = array_values(array_filter($data['vehicles'] ?? [], fn($v) => ($v['station_id'] ?? '') !== $targetId));
    $data['drivers'] = array_values(array_filter($data['drivers'] ?? [], fn($d) => ($d['station_id'] ?? '') !== $targetId));
    saveDb($dbFile, $data);
    echo json_encode(['success' => true, 'message' => 'Durak silindi']);
    exit;
}

// ==========================================
// 7. DURAK PANELİ ENDPOİNTLERİ
// ==========================================
if (preg_match('#^stations/(.*?)/overview$#', $endpoint, $m) || $endpoint === 'stations/overview') {
    $rawStId = isset($m[1]) ? trim(explode('?', $m[1])[0]) : 'durak_demo';
    $stId = (!$rawStId || $rawStId === 'durak_merkez') ? 'durak_demo' : $rawStId;
    $station = null;
    foreach ($data['stations'] ?? [] as $s) {
        if ($s['id'] === $stId || in_array($stId, $s['aliasIds'] ?? []) || ($s['subdomain'] ?? '') === $stId || ($s['username'] ?? '') === $stId) {
            $station = $s;
            break;
        }
    }
    if (!$station && !empty($data['stations'])) {
        $station = $data['stations'][0];
    }
    $targetId = $station ? $station['id'] : 'durak_demo';

    $vehicles = array_values(array_filter($data['vehicles'] ?? [], fn($v) => ($v['station_id'] ?? '') === $targetId || ($v['station_id'] ?? '') === $stId));
    $drivers = array_values(array_filter($data['drivers'] ?? [], fn($d) => ($d['station_id'] ?? '') === $targetId || ($d['station_id'] ?? '') === $stId));
    $shifts = array_values(array_filter($data['shifts'] ?? [], fn($s) => ($s['station_id'] ?? '') === $targetId || ($s['station_id'] ?? '') === $stId));
    $qrPoints = array_values(array_filter($data['qrPoints'] ?? [], fn($q) => ($q['station_id'] ?? '') === $targetId || ($q['station_id'] ?? '') === $stId));
    $customers = array_values(array_filter($data['customers'] ?? [], fn($c) => ($c['station_id'] ?? '') === $targetId || ($c['station_id'] ?? '') === $stId));
    $announcements = array_values(array_filter($data['announcements'] ?? [], fn($a) => ($a['station_id'] ?? '') === $targetId || ($a['station_id'] ?? '') === $stId));
    $messages = array_values(array_filter($data['messages'] ?? [], fn($m) => ($m['station_id'] ?? '') === $targetId || ($m['station_id'] ?? '') === $stId));
    $allCalls = array_values(array_filter($data['calls'] ?? [], fn($c) => ($c['station_id'] ?? '') === $targetId || ($c['station_id'] ?? '') === $stId));
    $queue = $data['queue'] ?? [];

    $activeCalls = array_values(array_filter($allCalls, fn($c) => in_array($c['status'] ?? '', ['pending', 'dispatched', 'accepted', 'in_trip'])));
    $completedCalls = array_values(array_filter($allCalls, fn($c) => ($c['status'] ?? '') === 'completed'));

    $totalRevenue = 0;
    foreach ($completedCalls as $c) { $totalRevenue += ($c['fare'] ?? 240); }
    $todayRevenue = $totalRevenue > 0 ? $totalRevenue : 18450;
    $avgFare = count($completedCalls) > 0 ? round($todayRevenue / count($completedCalls)) : 260;

    $totalQRScans = 0;
    foreach ($qrPoints as $q) { $totalQRScans += ($q['totalScans'] ?? 0); }

    echo json_encode([
        'success' => true,
        'station' => $station,
        'stats' => [
            'totalVehicles' => count($vehicles),
            'totalDrivers' => count($drivers),
            'activeShifts' => count($shifts),
            'inQueueCount' => count($queue),
            'totalQRPoints' => count($qrPoints),
            'totalQRScans' => $totalQRScans,
            'activeCallsCount' => count($activeCalls),
            'completedCallsCount' => count($completedCalls),
            'totalCustomers' => count($customers),
            'totalRevenue' => $todayRevenue * 30,
            'todayRevenue' => $todayRevenue,
            'avgFare' => $avgFare
        ],
        'vehicles' => $vehicles,
        'drivers' => $drivers,
        'shifts' => $shifts,
        'queue' => $queue,
        'qrPoints' => $qrPoints,
        'activeCalls' => $activeCalls,
        'recentCalls' => array_reverse(array_slice($allCalls, -20)),
        'customers' => $customers,
        'announcements' => $announcements,
        'messages' => $messages
    ]);
    exit;
}

// Araçlar
if (preg_match('#^stations/([^/]+)/vehicles$#', $endpoint, $m)) {
    $stId = $m[1];
    $vehs = array_values(array_filter($data['vehicles'] ?? [], fn($v) => ($v['station_id'] ?? '') === $stId));
    echo json_encode(['success' => true, 'vehicles' => $vehs]);
    exit;
}

// Sürücüler
if (preg_match('#^stations/([^/]+)/drivers$#', $endpoint, $m)) {
    $stId = $m[1];
    $drvs = array_values(array_filter($data['drivers'] ?? [], fn($d) => ($d['station_id'] ?? '') === $stId));
    echo json_encode(['success' => true, 'drivers' => $drvs]);
    exit;
}

// Vardiyalar / Kuyruk
if (preg_match('#^stations/([^/]+)/shifts$#', $endpoint, $m)) {
    $stId = $m[1];
    $shs = array_values(array_filter($data['shifts'] ?? [], fn($s) => ($s['station_id'] ?? '') === $stId));
    echo json_encode(['success' => true, 'shifts' => $shs]);
    exit;
}

// QR Noktaları
if (preg_match('#^stations/([^/]+)/qr-points$#', $endpoint, $m)) {
    $stId = $m[1];
    $qrs = array_values(array_filter($data['qrPoints'] ?? [], fn($q) => ($q['station_id'] ?? '') === $stId));
    echo json_encode(['success' => true, 'qrPoints' => $qrs]);
    exit;
}

// Çağrılar
if (preg_match('#^stations/([^/]+)/calls$#', $endpoint, $m)) {
    $stId = $m[1];
    $cls = array_values(array_filter($data['calls'] ?? [], fn($c) => ($c['station_id'] ?? '') === $stId));
    echo json_encode(['success' => true, 'calls' => $cls]);
    exit;
}

// Duyurular
if (preg_match('#^stations/([^/]+)/announcements$#', $endpoint, $m)) {
    $stId = $m[1];
    $anns = array_values(array_filter($data['announcements'] ?? [], fn($a) => ($a['station_id'] ?? '') === $stId));
    echo json_encode(['success' => true, 'announcements' => $anns]);
    exit;
}

// QR Noktası Önizleme (JSON)
if (preg_match('#^stations/([^/]+)/qr-points/([^/]+)/preview$#', $endpoint, $m)) {
    $stId = $m[1];
    $qrId = $m[2];
    
    $station = null;
    foreach ($data['stations'] ?? [] as $s) {
        if (($s['id'] ?? '') === $stId) { $station = $s; break; }
    }
    if (!$station && !empty($data['stations'])) $station = $data['stations'][0];

    $qrPoint = null;
    foreach ($data['qrPoints'] ?? [] as $q) {
        if (($q['id'] ?? '') === $qrId || ($q['code'] ?? '') === $qrId) {
            $qrPoint = $q;
            break;
        }
    }
    if (!$qrPoint && !empty($data['qrPoints'])) $qrPoint = $data['qrPoints'][0];

    $code = $qrPoint ? ($qrPoint['code'] ?? 'KR-101') : 'KR-101';
    $targetUrl = 'https://taksideode.com.tr/cagri/' . $code;
    $qrDataUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=' . urlencode($targetUrl);

    $scans = $qrPoint['totalScans'] ?? 53;
    $calls = $qrPoint['successfulCalls'] ?? 39;
    $rate = $scans > 0 ? round(($calls / $scans) * 100) : 74;

    echo json_encode([
        'success' => true,
        'qrPoint' => $qrPoint,
        'station' => $station,
        'targetUrl' => $targetUrl,
        'qrDataUrl' => $qrDataUrl,
        'stats' => [
            'totalScans' => $scans,
            'successfulCalls' => $calls,
            'conversionRate' => $rate,
            'totalRevenue' => $calls * 180
        ]
    ]);
    exit;
}

// QR Noktası A4 / Etiket Baskı Şablonu (HTML)
if (preg_match('#^stations/([^/]+)/qr-points/([^/]+)/print$#', $endpoint, $m)) {
    $stId = $m[1];
    $qrId = $m[2];
    
    $station = null;
    foreach ($data['stations'] ?? [] as $s) {
        if (($s['id'] ?? '') === $stId) { $station = $s; break; }
    }
    if (!$station && !empty($data['stations'])) $station = $data['stations'][0];

    $qrPoint = null;
    foreach ($data['qrPoints'] ?? [] as $q) {
        if (($q['id'] ?? '') === $qrId || ($q['code'] ?? '') === $qrId) {
            $qrPoint = $q;
            break;
        }
    }
    if (!$qrPoint && !empty($data['qrPoints'])) $qrPoint = $data['qrPoints'][0];

    $code = $qrPoint ? ($qrPoint['code'] ?? 'KR-101') : 'KR-101';
    $title = $qrPoint ? htmlspecialchars($qrPoint['title'] ?? 'Alsancak İskele Girişi') : 'Alsancak İskele Girişi';
    $neighborhood = $qrPoint ? htmlspecialchars($qrPoint['neighborhood'] ?? 'Alsancak') : 'Alsancak';
    $landmark = $qrPoint ? htmlspecialchars($qrPoint['landmark'] ?? 'İskele Karşısı Aydınlatma Direği') : 'İskele Karşısı';
    $stationName = $station ? htmlspecialchars($station['name'] ?? 'İzmir Kordon Demo Taksi Durağı') : 'İzmir Kordon Demo Taksi Durağı';
    
    $targetUrl = 'https://taksideode.com.tr/cagri/' . $code;
    $qrDataUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=' . urlencode($targetUrl);

    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaksideÖde • Sokak QR Baskı Şablonu - ' . $code . '</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #0f172a;
      background: #f8fafc;
    }
    .print-card {
      background: #ffffff;
      border: 4px solid #7c3aed;
      border-radius: 28px;
      padding: 36px 30px;
      width: 100%;
      max-width: 460px;
      text-align: center;
      box-shadow: 0 16px 36px rgba(124, 58, 237, 0.12);
    }
    .badge {
      display: inline-block;
      background: #f5f3ff;
      color: #7c3aed;
      border: 1.5px solid #ddd6fe;
      font-weight: 800;
      font-size: 13px;
      padding: 6px 18px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .brand-title {
      font-size: 30px;
      font-weight: 900;
      color: #0f172a;
      margin: 0 0 6px 0;
      letter-spacing: -0.5px;
    }
    .station-name {
      font-size: 18px;
      font-weight: 700;
      color: #7c3aed;
      margin: 0 0 20px 0;
    }
    .qr-frame {
      background: #ffffff;
      border: 2px dashed #cbd5e1;
      border-radius: 20px;
      padding: 16px;
      display: inline-block;
      margin-bottom: 18px;
    }
    .qr-frame img {
      width: 240px;
      height: 240px;
      display: block;
    }
    .instruction {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 6px 0;
    }
    .sub-instruction {
      font-size: 14px;
      color: #64748b;
      margin: 0 0 16px 0;
    }
    .location-box {
      background: #faf5ff;
      border: 1.5px solid #ede9fe;
      border-radius: 14px;
      padding: 12px 16px;
      text-align: left;
    }
    .location-label {
      font-size: 11px;
      font-weight: 800;
      color: #7c3aed;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .location-value {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }
    .print-actions {
      margin-top: 24px;
      display: flex;
      gap: 12px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .print-actions { display: none !important; }
      .print-card { box-shadow: none; border: 3px solid #7c3aed; max-width: 100%; }
    }
    .btn-print {
      background: linear-gradient(135deg, #7c3aed, #5b21b6);
      color: #ffffff;
      border: none;
      font-size: 15px;
      font-weight: 800;
      padding: 12px 28px;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
    }
    .btn-close {
      background: #ffffff;
      color: #475569;
      border: 1px solid #cbd5e1;
      font-size: 14px;
      font-weight: 700;
      padding: 12px 20px;
      border-radius: 12px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="print-card">
    <div style="margin-bottom: 12px;">
      <img src="/images/logo.png" alt="TaksideÖde" style="height: 52px; object-fit: contain;">
    </div>
    <div class="badge">🚖 Akıllı Durak QR Çağrı</div>
    <h1 class="brand-title">TAKSİ ÇAĞIR</h1>
    <h2 class="station-name">' . $stationName . '</h2>
    
    <div class="qr-frame">
      <img src="' . $qrDataUrl . '" alt="QR Kod" />
    </div>

    <div class="instruction">Telefon Kamerasıyla Okutun</div>
    <div class="sub-instruction">Uygulama indirmeden saniyeler içinde taksiniz kapınıza gelsin.</div>

    <div class="location-box">
      <div class="location-label">📍 ÇAĞRI NOKTASI / SOKAK</div>
      <div class="location-value">' . $title . ' (' . $neighborhood . ')</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">' . $landmark . ' • QR Kod: <strong>' . $code . '</strong></div>
    </div>
  </div>

  <div class="print-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Yazıcıdan Çıkar (A4 / Etiket)</button>
    <button class="btn-close" onclick="window.close()">Kapat</button>
  </div>
</body>
</html>';
    exit;
}

// Sürücü Girişi (Durak alt alan adı + Plaka + Şifre ile Doğrulama)
if (preg_match('#^drivers/login$#', $endpoint)) {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $rawSub = trim($input['subdomain'] ?? '');
    $plate = strtoupper(trim(preg_replace('/\s+/', ' ', $input['plate'] ?? '')));
    $password = trim((string)($input['password'] ?? ''));

    // Alt alan adını temizle (Örn: "demodurak", "demodurak.taksideode.com.tr", "durak_demo")
    $subdomain = strtolower(str_replace(['https://', 'http://', '.taksideode.com.tr', '/'], '', $rawSub));
    if (empty($subdomain)) {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if (strpos($host, 'demodurak') !== false) {
            $subdomain = 'demodurak';
        }
    }
    if (empty($subdomain)) $subdomain = 'demodurak';

    // Durağı bul (subdomain veya id ile)
    $station = null;
    foreach ($data['stations'] ?? [] as $s) {
        $sSub = strtolower(trim($s['subdomain'] ?? ''));
        $sId = strtolower(trim($s['id'] ?? ''));
        if ($sSub === $subdomain || $sId === $subdomain) {
            $station = $s;
            break;
        }
    }

    if (!$station) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => "Belirtilen durak ('" . htmlspecialchars($subdomain) . "') sistemde bulunamadı. Lütfen durak adınızı kontrol edin."]);
        exit;
    }

    // Sadece BU DURAĞA ait şoförler arasından plakayı bul
    $driver = null;
    foreach ($data['drivers'] ?? [] as $d) {
        $dPlate = strtoupper(trim(preg_replace('/\s+/', ' ', $d['plate'] ?? '')));
        if (($d['station_id'] ?? '') === $station['id'] && $dPlate === $plate) {
            $driver = $d;
            break;
        }
    }

    if (!$driver) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => "Bu plaka ('" . htmlspecialchars($plate) . "') '" . htmlspecialchars($station['name']) . "' durağına kayıtlı değildir."]);
        exit;
    }

    // Şifre kontrolü (varsayılan: 123)
    $expectedPass = trim((string)($driver['password'] ?? '123'));
    if ($password !== $expectedPass) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Girdiğiniz şifre hatalıdır.']);
        exit;
    }

    // Aktif vardiya bul veya oluştur
    $shift = null;
    foreach ($data['shifts'] ?? [] as &$sh) {
        if (($sh['driver_id'] ?? '') === $driver['id']) {
            $shift = &$sh;
            break;
        }
    }
    if (!$shift) {
        $newShift = [
            'id' => 'sh_' . $driver['id'],
            'station_id' => $station['id'],
            'vehicle_id' => 'v_' . $driver['id'],
            'driver_id' => $driver['id'],
            'plate' => $driver['plate'],
            'driverName' => $driver['fullName'],
            'startTime' => date('c'),
            'status' => 'active',
            'state' => 'in_queue',
            'lat' => $station['location']['lat'] ?? 38.4382,
            'lng' => $station['location']['lng'] ?? 27.1428
        ];
        $data['shifts'][] = $newShift;
        saveData($data);
        $shift = $newShift;
    }

    echo json_encode([
        'success' => true,
        'driver' => $driver,
        'station' => $station,
        'shift' => $shift
    ]);
    exit;
}

// Sürücü Oturum Doğrulama
if (preg_match('#^drivers/verify-session$#', $endpoint)) {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $driverId = $input['driverId'] ?? '';
    $stationId = $input['stationId'] ?? '';

    $station = null;
    foreach ($data['stations'] ?? [] as $s) {
        if (($s['id'] ?? '') === $stationId) { $station = $s; break; }
    }
    $driver = null;
    if ($station) {
        foreach ($data['drivers'] ?? [] as $d) {
            if (($d['id'] ?? '') === $driverId && ($d['station_id'] ?? '') === $station['id']) {
                $driver = $d;
                break;
            }
        }
    }

    if ($driver && $station) {
        echo json_encode(['valid' => true, 'driver' => $driver, 'station' => $station]);
    } else {
        echo json_encode(['valid' => false, 'error' => 'Oturum bu durağa ait değil veya geçersiz.']);
    }
    exit;
}

// Sürücünün Aktif Çağrısı (İş Emri Bildirimi)
if (preg_match('#^drivers/([^/]+)/active-call$#', $endpoint, $m)) {
    $shiftId = $m[1];
    $activeCall = null;
    foreach ($data['calls'] ?? [] as $c) {
        if (in_array($c['status'] ?? '', ['dispatched', 'accepted', 'in_trip'])) {
            if (($c['assignedShiftId'] ?? '') === $shiftId || ($c['assignedTaxi']['shift_id'] ?? '') === $shiftId || ($c['assignedTaxi']['id'] ?? '') === $shiftId) {
                $activeCall = $c;
                break;
            }
        }
    }
    echo json_encode([
        'success' => true,
        'hasActiveCall' => ($activeCall !== null),
        'call' => $activeCall,
        'activeCall' => $activeCall
    ]);
    exit;
}

// Sürücü Çağrıyı Kabul Etti
if (preg_match('#^calls/([^/]+)/accept$#', $endpoint, $m)) {
    $callId = $m[1];
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $shiftId = $input['shiftId'] ?? '';

    foreach ($data['calls'] ?? [] as &$c) {
        if (($c['id'] ?? '') === $callId) {
            $c['status'] = 'accepted';
            $c['acceptedAt'] = date('c');
            break;
        }
    }
    foreach ($data['shifts'] ?? [] as &$s) {
        if (($s['id'] ?? '') === $shiftId) {
            $s['state'] = 'in_trip';
            break;
        }
    }
    saveData($data);
    echo json_encode(['success' => true]);
    exit;
}

// Sürücü Yolcuyu Aldı
if (preg_match('#^calls/([^/]+)/pickup$#', $endpoint, $m)) {
    $callId = $m[1];
    foreach ($data['calls'] ?? [] as &$c) {
        if (($c['id'] ?? '') === $callId) {
            $c['status'] = 'in_trip';
            $c['pickedUpAt'] = date('c');
            break;
        }
    }
    saveData($data);
    echo json_encode(['success' => true]);
    exit;
}

// Sürücü Seferi Tamamladı (Ödeme Alındı)
if (preg_match('#^calls/([^/]+)/complete$#', $endpoint, $m)) {
    $callId = $m[1];
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $shiftId = $input['shiftId'] ?? '';
    $fare = intval($input['fare'] ?? 180);

    foreach ($data['calls'] ?? [] as &$c) {
        if (($c['id'] ?? '') === $callId) {
            $c['status'] = 'completed';
            $c['completedAt'] = date('c');
            $c['fare'] = $fare;
            break;
        }
    }
    foreach ($data['shifts'] ?? [] as &$s) {
        if (($s['id'] ?? '') === $shiftId) {
            $s['state'] = 'in_queue';
            break;
        }
    }
    saveData($data);
    echo json_encode(['success' => true]);
    exit;
}

// Sürücü Çağrıyı Reddetti
if (preg_match('#^calls/([^/]+)/reject$#', $endpoint, $m)) {
    $callId = $m[1];
    foreach ($data['calls'] ?? [] as &$c) {
        if (($c['id'] ?? '') === $callId) {
            $c['status'] = 'pending';
            break;
        }
    }
    saveData($data);
    echo json_encode(['success' => true]);
    exit;
}

// Durak Kuyruğu
if (preg_match('#^stations/([^/]+)/queue$#', $endpoint, $m)) {
    $stId = $m[1];
    $queue = $data['queue'] ?? [];
    echo json_encode(['success' => true, 'queue' => $queue]);
    exit;
}

// Sürücü GPS Konum Güncellemesi
if (preg_match('#^drivers/location$#', $endpoint)) {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $shiftId = $input['shiftId'] ?? '';
    $lat = floatval($input['lat'] ?? 0);
    $lng = floatval($input['lng'] ?? 0);

    if ($shiftId && $lat && $lng) {
        foreach ($data['shifts'] ?? [] as &$s) {
            if (($s['id'] ?? '') === $shiftId) {
                $s['lat'] = $lat;
                $s['lng'] = $lng;
                break;
            }
        }
        saveData($data);
    }
    echo json_encode(['success' => true]);
    exit;
}

// Sürücü Performans Bilgisi
if (preg_match('#^drivers/([^/]+)/performance$#', $endpoint, $m)) {
    $drvId = $m[1];
    $drv = null;
    foreach ($data['drivers'] ?? [] as $d) {
        if (($d['id'] ?? '') === $drvId) { $drv = $d; break; }
    }
    $completed = array_values(array_filter($data['calls'] ?? [], fn($c) => ($c['assignedDriverId'] ?? '') === $drvId && ($c['status'] ?? '') === 'completed'));
    $totalRev = array_reduce($completed, fn($sum, $c) => $sum + intval($c['fare'] ?? 180), 0);

    echo json_encode([
        'success' => true,
        'stats' => [
            'rating' => $drv['rating'] ?? 5.0,
            'acceptanceRate' => 100,
            'totalTrips' => count($completed),
            'todayRevenue' => $totalRev,
            'monthlyRevenue' => $drv['monthlyRevenue'] ?? $totalRev
        ],
        'recentTrips' => array_slice(array_reverse($completed), 0, 10)
    ]);
    exit;
}

// Sürücü Sefer Geçmişi
if (preg_match('#^drivers/([^/]+)/history$#', $endpoint, $m)) {
    $shiftId = $m[1];
    $completed = array_values(array_filter($data['calls'] ?? [], fn($c) => (($c['assignedShiftId'] ?? '') === $shiftId || ($c['assignedTaxi']['shift_id'] ?? '') === $shiftId) && ($c['status'] ?? '') === 'completed'));
    echo json_encode(['success' => true, 'history' => array_slice(array_reverse($completed), 0, 10)]);
    exit;
}

// Yeni Çağrı (QR ile Yolcu Çağrısı)
if (preg_match('#^calls/qr$#', $endpoint)) {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $qrCode = trim($input['qrCode'] ?? 'KD-101');
    $customerPhone = trim($input['customerPhone'] ?? '');
    $dropoffAddress = trim($input['dropoffAddress'] ?? '');

    // QR Noktasını bul
    $qrPoint = null;
    foreach ($data['qrPoints'] ?? [] as $q) {
        if (($q['code'] ?? '') === $qrCode) { $qrPoint = $q; break; }
    }
    if (!$qrPoint && !empty($data['qrPoints'])) $qrPoint = $data['qrPoints'][0];

    $stationId = $qrPoint['station_id'] ?? 'durak_demo';
    
    // Sıradaki ilk müsait aracı bul
    $assignedShift = null;
    foreach ($data['shifts'] ?? [] as $sh) {
        if (($sh['station_id'] ?? '') === $stationId && ($sh['state'] ?? '') === 'in_queue') {
            $assignedShift = $sh;
            break;
        }
    }
    if (!$assignedShift) {
        foreach ($data['shifts'] ?? [] as $sh) {
            if (($sh['station_id'] ?? '') === $stationId) {
                $assignedShift = $sh;
                break;
            }
        }
    }

    $callId = 'call_' . time();
    $newCall = [
        'id' => $callId,
        'station_id' => $stationId,
        'source' => 'qr',
        'qr_code' => $qrCode,
        'pickupAddress' => $qrPoint ? ($qrPoint['title'] . ' (' . ($qrPoint['neighborhood'] ?? '') . ')') : 'Alsancak Kordon',
        'dropoffAddress' => $dropoffAddress ?: 'Konak Meydan',
        'customerName' => 'Yolcu (' . substr($customerPhone ?: '5415776277', -4) . ')',
        'customerPhone' => $customerPhone ?: '0541 577 62 77',
        'status' => 'dispatched',
        'assignedPlate' => $assignedShift ? $assignedShift['plate'] : '35 TKS 01',
        'assignedDriverName' => $assignedShift ? $assignedShift['driverName'] : 'Caner Demir',
        'assignedDriverId' => $assignedShift ? $assignedShift['driver_id'] : 'd_1',
        'assignedShiftId' => $assignedShift ? $assignedShift['id'] : 'sh_1',
        'assignedTaxi' => $assignedShift,
        'fare' => 180,
        'createdAt' => date('c')
    ];

    $data['calls'][] = $newCall;
    saveData($data);

    echo json_encode(['success' => true, 'call' => $newCall, 'assignedTaxi' => $assignedShift]);
    exit;
}

// Bilinmeyen Endpoint
echo json_encode(['success' => true, 'message' => 'TaksideÖde API Aktif']);
