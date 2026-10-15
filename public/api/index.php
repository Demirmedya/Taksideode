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

    if (!$name || !$username || !$password) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Durak adı, kullanıcı adı ve şifre zorunludur.']);
        exit;
    }

    $newId = 'durak_' . time();
    $newStation = [
        'id' => $newId,
        'name' => $name,
        'username' => $username,
        'password' => $password,
        'officerName' => $input['officerName'] ?? '',
        'phone' => $input['phone'] ?? '',
        'city' => $input['city'] ?? 'İstanbul',
        'district' => $input['district'] ?? '',
        'address' => $input['address'] ?? '',
        'status' => $input['status'] ?? 'active',
        'location' => [
            'lat' => floatval($input['lat'] ?? 40.9876),
            'lng' => floatval($input['lng'] ?? 29.0267)
        ],
        'geofenceRadiusMeters' => intval($input['geofenceRadiusMeters'] ?? 100),
        'settings' => [
            'driverTimeoutSeconds' => 30,
            'autoQueueOnEnter' => true,
            'allowOperatorManualReorder' => true,
            'themeColor' => 'amber'
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
            if (!empty($input['username'])) $st['username'] = strtolower(trim($input['username']));
            if (!empty($input['password'])) $st['password'] = $input['password'];
            if (isset($input['officerName'])) $st['officerName'] = $input['officerName'];
            if (isset($input['phone'])) $st['phone'] = $input['phone'];
            if (isset($input['city'])) $st['city'] = $input['city'];
            if (isset($input['district'])) $st['district'] = $input['district'];
            if (isset($input['address'])) $st['address'] = $input['address'];
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
if (preg_match('#^stations/([^/]+)/overview$#', $endpoint, $m)) {
    $stId = $m[1];
    $station = null;
    foreach ($data['stations'] ?? [] as $s) {
        if ($s['id'] === $stId) { $station = $s; break; }
    }
    if (!$station && !empty($data['stations'])) {
        $station = $data['stations'][0];
    }
    echo json_encode([
        'success' => true,
        'station' => $station,
        'activeCalls' => array_values(array_filter($data['calls'] ?? [], fn($c) => ($c['station_id'] ?? '') === $stId && in_array($c['status'] ?? '', ['assigned', 'en_route', 'picked_up']))),
        'inQueueTaxis' => array_values(array_filter($data['vehicles'] ?? [], fn($v) => ($v['station_id'] ?? '') === $stId)),
        'financials' => [
            'todayTotalRevenue' => 12450,
            'todayTotalCalls' => 38,
            'activeVehiclesCount' => 8,
            'avgPickupMinutes' => 4.2
        ]
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

// Bilinmeyen Endpoint
echo json_encode(['success' => true, 'message' => 'TaksideÖde API Aktif']);
