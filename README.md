# Launch1500 — Independent Website

Launch1500 is a fully independent, bilingual (English & Arabic) business website and guided lead estimation assistant.

## Features

- **Responsive bilingual UI**: Instant toggle between English and Arabic (full RTL layout support).
- **Native Arabic Artwork**: Dedicated Arabic visual mockups with full RTL layout and authentic Arabic typography for the hero and flagship demo previews.
- **Package showcase**: Lite (AED 1,500), Basic (AED 2,000), Plus (AED 3,000), Store (AED 4,000), and Premium (AED 5,000).
- **Interactive Demos**: Three standalone, self-contained business demo sites (`/demos/aed-1500/`, `/demos/aed-3000/`, `/demos/aed-5000/`).
- **Interactive Lead Estimator**: Real-time deposit and total calculation with 30/70 payment model.
- **Guided Assistant**: Step-by-step local project brief generator with verified WhatsApp handoff.
- **Zero External Dependencies**: Completely decoupled from MotherBrain, Company Island, shared marketplaces, or parent folders.

## Running & Publishing Locally

To launch the independent website and start the public Cloudflare tunnel:

```bash
./start.sh
# Or: npm start
```

This starts the local server and routes it through an encrypted public HTTPS tunnel, automatically updating `live_url.txt`.
