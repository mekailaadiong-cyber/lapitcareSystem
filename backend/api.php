<?php
declare(strict_types=1);

const COLLECTIONS = [
    'activity_logs', 'appointments', 'barangays', 'clinics', 'faqs', 'feedback',
    'notifications', 'patients', 'schedules', 'services', 'slots', 'specialties',
    'staff', 'support_reports', 'users',
];

final class ApiError extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

function respond(array $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function requestBody(): array
{
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        throw new ApiError(400, 'A JSON object or array is required.');
    }
    return $body;
}

function database(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $configPath = __DIR__ . '/config.php';
    $config = is_file($configPath)
        ? require $configPath
        : require __DIR__ . '/configure.php';
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_port'],
        $config['db_name'],
    );
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    migrateAppointmentsView($pdo);
    $schema = (string)file_get_contents(__DIR__ . '/schema.sql');
    foreach (array_filter(array_map('trim', explode(';', $schema))) as $statement) {
        $pdo->exec($statement);
    }
    seedDatabase($pdo);
    normalizeLegacyIdentifiers($pdo);
    syncAppointmentTable($pdo);
    return $pdo;
}

function migrateAppointmentsView(PDO $pdo): void
{
    $statement = $pdo->prepare(
        'SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    );
    $statement->execute(['appointments']);
    if ($statement->fetchColumn() === 'VIEW') {
        $pdo->exec('DROP VIEW appointments');
    }
}

function syncAppointmentTable(PDO $pdo): void
{
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }
    try {
        $pdo->exec(
            "DELETE FROM appointments
            WHERE appointment_id NOT IN (
                SELECT record_id FROM app_records WHERE collection_name = 'appointments'
            )",
        );
        $statement = $pdo->prepare(
            'INSERT INTO appointments (
                appointment_id, reference_number, patient_id, clinic_id, staff_id, slot_id,
                appointment_date, appointment_time, service_name, appointment_status, booked_at, record_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                reference_number = VALUES(reference_number),
                patient_id = VALUES(patient_id),
                clinic_id = VALUES(clinic_id),
                staff_id = VALUES(staff_id),
                slot_id = VALUES(slot_id),
                appointment_date = VALUES(appointment_date),
                appointment_time = VALUES(appointment_time),
                service_name = VALUES(service_name),
                appointment_status = VALUES(appointment_status),
                booked_at = VALUES(booked_at),
                record_json = VALUES(record_json)',
        );
        $records = $pdo->query(
            "SELECT record_json FROM app_records WHERE collection_name = 'appointments' ORDER BY record_id",
        )->fetchAll();
        foreach ($records as $row) {
            $record = json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR);
            $statement->execute([
                (string)($record['appointment_id'] ?? recordKey($record)),
                isset($record['reference_number']) ? (string)$record['reference_number'] : null,
                isset($record['patient_id']) ? (string)$record['patient_id'] : null,
                isset($record['clinic_id']) ? (string)$record['clinic_id'] : null,
                isset($record['staff_id']) ? (string)$record['staff_id'] : null,
                isset($record['slot_id']) ? (string)$record['slot_id'] : null,
                isset($record['appointment_date']) ? (string)$record['appointment_date'] : null,
                isset($record['appointment_time']) ? (string)$record['appointment_time'] : null,
                isset($record['service_name']) ? (string)$record['service_name'] : null,
                isset($record['appointment_status']) ? (string)$record['appointment_status'] : null,
                isset($record['created_at']) ? (string)$record['created_at'] : null,
                json_encode($record, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ]);
        }
        if ($ownsTransaction) {
            $pdo->commit();
        }
    } catch (Throwable $error) {
        if ($ownsTransaction) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function shortIdMappings(PDO $pdo): array
{
    $definitions = [
        'clinics' => ['clinic_id', 'cln'],
        'patients' => ['patient_id', 'pat'],
        'staff' => ['staff_id', 'stf'],
        'slots' => ['slot_id', 'slot'],
        'appointments' => ['appointment_id', 'apt'],
    ];
    $rows = $pdo->query(
        'SELECT collection_name, record_id, record_json FROM app_records ORDER BY collection_name, record_id',
    )->fetchAll();
    $used = [];
    $maximum = [];
    foreach ($definitions as $collection => [$field, $prefix]) {
        $used[$collection] = [];
        $maximum[$collection] = 0;
        foreach ($rows as $row) {
            if ($row['collection_name'] !== $collection) {
                continue;
            }
            $record = json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR);
            $id = (string)($record[$field] ?? '');
            if (preg_match('/^' . preg_quote($prefix, '/') . '_(\d{3,5})$/', $id, $matches) === 1) {
                $number = (int)$matches[1];
                $used[$collection][$number] = true;
                $maximum[$collection] = max($maximum[$collection], $number);
            }
        }
    }

    $maps = [];
    foreach ($definitions as $collection => [$field, $prefix]) {
        $maps[$field] = [];
        foreach ($rows as $row) {
            if ($row['collection_name'] !== $collection) {
                continue;
            }
            $record = json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR);
            $oldId = (string)($record[$field] ?? '');
            if (preg_match('/^' . preg_quote($prefix, '/') . '_\d{3,5}$/', $oldId) === 1 || $oldId === '') {
                continue;
            }
            do {
                $number = ++$maximum[$collection];
                if ($number > 99999) {
                    throw new RuntimeException("No short identifiers remain for {$collection}.");
                }
            } while (isset($used[$collection][$number]));
            $used[$collection][$number] = true;
            $maps[$field][$oldId] = $prefix . '_' . str_pad((string)$number, 4, '0', STR_PAD_LEFT);
        }
    }

    return [$rows, $maps];
}

