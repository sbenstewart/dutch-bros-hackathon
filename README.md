# Dutch Bros POS Simulation & Backend

This repository contains a collection of tools and services used during the Dutch Bros hackathon effort. It includes a FastAPI-based backend that simulates POS integrations and realtime notifications, demo data, and an Angular-based POS UI project (`dutch-bros-pos`).

The repo is intentionally modular so teams can run the backend independently from the frontend UI and experiment with features like order submission, time simulation, and websocket notifications.

## Contents

```
/ (repo root)
|-- backend/                # FastAPI backend and services
|   |-- main.py             # FastAPI application (entrypoint)
|   |-- api_pipeline.py     # API client helpers
|   |-- notification_service.py
|   |-- requirements.txt
|   |-- data/               # sample data used by backend
|
|-- dutch-bros-pos/        # Angular POS client (development)
|   |-- package.json
|   |-- src/
|
|-- data/                  # shared data (menus, modifiers)
|   |-- menu/
|       |-- menu.json
|       |-- modifiers.json
|
|-- README.md
```

## High level overview

- Backend: FastAPI application (`backend/main.py`) that exposes REST endpoints and a WebSocket for realtime notifications. It contains simulation features (simulated time, notification generation) and order submission logic that can proxy to a Dutch Bros API (configurable via environment variables).
- Frontend: `dutch-bros-pos` is an Angular-based POS UI (development server via `ng serve`).
- Data: Sample menus and modifiers live in `data/menu` and also in the `dutch-bros-pos/public/assets` folder for frontend demos.

## Quick start (macOS / zsh)

Prerequisites:

- Python 3.8+ (recommend 3.10+)
- Node.js (for the Angular app)
- npm

1) Start the backend (FastAPI)

Open a terminal and run:

```bash
cd /Users/sbenstewart/Downloads/dutch\ bros/spark/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# The backend is started simply with Python
# (the app's entrypoint is `main.py`)
python main.py
```

The backend exposes REST endpoints and a websocket at ws://127.0.0.1:8000/ws/notifications by default.

Environment variables (copy `backend/.env.example` to `backend/.env` and edit):

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — required for AWS integrations (Transcribe, S3) if used.
- `DUTCH_BROS_API_BASE_URL` — URL to proxy order submissions (defaults to a placeholder if unset)
- `DUTCH_BROS_API_KEY` — API key used when submitting orders upstream

If you don't intend to call any external APIs, you can run the backend locally without credentials and use the simulation features.

2) Start the Angular POS app

Open a second terminal and run:

```bash
cd /Users/sbenstewart/Downloads/dutch\ bros/spark/dutch-bros-pos
npm install
npm start
```

This runs the Angular dev server (`ng serve`) and serves the POS UI (default port is shown in the terminal, typically 4200).

3) Explore the data and demo assets

Menu and modifiers JSON files are available under `data/menu/` and also copied to the frontend `public/assets` path for quick client-side demos.

## Backend API (selected endpoints)

The backend implements several useful endpoints for simulation and integration. These are available once the backend is running (default host: 127.0.0.1, port: 8000):

- POST /api/time/set — Set simulated time
	- Body: { "time": "HH:MM" }
	- Triggers generation of time-based notifications (morning rush, lunch, cleaning window, etc.)

- POST /api/time/reset — Reset to real time

- GET /api/time/current — Get current (simulated or real) time

- POST /submit-order — Submit an order (see `main.py` for expected payload). Returns success/failure and an order id when proxied successfully.

- WebSocket: /ws/notifications — Subscribe to realtime notifications. The socket sends existing active notifications on connect and receives JSON messages, including dismiss actions from clients.

Example order payload (simplified):

```json
{
	"customer_name": "Alice",
	"items": [
		{
			"product_id": "123",
			"name": "Caramelizer",
			"category": "Drink",
			"size": "Medium",
			"quantity": 1,
			"unit_price": 4.25,
			"child_items": [
				{"modifier_group": "size", "name": "Medium"},
				{"modifier_group": "shot", "name": "Double"}
			]
		}
	],
	"notes": "Extra caramel"
}
```

See `backend/main.py` for full request/response details and how the `modifiers` object is assembled before submitting to an upstream API.

## Development notes & architecture

- The backend uses FastAPI and `httpx` for async HTTP calls to external services. Uvicorn is the preferred server for local development (hot-reload supported).
- `notification_service.py` contains a lightweight notification manager used by the WebSocket endpoint to broadcast messages to connected clients.
- `api_pipeline.py` encapsulates request payload construction and any translation required for the Dutch Bros API.

## Troubleshooting

- Port conflicts: If port 8000 or Angular's 4200 is in use, the dev servers will report the alternative port. Stop the conflicting service or specify a different port.
- Missing environment variables: The backend prints warnings for missing AWS or API credentials. If you don't need integrations, those warnings are non-fatal for many local workflows.
- Order submission errors: When submitting orders the backend proxies to `DUTCH_BROS_API_BASE_URL`. Ensure that env var is set and accessible from the machine, and that `DUTCH_BROS_API_KEY` is configured if required.

## Contributing

Contributions are welcome. Please open issues for bugs and feature requests. If you submit a PR, include a brief description of your changes and any setup steps required to validate them.

Suggested small improvements:

- Add a docker-compose setup for the backend and frontend for reproducible local environments.
- Add OpenAPI examples for the `/submit-order` endpoint.

## License

This repository does not have a license file. Add a LICENSE if you plan to open-source the code.

---

If you'd like, I can also:

- add simple start scripts (Makefile or npm script) to standardize commands;
- add a small example curl script for submitting an order and connecting to the WebSocket;
- generate a minimal `.env.example` with the relevant environment variables.
