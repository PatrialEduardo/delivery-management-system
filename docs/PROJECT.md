# Delivery Management System — project context

Living reference for picking the project back up. Last updated after the
theme + products + line-items session (branch `feat/homepage-shipping-board`,
~5 commits past `5fec329`; see §11).

---

## 1. What this is

A multi-tenant delivery-operations app with two audiences:

- **Dispatcher / Admin** — a web board to plan the day: create *shippings*
  (a driver's route for one date), add or link *deliveries* (stops) into
  them, and drag to reorder the stops.
- **Driver** — a phone-first web app to run the route: see the shippings
  assigned to them, open a stop, get directions, contact the customer,
  start the delivery, and close it with an outcome.

"Shipping" in the UI == `delivery_batch` in the schema. "Delivery" / "stop"
== `delivery`.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Backend | Go (module `github.com/PatrialEduardo/delivery-management-system/backend`), `go 1.23` / toolchain `1.24.2` |
| HTTP router | `go-chi/chi/v5` + `go-chi/cors` |
| DB driver | `jackc/pgx/v5` (pool) |
| Auth | `golang-jwt/jwt/v5` (HS256) + `golang.org/x/crypto/bcrypt` |
| Database | PostgreSQL 16 |
| Migrations | `migrate/migrate` (golang-migrate), numbered SQL files |
| Frontend | React 19 + TypeScript + Vite 8 |
| Routing | `react-router-dom` v7 (`BrowserRouter`) |
| Drag & drop | `@dnd-kit/core` + `/sortable` + `/modifiers` + `/utilities` |
| PWA | `vite-plugin-pwa` (manifest only; no real icons yet) |
| Orchestration | Docker Compose |

No CSS framework — hand-rolled CSS on a small set of custom-property tokens
defined in `frontend/src/index.css`. The token *values* now split into a
light block (`:root`) and a dark block (`:root[data-theme="dark"]` +
a `prefers-color-scheme` fallback); `context/ThemeContext.tsx` writes
`data-theme` on `<html>` (persisted to `localStorage["dms_theme"]`,
follows the OS until the user overrides). `<ThemeToggle/>` is in every
screen's header (floating on the login page).

**i18n** is hand-rolled (no library, matching the no-framework style):
`src/i18n/pt-BR.ts` is the source of truth (**pt-BR is the default**),
`src/i18n/en-US.ts` is typed `: typeof ptBR` so it can't drift.
`context/LanguageContext.tsx` (`useT()` → the active dictionary,
`useLang()` → `{lang,setLang}`, `localStorage["dms_lang"]`, writes
`<html lang>`). `<LanguageToggle/>` (two inline-SVG flags, US + Brazil) is
on the login page (floating), the dispatcher sidebar, and the
Products/Customers headers — **not** the driver app (drivers pick the
language at login only). See §6.

---

## 3. Running it

**Prereqs:** Docker Desktop. (Local Go 1.24 and Node 20+ only needed to
build/lint outside containers.)

```bash
# from repo root
docker compose up -d --build          # build images, start everything
docker compose logs -f backend        # or: migrate | frontend | postgres
docker compose down                   # stop
docker compose down -v                # stop + WIPE the DB volume (fresh reseed on next up)
```

Services / ports (host → container), from `docker-compose.yml` + `.env`:

| Service | URL / port | Notes |
|---|---|---|
| `frontend` | http://localhost:5173 | Vite dev server, `--host`; **source is bind-mounted** → edits hot-reload, no rebuild |
| `backend` | http://localhost:8080 | Go API; binds `PORT` (=8080) inside the container |
| `postgres` | `localhost:5433` → 5432 | user `dms_app`, db `dms_dev` |
| `migrate` | — | runs `migrate ... up` once against Postgres, then exits; `backend` waits for it (`service_completed_successfully`) |

**Test accounts** — all password `Password123!`:

| Email | Role | Lands on | Seeded data |
|---|---|---|---|
| `patrialeduardo@gmail.com` | Admin | dispatcher board (`/`) | 2 shippings |
| `bruno.driver@dev.local` | Driver | driver app (`/d`) | SHP-0001, 3 stops |
| `marina.driver@dev.local` | Driver | driver app (`/d`) | SHP-0002, 2 stops |
| `caio.driver@dev.local` | Driver | driver app (`/d`) | none until assigned |

No profile switcher — **log out** (button top-right on every screen) and
log back in as another user.

---

## 4. Repo layout

```
.
├── docker-compose.yml          postgres + migrate + backend + frontend
├── .env / .env.example         all config (POSTGRES_*, BACKEND_PORT, JWT_SECRET,
│                               FRONTEND_ORIGIN, FRONTEND_PORT, VITE_API_URL)
├── schema/
│   ├── dmsschema.sql           source-of-truth v0.3 schema (ported into migration 000001)
│   └── dmserd.mermaid          ER diagram
├── backend/
│   ├── Dockerfile              multi-stage; build ./cmd/api
│   ├── cmd/api/main.go         wires config → db pool → auth + ops handlers → chi router
│   ├── migrations/             000001..000006 (see §7)
│   ├── scripts/hash_password.go  `go run ./scripts/hash_password.go "pw"` → bcrypt hash
│   ├── scripts/test.sh         run `go test` in a container on the compose network (see §8)
│   └── internal/
│       ├── config/             env → Config (AccessTokenTTL hardcoded 15m)
│       ├── database/           pgx pool, fail-fast ping
│       ├── httpx/              WriteJSON / WriteError / DecodeJSON helpers
│       ├── auth/               login, JWT (Claims), bcrypt, RequireAuth context
│       ├── middleware/         RequireAuth (Bearer → *auth.Claims in ctx)
│       ├── user/               app_user repository (GetByEmail joins role for role_name)
│       └── ops/                everything else (see §5)
│           ├── ops.go          Repository, Handler, Register(r) — the route table
│           ├── models.go       all wire DTOs + request bodies
│           ├── audit.go        setAuditUser(tx) / auditExec — tag a tx with app.user_id for the audit_log triggers
│           ├── reference.go    /delivery-statuses, /drivers
│           ├── customer.go     /customers CRUD (+ addresses), stats roll-up, name/address locks
│           ├── shipping.go     /shippings, quick-add, link, reorder, link-picker
│           ├── product.go      /products CRUD (soft delete)
│           ├── line.go         /deliveries/{id}/products, attachLines(), roll-ups
│           ├── driver.go       /me/* and /deliveries/{id}/start|finish (+ one-active guard)
│           ├── util.go         addressLine(), deref()
│           └── *_test.go       integration tests + helpers_test.go fixtures
└── frontend/
    ├── Dockerfile              node:20-alpine, `npm install`, `npm run dev -- --host`
    ├── vite.config.ts          port 5173, watch.usePolling (for the Docker mount), PWA
    └── src/
        ├── main.tsx            <ThemeProvider><LanguageProvider><BrowserRouter><App/>
        ├── App.tsx             role-aware routing (/products, /customers) + driver boot-redirect
        ├── index.css           global reset + light/dark palette token blocks + .sr-only
        ├── i18n/pt-BR.ts       source-of-truth dictionary (default language)
        ├── i18n/en-US.ts       English mirror, typed `: typeof ptBR` (can't drift)
        ├── context/AuthContext.tsx      login/logout, token+user in localStorage, `role`
        ├── context/ThemeContext.tsx     data-theme on <html>, localStorage, OS-follow
        ├── context/LanguageContext.tsx  useT()/useLang(), localStorage["dms_lang"], <html lang>
        ├── lib/
        │   ├── api.ts          typed client; Bearer header; all endpoints
        │   ├── geo.ts          getPositionBestEffort(), directionsUrl(), whatsappUrl(), telUrl()
        │   ├── date.ts         toLocalISODate() (browser tz), isoToBR() (dd/MM/yyyy display)
        │   ├── status.ts       statusLabel(t, code, fallback) — translate a delivery status code
        │   └── money.ts        money() — pt-BR / BRL currency format (stays BRL in both languages)
        ├── pages/
        │   ├── LoginPage.tsx / .css        mobile-first split; show/hide pw; "forgot" helper
        │   ├── HomePage.tsx / .css         dispatcher board (date-range filter)
        │   ├── ProductsPage.tsx / .css     /products — catalogue CRUD (+ field locks)
        │   ├── CustomersPage.tsx / .css    /customers — Excel report + CRUD + address mgr
        │   └── driver/
        │       ├── DriverShippingsPage.tsx   /d
        │       ├── DriverShippingPage.tsx    /d/shipping/:shippingId
        │       ├── DriverStopPage.tsx        /d/shipping/:shippingId/stop/:deliveryId
        │       └── driver.css
        └── components/         Modal, NewShippingModal, AddDeliveryModal,
                                LinkDeliveryModal, CustomerAddressField,
                                ShippingSection (dnd-kit), DeliveryRow,
                                DeliveryProductsModal (line-item grid),
                                ThemeToggle, LanguageToggle (inline-SVG flags), ui.css
```

`frontend/src/App.css` and the `assets/*` (hero/react/vite) are leftover
Vite-template files, unused. Root `package-lock.json` is a stray empty
stub — safe to delete.

---

## 5. Backend API

Base URL `http://localhost:8080`. All JSON. Errors are `{"error": "..."}`
with a matching status code.

**Public**

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{"status":"ok"}` |
| POST | `/auth/login` | `{email,password}` → `{accessToken, expiresIn, user:{userId,fullName,email,role}}` |

**Protected** — require `Authorization: Bearer <token>`; every query is
scoped to the company on the token. Handlers read `*auth.Claims` from
context (`companyID`, `userID`, `role`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/me` | `{userId, companyId, roleId, role}` from claims (no DB hit) |
| GET | `/delivery-statuses` | reference list (badges / summary strip) |
| GET | `/drivers` | active `Driver`-role users in the company |
| GET | `/customers?q=&all=1&stats=1` | customers + nested addresses; `q` filters by name; `all=1` includes inactive; `stats=1` attaches the per-customer delivery roll-up (`total/delivered/failed/absent/inProgress/pending/successRate/lastDeliveryDate/deliveredValue`). Every row carries `notes/isActive/hasActivity` |
| POST | `/customers` | `{fullName, phone?, notes?, address?}` → creates customer (+ first address) |
| PATCH | `/customers/{customerID}` | `{fullName, phone?, notes?, isActive}`. **409** if `hasActivity` and the name changed |
| DELETE | `/customers/{customerID}` | **hard** delete (+ addresses) when `hasActivity=false`; **409** ("deactivate instead") when true |
| POST | `/customers/{customerID}/addresses` | add an address to a customer |
| PATCH | `/customers/{customerID}/addresses/{addressID}` | edit an address. **409** if a delivery to it is in progress (started, not finished) |
| DELETE | `/customers/{customerID}/addresses/{addressID}` | remove an address; **409** if any delivery references it |
| GET | `/products?all=1` | company catalogue; active only unless `all=1`. Each row carries `hasActivity` (true once it's on a delivery line) |
| POST | `/products` | `{name, sku?, unit?, price?}` |
| PATCH | `/products/{productID}` | full replace of `{name, sku?, unit?, price?, isActive}`. **409** if `hasActivity` and name/sku/unit changed (price + isActive stay editable) |
| DELETE | `/products/{productID}` | **hard** delete when `hasActivity=false`; **409** ("deactivate instead") when true; 204 on success |
| GET | `/deliveries/{deliveryID}/products` | `{lines[], itemCount, itemTotal}` |
| PUT | `/deliveries/{deliveryID}/products` | replace-all: `{lines:[{productId, quantity, unitPrice?, notes?}]}` in one tx; `quantity>0`, price ≥ 0, product must be in the company. **409** if the delivery is no longer PENDING/ASSIGNED |
| GET | `/shippings?from=YYYY-MM-DD&to=YYYY-MM-DD` | **dispatcher board payload**: `{date, from, to, shippings[], statusSummary[]}` over a date *range* (inclusive, max 92 days → 400). Legacy `?date=` still works (from=to=date); nothing given → server's today. `date` == `from` for older clients |
| POST | `/shippings` | `{driverUserId, deliveryDate, notes?}`; auto `batch_code` `SHP-000N` |
| POST | `/shippings/{shippingID}/deliveries` | quick-add: `{customerId, addressId, notes?}`; driver inherited, status PENDING, order appended |
| GET | `/deliveries?date=&excludeShipping=` | link-picker: same-day deliveries not in that shipping |
| POST | `/shippings/{shippingID}/deliveries/{deliveryID}/link` | move a delivery here (must match date); renumbers the source; reassigns driver |
| PATCH | `/shippings/{shippingID}/deliveries/order` | `{deliveryIds:[...]}` full set → writes `delivery_order` 1..N in one tx. **409** if the new order would move a stop that isn't PENDING/ASSIGNED |
| GET | `/me/shippings?date=` | driver's own shippings for a date: `{date, shippings[]}` |
| GET | `/me/shippings/{shippingID}` | one shipping (403 if not assigned to caller) |
| GET | `/me/active-delivery` | `{active: {shippingId, deliveryId} \| null}` — most recent started-but-unfinished |
| POST | `/deliveries/{deliveryID}/start` | body `{lat?, lng?}`; sets `started_at`, status IN_TRANSIT, writes `delivery_history`. **409** if the driver already has another started-but-unfinished stop. Re-tapping the stop already in progress is a no-op (no duplicate history row). |
| POST | `/deliveries/{deliveryID}/finish` | `{outcome, note?, lat?, lng?}`; `outcome ∈ COMPLETE\|ABSENT\|TROUBLE`; TROUBLE needs `note` ≥ 15 chars; maps COMPLETE→DELIVERED, ABSENT→ABSENT, TROUBLE→FAILED; sets `finished_at`, `notes`, writes history |

Ownership: `/me/*` and start/finish check that the delivery's shipping
has `driver_user_id == caller` → 403 otherwise. start/finish on an
already-finished delivery → 409.

`Delivery` DTO fields: `id, order, customerId, customerName, customerPhone,
addressId, addressLine, lat, lng, statusId, statusCode, statusName,
statusColor, attemptNumber, notes, startedAt, finishedAt` plus
`products[]` (line items), `itemCount`, `itemTotal` (Σ `quantity ×
unitPrice` over priced lines). `Shipping` DTO carries `itemCount` /
`itemTotal` rolled up from its deliveries. `lat/lng` on a delivery are the
**address** coordinates (nullable; not seeded). GPS captured at
start/finish goes to `delivery_history.latitude/longitude`.

### Auth model

- JWT HS256, secret = `JWT_SECRET` env. Claims: `userId, companyId,
  roleId, role` (role = the human name, e.g. `"Driver"` / `"Admin"`) +
  `sessionStart`, `exp`, `iat`.
- **Sliding session** (`config.go`): TTL **30 minutes**, absolute cap
  **12 h** (`SessionMaxLifetime`). `RequireAuth` re-mints a fresh 30-min
  token on *every* authenticated request and returns it on the
  `X-Access-Token` / `X-Access-Token-Expires` response headers (CORS
  `ExposedHeaders`). `sessionStart` is preserved across re-issues so the
  12 h cap is real; past it → 401 "session expired". So you're logged out
  after 30 min of **inactivity**, not 30 min after login.
- Frontend stores the token in `localStorage["dms_access_token"]` and the
  user object in `localStorage["dms_user"]`; `lib/api.ts` attaches the
  Bearer header and, on each response, swaps in any `X-Access-Token` it
  sees. `isAuthenticated` is still just "is there a cached user" — a truly
  expired session shows the last screen with API errors until you log out.
- Passwords: bcrypt (cost 10). `internal/auth/password.go`.

---

## 6. Frontend behaviour

### Routing (`App.tsx`)

- **Not authenticated** → `<LoginPage/>` regardless of URL.
- **Authenticated, role ≠ `Driver`** → `/` = `<HomePage/>`, `/products` =
  `<ProductsPage/>`, `/customers` = `<CustomersPage/>`; anything else
  redirects to `/`.
- **Authenticated, role = `Driver`** →
  - `/d` — `DriverShippingsPage`
  - `/d/shipping/:shippingId` — `DriverShippingPage`
  - `/d/shipping/:shippingId/stop/:deliveryId` — `DriverStopPage`
  - anything else redirects to `/d`
- **Driver boot-redirect**: once per page load (guarded by
  `sessionStorage["dms_boot_redirect_done"]`, cleared on logout), the app
  calls `/me/active-delivery` and, if there is one, navigates straight to
  that stop. After that the driver navigates freely and may start others.

### Dispatcher board (`HomePage.tsx`)

Top bar (**date range** — two native `<input type=date>` `From`/`To`,
both **default to the browser's local day** via `toLocalISODate()`, not the
server clock; a `dd/MM/yyyy – dd/MM/yyyy` caption sits beside them). The
board lists every shipping whose `delivery_date` falls in the range, and
each `ShippingSection` header shows its own date when `from !== to`. Status
summary strip aggregates across the range · the chips are
**multi-select filter toggles** — selecting statuses shows only
matching stop rows and hides shippings with no match; a `Clear` chip
resets; drag-reorder is disabled while a filter is on (the reorder API
needs the full stop set) · left action menu (`+ New shipping` / `+ New
delivery` / `Products` / `Customers`; slide-over on mobile) · collapsible
section per shipping with sortable stop rows. **Only PENDING/ASSIGNED stops
are draggable** (a started/finished stop's handle is inert and dnd-kit
`disabled`); the modal that edits line items goes read-only for those stops
too. Each stop row shows `N items · R$ x` and opens `DeliveryProductsModal`
on click; the shipping header shows the rolled-up total. Drag handle =
"hold to lift" (`@dnd-kit` `PointerSensor`/`TouchSensor` with 180 ms delay;
keyboard supported). Reorder is optimistic and persists on drop; on error
it toasts and reloads. Modals: new shipping, quick/new delivery (customer +
address pickers with inline create), link an existing same-day delivery,
and the line-item grid (product / qty / unit price / per-line note, live
total, PUT replace-all).

### Driver app (`pages/driver/*`, `driver.css`)

Phone-first single column (`max-width: 560px`, centered). Stop screen:
status badge · customer · address · **Route** (Google Maps directions,
new tab) · **WhatsApp** + **Call** (only if `customerPhone`) · **Start
delivery** → then **Delivery complete / Absent client / Trouble** (Trouble
opens a textarea, live `n/15` counter, submit disabled < 15). If the
driver already has another stop in progress, Start returns 409 and the
screen shows the message plus an **Open the stop in progress** button
(from `/me/active-delivery`). Finished stops are read-only (outcome +
note + local timestamp). Fixed bottom **‹ Prev / Next ›** bar cycles the
shipping's stops. Best-effort geolocation on start/finish (`lib/geo.ts`,
3.5 s timeout, resolves `null` on denial/timeout — never blocks).

### Products screen (`pages/ProductsPage.tsx`)

Reached from the board's `Products` sidebar button. An add form on top,
then inline-editable rows (name / SKU / unit / price); `Save` appears per
row when a field changes. Once a product has line items (`hasActivity`),
name/SKU/unit inputs go `disabled` (lock tooltip) and only price is
editable. `Delete` (two-step inline confirm) shows only when
`hasActivity=false` and removes the row outright; used products show
`Deactivate` instead. A `Show inactive` toggle brings deactivated rows back
with `Reactivate` (and `Delete`, if still unused).

### Customers screen (`pages/CustomersPage.tsx`)

Reached from the board's `Customers` sidebar button. Same shape as
Products: a "New customer" form (name / phone / notes + an optional first
address) on top, a `Show inactive` toggle, then a wide **Excel-style
report table** (own `overflow-x` scroll) — one row per customer with
editable name / phone / notes and read-only metric columns from
`?stats=1`: **Total · Delivered · Failed · Absent · In prog. · Pending ·
Success % · Last delivery · Delivered value**. The name input is `disabled`
once the customer `hasActivity`. `Save` per row when a field changes;
`Delete` (two-step) only when `hasActivity=false`, else `Deactivate` /
`Reactivate`. Each row's `▸` expands an **address manager**: inline-edit
each address (street/nº/district/city/UF/ZIP) + `Save` + `Remove`, plus an
"Add address" row. A `PATCH` on an address whose delivery is *in progress*
returns 409 and the warning text renders under the address fields
("… only be changed once that delivery is completed").

### Internationalisation (i18n)

The whole UI is bilingual **pt-BR (default) / en-US**, switched live by
`<LanguageToggle/>` (two flags) with no reload. Mechanism: a hand-rolled
`LanguageContext` — `const t = useT()` gives the active dictionary,
`t.home.clear` / `t.deliveryProducts.title(name)` (parameterised entries
are functions). Choice persists in `localStorage["dms_lang"]`.

- **`src/i18n/pt-BR.ts` is the single source of truth.** `en-US.ts` is
  `export const enUS: typeof ptBR = {…}` — TypeScript rejects a missing
  key, an extra key, or a wrong function signature, so the two never drift.
- **RULE for every future change: no bare user-facing string in a
  component.** Add the key to `pt-BR.ts`, then to `en-US.ts`, then read it
  via `useT()`. `tsc` fails the build if you forget en-US.
- Delivery **status labels** are translated on the client
  (`lib/status.ts` `statusLabel(t, code, apiName)`), keyed off the stable
  `status_code`, falling back to the API's `status_name`.
- **Not translated (deliberate / known gaps):** API error messages come
  from the Go backend in English — the client shows `err.message` verbatim
  (the common "date range too wide" case is caught client-side and
  translated; a full backend i18n pass is future work). `money()` stays
  `pt-BR`/`BRL` in both languages (the business is Brazilian; UI language
  ≠ currency). Dates render `dd/MM/yyyy` in both.
- Data-loading callbacks (`HomePage`/`ProductsPage`/`CustomersPage`/
  `DriverShippingsPage`) read `t` through a `tRef` (updated in an effect),
  **not** a `useCallback` dep — otherwise switching language would refetch
  and reset the board's date range.

### Responsive layout

Mobile-first, verified in code against a 320 → 1920 px sweep. Notable
breakpoints: **login** splits to two panes at ≥900 px; **the board's
top bar** (`.home__topbar`) `flex-wrap`s below 900 px, dropping the two
date inputs onto their own full-width row (`.home__ranges { order: 10;
flex-basis: 100% }`) and hiding the range caption + user name; the sidebar
becomes a slide-over with a scrim; **Products/Customers headers** hide the
user name below 600 px so the flag + theme toggles fit; the **Customers
report table** always scrolls inside its own `overflow-x` wrapper; modals
are bottom-sheets below 640 px, centred above. Portuguese strings run
~15-25 % longer than English, so pt-BR (the default) is the layout's
worst case.

## 7. Database

Schema = `schema/dmsschema.sql` (v0.3), ported verbatim into migration
`000001`. Tables: `company`, `role`, `app_user`, `customer`, `address`,
`product`, `delivery_status`, `delivery_batch`, `delivery`,
`delivery_product`, `delivery_history`, `attachment`. UUID PKs
(`gen_random_uuid()`) except `delivery_batch`, `delivery`,
`delivery_product`, `delivery_history`, `attachment` which are `BIGSERIAL`.

Key columns used by the app:
- `delivery_batch(company_id, driver_user_id, batch_code, delivery_date, notes)`
  — one driver, one date; `UNIQUE(company_id, batch_code)`.
- `delivery(company_id, delivery_batch_id NOT NULL, customer_id, address_id,
  driver_user_id, delivery_status_id, delivery_order, attempt_number,
  started_at, finished_at, notes)` — `delivery_order` is the source of
  truth for stop sequence.
- `delivery_history(delivery_id, user_id, delivery_status_id, description,
  latitude, longitude, created_at)` — one row per start/finish event.

### Migrations

| # | File | What it does |
|---|---|---|
| 000001 | `init_schema` | full v0.3 schema (all tables, FKs, indexes, `pgcrypto`) |
| 000002 | `seed_dev_user` | company `…0001` "Dev Company", role `…0010` "Admin", user `…0100` `patrialeduardo@gmail.com` (Admin) |
| 000003 | `seed_delivery_statuses` | `PENDING, ASSIGNED, IN_TRANSIT, DELIVERED, FAILED, RESCHEDULED` (code, name, color, display_order, flags) |
| 000004 | `seed_drivers_and_samples` | role `…0011` "Driver"; 3 drivers (`…0201` Bruno / `…0202` Marina / `…0203` Caio); 5 customers `…0301–0305` + addresses `…0401–0405`; **SHP-0001** (Bruno, `CURRENT_DATE`) 3 stops [Ana IN_TRANSIT, Théo PENDING, Duda DELIVERED] and **SHP-0002** (Marina) 2 stops [Marco, Lia — PENDING] |
| 000005 | `seed_absent_status` | `ABSENT` "Absent client" status (RESULT, `display_order` 45) |
| 000006 | `products_and_line_item_price` | `ALTER delivery_product ADD unit_price NUMERIC(10,2)` (captured per line, not read live); seeds 5 dev products `…0501–0505` for Dev Company |
| 000007 | `audit_log` | generic `audit_log` table + `log_row_change()` trigger fn, attached `AFTER INSERT/UPDATE/DELETE` to all 12 business tables. Records `table_name, row_pk, action, old_row/new_row (jsonb), changed_by, changed_at`. `changed_by` is filled from `current_setting('app.user_id')` — the `ops` repo sets it per-tx via `set_config(...,true)` (`internal/ops/audit.go`); unset ⇒ NULL. No app code reads it yet |

Fixed seed UUIDs follow `00000000-0000-0000-0000-000000000XXX`. The
`migrate` service applies any un-applied migrations on every
`docker compose up`. `down -v` wipes `pgdata` so the next `up` reseeds
from scratch.

`delivery_status` values available to code (by `status_code`): `PENDING`,
`ASSIGNED`, `IN_TRANSIT`, `DELIVERED`, `ABSENT`, `FAILED`, `RESCHEDULED`.

---

## 8. Dev workflow & gotchas

- **Frontend edits hot-reload** (bind mount + Vite polling). **Backend or
  migration changes need `docker compose up -d --build backend`** — that
  rebuilds the image and reruns `migrate`.
- **Container clock is ahead of the wall date.** During this session the
  host date was 2026-08-31 but Postgres `CURRENT_DATE` / the API's "today"
  was 2026-09-01. Seed shippings are dated `CURRENT_DATE`, and every date
  picker defaults to the *server's* today (the board/driver-list call the
  API with an empty `date` and adopt `payload.date`). If a screen looks
  empty, check the date field.