function normalizeLegacyIdentifiers(PDO $pdo): void
{
    $migrationKey = 'short-appointment-identifiers-v1';
    $check = $pdo->prepare('SELECT 1 FROM backend_migrations WHERE migration_key = ?');
    $check->execute([$migrationKey]);
    if ($check->fetchColumn()) {
        return;
    }

    [$rows, $maps] = shortIdMappings($pdo);
    $references = [];
    $usedReferences = [];
    $nextReference = 0;
    foreach ($rows as $row) {
        if ($row['collection_name'] !== 'appointments') {
            continue;
        }
        $record = json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR);
        $reference = (string)($record['reference_number'] ?? '');
        if (preg_match('/^LC-(\d{3,5})$/', $reference, $matches) === 1) {
            $number = (int)$matches[1];
            $usedReferences[$number] = true;
            $nextReference = max($nextReference, $number);
        }
    }
    foreach ($rows as $row) {
        if ($row['collection_name'] !== 'appointments') {
            continue;
        }
        $record = json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR);
        $reference = (string)($record['reference_number'] ?? '');
        if (preg_match('/^LC-\d{3,5}$/', $reference) === 1) {
            continue;
        }
        do {
            $number = ++$nextReference;
            if ($number > 99999) {
                throw new RuntimeException('No short appointment reference numbers remain.');
            }
        } while (isset($usedReferences[$number]));
        $usedReferences[$number] = true;
        $references[$reference] = 'LC-' . str_pad((string)$number, 4, '0', STR_PAD_LEFT);
    }

    $updates = [];
    foreach ($rows as $row) {
        $record = json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR);
        $original = $record;
        foreach (['clinic_id', 'patient_id', 'staff_id', 'slot_id'] as $field) {
            $value = (string)($record[$field] ?? '');
            if (isset($maps[$field][$value])) {
                $record[$field] = $maps[$field][$value];
            }
        }
        if (($row['collection_name'] ?? '') === 'clinics'
            && isset($maps['clinic_id'][(string)($record['clinic_id'] ?? '')])) {
            $record['clinic_id'] = $maps['clinic_id'][(string)$record['clinic_id']];
        }
        if (($row['collection_name'] ?? '') === 'patients'
            && isset($maps['patient_id'][(string)($record['patient_id'] ?? '')])) {
            $record['patient_id'] = $maps['patient_id'][(string)$record['patient_id']];
        }
        if (($row['collection_name'] ?? '') === 'staff'
            && isset($maps['staff_id'][(string)($record['staff_id'] ?? '')])) {
            $record['staff_id'] = $maps['staff_id'][(string)$record['staff_id']];
        }
        if (($row['collection_name'] ?? '') === 'slots'
            && isset($maps['slot_id'][(string)($record['slot_id'] ?? '')])) {
            $record['slot_id'] = $maps['slot_id'][(string)$record['slot_id']];
        }
        if (($row['collection_name'] ?? '') === 'appointments') {
            $oldAppointmentId = (string)($record['appointment_id'] ?? '');
            if (isset($maps['appointment_id'][$oldAppointmentId])) {
                $record['appointment_id'] = $maps['appointment_id'][$oldAppointmentId];
            }
            $reference = (string)($record['reference_number'] ?? '');
            if (isset($references[$reference])) {
                $record['reference_number'] = $references[$reference];
            }
        }
        $recipient = (string)($record['recipient_id'] ?? '');
        foreach (['patient_id', 'clinic_id'] as $field) {
            if (isset($maps[$field][$recipient])) {
                $record['recipient_id'] = $maps[$field][$recipient];
                break;
            }
        }
        $referenceId = (string)($record['reference_id'] ?? '');
        $referenceType = (string)($record['reference_type'] ?? '');
        $referenceField = match ($referenceType) {
            'appointment' => 'appointment_id',
            'patient' => 'patient_id',
            'clinic' => 'clinic_id',
            'staff' => 'staff_id',
            'slot' => 'slot_id',
            default => null,
        };
        if ($referenceField !== null && isset($maps[$referenceField][$referenceId])) {
            $record['reference_id'] = $maps[$referenceField][$referenceId];
        } elseif ($referenceType === 'appointment' && $referenceId !== '' && isset($references[$referenceId])) {
            $record['reference_id'] = $references[$referenceId];
        }
        if (($record['entity_type'] ?? '') === 'Appointment'
            && isset($maps['appointment_id'][(string)($record['entity_id'] ?? '')])) {
            $record['entity_id'] = $maps['appointment_id'][(string)$record['entity_id']];
        }
        $recordReference = (string)($record['reference_number'] ?? '');
        if ($recordReference !== '' && isset($references[$recordReference])) {
            $record['reference_number'] = $references[$recordReference];
        }
        if (is_string($record['message'] ?? null)) {
            foreach ($references as $oldReference => $newReference) {
                if ($oldReference !== '') {
                    $record['message'] = str_replace($oldReference, $newReference, $record['message']);
                }
            }
        }
        if ($record !== $original) {
            $newId = recordKey($record);
            $updates[] = [
                'collection' => $row['collection_name'],
                'old_id' => $row['record_id'],
                'new_id' => $newId,
                'json' => json_encode($record, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ];
        }
    }

    $pdo->beginTransaction();
    try {
        $statement = $pdo->prepare(
            'UPDATE app_records SET record_id = ?, record_json = ? WHERE collection_name = ? AND record_id = ?',
        );
        foreach ($updates as $update) {
            $statement->execute([
                $update['new_id'],
                $update['json'],
                $update['collection'],
                $update['old_id'],
            ]);
        }
        $statement = $pdo->prepare('INSERT IGNORE INTO backend_migrations (migration_key) VALUES (?)');
        $statement->execute([$migrationKey]);
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
}

function nextShortId(string $collection, string $prefix, array $reserved = []): string
{
    $maximum = 0;
    foreach (rows($collection) as $record) {
        $id = recordKey($record);
        if (preg_match('/^' . preg_quote($prefix, '/') . '_(\d{3,5})$/', $id, $matches) === 1) {
            $number = (int)$matches[1];
            $maximum = max($maximum, $number);
        }
    }
    foreach ($reserved as $id) {
        if (preg_match('/^' . preg_quote($prefix, '/') . '_(\d{3,5})$/', $id, $matches) === 1) {
            $number = (int)$matches[1];
            $maximum = max($maximum, $number);
        }
    }
    $number = nextSequenceNumber($collection, $maximum);
    if ($number > 99999) {
        throw new ApiError(503, "No short identifiers remain for {$collection}.");
    }
    return $prefix . '_' . str_pad((string)$number, 4, '0', STR_PAD_LEFT);
}

