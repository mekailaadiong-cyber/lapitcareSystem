<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($path === '/backend/api.php') {
    require __DIR__ . '/api.php';
    return true;
}

if (is_string($path) && str_starts_with($path, '/backend/')) {
    http_response_code(404);
    return true;
}

return false;