- **Seed `delivery` ids are not sequential by stop order** — `INSERT …
  SELECT` without `ORDER BY`. Always sort by `delivery_order`.
- **Local checks before committing:**
  - backend: `cd backend && go build ./... && go vet ./...`
  - backend tests: `bash backend/scripts/test.sh ./...` — runs `go test`
    inside a `golang:1.24-alpine` container on the compose network so it
    reaches Postgres at `postgres:5432`. Plain `cd backend && go test ./...`
    also works, but on a host that *also* runs a native Postgres the
    published port 5433 is ambiguous and the DB-backed tests just **skip**
    (they never fail offline). Set `TEST_DATABASE_URL` to override.
    Each test seeds its own throwaway `company` and deletes it on cleanup.
  - frontend: `cd frontend && npx tsc -b && npx eslint src/ && npx vite build`
    (then `rm -rf dist`). `eslint src/` is currently **clean** (0 problems).
- **Adding UI text:** never hard-code a user-facing string. Add the key to
  `src/i18n/pt-BR.ts`, then `src/i18n/en-US.ts` (`tsc` fails if you skip
  en-US), then use `useT()` in the component. See §6 "Internationalisation".
- **Lint disables in the tree:** context hook files carry a
  `// eslint-disable-next-line react-refresh/only-export-components` (they
  export a provider + a hook); data-fetch effects carry
  `// eslint-disable-next-line react-hooks/set-state-in-effect`. Both are
  intentional.