function nextSequenceNumber(string $sequence, int $initialMaximum): int
{
    $pdo = database();
    $statement = $pdo->prepare(
        'INSERT IGNORE INTO id_sequences (sequence_name, current_value) VALUES (?, ?)',
    );
    $statement->execute([$sequence, $initialMaximum]);
    $statement = $pdo->prepare(
        'UPDATE id_sequences SET current_value = GREATEST(current_value, ?) WHERE sequence_name = ?',
    );
    $statement->execute([$initialMaximum, $sequence]);
    $statement = $pdo->prepare(
        'UPDATE id_sequences SET current_value = LAST_INSERT_ID(current_value + 1) WHERE sequence_name = ?',
    );
    $statement->execute([$sequence]);
    return (int)$pdo->lastInsertId();
}

function nextAppointmentReference(array $reserved = []): string
{
    $maximum = 0;
    foreach (rows('appointments') as $record) {
        $reference = (string)($record['reference_number'] ?? '');
        if (preg_match('/^LC-(\d{3,5})$/', $reference, $matches) === 1) {
            $number = (int)$matches[1];
            $maximum = max($maximum, $number);
        }
    }
    foreach ($reserved as $reference) {
        if (preg_match('/^LC-(\d{3,5})$/', $reference, $matches) === 1) {
            $number = (int)$matches[1];
            $maximum = max($maximum, $number);
        }
    }
    $number = nextSequenceNumber('appointment-reference', $maximum);
    if ($number > 99999) {
        throw new ApiError(503, 'No short appointment reference numbers remain.');
    }
    return 'LC-' . str_pad((string)$number, 4, '0', STR_PAD_LEFT);
}

function recordKey(array $record): string
{
    foreach ($record as $key => $value) {
        if (str_ends_with((string)$key, '_id') && is_scalar($value) && (string)$value !== '') {
            return (string)$value;
        }
    }
    throw new ApiError(422, 'Every record must have an identifier field.');
}

function seedDatabase(PDO $pdo): void
{
    $count = (int)$pdo->query('SELECT COUNT(*) FROM app_records')->fetchColumn();
    if ($count > 0) {
        return;
    }

    $root = dirname(__DIR__);
    $insert = $pdo->prepare(
        'INSERT IGNORE INTO app_records (collection_name, record_id, record_json) VALUES (?, ?, ?)',
    );
    foreach (COLLECTIONS as $collection) {
        $path = $root . '/frontend/data/' . $collection . '.json';
        if (!is_file($path)) {
            continue;
        }
        $records = json_decode((string)file_get_contents($path), true);
        if (!is_array($records)) {
            throw new RuntimeException("Invalid seed file for {$collection}.");
        }
        foreach ($records as $index => $record) {
            if (!is_array($record)) {
                continue;
            }
            try {
                $id = recordKey($record);
            } catch (ApiError) {
                $id = 'seed_' . $index;
            }
            $insert->execute([$collection, $id, json_encode($record, JSON_THROW_ON_ERROR)]);
        }
    }
}

function rows(string $collection): array
{
    $statement = database()->prepare(
        'SELECT record_json FROM app_records WHERE collection_name = ? ORDER BY created_at, record_id',
    );
    $statement->execute([$collection]);
    return array_map(
        static fn(array $row): array => json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR),
        $statement->fetchAll(),
    );
}

function currentUser(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $statement = database()->prepare(
        'SELECT record_json FROM app_records WHERE collection_name = ? AND record_id = ?',
    );
    $statement->execute(['users', (string)$_SESSION['user_id']]);
    $row = $statement->fetch();
    if (!$row) {
        return null;
    }
    $user = json_decode($row['record_json'], true, 512, JSON_THROW_ON_ERROR);
    if (($user['account_status'] ?? '') !== 'Active') {
        $_SESSION = [];
        return null;
    }
    if (($user['role'] ?? '') === 'Patient') {
        foreach (rows('patients') as $patient) {
            if (($patient['user_id'] ?? '') === ($user['user_id'] ?? '')) {
                $user['patient_id'] = $patient['patient_id'] ?? null;
                break;
            }
        }
    }
    return $user;
}

function requireUser(): array
{
    $user = currentUser();
    if ($user === null) {
        throw new ApiError(401, 'Please sign in to continue.');
    }
    return $user;
}

function publicClinicIds(): array
{
    return array_values(array_map(
        static fn(array $row): string => (string)$row['clinic_id'],
        array_filter(rows('clinics'), static fn(array $row): bool =>
            !empty($row['verified']) && ($row['approval_status'] ?? '') === 'Approved'
        ),
    ));
}

function isDemoClinicAccount(?array $user): bool
{
    $demoMode = getenv('LAPITCARE_DEMO_MODE');
    if ($demoMode !== false && !filter_var($demoMode, FILTER_VALIDATE_BOOLEAN)) {
        return false;
    }
    return ($user['user_id'] ?? '') === 'usr_clinic_01'
        && ($user['clinic_id'] ?? '') === 'cln_001'
        && ($user['role'] ?? '') === 'Clinic Administrator';
}

function demoPatientHasAppointment(string $patientId): bool
{
    foreach (rows('appointments') as $appointment) {
        if ((string)($appointment['patient_id'] ?? '') === $patientId) {
            return true;
        }
    }
    return false;
}

