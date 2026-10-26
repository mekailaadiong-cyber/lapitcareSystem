# LapitCare

LapitCare is a clinic discovery and appointment management app for Pagadian
City. Its existing HTML and CSS design is unchanged. The frontend uses
ECMAScript modules and connects to the PHP/MySQL API in `../backend/`.

## Run locally

Set up the PHP backend and run the app using the instructions in
[`../backend/README.md`](../backend/README.md). Open
`http://127.0.0.1:8000/frontend/index.html`. The map and map tiles load from
public CDNs and need an internet connection.

The centralized sign-in page identifies the account role from its email or
mobile number. Use the demo buttons or these predefined mock credentials:

| Role | Email or mobile | Password |
| --- | --- | --- |
| Patient | `mara@lapitcare.demo` or `09190000000` | `Patient123!` |
| Clinic | `clinic@lapitcare.demo` or `09170000010` | `Clinic123!` |
| Admin | `admin@lapitcare.demo` | `Admin123!` |

Admin access uses the predefined System Administrator demo account; there is no
Admin registration option. Patient and clinic registration are saved to MySQL.
Demo accounts and clinic listings are imported from `data/*.json` on the first
API request. Passwords for newly registered accounts are hashed on the server.
Clinic approval is still an administrator-reviewed workflow. Password recovery
is unavailable until an email delivery provider is configured.

## Data and recovery

On first use, the backend imports data collections from `data/*.json` into
MySQL. Subsequent application changes are saved to that database and shared
across browsers. The local pre-enhancement snapshot is at
`backups/pre-enhancement-2026-10-19/`; it is excluded from builds and Git. It
contains seed JSON and a schema copy, not browser storage.

The earlier Supabase schema archive is not used by this PHP/MySQL backend.

## Build and deploy

The application requires PHP and MySQL hosting; a static GitHub Pages build
does not provide the backend. The frontend-only build can still be generated
for visual previews. To build locally to a directory outside the repository,
run:

```sh
node scripts/build-pages.mjs OWNER/REPOSITORY /path/to/output
```

For a user or organization site, use `OWNER/OWNER.github.io` as the repository
argument. The app has no package installation, compilation, or bundling step.

## Included workflows

- **Patient:** clinic search and map, profile management, appointment requests,
  appointment status and cancellation/rescheduling, notifications, and feedback.
- **Clinic administrator:** clinic profile, services, staff and schedules, and
  appointment request management.
- **System administrator:** clinic registration review, account oversight,
  specialties, reports, notifications, and activity review.
- **Shared:** role-specific navigation, responsive layouts, dashboard shortcuts,
  and periodic local data refresh.

This demo is not a substitute for clinical systems or emergency services.
