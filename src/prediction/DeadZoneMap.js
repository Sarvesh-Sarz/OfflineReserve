/**
 * DeadZoneMap.js
 * Comprehensive dead zone coverage for South India.
 * Primary focus: Tamil Nadu + Karnataka
 * Secondary: Kerala, Andhra Pradesh
 *
 * Data sources used:
 *  - Known railway tunnels and ghats (Western Ghats)
 *  - Namma Metro underground sections (Bangalore)
 *  - Chennai Metro underground sections
 *  - Known rural/forest stretches with poor coverage
 *  - Major highway dead patches
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEAD_ZONES_KEY  = '@dead_zones_v2';
const USER_EVENTS_KEY = '@signal_loss_events';

// ─────────────────────────────────────────────────────────────────
// SEED DATA — South India Dead Zones
// Format: { id, name, lat, lng, radiusMetres, type, state, route }
// ─────────────────────────────────────────────────────────────────
const SEED_DEAD_ZONES = [

  // ══════════════════════════════════════════════════════════════
  // KARNATAKA — BANGALORE METRO (Namma Metro)
  // Underground sections between stations
  // ══════════════════════════════════════════════════════════════
  { id: 'blr_metro_01', name: 'Namma Metro — Majestic underground',      lat: 12.9761, lng: 77.5727, radiusMetres: 600,  type: 'metro',   state: 'KA', route: 'Purple + Green Line' },
  { id: 'blr_metro_02', name: 'Namma Metro — Cubbon Park tunnel',        lat: 12.9767, lng: 77.5929, radiusMetres: 500,  type: 'metro',   state: 'KA', route: 'Purple Line' },
  { id: 'blr_metro_03', name: 'Namma Metro — MG Road underground',       lat: 12.9760, lng: 77.6089, radiusMetres: 400,  type: 'metro',   state: 'KA', route: 'Purple Line' },
  { id: 'blr_metro_04', name: 'Namma Metro — Trinity station tunnel',    lat: 12.9746, lng: 77.6179, radiusMetres: 350,  type: 'metro',   state: 'KA', route: 'Purple Line' },
  { id: 'blr_metro_05', name: 'Namma Metro — Halasuru tunnel',           lat: 12.9740, lng: 77.6259, radiusMetres: 350,  type: 'metro',   state: 'KA', route: 'Purple Line' },
  { id: 'blr_metro_06', name: 'Namma Metro — Indiranagar tunnel',        lat: 12.9714, lng: 77.6399, radiusMetres: 350,  type: 'metro',   state: 'KA', route: 'Purple Line' },
  { id: 'blr_metro_07', name: 'Namma Metro — Green Line underground',    lat: 12.9797, lng: 77.5908, radiusMetres: 500,  type: 'metro',   state: 'KA', route: 'Green Line' },
  { id: 'blr_metro_08', name: 'Namma Metro — Vidhana Soudha tunnel',     lat: 12.9794, lng: 77.5907, radiusMetres: 300,  type: 'metro',   state: 'KA', route: 'Green Line' },
  { id: 'blr_metro_09', name: 'Namma Metro — Shivajinagar tunnel',       lat: 12.9829, lng: 77.6012, radiusMetres: 350,  type: 'metro',   state: 'KA', route: 'Green Line' },

  // ══════════════════════════════════════════════════════════════
  // KARNATAKA — WESTERN GHATS TRAIN TUNNELS
  // Bengaluru–Mangaluru route (Hassan–Sakleshpur–Subrahmanya)
  // One of the most tunnel-dense routes in India (57 tunnels!)
  // ══════════════════════════════════════════════════════════════
  { id: 'wg_kar_01', name: 'Sakleshpur tunnel cluster',               lat: 12.9368, lng: 75.7883, radiusMetres: 3000, type: 'tunnel',  state: 'KA', route: 'Bengaluru–Mangaluru' },
  { id: 'wg_kar_02', name: 'Yedakumeri tunnel',                       lat: 12.9100, lng: 75.7200, radiusMetres: 2500, type: 'tunnel',  state: 'KA', route: 'Bengaluru–Mangaluru' },
  { id: 'wg_kar_03', name: 'Kadagaravalli tunnel',                    lat: 12.8900, lng: 75.7050, radiusMetres: 2000, type: 'tunnel',  state: 'KA', route: 'Bengaluru–Mangaluru' },
  { id: 'wg_kar_04', name: 'Donigal–Subrahmanya Road tunnels',        lat: 12.6100, lng: 75.6500, radiusMetres: 4000, type: 'tunnel',  state: 'KA', route: 'Bengaluru–Mangaluru' },
  { id: 'wg_kar_05', name: 'Shiradi Ghat dead zone',                  lat: 12.8500, lng: 75.7500, radiusMetres: 5000, type: 'forest',  state: 'KA', route: 'NH-75 Bengaluru–Mangaluru highway' },
  { id: 'wg_kar_06', name: 'Charmadi Ghat stretch',                   lat: 13.0200, lng: 75.6000, radiusMetres: 6000, type: 'forest',  state: 'KA', route: 'Chikkamagaluru–Mangaluru' },
  { id: 'wg_kar_07', name: 'Bisle Ghat forest zone',                  lat: 12.7200, lng: 75.8000, radiusMetres: 4000, type: 'forest',  state: 'KA', route: 'Sakleshpur–Mangaluru' },
  { id: 'wg_kar_08', name: 'Kukke Subramanya area',                   lat: 12.5500, lng: 75.6500, radiusMetres: 3000, type: 'forest',  state: 'KA', route: 'Bengaluru–Mangaluru' },

  // ══════════════════════════════════════════════════════════════
  // KARNATAKA — COORG / KODAGU REGION
  // Heavy forest, no towers
  // ══════════════════════════════════════════════════════════════
  { id: 'kar_cg_01', name: 'Coorg forest stretch — Madikeri',         lat: 12.4200, lng: 75.7400, radiusMetres: 8000, type: 'forest',  state: 'KA', route: 'Mysuru–Madikeri highway' },
  { id: 'kar_cg_02', name: 'Virajpet rural area',                     lat: 12.1600, lng: 75.8000, radiusMetres: 5000, type: 'forest',  state: 'KA', route: 'Coorg interior' },
  { id: 'kar_cg_03', name: 'Nagarhole forest reserve',                lat: 12.0400, lng: 76.1300, radiusMetres: 12000, type: 'forest', state: 'KA', route: 'Mysuru–Coorg' },

  // ══════════════════════════════════════════════════════════════
  // KARNATAKA — OTHER NOTABLE DEAD ZONES
  // ══════════════════════════════════════════════════════════════
  { id: 'kar_01', name: 'Mysuru–Bengaluru highway rural stretch',      lat: 12.5000, lng: 76.8500, radiusMetres: 4000, type: 'highway', state: 'KA', route: 'NH-275' },
  { id: 'kar_02', name: 'Tumkur–Chitradurga highway gap',              lat: 14.2000, lng: 76.4000, radiusMetres: 5000, type: 'highway', state: 'KA', route: 'NH-150A' },
  { id: 'kar_03', name: 'Hospet–Bellary rural stretch',                lat: 15.2500, lng: 76.5000, radiusMetres: 6000, type: 'highway', state: 'KA', route: 'Hampi region' },
  { id: 'kar_04', name: 'Dandeli forest area',                         lat: 15.2500, lng: 74.6200, radiusMetres: 10000, type: 'forest', state: 'KA', route: 'Hubli–Goa route' },

  // ══════════════════════════════════════════════════════════════
  // TAMIL NADU — CHENNAI METRO UNDERGROUND
  // ══════════════════════════════════════════════════════════════
  { id: 'chn_metro_01', name: 'Chennai Metro — Central underground',   lat: 13.0824, lng: 80.2752, radiusMetres: 500,  type: 'metro',   state: 'TN', route: 'Blue Line' },
  { id: 'chn_metro_02', name: 'Chennai Metro — Government Estate',     lat: 13.0772, lng: 80.2691, radiusMetres: 400,  type: 'metro',   state: 'TN', route: 'Blue Line' },
  { id: 'chn_metro_03', name: 'Chennai Metro — LIC tunnel',            lat: 13.0680, lng: 80.2569, radiusMetres: 400,  type: 'metro',   state: 'TN', route: 'Blue Line' },
  { id: 'chn_metro_04', name: 'Chennai Metro — Thousand Lights',       lat: 13.0563, lng: 80.2499, radiusMetres: 350,  type: 'metro',   state: 'TN', route: 'Blue Line' },
  { id: 'chn_metro_05', name: 'Chennai Metro — AG-DMS tunnel',         lat: 13.0480, lng: 80.2428, radiusMetres: 400,  type: 'metro',   state: 'TN', route: 'Blue Line' },
  { id: 'chn_metro_06', name: 'Chennai Metro — Teynampet tunnel',      lat: 13.0401, lng: 80.2497, radiusMetres: 350,  type: 'metro',   state: 'TN', route: 'Blue Line' },

  // ══════════════════════════════════════════════════════════════
  // TAMIL NADU — NILGIRIS / WESTERN GHATS
  // Some of the worst dead zones in South India
  // ══════════════════════════════════════════════════════════════
  { id: 'tn_nilg_01', name: 'Nilgiri Mountain Railway — Coonoor stretch',   lat: 11.3500, lng: 76.7900, radiusMetres: 5000, type: 'tunnel',  state: 'TN', route: 'Ooty–Mettupalayam' },
  { id: 'tn_nilg_02', name: 'Nilgiri Mountain Railway — Ooty area',         lat: 11.4100, lng: 76.7000, radiusMetres: 4000, type: 'tunnel',  state: 'TN', route: 'Ooty–Mettupalayam' },
  { id: 'tn_nilg_03', name: 'Mudumalai forest reserve',                     lat: 11.5500, lng: 76.5200, radiusMetres: 15000, type: 'forest', state: 'TN', route: 'Ooty–Mysuru highway' },
  { id: 'tn_nilg_04', name: 'Anaimalai hills stretch',                      lat: 10.5600, lng: 77.1000, radiusMetres: 8000, type: 'forest',  state: 'TN', route: 'Pollachi–Munnar' },
  { id: 'tn_nilg_05', name: 'Kodaikanal ghat road dead zone',               lat: 10.2400, lng: 77.4800, radiusMetres: 6000, type: 'forest',  state: 'TN', route: 'Kodaikanal hills' },
  { id: 'tn_nilg_06', name: 'Valparai hills area',                          lat: 10.3200, lng: 76.9600, radiusMetres: 7000, type: 'forest',  state: 'TN', route: 'Coimbatore–Valparai' },
  { id: 'tn_nilg_07', name: 'Yercaud forest zone',                          lat: 11.7780, lng: 78.2050, radiusMetres: 5000, type: 'forest',  state: 'TN', route: 'Salem–Yercaud hills' },
  { id: 'tn_nilg_08', name: 'Kolli Hills stretch',                          lat: 11.2350, lng: 78.3200, radiusMetres: 6000, type: 'forest',  state: 'TN', route: 'Namakkal–Kolli Hills' },

  // ══════════════════════════════════════════════════════════════
  // TAMIL NADU — TRAIN ROUTES
  // Known rural + tunnel dead zones on major routes
  // ══════════════════════════════════════════════════════════════
  { id: 'tn_tr_01', name: 'Chennai–Bengaluru line — Jolarpettai rural', lat: 12.9100, lng: 78.5800, radiusMetres: 4000, type: 'highway', state: 'TN', route: 'Chennai–Bengaluru' },
  { id: 'tn_tr_02', name: 'Chennai–Madurai line — Villupuram stretch',  lat: 11.9400, lng: 79.5000, radiusMetres: 5000, type: 'highway', state: 'TN', route: 'Chennai–Madurai' },
  { id: 'tn_tr_03', name: 'Madurai–Dindigul rural stretch',             lat: 10.3600, lng: 77.9700, radiusMetres: 4000, type: 'highway', state: 'TN', route: 'Madurai–Coimbatore' },
  { id: 'tn_tr_04', name: 'Coimbatore–Palakkad border stretch',         lat: 10.8000, lng: 76.9500, radiusMetres: 5000, type: 'highway', state: 'TN', route: 'Coimbatore–Palakkad' },
  { id: 'tn_tr_05', name: 'Salem–Dharmapuri rural area',                lat: 12.1000, lng: 78.1500, radiusMetres: 6000, type: 'highway', state: 'TN', route: 'Salem–Bengaluru highway' },
  { id: 'tn_tr_06', name: 'Tirunelveli–Nagercoil rural stretch',        lat: 8.7000,  lng: 77.6000, radiusMetres: 5000, type: 'highway', state: 'TN', route: 'Chennai–Kanyakumari line' },
  { id: 'tn_tr_07', name: 'Rameswaram bridge approach dead zone',       lat: 9.2876,  lng: 79.3129, radiusMetres: 3000, type: 'tunnel',  state: 'TN', route: 'Mandapam–Rameswaram' },
  { id: 'tn_tr_08', name: 'Tiruvannamalai rural stretch',               lat: 12.2300, lng: 79.0700, radiusMetres: 5000, type: 'highway', state: 'TN', route: 'Chennai–Salem' },
  { id: 'tn_tr_09', name: 'Krishnagiri–Dharmapuri stretch',             lat: 12.5200, lng: 78.2100, radiusMetres: 5000, type: 'highway', state: 'TN', route: 'NH-44' },
  { id: 'tn_tr_10', name: 'Vellore–Katpadi rural area',                 lat: 12.9200, lng: 79.1600, radiusMetres: 3000, type: 'highway', state: 'TN', route: 'Chennai–Bengaluru NH-48' },
  { id: 'tn_tr_11', name: 'Cuddalore coast stretch',                    lat: 11.7400, lng: 79.7700, radiusMetres: 5000, type: 'highway', state: 'TN', route: 'ECR coastal' },
  { id: 'tn_tr_12', name: 'Kanyakumari tip dead zone',                  lat: 8.0880,  lng: 77.5500, radiusMetres: 4000, type: 'highway', state: 'TN', route: 'Southernmost stretch' },

  // ══════════════════════════════════════════════════════════════
  // TAMIL NADU — CHENNAI LOCAL TRAIN TUNNELS / WEAK SPOTS
  // ══════════════════════════════════════════════════════════════
  { id: 'chn_local_01', name: 'Chennai Beach–Egmore stretch',          lat: 13.0820, lng: 80.2870, radiusMetres: 500,  type: 'tunnel',  state: 'TN', route: 'Chennai local' },
  { id: 'chn_local_02', name: 'Park Town cutting',                     lat: 13.0780, lng: 80.2769, radiusMetres: 400,  type: 'tunnel',  state: 'TN', route: 'Chennai local' },

  // ══════════════════════════════════════════════════════════════
  // KERALA — BORDER ZONES (affecting TN/KA travellers)
  // ══════════════════════════════════════════════════════════════
  { id: 'ker_01', name: 'Palakkad Gap forest stretch',                 lat: 10.7800, lng: 76.7000, radiusMetres: 8000, type: 'forest',  state: 'KL', route: 'Coimbatore–Palakkad' },
  { id: 'ker_02', name: 'Shoranur–Palakkad rural stretch',             lat: 10.7600, lng: 76.6000, radiusMetres: 4000, type: 'highway', state: 'KL', route: 'TN–Kerala border' },
  { id: 'ker_03', name: 'Munnar approach road dead zone',              lat: 10.0800, lng: 77.0600, radiusMetres: 7000, type: 'forest',  state: 'KL', route: 'Madurai–Munnar highway' },

  // ══════════════════════════════════════════════════════════════
  // ANDHRA PRADESH — BORDER ZONES (affecting KA travellers)
  // ══════════════════════════════════════════════════════════════
  { id: 'ap_01', name: 'Kurnool–Nandyal forest stretch',              lat: 15.5000, lng: 78.2000, radiusMetres: 6000, type: 'forest',  state: 'AP', route: 'Bengaluru–Hyderabad' },
  { id: 'ap_02', name: 'Nallamala forest zone',                        lat: 15.8000, lng: 78.9000, radiusMetres: 12000, type: 'forest', state: 'AP', route: 'NH-44' },

];

// ─────────────────────────────────────────────────────────────────

class DeadZoneMap {
  constructor() {
    this.zones      = [...SEED_DEAD_ZONES];
    this.userEvents = [];
  }

  async init() {
    try {
      const raw = await AsyncStorage.getItem(DEAD_ZONES_KEY);
      if (raw) {
        const synced = JSON.parse(raw);
        this._mergeZones(synced);
      }

      const eventsRaw = await AsyncStorage.getItem(USER_EVENTS_KEY);
      if (eventsRaw) {
        this.userEvents = JSON.parse(eventsRaw);
        this._learnFromUserEvents();
      }

      console.log(`[DeadZoneMap] Ready — ${this.zones.length} dead zones loaded`);
    } catch (e) {
      console.error('[DeadZoneMap] Init error:', e);
    }
  }

  /**
   * Main method — is there a dead zone ahead of us?
   */
  predictAhead(currentLat, currentLng, speedKmh, headingDegrees = null) {
    if (speedKmh < 10) return null;

    const speedMs           = speedKmh / 3.6;
    const maxLookAheadMetres = speedMs * 10 * 60; // 10 min lookahead
    let closestThreat       = null;

    for (const zone of this.zones) {
      const distance = this._haversine(currentLat, currentLng, zone.lat, zone.lng);

      if (distance > maxLookAheadMetres) continue;

      // Heading check — are we actually moving towards it?
      if (headingDegrees !== null) {
        const bearing      = this._bearing(currentLat, currentLng, zone.lat, zone.lng);
        const angleDiff    = Math.abs(headingDegrees - bearing);
        const normalised   = angleDiff > 180 ? 360 - angleDiff : angleDiff;
        if (normalised > 60) continue;
      }

      const distanceToEdge = Math.max(0, distance - zone.radiusMetres);
      const etaSeconds     = distanceToEdge / speedMs;
      const etaMinutes     = etaSeconds / 60;

      const confidence =
        zone.id.startsWith('user_')  ? 'high'   :
        zone.id.startsWith('crowd_') ? 'high'   : 'medium';

      const threat = {
        zone,
        distanceMetres  : Math.round(distance),
        distanceToEdge  : Math.round(distanceToEdge),
        etaSeconds      : Math.round(etaSeconds),
        etaMinutes      : Math.round(etaMinutes * 10) / 10,
        confidence,
      };

      if (!closestThreat || distanceToEdge < closestThreat.distanceToEdge) {
        closestThreat = threat;
      }
    }

    return closestThreat;
  }

  isInsideDeadZone(lat, lng) {
    return this.zones.some(zone =>
      this._haversine(lat, lng, zone.lat, zone.lng) <= zone.radiusMetres
    );
  }

  async logSignalLoss(lat, lng) {
    const event = {
      lat       : Math.round(lat * 1000) / 1000,
      lng       : Math.round(lng * 1000) / 1000,
      timestamp : Date.now(),
    };
    this.userEvents.push(event);
    if (this.userEvents.length > 200) this.userEvents.shift();
    await AsyncStorage.setItem(USER_EVENTS_KEY, JSON.stringify(this.userEvents));
    this._learnFromUserEvents();
    console.log(`[DeadZoneMap] Signal loss logged at ${event.lat}, ${event.lng}`);
  }

  async syncFromBackend(zones) {
    this._mergeZones(zones);
    await AsyncStorage.setItem(DEAD_ZONES_KEY, JSON.stringify(this.zones));
    console.log(`[DeadZoneMap] Synced ${zones.length} zones from backend`);
  }

  getZonesByState(stateCode) {
    return this.zones.filter(z => z.state === stateCode);
  }

  getAllZones() { return this.zones; }
  getTotalCount() { return this.zones.length; }

  // ── Private ──────────────────────────────────────────────────

  _learnFromUserEvents() {
    if (this.userEvents.length < 2) return;

    const clusters = [];
    for (const event of this.userEvents) {
      let added = false;
      for (const cluster of clusters) {
        if (this._haversine(event.lat, event.lng, cluster.centerLat, cluster.centerLng) < 200) {
          cluster.events.push(event);
          cluster.centerLat = cluster.events.reduce((s, e) => s + e.lat, 0) / cluster.events.length;
          cluster.centerLng = cluster.events.reduce((s, e) => s + e.lng, 0) / cluster.events.length;
          added = true;
          break;
        }
      }
      if (!added) clusters.push({ centerLat: event.lat, centerLng: event.lng, events: [event] });
    }

    for (const cluster of clusters) {
      if (cluster.events.length < 2) continue;
      const id = `user_${cluster.centerLat.toFixed(3)}_${cluster.centerLng.toFixed(3)}`;
      if (this.zones.find(z => z.id === id)) continue;
      this.zones.push({
        id,
        name         : 'Your dead zone',
        lat          : cluster.centerLat,
        lng          : cluster.centerLng,
        radiusMetres : 300,
        type         : 'personal',
        state        : 'unknown',
        hitCount     : cluster.events.length,
      });
      console.log(`[DeadZoneMap] Learned new dead zone at ${cluster.centerLat.toFixed(3)}, ${cluster.centerLng.toFixed(3)}`);
    }
  }

  _mergeZones(newZones) {
    for (const zone of newZones) {
      if (!this.zones.find(z => z.id === zone.id)) {
        this.zones.push(zone);
      }
    }
  }

  _haversine(lat1, lng1, lat2, lng2) {
    const R    = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a    =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _bearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y    = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    const x    =
      Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }
}

export default new DeadZoneMap();
