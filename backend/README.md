# LapitCare PHP backend

This PHP 8.1+ API uses MySQL/MariaDB and PHP's PDO MySQL driver. It keeps the
existing frontend pages and styling intact. On first API request it imports
the current `frontend/data/*.json` demo collections into MySQL.

## Setup

1. Create a MySQL database named `lapitcare` with `utf8mb4` support.
2. Copy `configure.php` to `config.php` and set your database connection,
   or provide `LAPITCARE_DB_HOST`, `LAPITCARE_DB_PORT`, `LAPITCARE_DB_NAME`,
   `LAPITCARE_DB_USER`, and `LAPITCARE_DB_PASSWORD` environment variables.
3. Enable PHP's `pdo_mysql` extension. From the project root, serve the
   `frontend` folder and use the included router to forward API requests:

   ```powershell
   php -S 127.0.0.1:8000 -t frontend backend/router.php
   ```

4. Open `http://127.0.0.1:8000/`.

The API is at `/backend/api.php`. Do not deploy with the sample database
credentials or expose the PHP development server to the public internet.
Patient, clinic, staff, slot, and appointment identifiers use a prefix and a
sequential 3–5 digit suffix. Appointment references use `LC-` plus 3–5 digits.
On first API use after this update, existing MySQL records and their linked
references are migrated to this format.
The built-in demo login is enabled by default for this prototype; set
`LAPITCARE_DEMO_MODE=false` before deploying with real accounts.
While demo mode is enabled, the seeded demo Clinic Administrator can review
and approve pending appointments across clinics. This cross-clinic access is
limited to that demo account; other clinic accounts can manage only their own
clinic's appointments. The demo account cannot edit appointment ownership or
perform other clinic appointment actions across clinics.

## API

- `GET /backend/api.php?resource=clinics` lists a collection.
- `PUT /backend/api.php?resource=appointments` replaces the signed-in user's
  visible records in that collection; records outside that user's scope remain
  unchanged.
- `POST /backend/api.php?action=login` accepts `identifier` and `password`.
- `POST /backend/api.php?action=current-user` refreshes the signed-in account
  details from the server.
- `POST /backend/api.php?action=register-patient` and
  `action=register-clinic` create accounts.
- `POST /backend/api.php?action=demo-login` opens one of the existing demo
  roles.
- `POST /backend/api.php?action=identity-check` checks registration details.
- Password reset endpoints return an explicit `503` until an email delivery
  provider is configured; they do not allow unauthenticated password changes.

Successful sign-in uses a server-side PHP session cookie. Newly registered
passwords are stored with PHP's `password_hash()`.
Seeded demo accounts retain their existing SHA-256 hashes until the account
successfully signs in, at which point the hash is upgraded.

Successful logins, demo logins, failed login attempts, patient/clinic
registrations, and newly submitted appointment requests are recorded in the
`activity_logs` collection in MySQL. They appear in `app_records` as rows where
`collection_name` is `activity_logs`.
When a patient submits an appointment request, the backend also creates an
in-app clinic notification in the `notifications` collection. The clinic can
see it in its LapitCare notification page; this does not send SMS or email.
Appointments and their clinic notifications are saved in the same database
transaction. The clinic appointment page refreshes automatically, so a signed-in
clinic account for the booked clinic sees new requests within about 12 seconds.
To view them in phpMyAdmin, select the `lapitcare` database, open the **SQL**
tab, and run:

```sql
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.action')) AS action,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.user_name')) AS user_name,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.user_role')) AS user_role,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.created_at')) AS occurred_at
FROM app_records
WHERE collection_name = 'activity_logs'
ORDER BY created_at DESC;
```

Passwords and the login identifier are never included in these event records.
phpMyAdmin also shows the `clinic_directory`, `user_accounts`, and
`clinic_staff` views under the `lapitcare` database. Click a view and choose
**Browse** to see clinic profiles, user accounts, or clinic staff without
running a query. The views update from `app_records` automatically and do not
expose password hashes. Staff records include their clinic, role, specialty,
duty status, active state, assigned services, and complete record data.

The `appointments` object is a physical MySQL table for convenient browsing.
On each API request, the backend reconciles it with `app_records`, inserting
missing bookings, updating changed records, and removing stale rows. Appointment
bookings and updates are also synchronized in the same transaction as
`app_records`.
Browse `appointments` in phpMyAdmin to see appointment IDs, patient and clinic
IDs, dates, times, statuses, and the complete `record_json`. The other
`notifications`, `feedback`, and `schedules` objects remain views backed by
`app_records`.

For example, run this in phpMyAdmin's SQL tab to list the newest bookings:

```sql
SELECT appointment_id, reference_number, patient_id, clinic_id,
       appointment_date, appointment_time, appointment_status
FROM appointments
ORDER BY booked_at DESC;
```

This API is an application backend, not a substitute for production security
review. Deploy behind HTTPS, configure secure session cookies, set least-
privilege MySQL credentials, and provide a real password-reset delivery flow
before handling real patient information.