- **Line endings:** repo files are LF; on Windows git warns
  `LF will be replaced by CRLF`. Harmless.
- **`JWT_SECRET` in `.env` is a weak dev value** (`reallycoolkeyword`).
  `.env` is git-ignored (`.env.example` is the template). Replace before
  any real deployment; also swap the shared dev password.
- **`hash_password.go`** (`go run ./scripts/hash_password.go "pw"`) prints
  a bcrypt hash to paste into a seed migration.
- **Backend integration tests** live in `internal/ops/*_test.go` (start
  guard, product CRUD, line-item set + roll-ups; `helpers_test.go` has the
  fixtures). They need the compose Postgres — see the run command above.
  No frontend test runner yet; UI verification is still `curl` + a
  Claude-in-Chrome walkthrough.
- **Container clock drift bit us again:** the board's date default was
  switched to the *browser's* local day precisely because the API's
  `time.Now().UTC()` had rolled past midnight while the host was still on
  the previous day, hiding the seed shippings on first load.

---

## 9. Git state

- `main` → `2ffa64e` (pushed to `origin/main`). Contains the JWT-login +
  Docker work (branch `feat/jwt-login-docker`, already merged; the branch
  ref is stale and safe to delete).
- **`feat/homepage-shipping-board` → ~7 commits ahead of `main`, not
  merged, not pushed:**
  - `3dd3414` feat(home): shipping board homepage + responsive login rework
  - `5fec329` feat(driver): driver web-app — assigned shippings, start/finish, resume
  - `+` feat(web): light/dark theme switcher, device-date board default, status filters
  - `+` feat(driver): one active delivery at a time + idempotent start
  - `+` feat(products): product catalogue CRUD + management screen
  - `+` feat(line-items): per-delivery product grid + shipping résumé
