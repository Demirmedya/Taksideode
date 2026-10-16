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
if (preg_match('#^stations/([^/]+)/overview$#', $endpoint, $m)) {
    $stId = $m[1];
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
    $targetId = $station ? $station['id'] : $stId;

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

// Bilinmeyen Endpoint
echo json_encode(['success' => true, 'message' => 'TaksideÖde API Aktif']);