function canSeeRecord(string $collection, array $record, ?array $user): bool
{
    if ($user !== null && ($user['role'] ?? '') === 'System Administrator') {
        return true;
    }
    if (isDemoClinicAccount($user) && $collection === 'appointments') {
        return true;
    }

    $role = $user['role'] ?? '';
    $userId = (string)($user['user_id'] ?? '');
    $patientId = (string)($user['patient_id'] ?? '');
    $clinicId = (string)($user['clinic_id'] ?? '');

    if ($collection === 'users') {
        return $user !== null && (string)($record['user_id'] ?? '') === $userId;
    }
    if ($collection === 'patients') {
        return ($role === 'Patient' && (string)($record['patient_id'] ?? '') === $patientId)
            || ($role === 'Clinic Administrator' && (string)($record['user_id'] ?? '') === $userId)
            || (isDemoClinicAccount($user) && demoPatientHasAppointment(
                (string)($record['patient_id'] ?? ''),
            ));
    }
    if ($collection === 'clinics') {
        return ($role === 'Clinic Administrator' && (string)($record['clinic_id'] ?? '') === $clinicId)
            || (!empty($record['verified']) && ($record['approval_status'] ?? '') === 'Approved');
    }
    if (in_array($collection, ['specialties', 'barangays', 'faqs'], true)) {
        return true;
    }

    if (in_array($collection, ['services', 'staff', 'schedules', 'slots', 'feedback'], true)) {
        $clinic = (string)($record['clinic_id'] ?? '');
        return ($role === 'Clinic Administrator' && $clinic === $clinicId)
            || ($clinic !== '' && in_array($clinic, publicClinicIds(), true));
    }

    if ($user === null) {
        return false;
    }
    if ($role === 'Clinic Administrator' && (string)($record['clinic_id'] ?? '') === $clinicId) {
        return true;
    }
    return (string)($record['user_id'] ?? '') === $userId
        || ($patientId !== '' && (string)($record['patient_id'] ?? '') === $patientId)
        || (string)($record['recipient_id'] ?? '') === $userId
        || ($patientId !== '' && (string)($record['recipient_id'] ?? '') === $patientId);
}

function visibleRows(string $collection, ?array $user): array
{
    return array_values(array_filter(
        rows($collection),
        static fn(array $record): bool => canSeeRecord($collection, $record, $user),
    ));
}

function cleanUser(array $user): array
{
    unset($user['password_hash']);
    return $user;
}

function normalizeMobile(string $value): string
{
    $digits = preg_replace('/\D+/', '', $value) ?? '';
    return str_starts_with($digits, '63') ? '0' . substr($digits, 2) : $digits;
}

function identityInUse(string $email, string $mobile, array $excludeIds = []): array
{
    $email = strtolower(trim($email));
    $mobile = normalizeMobile($mobile);
    $excludedOwners = $excludeIds;
    foreach (rows('users') as $user) {
        if (in_array((string)($user['user_id'] ?? ''), $excludeIds, true)
            || in_array((string)($user['clinic_id'] ?? ''), $excludeIds, true)) {
            $excludedOwners[] = (string)($user['user_id'] ?? '');
        }
    }
    $emailUsed = false;
    $mobileUsed = false;
    foreach (['users', 'patients', 'clinics'] as $collection) {
        foreach (rows($collection) as $record) {
            if (in_array(recordKey($record), $excludeIds, true)
                || in_array((string)($record['user_id'] ?? ''), $excludedOwners, true)
                || in_array((string)($record['clinic_id'] ?? ''), $excludeIds, true)) {
                continue;
            }
            $recordEmail = strtolower(trim((string)($record['email'] ?? '')));
            $recordMobile = normalizeMobile((string)($record['mobile_number'] ?? $record['contact_number'] ?? ''));
            $emailUsed = $emailUsed || ($email !== '' && $recordEmail === $email);
            $mobileUsed = $mobileUsed || ($mobile !== '' && $recordMobile === $mobile);
        }
    }
    return ['email' => $emailUsed, 'mobile' => $mobileUsed];
}

function canModifyRecord(string $collection, array $record, array $user): bool
{
    if (($user['role'] ?? '') === 'System Administrator') {
        return true;
    }
    if (isDemoClinicAccount($user) && $collection === 'appointments') {
        return true;
    }
    $userId = (string)($user['user_id'] ?? '');
    $patientId = (string)($user['patient_id'] ?? '');
    $clinicId = (string)($user['clinic_id'] ?? '');
    if ($collection === 'users') {
        return (string)($record['user_id'] ?? '') === $userId;
    }
    if ($collection === 'patients') {
        return ($patientId !== '' && (string)($record['patient_id'] ?? '') === $patientId)
            || (string)($record['user_id'] ?? '') === $userId;
    }
    if ($collection === 'slots' && ($user['role'] ?? '') === 'Patient') {
        foreach (rows('appointments') as $appointment) {
            if (($appointment['slot_id'] ?? '') === ($record['slot_id'] ?? '')
                && ($appointment['patient_id'] ?? '') === $patientId) {
                return true;
            }
        }
        return false;
    }
    if (isDemoClinicAccount($user) && $collection === 'slots') {
        foreach (rows('appointments') as $appointment) {
            if (($appointment['slot_id'] ?? '') === ($record['slot_id'] ?? '')) {
                return true;
            }
        }
        return false;
    }
    if ($collection === 'clinics') {
        return ($clinicId !== '' && (string)($record['clinic_id'] ?? '') === $clinicId);
    }
    if (($user['role'] ?? '') === 'Clinic Administrator') {
        return $clinicId !== '' && (string)($record['clinic_id'] ?? '') === $clinicId;
    }
    return ($patientId !== '' && (string)($record['patient_id'] ?? '') === $patientId)
        || (string)($record['user_id'] ?? '') === $userId
        || (string)($record['recipient_id'] ?? '') === $userId
        || ($patientId !== '' && (string)($record['recipient_id'] ?? '') === $patientId);
}