- To land it:
  ```bash
  git checkout main && git merge --ff-only feat/homepage-shipping-board && git push
  ```

Commit trailers used in this repo: `Co-Authored-By: Claude Sonnet 5
<noreply@anthropic.com>` and a `Claude-Session:` line.

---

## 10. Status

**Working end-to-end**

- JWT login (bcrypt), role in token, role-aware SPA routing. **Sliding
  30-min session** (re-issued per request via `X-Access-Token`), 12 h cap.
- Light/dark theme on every screen (localStorage + OS-follow).
- **Bilingual UI** (pt-BR default / en-US), live flag switcher on login +
  dispatcher sidebar + Products/Customers headers; every visible string in
  the two i18n dictionaries; status labels translated client-side.
  Responsive from ~320 px up (top-bar wraps, sidebar → slide-over, wide
  tables scroll, modals → bottom sheets).
- Dispatcher board: **date-range** filter (`from`/`to`, local-day default),
  status summary that doubles as a **status filter**, create shipping,
  quick-add delivery (with inline customer/address create), link an
  existing same-day delivery, hold-drag reorder (persisted; **locked for
  non-PENDING/ASSIGNED stops**, API + UI).
- **Product catalogue**: `/products` CRUD. Name/SKU/unit freeze once the
  product is on a line (`hasActivity`); delete is hard when unused, else
  deactivate-only.
