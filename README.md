# OfflineReserve

> An Android app that predicts when you'll lose mobile signal — and prepares your phone before it happens.

Built for India's 450 million mobile users who lose connectivity daily on trains, metros and highways.

---

## The Problem

Every day, millions of people lose internet access unexpectedly — inside metro tunnels, on train routes through rural areas, on highways through the Western Ghats. When signal drops, everything stops. Pages won't load. Maps freeze. Articles disappear.

Current solutions are app-specific (Spotify offline, Netflix downloads) and require manual action. Nobody has built a universal, predictive offline safety net.

---

## The Solution

OfflineReserve sits silently in the background and:

1. **Predicts** when you'll lose signal using GPS speed + a database of known dead zones
2. **Notifies** you before signal drops — with enough time to act
3. **Saves** content you browse inside the app automatically
4. **Serves** saved content seamlessly when you go offline

No manual setup. No app-specific restrictions. Just works.

---

## How It Works

```
GPS detects you moving at 80 km/h on a train route
        +
Dead zone database: tunnel 6 km ahead
        +
ETA calculation: 4.5 minutes away
        ↓
Notification: "Signal dropping in ~5 min"
        ↓
User opens app, browses and saves content
        ↓
Signal drops — saved pages load instantly from reserve
```

---

## Features

### Signal Prediction Engine
- GPS-based speed and direction detection
- 57 known dead zones across South India (Mumbai, Delhi, Bangalore, Chennai, Tamil Nadu, Karnataka)
- ETA calculation using Haversine formula
- Directional heading — only warns if you're moving TOWARDS a dead zone

### Manual Triggers
Tap before you go offline:
- Boarding a flight (30 min)
- Taking the metro (5 min)
- Long highway stretch (15 min)
- Going underground (3 min)

Triggers send countdown notifications at the right time.

### In-App Browser
- Browse any website inside the app
- Pages auto-save to your reserve as you browse
- Saved pages load offline — no internet needed

### Reserve Storage
- Up to 2GB of offline content (configurable: 1GB / 2GB / 5GB)
- Smart eviction — removes least-accessed content when full
- View, open and delete saved pages
- One-tap clear all

### Privacy by Design
- Data never leaves your device
- 30+ blocked domains (banking, chats, passwords, payments)
- Incognito sessions never cached
- No analytics, no tracking, no ads

### Battery Optimised
4-tier detection system:
```
Sleeping  → accelerometer only      ~0.5% per hour
Passive   → activity recognition    ~1%   per hour
Active    → GPS moderate            ~2%   per hour
Precise   → GPS fast (dead zone close, max 5 min) ~4% per hour
```

---

## Dead Zone Coverage

| Region | Zones |
|--------|-------|
| Bangalore Metro (Namma Metro) | 9 underground sections |
| Western Ghats Karnataka | 8 tunnel + forest zones |
| Coorg / Kodagu forest | 3 zones |
| Chennai Metro | 6 underground sections |
| Nilgiris / Tamil Nadu Ghats | 8 zones |
| Tamil Nadu train routes | 12 zones |
| Kerala + AP border zones | 5 zones |
| **Total** | **57 zones** |

New dead zones are learned automatically from user signal loss events.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Native (TypeScript) |
| In-app browser | react-native-webview |
| Notifications | @notifee/react-native |
| File storage | react-native-fs |
| Metadata | AsyncStorage |
| GPS | @react-native-community/geolocation |
| Signal monitoring | @react-native-community/netinfo |
| HTTP | axios |

---

## Architecture

```
App.tsx
├── PredictionEngine      ← GPS + dead zone detection
│   ├── MotionDetector    ← speed, direction, travel mode
│   └── DeadZoneMap       ← 57 zones + self-learning
├── NotificationManager   ← countdown notifications
├── AutoSaver             ← fetches and saves content
├── ReserveStorage        ← file system + metadata
├── SignalMonitor         ← network state watching
└── PrivacyFilter         ← blocks sensitive URLs
```

---

## Current Status

**Version:** 0.1.0 — Beta  
**Platform:** Android  
**Status:** Working prototype

### What works
- Signal prediction UI
- Manual triggers with countdown notifications
- In-app browser with auto-save
- Offline serving from reserve
- 57 dead zone locations

### Roadmap
- [ ] Background auto-save (requires system-level access)
- [ ] Crowdsourced dead zone map (backend)
- [ ] Wikipedia offline search
- [ ] iOS support
- [ ] Telecom SDK integration (Jio / Airtel partnership)

---

## Why Telecom Partnership Matters

Full background traffic interception (saving content from Chrome, YouTube, any app) requires system-level permissions unavailable to Play Store apps.

A telecom partner (Jio, Airtel, Vodafone Idea) can:
- Pre-install as a system app with full permissions
- Provide dead zone data from their network infrastructure
- Bundle with data plans as a value-added service
- Distribute to hundreds of millions of users instantly

This prototype demonstrates the concept and prediction engine. The full product requires telecom partnership.

---

## Contact

Built by a developer in Tamil Nadu, India.  
Targeting the Jio GenNext Hub and Airtel Startup Program.

---

*OfflineReserve v0.1.0 — Built with React Native*