function assertSafeUpdate(string $collection, array $before, array $after, array $user): void
{
    if (($user['role'] ?? '') === 'System Administrator') {
        return;
    }

    foreach (['user_id', 'patient_id', 'clinic_id', 'role', 'account_status', 'email_verified'] as $field) {
        if (array_key_exists($field, $before) && ($after[$field] ?? null) !== $before[$field]) {
            throw new ApiError(403, 'Account ownership and access controls cannot be changed here.');
        }
    }

    $changed = [];
    foreach ($after as $field => $value) {
        if (!array_key_exists($field, $before) || $before[$field] !== $value) {
            $changed[] = $field;
        }
    }
    if (isDemoClinicAccount($user)
        && $collection === 'appointments'
        && $changed
        && (($before['appointment_status'] ?? '') !== 'Pending'
            || ($after['appointment_status'] ?? '') !== 'Confirmed')) {
        throw new ApiError(403, 'The demo clinic account can only approve pending appointments.');
    }
    $allowed = match ($collection) {
        'users' => ['name', 'email', 'mobile_number', 'updated_at'],
        'patients' => ['name', 'first_name', 'middle_name', 'last_name', 'suffix', 'preferred_name', 'email', 'mobile_number', 'barangay', 'city', 'province', 'profile_photo', 'profile_photo_ref', 'updated_at'],
        'clinics' => array_keys($after),
        'appointments' => isDemoClinicAccount($user)
            ? ['appointment_status', 'status_history']
            : (($user['role'] ?? '') === 'Clinic Administrator'
                ? ['appointment_status', 'status_history', 'cancellation_reason', 'requested_reschedule', 'slot_id', 'staff_id', 'appointment_date', 'appointment_time']
                : ['appointment_status', 'status_history', 'cancellation_reason', 'requested_reschedule']),
        'slots' => ($user['role'] ?? '') === 'Clinic Administrator'
            ? ['slot_status', 'availability_reason']
            : ['slot_status'],
        'notifications' => ['read', 'updated_at'],
        default => array_keys($after),
    };
    foreach ($changed as $field) {
        if ($field === 'password_hash' || !in_array($field, $allowed, true)) {
            throw new ApiError(403, 'This field cannot be changed from this account.');
        }
    }

    if ($collection === 'clinics') {
        if (array_key_exists('approval_status', $after)
            && $after['approval_status'] !== ($before['approval_status'] ?? null)
            && !(in_array($before['approval_status'] ?? '', ['Rejected', 'Needs Correction'], true)
                && $after['approval_status'] === 'Pending')) {
            throw new ApiError(403, 'Clinic approval status can only be changed by an administrator.');
        }
        if (array_key_exists('registration_status', $after)
            && $after['registration_status'] !== ($before['registration_status'] ?? null)
            && !(($before['registration_status'] ?? '') === 'Needs Correction'
                && $after['registration_status'] === 'Pending Review')) {
            throw new ApiError(403, 'Clinic registration status can only be changed by an administrator.');
        }
        if (array_key_exists('verified', $after) && $after['verified'] !== ($before['verified'] ?? null)) {
            throw new ApiError(403, 'Clinic verification can only be changed by an administrator.');
        }
    }

    if ($collection === 'appointments'
        && isset($after['appointment_status'])
        && $after['appointment_status'] !== ($before['appointment_status'] ?? null)) {
        $status = (string)$after['appointment_status'];
        if (isDemoClinicAccount($user) && $status !== 'Confirmed') {
            throw new ApiError(403, 'The demo clinic account can only approve pending appointments.');
        }
        if (($user['role'] ?? '') === 'Patient'
            && !in_array($status, ['Cancellation Requested', 'Reschedule Requested', 'Cancelled'], true)) {
            throw new ApiError(403, 'Patients can only request appointment changes or cancellation.');
        }
        if (($user['role'] ?? '') === 'Clinic Administrator'
            && !in_array($status, ['Confirmed', 'Rejected', 'Cancelled', 'Completed', 'No-show'], true)) {
            throw new ApiError(403, 'The appointment status is not available to clinic accounts.');
        }
    }

    if ($collection === 'slots'
        && array_key_exists('slot_status', $after)
        && $after['slot_status'] !== ($before['slot_status'] ?? null)
        && ($user['role'] ?? '') === 'Patient') {
        $validTransition = false;
        foreach (rows('appointments') as $appointment) {
            if (($appointment['slot_id'] ?? '') !== ($before['slot_id'] ?? '')
                || ($appointment['patient_id'] ?? '') !== ($user['patient_id'] ?? '')) {
                continue;
            }
            $validTransition = ($before['slot_status'] ?? '') === 'Available'
                && $after['slot_status'] === 'Booked'
                && ($appointment['appointment_status'] ?? '') === 'Pending';
            $validTransition = $validTransition || (
                ($before['slot_status'] ?? '') === 'Booked'
                && $after['slot_status'] === 'Available'
                && in_array($appointment['appointment_status'] ?? '', ['Cancelled', 'Rejected'], true)
            );
            break;
        }
        if (!$validTransition) {
            throw new ApiError(403, 'This appointment does not allow that schedule change.');
        }
    }
}