- **Customer management**: `/customers` — Excel-style report (delivery
  counts by outcome, success %, last delivery, delivered value), editable
  name/phone/notes, per-row address manager. Name frozen once
  `hasActivity`; delete hard when unused else deactivate; address edits
  blocked (409 + warning) while a delivery to it is in progress.
- **Line items**: editable product grid per delivery (qty + unit price +
  note), **frozen once the stop leaves PENDING/ASSIGNED**; per-delivery and
  per-shipping `itemCount` / `itemTotal` roll-ups shown on the board and in
  the driver payload.
- **Audit log**: `audit_log` table + AFTER triggers on all 12 business
  tables record every INSERT/UPDATE/DELETE (old/new JSONB, timestamp,
  best-effort `changed_by`). Schema-only — no UI.
- Driver app: assigned shippings by date, ordered read-only stops,
  Route / WhatsApp / Call, start (**one active stop at a time**, idempotent
  re-tap), finish (Complete/Absent/Trouble with the 15-char rule),
  read-only finished stops, prev/next, resume-in-progress on reopen,
  best-effort GPS logged to `delivery_history`.
- Docker Compose: postgres + one-shot migrate + backend + hot-reload
  frontend.
- Backend integration tests for the ops package (start guard, products
  incl. the used-product locks, line items).

