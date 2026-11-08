# Sweety — blood glucose tracker

Sweety is a small personal journal for recording up to four blood glucose readings a day. It has a React frontend, an Express API, and PostgreSQL storage. The API scopes every reading query to the signed-in user.

## Requirements

- Node.js 18 or newer and npm
- PostgreSQL 14 or newer

## Install

1. Create a PostgreSQL database, for example `sweety`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a private `JWT_SECRET`.
3. Install dependencies from the repository root:

   ```sh
   npm install
   ```

4. Create the tables and indexes:

   ```sh
   npm run db:setup
   ```

5. (Optional) Create the demo account and sample readings:

   ```sh
   npm run seed
   ```

   Demo credentials default to `demo@sweety.local` / `SweetDemo123!`; set `SEED_NAME`, `SEED_EMAIL`, and `SEED_PASSWORD` in `.env` to change them. The seed script is safe to rerun: it resets the demo user's readings to its three sample values.

## Run the app

Start the API and web client together from the repository root:

```sh
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The client proxies `/api` requests to the API on port 4000. To run the API alone in production mode, use `npm start`. To build the frontend, use `npm run build`.

### Run with Docker

The included Compose setup starts PostgreSQL and the production app (including the built frontend) on port 4000. Copy `.env.example` to `.env`, set a `JWT_SECRET`, then run:

```sh
docker compose up --build
```

The app creates the schema after PostgreSQL is healthy. Open `http://localhost:4000`; seed the demo user separately with `docker compose exec app npm run seed --workspace server` if you want sample readings.

## Tests

Run the focused server validation tests with:

```sh
npm test
```

They cover required/ranged whole-number values, valid calendar dates, future dates, and the supported time slots.

## API overview

- `POST /api/auth/register` and `POST /api/auth/login`
- `GET /api/readings?date=YYYY-MM-DD`
- `POST /api/readings`, `PUT /api/readings/:id`, and `DELETE /api/readings/:id`
- `GET /api/reports?date=YYYY-MM-DD` (daily, month-to-date, and previous month)

Reading endpoints require a bearer token. Passwords are stored as bcrypt hashes. A database unique constraint protects the one-reading-per-slot rule, and reading records are always queried or changed with the authenticated user's ID.

## Notes

- A day is interpreted in the browser's local time zone. The client sends its IANA time-zone name so the API can validate the future-date rule against that local calendar day.
- The four defined slots also make the four-readings-per-day limit explicit; the API checks the limit and the database prevents duplicate slots.
- This is a portfolio assignment, not a medical device. It stores entered readings and reports basic aggregates; it does not give medical guidance or set target ranges.
- With more time, I would add password reset and email verification, rate limiting, API integration tests against a disposable PostgreSQL database, and a chart for longer-term trends.

## Environment variables

See `.env.example` for all variables. `DATABASE_URL`, `JWT_SECRET`, `PORT`, and optional `PGSSL` configure the app; the three `SEED_*` variables configure the demo account. The `POSTGRES_*` variables configure Compose. The server uses a development-only fallback JWT secret if `JWT_SECRET` is omitted, so set it before sharing or deploying the app.