function insertRecord(string $collection, array $record): void
{
    $statement = database()->prepare(
        'INSERT INTO app_records (collection_name, record_id, record_json) VALUES (?, ?, ?)',
    );
    $statement->execute([
        $collection,
        recordKey($record),
        json_encode($record, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
    ]);
}

function logAccountEvent(
    string $action,
    string $eventType,
    string $userName,
    ?string $userId = null,
    ?string $role = null,
    array $details = [],
): void {
    $event = [
        'activity_log_id' => 'log_' . bin2hex(random_bytes(12)),
        'user_id' => $userId,
        'user_name' => $userName,
        'user_role' => $role,
        'action' => $action,
        'entity_type' => $eventType,
        'created_at' => gmdate(DATE_ATOM),
    ];
    foreach ($details as $key => $value) {
        if (!in_array($key, ['password', 'password_hash', 'identifier', 'email', 'mobile_number'], true)) {
            $event[$key] = $value;
        }
    }
    insertRecord('activity_logs', $event);
}

function login(string $identifier, string $password): array
{
    $identifier = trim($identifier);
    $emailLogin = str_contains($identifier, '@');
    $normalized = $emailLogin ? strtolower($identifier) : normalizeMobile($identifier);
    $matches = [];
    $patients = rows('patients');
    $clinics = rows('clinics');
    foreach (rows('users') as $user) {
        $candidate = $emailLogin
            ? strtolower(trim((string)($user['email'] ?? '')))
            : normalizeMobile((string)($user['mobile_number'] ?? ''));
        if (!$emailLogin && $candidate === '') {
            if (($user['role'] ?? '') === 'Patient') {
                foreach ($patients as $patient) {
                    if (($patient['user_id'] ?? '') === ($user['user_id'] ?? '')) {
                        $candidate = normalizeMobile((string)($patient['mobile_number'] ?? ''));
                        break;
                    }
                }
            } elseif (($user['role'] ?? '') === 'Clinic Administrator') {
                foreach ($clinics as $clinic) {
                    if (($clinic['clinic_id'] ?? '') === ($user['clinic_id'] ?? '')) {
                        $candidate = normalizeMobile((string)($clinic['contact_number'] ?? ''));
                        break;
                    }
                }
            }
        }
        if ($candidate !== '' && hash_equals($normalized, $candidate)) {
            $matches[] = $user;
        }
    }
    if (count($matches) !== 1) {
        logAccountEvent('Failed login', 'Authentication', 'Unidentified account', null, null, [
            'login_method' => 'password',
            'result' => 'failed',
        ]);
        throw new ApiError(401, 'The email or mobile number and password do not match.');
    }
    $user = $matches[0];
    $hash = (string)($user['password_hash'] ?? '');
    $valid = password_verify($password, $hash)
        || (preg_match('/^[a-f0-9]{64}$/i', $hash) === 1 && hash_equals(strtolower($hash), hash('sha256', $password)));
    if (!$valid) {
        logAccountEvent('Failed login', 'Authentication', 'Unverified account', null, null, [
            'login_method' => 'password',
            'result' => 'failed',
        ]);
        throw new ApiError(401, 'The email or mobile number and password do not match.');
    }
    if (!str_starts_with($hash, '$2y$') && !str_starts_with($hash, '$argon2')) {
        $user['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
        $statement = database()->prepare(
            'UPDATE app_records SET record_json = ? WHERE collection_name = ? AND record_id = ?',
        );
        $statement->execute([
            json_encode($user, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            'users',
            recordKey($user),
        ]);
    }
    if (($user['account_status'] ?? '') !== 'Active') {
        logAccountEvent('Login denied for inactive account', 'Authentication', (string)($user['name'] ?? 'Account'), recordKey($user), $user['role'] ?? null, [
            'login_method' => 'password',
            'result' => 'denied',
        ]);
        throw new ApiError(403, 'This account is not active.');
    }
    logAccountEvent('Successful login', 'Authentication', (string)($user['name'] ?? 'Account'), recordKey($user), $user['role'] ?? null, [
        'login_method' => 'password',
        'result' => 'success',
    ]);
    session_regenerate_id(true);
    $_SESSION['user_id'] = recordKey($user);
    if (isDemoClinicAccount($user)) {
        $user['demo_appointment_access'] = true;
    }
    return cleanUser($user);
}

function registerAccount(array $body, string $role): array
{
    $patient = $body['patient'] ?? null;
    $clinic = $body['clinic'] ?? null;
    $user = $body['user'] ?? null;
    $password = $body['password'] ?? '';
    if (!is_array($user) || !is_array($patient ?? $clinic) || !is_string($password) || strlen($password) < 8) {
        throw new ApiError(422, 'Please provide complete account details and a password of at least 8 characters.');
    }
    $expectedRole = $role === 'Patient' ? 'Patient' : 'Clinic Administrator';
    if (($user['role'] ?? '') !== $expectedRole) {
        throw new ApiError(422, 'The account role is invalid.');
    }
    if (!filter_var((string)($user['email'] ?? ''), FILTER_VALIDATE_EMAIL)) {
        throw new ApiError(422, 'Enter a valid email address.');
    }
    if (preg_match('/^09\d{9}$/', normalizeMobile((string)($user['mobile_number'] ?? ''))) !== 1) {
        throw new ApiError(422, 'Enter a valid Philippine mobile number.');
    }
    $identity = identityInUse((string)($user['email'] ?? ''), (string)($user['mobile_number'] ?? ''));
    if ($role === 'Clinic Administrator') {
        if (!is_array($clinic)
            || !filter_var((string)($clinic['email'] ?? ''), FILTER_VALIDATE_EMAIL)
            || preg_match('/^09\d{9}$/', normalizeMobile((string)($clinic['contact_number'] ?? ''))) !== 1) {
            throw new ApiError(422, 'Enter valid clinic email and Philippine mobile details.');
        }
        $clinicIdentity = identityInUse(
            (string)($clinic['email'] ?? ''),
            (string)($clinic['contact_number'] ?? ''),
        );
        $identity['email'] = $identity['email'] || $clinicIdentity['email'];
        $identity['mobile'] = $identity['mobile'] || $clinicIdentity['mobile'];
    }
    if ($identity['email'] || $identity['mobile']) {
        throw new ApiError(409, $identity['email']
            ? 'An account already uses this email address.'
            : 'An account already uses this mobile number.');
    }

    $user['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
    $user['account_status'] = 'Active';
    unset($user['password']);
    if ($role === 'Patient') {
        if (($patient['user_id'] ?? '') !== ($user['user_id'] ?? '')) {
            throw new ApiError(422, 'The patient profile does not match the account.');
        }
        $patient['email'] = $user['email'] ?? $patient['email'] ?? '';
        $patient['mobile_number'] = $user['mobile_number'] ?? $patient['mobile_number'] ?? '';
        $patient['account_status'] = 'Active';
    } else {
        if (!is_array($clinic) || ($user['clinic_id'] ?? '') !== ($clinic['clinic_id'] ?? '')) {
            throw new ApiError(422, 'The clinic profile does not match the account.');
        }
        $clinic['approval_status'] = 'Pending';
        $clinic['verified'] = false;
        $clinic['registration_status'] = 'Pending Review';
        $clinic['clinic_status'] = 'Closed';
    }

    $pdo = database();
    $pdo->beginTransaction();
    try {
        if ($role === 'Patient') {
            $patient['patient_id'] = nextShortId('patients', 'pat');
        } else {
            $clinic['clinic_id'] = nextShortId('clinics', 'cln');
            $user['clinic_id'] = $clinic['clinic_id'];
        }
        insertRecord('users', $user);
        if ($role === 'Patient') {
            insertRecord('patients', $patient);
        } else {
            insertRecord('clinics', $clinic);
            insertRecord('notifications', [
                'notification_id' => 'not_reg_' . bin2hex(random_bytes(8)),
                'recipient_id' => 'system_admin',
                'clinic_id' => $clinic['clinic_id'],
                'notification_type' => 'Clinic registration',
                'message' => 'A new clinic registration from ' . (string)($clinic['clinic_name'] ?? 'a clinic') . ' is awaiting review.',
                'reference_type' => 'clinic',
                'reference_id' => $clinic['clinic_id'],
                'read' => false,
                'created_at' => gmdate(DATE_ATOM),
            ]);
        }
        logAccountEvent(
            $role === 'Patient' ? 'Patient registration completed' : 'Clinic registration submitted',
            $role === 'Patient' ? 'Patient' : 'Clinic',
            (string)($user['name'] ?? 'New account'),
            recordKey($user),
            $role,
            [
                'entity_id' => $role === 'Patient' ? recordKey($patient) : recordKey($clinic),
                'result' => 'success',
            ],
        );
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        if ($error instanceof PDOException && (string)$error->getCode() === '23000') {
            throw new ApiError(409, 'This account was already submitted.');
        }
        throw $error;
    }
    if ($role === 'Clinic Administrator') {
        session_regenerate_id(true);
        $_SESSION['user_id'] = recordKey($user);
    }
    return [
        'user' => cleanUser($user),
        ($role === 'Patient' ? 'patient' : 'clinic') => $role === 'Patient' ? $patient : $clinic,
    ];
}

function handleAction(string $action, array $body): array
{
    if ($action === 'current-user') {
        $user = requireUser();
        if (isDemoClinicAccount($user)) {
            $user['demo_appointment_access'] = true;
        }
        return ['user' => cleanUser($user)];
    }
    if ($action === 'login') {
        return ['user' => login((string)($body['identifier'] ?? ''), (string)($body['password'] ?? ''))];
    }
    if ($action === 'demo-login') {
        if (getenv('LAPITCARE_DEMO_MODE') !== false
            && !filter_var((string)getenv('LAPITCARE_DEMO_MODE'), FILTER_VALIDATE_BOOLEAN)) {
            throw new ApiError(404, 'Unknown API action.');
        }
        $role = (string)($body['role'] ?? '');
        $ids = [
            'Patient' => 'usr_patient_01',
            'Clinic Administrator' => 'usr_clinic_01',
            'System Administrator' => 'usr_admin_01',
        ];
        if (!isset($ids[$role])) {
            throw new ApiError(422, 'Unknown demo portal.');
        }
        $user = null;
        foreach (rows('users') as $record) {
            if (($record['user_id'] ?? '') === $ids[$role]) {
                $user = $record;
                break;
            }
        }
        if ($user === null) {
            throw new ApiError(404, 'The demo account is missing from the seed data.');
        }
        logAccountEvent('Successful demo login', 'Authentication', (string)($user['name'] ?? 'Demo account'), recordKey($user), $role, [
            'login_method' => 'demo',
            'result' => 'success',
        ]);
        session_regenerate_id(true);
        $_SESSION['user_id'] = $ids[$role];
        if ($role === 'Clinic Administrator') {
            $user['demo_appointment_access'] = true;
        }
        return ['user' => cleanUser($user)];
    }
    if ($action === 'register-patient') {
        return registerAccount($body, 'Patient');
    }
    if ($action === 'register-clinic') {
        return registerAccount($body, 'Clinic Administrator');
    }
    if ($action === 'identity-check') {
        $excluded = array_values(array_filter([
            'user_id' => (string)($body['exclude_user_id'] ?? ''),
            'patient_id' => (string)($body['exclude_patient_id'] ?? ''),
            'clinic_id' => (string)($body['exclude_clinic_id'] ?? ''),
        ]));
        return identityInUse(
            (string)($body['email'] ?? ''),
            (string)($body['mobile'] ?? ''),
            $excluded,
        );
    }
    if ($action === 'begin-password-reset') {
        throw new ApiError(503, 'Password reset email delivery is not configured.');
    }
    if ($action === 'update-password') {
        throw new ApiError(503, 'Password reset email delivery is not configured.');
    }
    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        $cookie = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $cookie['path'],
            'domain' => $cookie['domain'],
            'secure' => $cookie['secure'],
            'httponly' => $cookie['httponly'],
            'samesite' => $cookie['samesite'] ?? 'Lax',
        ]);
        return ['signed_out' => true];
    }
    throw new ApiError(404, 'Unknown API action.');
}

function handleCollection(string $collection, string $method): array
{
    if (!in_array($collection, COLLECTIONS, true)) {
        throw new ApiError(404, 'Unknown data collection.');
    }
    $user = currentUser();
    if ($method === 'GET') {
        if ($user === null
            && !in_array($collection, ['clinics', 'services', 'staff', 'schedules', 'slots', 'feedback', 'specialties', 'barangays', 'faqs'], true)) {
            throw new ApiError(401, 'Please sign in to view this data.');
        }
        $result = visibleRows($collection, $user);
        if ($collection === 'users') {
            $result = array_map('cleanUser', $result);
        }
        return ['data' => $result];
    }
    if ($method !== 'PUT') {
        throw new ApiError(405, 'This HTTP method is not supported.');
    }
    $user = requireUser();
    $incoming = requestBody();
    if (!array_is_list($incoming)) {
        throw new ApiError(422, 'Collection updates must be JSON arrays.');
    }
    $existingById = [];
    foreach (rows($collection) as $record) {
        $existingById[recordKey($record)] = $record;
    }
    $reservedIds = [];
    $reservedReferences = [];
    $idDefinitions = [
        'clinics' => ['clinic_id', 'cln'],
        'patients' => ['patient_id', 'pat'],
        'staff' => ['staff_id', 'stf'],
        'slots' => ['slot_id', 'slot'],
        'appointments' => ['appointment_id', 'apt'],
    ];
    foreach ($incoming as &$record) {
        if (!is_array($record)) {
            continue;
        }
        if (($user['role'] ?? '') === 'Patient') {
            if ($collection === 'appointments' || array_key_exists('patient_id', $record)) {
                $record['patient_id'] = (string)$user['patient_id'];
            }
            $recipient = (string)($record['recipient_id'] ?? '');
            if (str_starts_with($recipient, 'pat_')) {
                $record['recipient_id'] = (string)$user['patient_id'];
            }
        }
        $oldId = recordKey($record);
        if (isset($existingById[$oldId]) || !isset($idDefinitions[$collection])) {
            continue;
        }
        [$field, $prefix] = $idDefinitions[$collection];
        $record[$field] = nextShortId($collection, $prefix, $reservedIds);
        $reservedIds[] = $record[$field];
        if ($collection === 'appointments') {
            $record['reference_number'] = nextAppointmentReference($reservedReferences);
            $reservedReferences[] = $record['reference_number'];
        }
    }
    unset($record);
    $writable = [];
    foreach ($incoming as $record) {
        if (!is_array($record)) {
            throw new ApiError(422, 'Collection records must be JSON objects.');
        }
        $id = recordKey($record);
        if (!canModifyRecord($collection, $record, $user)) {
            if (isset($existingById[$id])
                && canSeeRecord($collection, $existingById[$id], $user)
                && $record == $existingById[$id]) {
                continue;
            }
            throw new ApiError(403, 'You cannot modify records outside your account.');
        }
        if (($user['role'] ?? '') !== 'System Administrator'
            && $collection === 'users'
            && (string)($record['user_id'] ?? '') !== (string)$user['user_id']) {
            throw new ApiError(403, 'You cannot modify another account.');
        }
        $writable[] = $record;
    }
    $incoming = $writable;

    $pdo = database();
    $pdo->beginTransaction();
    try {
        $existing = rows($collection);
        $visibleIds = [];
        foreach ($existing as $record) {
            if (canModifyRecord($collection, $record, $user)) {
                $visibleIds[recordKey($record)] = true;
            }
        }
        $existingById = [];
        foreach ($existing as $record) {
            $existingById[recordKey($record)] = $record;
        }
        foreach ($incoming as &$record) {
            $id = recordKey($record);
            if ($collection === 'users' && isset($existingById[$id]) && !isset($record['password_hash'])) {
                $record['password_hash'] = $existingById[$id]['password_hash'] ?? '';
            }
        }
        unset($record);
        foreach ($incoming as $record) {
            $id = recordKey($record);
            if (($user['role'] ?? '') !== 'System Administrator'
                && !isset($existingById[$id])
                && in_array($collection, ['users', 'patients', 'clinics'], true)) {
                throw new ApiError(403, 'Accounts and clinic profiles must use the registration workflow.');
            }
            if (isset($existingById[$id])) {
                assertSafeUpdate($collection, $existingById[$id], $record, $user);
            }
        }
        if (($user['role'] ?? '') !== 'System Administrator'
            && in_array($collection, ['users', 'patients', 'clinics'], true)) {
            foreach (array_keys($visibleIds) as $id) {
                if (!in_array($id, array_map('recordKey', $incoming), true)) {
                    throw new ApiError(403, 'Core account records cannot be deleted.');
                }
            }
        }
        $remove = $pdo->prepare('DELETE FROM app_records WHERE collection_name = ? AND record_id = ?');
        foreach (array_keys($visibleIds) as $id) {
            $remove->execute([$collection, $id]);
        }
        $put = $pdo->prepare(
            'INSERT INTO app_records (collection_name, record_id, record_json) VALUES (?, ?, ?)',
        );
        foreach ($incoming as $record) {
            $id = recordKey($record);
            $put->execute([
                $collection,
                $id,
                json_encode($record, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ]);
            if ($collection === 'appointments'
                && !isset($existingById[$id])
                && ($user['role'] ?? '') === 'Patient') {
                $clinicId = (string)($record['clinic_id'] ?? '');
                $reference = (string)($record['reference_number'] ?? $id);
                insertRecord('notifications', [
                    'notification_id' => 'not_appt_' . bin2hex(random_bytes(10)),
                    'recipient_id' => $clinicId,
                    'clinic_id' => $clinicId,
                    'notification_type' => 'Appointment request',
                    'message' => 'A new appointment request (' . $reference . ') needs review.',
                    'reference_type' => 'appointment',
                    'reference_id' => $id,
                    'read' => false,
                    'created_at' => gmdate(DATE_ATOM),
                ]);
                logAccountEvent(
                    'Appointment request submitted',
                    'Appointment',
                    (string)($user['name'] ?? 'Patient'),
                    (string)$user['user_id'],
                    (string)$user['role'],
                    [
                        'entity_id' => $id,
                        'clinic_id' => $record['clinic_id'] ?? null,
                        'reference_number' => $record['reference_number'] ?? null,
                        'appointment_date' => $record['appointment_date'] ?? null,
                        'appointment_status' => $record['appointment_status'] ?? 'Pending',
                        'result' => 'success',
                    ],
                );
            }
        }
        if ($collection === 'appointments') {
            syncAppointmentTable($pdo);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
    return [
        'data' => $collection === 'users'
            ? array_map('cleanUser', $incoming)
            : $incoming,
    ];
}

try {
    ini_set('session.use_strict_mode', '1');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    session_start();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if ($method === 'POST') {
        $result = handleAction((string)($_GET['action'] ?? ''), requestBody());
    } elseif (isset($_GET['resource'])) {
        $result = handleCollection((string)$_GET['resource'], $method);
    } else {
        throw new ApiError(404, 'An API action or collection is required.');
    }
    respond($result);
} catch (ApiError $error) {
    respond(['error' => $error->getMessage()], $error->status);
} catch (Throwable $error) {
    error_log($error->__toString());
    respond(['error' => 'The server could not complete the request.'], 500);
}