**Not built yet / deliberately out of scope**

- Editing a delivery's status or free-text details from the dispatcher
  board; deleting a shipping. (The customer address-in-progress flow
  currently only *warns* — the "append note to driver / flag delivery
  error" recourse is deferred.)
- `RESCHEDULED` has no UI path (driver has 3 outcomes only).
- `attachment` management screen (`attachment` is still unused by code).
- A UI over `audit_log` (table + triggers exist; nothing reads it).
- Retry chains (`delivery.parent_delivery_id` / `delivery_group_id`) —
  columns exist, no logic.
- RBAC beyond "is this shipping mine" — any authenticated non-Driver is
  treated as a dispatcher, incl. `/products` and `/customers`.
- Line-item history/snapshots beyond `unit_price` on the current row;
  drivers can view line items in the payload but there's no driver UI for
  them yet.
- Frontend test runner, CI, prod deployment config, real PWA icons/offline.
- `attempt_number` is always 1 (only set at insert).
- **Backend i18n**: API error strings are English-only; the client shows
  them verbatim (only the "date range too wide" case is caught + translated
  client-side). Currency stays BRL and dates `dd/MM/yyyy` in both languages.

**Likely next steps**

- Let the driver's finish auto-advance to the next unfinished stop.
- Dispatcher: reassign a shipping's driver; edit stop details; mark
  `RESCHEDULED`.
- Show `delivery_history` (the event log + GPS) somewhere — driver stop
  screen and/or a dispatcher drill-down.
- Surface line items on the driver stop screen (read-only checklist).
- Dispatcher recourse when an address edit is blocked: append a note to the
  in-progress delivery for the driver, or flag it as a delivery error.
- A read UI over `audit_log` (dispatcher drill-down / per-row history).
- Backend i18n (Accept-Language → translated API error messages).
- A `Makefile` / task runner; frontend component tests (a Vitest check that
  `en-US.ts` and `pt-BR.ts` have identical key sets would be cheap insurance).

---

## 11. This session's changelog

Starting point: repo had a Go module with a health endpoint and a
Docker Compose skeleton; frontend was the stock Vite template.

1. **JWT login end-to-end** (`2ffa64e`, on `main`): ported
   `schema/dmsschema.sql` into migration `000001`; `000002` dev seed;
   bcrypt; `POST /auth/login` + `GET /auth/me`; `migrate` compose service;
   frontend `AuthContext` + login screen; `PORT` vs `BACKEND_PORT` split;
   `.dockerignore`s.
2. **Login screen rework** (in `3dd3414`): mobile-first split layout,
   password show/hide, "forgot password" helper, focus states, palette
   moved to `index.css` tokens, dropped the Vite-template `#root` sizing,
   `docker-compose` frontend bind mount for hot reload.
3. **Dispatcher board** (`3dd3414`): `internal/ops` + `internal/httpx`;
   migrations `000003` (statuses) and `000004` (drivers + samples);
   endpoints for statuses/drivers/customers/shippings/deliveries/reorder/
   link; `HomePage` + modal components + `@dnd-kit` reorder.
4. **Driver web-app** (`5fec329`): role name in `/auth/login` +
   `/auth/me`; migration `000005` (`ABSENT`); `internal/ops/driver.go`
   (`/me/*`, start, finish, ownership guards); `react-router-dom`;
   `App.tsx` role routing + boot-redirect; `pages/driver/*`; `lib/geo.ts`
   (geolocation + maps/WhatsApp/tel links).
5. **Theme + products + line-items** (4 commits on
   `feat/homepage-shipping-board`):
   - **Theme switcher**: `index.css` palette split into light/dark token
     blocks; `context/ThemeContext.tsx` + `components/ThemeToggle.tsx`;
     toggle wired into every screen header.
   - **Board fixes**: date picker defaults to `toLocalISODate()`; the
     status summary chips became multi-select filters (`chip--btn`,
     hide-empty-shippings, `Clear`, reorder disabled while filtering).
   - **Driver start guard**: `StartDelivery` rejects a second open stop
     (409) and no-ops a re-tap; `assertDeliveryDriver` also returns
     `started`; stop screen shows an "Open the stop in progress" button.
   - **Products**: migration `000006` (+`delivery_product.unit_price`,
     5 seed products); `internal/ops/product.go`; `/products` CRUD;
     `pages/ProductsPage.tsx`.
   - **Line items**: `internal/ops/line.go` (`GET`/`PUT
     /deliveries/{id}/products`, `attachLines`, roll-ups); `products` +
     `itemCount`/`itemTotal` nested on `Delivery`, roll-up on `Shipping`;
     `components/DeliveryProductsModal.tsx` grid; row/header totals.
   - **Tests**: first backend integration tests
     (`internal/ops/*_test.go`, `helpers_test.go`) + `scripts/test.sh`.
6. **Lifecycle rules + audit + customers** (on
   `feat/homepage-shipping-board`):
   - **Sliding session**: `config.go` TTL 15m→30m + `SessionMaxLifetime`
     12h; `auth/jwt.go` `sessionStart` claim + `ReissueToken`;
     `middleware/auth.go` re-mints per request onto `X-Access-Token`
     (+ CORS `ExposedHeaders`); `lib/api.ts` swaps the rolled token in.
   - **Pending locks**: `line.go` `SetDeliveryLines` 409s unless
     PENDING/ASSIGNED; `shipping.go` `Reorder` 409s if a non-editable stop
     would move; `ShippingSection`/`DeliveryProductsModal` reflect it.
   - **Date range**: `/shippings` takes `from`/`to` (legacy `date` kept),
     `parseDateRange` (92-day cap), `shippingsForRange` /
     `statusSummary(from,to)`; `HomePage` two date inputs + `isoToBR`.
   - **Products**: `productCols` computes `has_activity`; `UpdateProduct`
     freezes name/SKU/unit, `DeleteProduct` hard-deletes when unused.
   - **Customers**: `customer.go` gains `Customers(…, includeInactive,
     withStats)` + `customerStats`, `UpdateCustomer` / `DeleteCustomer` /
     `UpdateAddress` (in-progress guard) / `DeleteAddress`; new routes;
     `pages/CustomersPage.tsx` Excel-style report + address manager.
   - **Audit**: migration `000007` — `audit_log` + `log_row_change()`
     trigger on all 12 tables; `internal/ops/audit.go` sets `app.user_id`
     per tx so `changed_by` is filled for API-driven changes.
   - **Tests**: `product_test.go` updated for hard-delete + new
     `TestProduct_LockedAfterActivity`; `line_test.go` `Home(…, day, day)`.
7. **i18n + responsive pass** (on `feat/homepage-shipping-board`,
   frontend only):
   - **Dictionaries**: `src/i18n/pt-BR.ts` (source of truth, default) +
     `src/i18n/en-US.ts` (`: typeof ptBR`); every user-facing string in
     every screen/component/modal migrated to `useT()`.
   - **Plumbing**: `context/LanguageContext.tsx` (`useT`/`useLang`,
     `localStorage["dms_lang"]`, `<html lang>`); `components/LanguageToggle`
     + `language-toggle.css` (inline-SVG US/Brazil flags); `lib/status.ts`
     `statusLabel()`; `.sr-only` in `index.css`; `<LanguageProvider>` in
     `main.tsx`. Switcher on login (floating), sidebar, Products/Customers
     headers — not the driver app.
   - **Data-load fix**: `HomePage`/`ProductsPage`/`CustomersPage`/
     `DriverShippingsPage` read `t` via a `tRef` so a language switch no
     longer refetches / resets the board range; client-side 92-day guard
     (`spanDays`) with a translated message.
   - **Responsive**: `.home__topbar` wraps below 900px with the date
     inputs on their own row (`.home__ranges`); Products/Customers hide the
     user name below 600px; `home__user`/`prods__user`/`custs__user` gain
     ellipsis. `AuthContext` `useAuth` got its `eslint-disable` (lint now
     0 problems).
