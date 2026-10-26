<?php
declare(strict_types=1);

return [
    'db_host' => getenv('LAPITCARE_DB_HOST') ?: '127.0.0.1',
    'db_port' => getenv('LAPITCARE_DB_PORT') ?: '3306',
    'db_name' => getenv('LAPITCARE_DB_NAME') ?: 'lapitcare',
    'db_user' => getenv('LAPITCARE_DB_USER') ?: 'root',
    'db_password' => getenv('LAPITCARE_DB_PASSWORD') ?: '',
];
