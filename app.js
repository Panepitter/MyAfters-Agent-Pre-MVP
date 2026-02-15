// Chat proxied through local server.py → agent-z-platform
const CHAT_ENDPOINT = '/api/chat';

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const sessionIdEl = document.getElementById('sessionId');
const messageCountEl = document.getElementById('messageCount');
const clearBtn = document.getElementById('clearBtn');
const tabButtons = document.querySelectorAll('.cp-tab');
const chatPanel = document.getElementById('chatPanel');
const profilePanel = document.getElementById('profilePanel');
const profileToggle = document.getElementById('profileToggle');
const profileBody = document.getElementById('profileBody');
const profileSummary = document.getElementById('profileSummary');
const profileCard = document.getElementById('profileCard');
const profileAddress = document.getElementById('profileAddress');
const profileLat = document.getElementById('profileLat');
const profileLng = document.getElementById('profileLng');
const profileMap = document.getElementById('profileMap');
const searchBtn = document.getElementById('searchBtn');
const geoBtn = document.getElementById('geoBtn');
const profileNameEl = document.getElementById('profileName');
const profileSurnameEl = document.getElementById('profileSurname');
const profilePhoneEl = document.getElementById('profilePhone');
const genreChips = document.querySelectorAll('.cp-genre-chip');
const budgetMinEl = document.getElementById('budgetMin');
const budgetMaxEl = document.getElementById('budgetMax');
const partySizeEl = document.getElementById('partySize');
const saveProfileBtn = document.getElementById('saveProfileBtn');

let messages = [];
let isThinking = false;
let sessionId = null;
let lastVenuePayload = null;
// lastServerMessageCount removed — no longer needed with SSE streaming
let hasInjectedProfile = false;
let mapInstance = null;
let mapMarker = null;
const profileState = {
  name: '',
  surname: '',
  phone: '',
  address: '',
  lat: null,
  lng: null,
  genres: [],
  budgetMin: null,
  budgetMax: null,
  partySize: null
};

sessionIdEl.textContent = sessionId || 'Nuova sessione';

const saveSession = () => {
  try {
    localStorage.setItem('myafters_chat_session', JSON.stringify({
      messages,
      sessionId,
      hasInjectedProfile
    }));
  } catch (err) {
    // ignore quota errors
  }
};

const loadSession = () => {
  try {
    const saved = localStorage.getItem('myafters_chat_session');
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return;
    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      messages = parsed.messages;
    }
    if (parsed.sessionId) {
      sessionId = parsed.sessionId;
      sessionIdEl.textContent = sessionId;
    }
    if (typeof parsed.hasInjectedProfile === 'boolean') {
      hasInjectedProfile = parsed.hasInjectedProfile;
    }
  } catch (err) {
    // ignore localStorage errors
  }
};

const renderMarkdown = (text) => {
  if (window.marked && typeof window.marked.parse === 'function') {
    return window.marked.parse(text);
  }
  return text
    .replace(/\n/g, '<br/>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
};

const renderMessages = () => {
  messagesEl.innerHTML = '';
  messages.forEach((msg) => {
    const bubble = document.createElement('div');
    const isWidget = msg.isHtml;
    const hasOverlay = Boolean(msg.overlayHtml);
    bubble.className = `cp-message ${msg.role}${isWidget ? ' widget' : ''}${hasOverlay ? ' with-overlay' : ''}`;

    if (isWidget) {
      bubble.innerHTML = msg.content;
    } else if (msg.role === 'assistant') {
      const textHtml = msg.content ? renderMarkdown(msg.content) : '';
      if (hasOverlay) {
        bubble.innerHTML = `
          <div class="cp-message-text">${textHtml}</div>
          ${msg.overlayHtml}
        `;
      } else {
        bubble.innerHTML = textHtml;
      }
    } else {
      bubble.textContent = msg.content;
    }
    messagesEl.appendChild(bubble);

    if (hasOverlay) {
      const trigger = bubble.querySelector('.cp-overlay-trigger');
      const overlay = bubble.querySelector('.cp-message-overlay');
      if (trigger && overlay) {
        const show = () => overlay.classList.add('visible');
        const hide = () => overlay.classList.remove('visible');
        trigger.addEventListener('mouseenter', show);
        trigger.addEventListener('mouseleave', hide);
        overlay.addEventListener('mouseenter', show);
        overlay.addEventListener('mouseleave', hide);
      }
    }
  });

  if (isThinking) {
    const typing = document.createElement('div');
    typing.className = 'cp-message assistant';
    typing.innerHTML = '<div class="cp-typing"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(typing);
  }

  messageCountEl.textContent = String(messages.length);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  enhanceQrCodes();

  // Initialize Uber widgets
  document.querySelectorAll('.cp-uber-widget').forEach(initUberWidget);

  saveSession();
};

const DEFAULT_CENTER = { lat: 45.4642, lng: 9.19 };

const buildGradientQr = (element, text, size = 100) => {
  if (!window.QRCodeStyling || !element || !text) return false;
  element.innerHTML = '';
  const qr = new QRCodeStyling({
    width: size,
    height: size,
    type: 'svg',
    data: text,
    margin: 0,
    qrOptions: {
      errorCorrectionLevel: 'L',
      margin: 0
    },
    dotsOptions: {
      type: 'dots',
      gradient: {
        type: 'linear',
        rotation: 2.2,
        colorStops: [
          { offset: 0, color: '#6366f1' },
          { offset: 0.6, color: '#4f46e5' },
          { offset: 1, color: '#7c3aed' }
        ]
      }
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      color: '#6366f1'
    },
    cornersDotOptions: {
      type: 'dot',
      color: '#7c3aed'
    },
    backgroundOptions: {
      color: 'transparent'
    }
  });
  qr.append(element);
  return true;
};

const enhanceQrCodes = () => {
  const nodes = document.querySelectorAll('[data-qr]');
  nodes.forEach((node) => {
    const text = node.dataset.qr;
    const size = Number(node.dataset.qrSize) || 120;
    if (!text || node.dataset.qrReady === 'true') return;
    const rendered = buildGradientQr(node, text, size);
    if (rendered) {
      node.dataset.qrReady = 'true';
    }
  });
};

const setActiveTab = (tabName) => {
  tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  chatPanel.hidden = tabName !== 'chat';
  profilePanel.hidden = tabName !== 'profile';
  if (tabName === 'profile' && mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 200);
  }
};

const isProfileComplete = () => {
  const hasLocation = profileState.address || (profileState.lat !== null && profileState.lng !== null);
  const hasGenres = profileState.genres.length > 0;
  return Boolean(hasLocation && hasGenres);
};

const formatCoord = (value) => (value !== null && value !== undefined ? Number(value).toFixed(4) : '—');

const buildUserInfoPrefix = () => {
  const address = profileState.address ? `via ${profileState.address}` : 'posizione manuale';
  const coords = profileState.lat !== null && profileState.lng !== null
    ? `${formatCoord(profileState.lat)}, ${formatCoord(profileState.lng)}`
    : 'n/d';
  const genres = profileState.genres.length ? profileState.genres.join(', ') : 'n/d';
  const budget = profileState.budgetMin || profileState.budgetMax
    ? `${profileState.budgetMin || '—'}-${profileState.budgetMax || '—'}€`
    : null;
  const party = profileState.partySize ? `${profileState.partySize} persone` : null;
  const personInfo = [profileState.name, profileState.surname].filter(Boolean).join(' ').trim();
  const phoneInfo = profileState.phone ? `tel: ${profileState.phone}` : null;
  const personal = [personInfo || null, phoneInfo].filter(Boolean).join(', ');
  const extra = [budget ? `budget: ${budget}` : null, party ? `gruppo: ${party}` : null]
    .filter(Boolean)
    .join(', ');
  const extraText = extra ? `, ${extra}` : '';
  const personalText = personal ? `, contatto: ${personal}` : '';
  return `INFO UTENTE: posizione ${address} (coordinate: ${coords}), preferenze generi musicali: ${genres}${personalText}${extraText}.\n\n`;
};

const updateProfileSummary = (persist = false) => {
  const complete = isProfileComplete();
  const locationText = profileState.address || (profileState.lat !== null && profileState.lng !== null
    ? `Lat ${formatCoord(profileState.lat)} · Lng ${formatCoord(profileState.lng)}`
    : 'Posizione mancante');
  const genresText = profileState.genres.length ? profileState.genres.join(', ') : 'Generi mancanti';
  profileSummary.textContent = complete
    ? `Profilo pronto · ${locationText} · ${genresText}`
    : `Completa i campi richiesti · ${locationText} · ${genresText}`;
  profileCard.classList.toggle('ready', complete);
  if (persist) {
    localStorage.setItem('myafters_profile', JSON.stringify(profileState));
  }
};

const setCoordinates = (lat, lng, shouldFly = true) => {
  if (lat !== null && lat !== undefined) profileState.lat = Number(lat);
  if (lng !== null && lng !== undefined) profileState.lng = Number(lng);
  profileLat.value = profileState.lat !== null ? profileState.lat.toFixed(4) : '';
  profileLng.value = profileState.lng !== null ? profileState.lng.toFixed(4) : '';

  if (mapInstance && profileState.lat !== null && profileState.lng !== null) {
    const profileIcon = L.divIcon({ 
      className: 'cp-profile-marker', 
      html: '<div></div>', 
      iconSize: [18, 18] 
    });
    if (!mapMarker) {
      mapMarker = L.marker([profileState.lat, profileState.lng], { icon: profileIcon, draggable: true }).addTo(mapInstance);
      mapMarker.on('dragend', async (e) => {
        const ll = e.target.getLatLng();
        setCoordinates(ll.lat, ll.lng, false);
        const address = await reverseGeocode(ll.lat, ll.lng);
        if (address) {
          profileAddress.value = address;
          syncProfileState();
        }
      });
    } else {
      mapMarker.setLatLng([profileState.lat, profileState.lng]);
    }
    if (shouldFly) {
      mapInstance.setView([profileState.lat, profileState.lng], Math.max(mapInstance.getZoom(), 13), { animate: true });
    }
  }

  updateProfileSummary();
};

const loadProfile = () => {
  try {
    const saved = localStorage.getItem('myafters_profile');
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return;
    profileState.name = parsed.name || '';
    profileState.surname = parsed.surname || '';
    profileState.phone = parsed.phone || '';
    profileState.address = parsed.address || '';
    profileState.lat = parsed.lat ?? null;
    profileState.lng = parsed.lng ?? null;
    profileState.genres = Array.isArray(parsed.genres) ? parsed.genres : [];
    profileState.budgetMin = parsed.budgetMin ?? null;
    profileState.budgetMax = parsed.budgetMax ?? null;
    profileState.partySize = parsed.partySize ?? null;

    profileNameEl.value = profileState.name || '';
    profileSurnameEl.value = profileState.surname || '';
    profilePhoneEl.value = profileState.phone || '';
    profileAddress.value = profileState.address || '';
    budgetMinEl.value = profileState.budgetMin ?? '';
    budgetMaxEl.value = profileState.budgetMax ?? '';
    partySizeEl.value = profileState.partySize ?? '';
    if (profileState.lat !== null && profileState.lng !== null) {
      setCoordinates(profileState.lat, profileState.lng, false);
    }
    genreChips.forEach((chip) => {
      const active = profileState.genres.includes(chip.dataset.genre);
      chip.classList.toggle('active', active);
    });
    updateProfileSummary();
  } catch (err) {
    // ignore localStorage errors
  }
};

const reverseGeocode = async (lat, lng) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.display_name || null;
  } catch (err) {
    return null;
  }
};

const geocodeAddress = async (query) => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!resp.ok) return null;
    const results = await resp.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    return results[0];
  } catch (err) {
    return null;
  }
};

const initMap = () => {
  if (!window.L || mapInstance) return;
  const startLat = profileState.lat ?? DEFAULT_CENTER.lat;
  const startLng = profileState.lng ?? DEFAULT_CENTER.lng;
  mapInstance = L.map(profileMap, { zoomControl: false, attributionControl: false }).setView([startLat, startLng], 12);

  // Dark theme map (same as Uber widget)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(mapInstance);

  // Custom marker icon
  const profileIcon = L.divIcon({ 
    className: 'cp-profile-marker', 
    html: '<div></div>', 
    iconSize: [18, 18] 
  });

  if (profileState.lat !== null && profileState.lng !== null) {
    mapMarker = L.marker([profileState.lat, profileState.lng], { icon: profileIcon, draggable: true }).addTo(mapInstance);
    mapMarker.on('dragend', async (e) => {
      const ll = e.target.getLatLng();
      setCoordinates(ll.lat, ll.lng, false);
      const address = await reverseGeocode(ll.lat, ll.lng);
      if (address) {
        profileAddress.value = address;
        syncProfileState();
      }
    });
  }

  mapInstance.on('click', async (event) => {
    const { lat, lng } = event.latlng;
    setCoordinates(lat, lng);
    const address = await reverseGeocode(lat, lng);
    if (address) {
      profileAddress.value = address;
      syncProfileState();
    }
  });

  setTimeout(() => {
    mapInstance.invalidateSize();
  }, 0);
};

const extractJsonBlock = (text) => {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = text.slice(start, i + 1);
          try {
            return JSON.parse(slice);
          } catch (err) {
            return null;
          }
        }
      }
    }
  }

  return null;
};

const repairTruncatedJson = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const marker = '... (truncated - output too large)';
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let jsonText = raw.slice(start);
  if (jsonText.includes(marker)) {
    jsonText = jsonText.split(marker)[0];
  }

  if (jsonText.includes('"all_venues"')) {
    const cutIndex = jsonText.indexOf('"all_venues"');
    let trimmed = jsonText.slice(0, cutIndex);
    trimmed = trimmed.replace(/,\s*$/, '');
    jsonText = `${trimmed}\n  }\n}`;
  }

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    return null;
  }
};

const parseToolPayload = (raw) => {
  const direct = extractJsonBlock(raw);
  if (direct) return direct;
  return repairTruncatedJson(raw);
};

const resolvePayload = (obj) => {
  if (!obj) return null;
  if (obj.type) return obj;
  if (obj.result && obj.result.type) return obj.result;
  if (obj.result && obj.result.reservation) return { type: 'reservation_card', ...obj.result };
  if (obj.reservation) return { type: 'reservation_card', ...obj };
  if (obj.result && obj.result.prevendita) return { type: 'prevendita_card', ...obj.result };
  if (obj.prevendita) return { type: 'prevendita_card', ...obj };
  return null;
};

const buildVenueGridHtml = (payload) => {
  const venues = payload.venues || [];
  const allVenues = payload.all_venues || venues;
  const criteria = payload.criteria || {};
  const subtitle = `Generi: ${(criteria.preferred_genres || []).join(', ') || 'tutti'} · Budget: ${criteria.budget_min || '—'}-${criteria.budget_max || '—'} · Raggio: ${criteria.max_distance_km || 30}km`;
  const totalResults = payload.total || allVenues.length || venues.length;
  const canExpand = totalResults > venues.length;

  const buildBadges = (venue) => {
    const badges = [];
    const score = venue.score || 0;
    const popularity = venue.popularity || 0;
    const distance = venue.distance_km;
    const budgetScore = venue.score_breakdown?.budget ?? null;

    if (score >= 0.85) badges.push({ label: 'Top match', className: '' });
    if (popularity >= 90) badges.push({ label: 'Trending', className: 'trending' });
    if (budgetScore !== null && budgetScore >= 0.9) badges.push({ label: 'Best value', className: 'value' });
    if (distance !== null && distance !== undefined && distance <= 3) badges.push({ label: 'Vicino', className: 'nearby' });

    return badges;
  };

  const cards = venues.map((venue, cardIndex) => {
    const tags = (venue.music_genres || []).slice(0, 3).map((tag) => `<span class="cp-tag">${tag}</span>`).join('');
    const distance = venue.distance_km !== null && venue.distance_km !== undefined ? `${venue.distance_km} km` : 'Distanza n/d';
    const score = venue.score ? `Score ${venue.score}` : '';
    const imageUrl = venue.image_url || '';
    const badges = buildBadges(venue)
      .slice(0, 3)
      .map((badge) => `<span class="cp-badge ${badge.className}">${badge.label}</span>`)
      .join('');
    return `
      <div class="cp-venue-card" style="--card-index: ${cardIndex}">
        <div class="cp-venue-image" style="background-image:url('${imageUrl}')"></div>
        <div class="cp-venue-body">
          <div class="cp-venue-title">${venue.name}</div>
          <div class="cp-venue-meta">${venue.address || ''} · ${venue.city || ''}</div>
          ${badges ? `<div class="cp-badges">${badges}</div>` : ''}
          <div class="cp-venue-tags">${tags}</div>
          <div class="cp-score">
            <span>⭐ ${venue.rating || '—'}</span>
            <span>${distance}</span>
            <span>${score}</span>
          </div>
          <div class="cp-widget-actions">
            <button class="cp-action-btn" data-action="book" data-venue="${venue.id}" data-name="${venue.name}">Prenota</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="cp-widget">
      <div class="cp-widget-header">
        <div>
          <div class="cp-widget-title">${payload.title || 'Top locali consigliati'}</div>
          <div class="cp-widget-subtitle">${subtitle}</div>
        </div>
        <div class="cp-widget-subtitle">${payload.total || venues.length} risultati</div>
      </div>
      <div class="cp-venue-grid">${cards || '<div class="cp-widget-subtitle">Nessun locale trovato.</div>'}</div>
      ${canExpand ? `
      <div class="cp-widget-actions">
        <button class="cp-action-btn" data-action="show-more">Carica altri locali</button>
      </div>` : ''}
    </div>
  `;
};

const buildReservationOverlayHtml = (payload) => {
  const reservation = payload.reservation || {};
  const status = payload.status || reservation.status || 'pending';
  const date = reservation.reservation_datetime ? new Date(reservation.reservation_datetime).toLocaleString('it-IT') : '—';
  const venueInfo = reservation.venue_id ? `Locale #${reservation.venue_id}` : 'Locale selezionato';
  const hostPasscode = payload.host_passcode || '';
  const guestUrl = payload.guest_url || '';
  const tableLabel = reservation.table_number || '—';
  
  // Build host URL with passcode included so creator can access directly
  let hostUrl = payload.reservation_url || '#';
  if (hostPasscode && hostUrl !== '#') {
    const separator = hostUrl.includes('?') ? '&' : '?';
    hostUrl = `${hostUrl}${separator}passcode=${encodeURIComponent(hostPasscode)}`;
  }

  const statusLabel = {
    pending: 'In attesa',
    accepted: 'Confermata',
    rejected: 'Rifiutata'
  }[status] || status;

  return {
    html: `
      <div class="cp-message-overlay">
        <div class="cp-reservation-bubble-v2">
          <div class="cp-bubble-arrow"></div>
          <div class="cp-bubble-header-v2">
            <div class="cp-bubble-icon">🎉</div>
            <div class="cp-bubble-title-group">
              <div class="cp-bubble-title">Tavolo ${tableLabel}</div>
              <div class="cp-bubble-venue">${venueInfo} · ${date}</div>
            </div>
            <span class="cp-status-pill ${status}">${statusLabel}</span>
          </div>
          
          <div class="cp-bubble-body">
            <div class="cp-bubble-info">
              <div class="cp-bubble-row">
                <span class="cp-bubble-label">Intestatario</span>
                <span class="cp-bubble-value">${reservation.user_name || 'Ospite'}</span>
              </div>
              <div class="cp-bubble-row">
                <span class="cp-bubble-label">Persone</span>
                <span class="cp-bubble-value">${reservation.party_size || '—'}</span>
              </div>
              <div class="cp-bubble-row">
                <span class="cp-bubble-label">Telefono</span>
                <span class="cp-bubble-value">${reservation.user_phone || '—'}</span>
              </div>
            </div>
            
            <div class="cp-bubble-qr-section">
              <div class="cp-bubble-qr" data-qr="${guestUrl}" data-qr-size="94"></div>
              <div class="cp-bubble-qr-hint">QR per invitare ospiti</div>
            </div>
          </div>
          
          <div class="cp-bubble-footer">
            <div class="cp-bubble-passcode">
              <span class="cp-bubble-passcode-label">🔑 Codice creator</span>
              <span class="cp-bubble-passcode-value">${hostPasscode}</span>
            </div>
            <a class="cp-bubble-manage-btn" href="${hostUrl}" target="_blank" rel="noopener">
              Gestisci →
            </a>
          </div>
        </div>
      </div>
    `,
    reservationUrl: hostUrl,
    tableLabel
  };
};

const buildPrevenditaHtml = (payload) => {
  const prevendita = payload.prevendita || {};
  const status = payload.status || prevendita.status || 'active';
  const date = prevendita.event_datetime ? new Date(prevendita.event_datetime).toLocaleString('it-IT') : '—';
  const venueInfo = prevendita.venue_id ? `Locale #${prevendita.venue_id}` : 'Locale selezionato';
  const guestUrl = payload.guest_url || '';
  const ticketType = prevendita.ticket_type || 'standard';

  const statusLabel = {
    active: 'Biglietto attivo',
    accepted: 'Confermata',
    rejected: 'Rifiutata'
  }[status] || status;

  return {
    html: `
      <div class="cp-message-overlay">
        <div class="cp-prevendita-bubble">
          <div class="cp-bubble-arrow"></div>
          <div class="cp-bubble-header-v2">
            <div class="cp-bubble-icon">🎟️</div>
            <div class="cp-bubble-title-group">
              <div class="cp-bubble-title">Prevendita ${ticketType}</div>
              <div class="cp-bubble-venue">${venueInfo} · ${date}</div>
            </div>
            <span class="cp-status-pill ${status}">${statusLabel}</span>
          </div>

          <div class="cp-bubble-body">
            <div class="cp-bubble-info">
              <div class="cp-bubble-row">
                <span class="cp-bubble-label">Intestatario</span>
                <span class="cp-bubble-value">${prevendita.user_name || 'Ospite'}</span>
              </div>
              <div class="cp-bubble-row">
                <span class="cp-bubble-label">Persone</span>
                <span class="cp-bubble-value">${prevendita.party_size || '—'}</span>
              </div>
              <div class="cp-bubble-row">
                <span class="cp-bubble-label">Telefono</span>
                <span class="cp-bubble-value">${prevendita.user_phone || '—'}</span>
              </div>
            </div>

            <div class="cp-bubble-qr-section">
              <div class="cp-bubble-qr" data-qr="${guestUrl}" data-qr-size="94"></div>
              <div class="cp-bubble-qr-hint">QR per accesso prevendita</div>
            </div>
          </div>

          <div class="cp-bubble-footer">
            <a class="cp-bubble-manage-btn" href="${guestUrl}" target="_blank" rel="noopener">
              Apri biglietto →
            </a>
          </div>
        </div>
      </div>
    `,
    prevenditaUrl: guestUrl,
    ticketType
  };
};

const buildUberEmbedHtml = (payload) => {
  const ride = payload.ride || {};
  const widgetId = `uber-widget-${Date.now()}`;
  
  // Usa indirizzo profilo come fallback per pickup
  const pickupAddr = payload.pickup_address || profileState.address || '';
  const dropoffAddr = payload.dropoff_address || '';
  
  const eta = ride.eta_minutes ?? Math.floor(Math.random() * 5) + 2;
  const priceLow = ride.price_low ?? 8;
  const priceHigh = ride.price_high ?? 14;
  const rideId = ride.id || `UB-${Math.floor(Math.random() * 9000) + 1000}`;

  const fmtPrice = (v) => `€${v.toFixed(2).replace('.', ',')}`;

  const vehicles = [
    { id: 'uberx', name: 'UberX', desc: '4 posti · Economica', icon: '🚗', mult: 1.0 },
    { id: 'comfort', name: 'Comfort', desc: '4 posti · Spazio extra', icon: '🚙', mult: 1.35 },
    { id: 'black', name: 'Black', desc: '4 posti · Premium', icon: '🖤', mult: 2.1 },
    { id: 'green', name: 'Green', desc: '4 posti · Elettrica', icon: '🌿', mult: 1.15 }
  ];

  const vehicleCards = vehicles.map((v, i) => {
    const low = priceLow * v.mult;
    const high = priceHigh * v.mult;
    return `
      <button class="cp-uber-vehicle${i === 0 ? ' active' : ''}" data-vehicle="${v.id}">
        <span class="cp-uber-vehicle-icon">${v.icon}</span>
        <div class="cp-uber-vehicle-info">
          <div class="cp-uber-vehicle-name">${v.name}</div>
          <div class="cp-uber-vehicle-desc">${v.desc}</div>
        </div>
        <div class="cp-uber-vehicle-price">${fmtPrice(low)} – ${fmtPrice(high)}</div>
      </button>
    `;
  }).join('');

  return `
    <div class="cp-uber-widget" id="${widgetId}" 
         data-pickup-address="${pickupAddr}"
         data-dropoff-address="${dropoffAddr}"
         data-link="${payload.link || '#'}">
      
      <div class="cp-uber-header">
        <div class="cp-uber-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span>Uber</span>
        </div>
        <div class="cp-uber-eta">
          <span class="cp-uber-eta-time">${eta}</span>
          <span class="cp-uber-eta-label">min</span>
        </div>
      </div>

      <div class="cp-uber-map-container">
        <div class="cp-uber-map" id="${widgetId}-map"></div>
        <div class="cp-uber-map-actions">
          <button class="cp-uber-geo-btn" data-action="geolocate" title="Usa la mia posizione">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="cp-uber-locations">
        <div class="cp-uber-location-row">
          <div class="cp-uber-location-dot pickup"></div>
          <div class="cp-uber-location-input-wrap">
            <input type="text" class="cp-uber-location-input" data-type="pickup" 
                   placeholder="Punto di partenza" value="${pickupAddr}">
            <button class="cp-uber-search-btn" data-target="pickup">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="cp-uber-location-line"></div>
        <div class="cp-uber-location-row">
          <div class="cp-uber-location-dot dropoff"></div>
          <div class="cp-uber-location-input-wrap">
            <input type="text" class="cp-uber-location-input" data-type="dropoff" 
                   placeholder="Destinazione" value="${dropoffAddr}">
            <button class="cp-uber-search-btn" data-target="dropoff">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="cp-uber-vehicles">
        ${vehicleCards}
      </div>

      <div class="cp-uber-trip-info">
        <div class="cp-uber-trip-stat">
          <span class="cp-uber-trip-value cp-uber-distance">—</span>
          <span class="cp-uber-trip-label">km</span>
        </div>
        <div class="cp-uber-trip-divider"></div>
        <div class="cp-uber-trip-stat">
          <span class="cp-uber-trip-value cp-uber-duration">—</span>
          <span class="cp-uber-trip-label">min</span>
        </div>
        <div class="cp-uber-trip-divider"></div>
        <div class="cp-uber-trip-stat">
          <span class="cp-uber-trip-value cp-uber-price-range">${fmtPrice(priceLow)} – ${fmtPrice(priceHigh)}</span>
          <span class="cp-uber-trip-label">stima</span>
        </div>
      </div>

      <div class="cp-uber-footer">
        <button class="cp-uber-confirm-btn" data-action="confirm">
          <span>Conferma UberX</span>
          <span class="cp-uber-confirm-price">${fmtPrice(priceLow)} – ${fmtPrice(priceHigh)}</span>
        </button>
        <div class="cp-uber-disclaimer">
          <span class="cp-uber-ride-id">${rideId}</span>
          <span>·</span>
          <span>Simulazione – nessun addebito</span>
        </div>
      </div>

      <div class="cp-uber-confirmed hidden">
        <div class="cp-uber-confirmed-icon">✓</div>
        <div class="cp-uber-confirmed-title">Corsa confermata!</div>
        <div class="cp-uber-confirmed-sub">Il tuo autista sta arrivando</div>
        <div class="cp-uber-driver">
          <div class="cp-uber-driver-avatar">👤</div>
          <div class="cp-uber-driver-info">
            <div class="cp-uber-driver-name">Marco R.</div>
            <div class="cp-uber-driver-rating">⭐ 4.92 · Toyota Prius · AB 123 CD</div>
          </div>
        </div>
      </div>
    </div>
  `;
};

const initUberWidget = async (widgetEl) => {
  if (!widgetEl || widgetEl.dataset.initialized === 'true') return;
  widgetEl.dataset.initialized = 'true';

  const mapContainer = widgetEl.querySelector('.cp-uber-map');
  if (!mapContainer || !window.L) return;

  // State
  let pickupLat = profileState.lat || 45.4642;
  let pickupLng = profileState.lng || 9.19;
  let dropoffLat = null;
  let dropoffLng = null;
  let pickupMarker = null;
  let dropoffMarker = null;
  let routeLine = null;

  const pickupInput = widgetEl.querySelector('[data-type="pickup"]');
  const dropoffInput = widgetEl.querySelector('[data-type="dropoff"]');
  const distanceEl = widgetEl.querySelector('.cp-uber-distance');
  const durationEl = widgetEl.querySelector('.cp-uber-duration');

  // Haversine distance
  const haversineKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Update trip info
  const updateTripInfo = () => {
    if (pickupLat && dropoffLat) {
      const dist = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
      const duration = Math.max(5, Math.round(dist * 3.5));
      distanceEl.textContent = dist.toFixed(1);
      durationEl.textContent = duration;
    } else {
      distanceEl.textContent = '—';
      durationEl.textContent = '—';
    }
  };

  // Init map
  const uberMap = L.map(mapContainer, { zoomControl: false, attributionControl: false })
    .setView([pickupLat, pickupLng], 13);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(uberMap);

  const pickupIcon = L.divIcon({ className: 'cp-uber-marker pickup', html: '<div></div>', iconSize: [16, 16] });
  const dropoffIcon = L.divIcon({ className: 'cp-uber-marker dropoff', html: '<div></div>', iconSize: [16, 16] });

  // Draw route line
  const drawRoute = () => {
    if (routeLine) uberMap.removeLayer(routeLine);
    if (!pickupMarker || !dropoffMarker) return;
    const pll = pickupMarker.getLatLng();
    const dll = dropoffMarker.getLatLng();
    routeLine = L.polyline([[pll.lat, pll.lng], [dll.lat, dll.lng]], {
      color: '#276EF1', weight: 4, opacity: 0.8, dashArray: '8, 12'
    }).addTo(uberMap);
    uberMap.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    updateTripInfo();
  };

  // Set pickup marker
  const setPickup = (lat, lng, addr) => {
    pickupLat = lat;
    pickupLng = lng;
    if (addr && pickupInput) pickupInput.value = addr;
    if (!pickupMarker) {
      pickupMarker = L.marker([lat, lng], { icon: pickupIcon, draggable: true }).addTo(uberMap);
      pickupMarker.on('dragend', async (e) => {
        const ll = e.target.getLatLng();
        pickupLat = ll.lat;
        pickupLng = ll.lng;
        const address = await reverseGeocode(ll.lat, ll.lng);
        if (address && pickupInput) pickupInput.value = address;
        drawRoute();
      });
    } else {
      pickupMarker.setLatLng([lat, lng]);
    }
    if (!dropoffMarker) uberMap.setView([lat, lng], 14);
    drawRoute();
  };

  // Set dropoff marker
  const setDropoff = (lat, lng, addr) => {
    dropoffLat = lat;
    dropoffLng = lng;
    if (addr && dropoffInput) dropoffInput.value = addr;
    if (!dropoffMarker) {
      dropoffMarker = L.marker([lat, lng], { icon: dropoffIcon, draggable: true }).addTo(uberMap);
      dropoffMarker.on('dragend', async (e) => {
        const ll = e.target.getLatLng();
        dropoffLat = ll.lat;
        dropoffLng = ll.lng;
        const address = await reverseGeocode(ll.lat, ll.lng);
        if (address && dropoffInput) dropoffInput.value = address;
        drawRoute();
      });
    } else {
      dropoffMarker.setLatLng([lat, lng]);
    }
    drawRoute();
  };

  // Geocode and set location
  const geocodeAndSet = async (address, type) => {
    if (!address || !address.trim()) return false;
    const result = await geocodeAddress(address.trim());
    if (!result) return false;
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const displayAddr = result.display_name || address;
    if (type === 'pickup') {
      setPickup(lat, lng, displayAddr);
    } else {
      setDropoff(lat, lng, displayAddr);
    }
    return true;
  };

  // Initial geocoding from data attributes
  const initialPickupAddr = widgetEl.dataset.pickupAddress || '';
  const initialDropoffAddr = widgetEl.dataset.dropoffAddress || '';

  // Use profile location as pickup fallback
  if (profileState.lat && profileState.lng) {
    setPickup(profileState.lat, profileState.lng, profileState.address || '');
  }

  // Geocode initial addresses
  if (initialPickupAddr) {
    await geocodeAndSet(initialPickupAddr, 'pickup');
  }
  if (initialDropoffAddr) {
    await geocodeAndSet(initialDropoffAddr, 'dropoff');
  }

  // Search buttons
  widgetEl.querySelectorAll('.cp-uber-search-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.target;
      const input = widgetEl.querySelector(`[data-type="${target}"]`);
      if (!input || !input.value.trim()) return;
      
      btn.disabled = true;
      btn.innerHTML = '<span class="cp-uber-spinner-small"></span>';
      
      const success = await geocodeAndSet(input.value, target);
      
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>`;
      
      if (!success) {
        input.style.borderColor = '#ef4444';
        setTimeout(() => { input.style.borderColor = ''; }, 2000);
      }
    });
  });

  // Enter key on inputs
  [pickupInput, dropoffInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const type = input.dataset.type;
        const btn = widgetEl.querySelector(`[data-target="${type}"]`);
        if (btn) btn.click();
      }
    });
  });

  // Geolocation button
  const geoBtn = widgetEl.querySelector('[data-action="geolocate"]');
  if (geoBtn) {
    geoBtn.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      geoBtn.classList.add('loading');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const addr = await reverseGeocode(latitude, longitude);
          setPickup(latitude, longitude, addr || 'Posizione attuale');
          geoBtn.classList.remove('loading');
        },
        () => { geoBtn.classList.remove('loading'); }
      );
    });
  }

  // Vehicle selection
  widgetEl.querySelectorAll('.cp-uber-vehicle').forEach((vBtn) => {
    vBtn.addEventListener('click', () => {
      widgetEl.querySelectorAll('.cp-uber-vehicle').forEach((b) => b.classList.remove('active'));
      vBtn.classList.add('active');
      const name = vBtn.querySelector('.cp-uber-vehicle-name').textContent;
      const price = vBtn.querySelector('.cp-uber-vehicle-price').textContent;
      widgetEl.querySelector('.cp-uber-confirm-btn span:first-child').textContent = `Conferma ${name}`;
      widgetEl.querySelector('.cp-uber-confirm-price').textContent = price;
    });
  });

  // Confirm button
  const confirmBtn = widgetEl.querySelector('[data-action="confirm"]');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="cp-uber-spinner"></span> Prenotazione in corso...';
      setTimeout(() => {
        widgetEl.querySelector('.cp-uber-footer').classList.add('hidden');
        widgetEl.querySelector('.cp-uber-vehicles').classList.add('hidden');
        widgetEl.querySelector('.cp-uber-trip-info').classList.add('hidden');
        widgetEl.querySelector('.cp-uber-confirmed').classList.remove('hidden');
      }, 1500);
    });
  }

  setTimeout(() => uberMap.invalidateSize(), 100);
};

const renderWidget = (payload) => {
  if (!payload) return null;
  if (payload.type === 'venue_grid') return buildVenueGridHtml(payload);
  if (payload.type === 'uber_embed') return buildUberEmbedHtml(payload);
  if (payload.type === 'prevendita_card') return buildPrevenditaHtml(payload);
  return null;
};

const stripLongLinks = (text) => {
  if (!text) return '';
  return text.replace(/https?:\/\/\S+/g, (match) => {
    if (match.length > 35) return 'link disponibile nel widget';
    return match;
  });
};

let abortController = null;

const finalizeStream = (assistantText, widgetPayloads) => {
  let reservationOverlay = null;
  let reservationTrigger = '';
  let prevenditaOverlay = null;
  let prevenditaTrigger = '';

  widgetPayloads.forEach((payload) => {
    if (payload.type === 'venue_grid') {
      lastVenuePayload = payload;
    }
    // Skip widgets already rendered inline during streaming
    if (payload._rendered) return;
    if (payload.type === 'reservation_card') {
      reservationOverlay = buildReservationOverlayHtml(payload);
      reservationTrigger = `Tavolo ${reservationOverlay.tableLabel}`;
      return;
    }
    if (payload.type === 'prevendita_card') {
      prevenditaOverlay = buildPrevenditaHtml(payload);
      prevenditaTrigger = `Prevendita ${prevenditaOverlay.ticketType}`;
      return;
    }
    const html = renderWidget(payload);
    if (html) messages.push({ role: 'assistant', content: html, isHtml: true });
  });

  const safeResponse = stripLongLinks(assistantText.trim());
  const triggerHtml = reservationOverlay
    ? `<a class="cp-overlay-trigger" href="${reservationOverlay.reservationUrl}" target="_blank" rel="noopener">${reservationTrigger}</a>`
    : prevenditaOverlay
    ? `<a class="cp-overlay-trigger" href="${prevenditaOverlay.prevenditaUrl}" target="_blank" rel="noopener">${prevenditaTrigger}</a>`
    : '';
  const combinedText = safeResponse
    ? `${safeResponse}${triggerHtml ? '<br/>' + triggerHtml : ''}`
    : triggerHtml;

  if (combinedText || reservationOverlay || prevenditaOverlay) {
    messages.push({
      role: 'assistant',
      content: combinedText || '',
      overlayHtml: reservationOverlay ? reservationOverlay.html : (prevenditaOverlay ? prevenditaOverlay.html : null)
    });
  } else if (widgetPayloads.every(p => p._rendered) && !assistantText.trim()) {
    // All widgets rendered inline, no extra text — nothing to add
  } else if (widgetPayloads.length === 0 && !assistantText.trim()) {
    messages.push({ role: 'assistant', content: '✅ Richiesta completata.' });
  }
};

const sendMessage = async (text) => {
  const trimmed = text.trim();
  if (!trimmed || isThinking) return;

  let outboundMessage = trimmed;
  if (!hasInjectedProfile) {
    if (!isProfileComplete()) {
      messages.push({ role: 'assistant', content: '⚠️ Completa la scheda profilo per iniziare la conversazione.' });
      renderMessages();
      setActiveTab('profile');
      return;
    }
    outboundMessage = `${buildUserInfoPrefix()}${trimmed}`;
    hasInjectedProfile = true;
  }

  messages.push({ role: 'user', content: trimmed });
  inputEl.value = '';
  resizeTextarea();
  isThinking = true;
  renderMessages();

  // Prepare streaming state
  let assistantText = '';
  const widgetPayloads = [];
  let streamBubble = null;

  abortController = new AbortController();

  try {
    const resp = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ message: outboundMessage, session_id: sessionId }),
      signal: abortController.signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      messages.push({ role: 'assistant', content: `⚠️ Errore: ${err.error || 'Impossibile completare la richiesta.'}` });
      isThinking = false;
      renderMessages();
      return;
    }

    // Switch from thinking dots to streaming bubble
    isThinking = false;
    const typingEl = messagesEl.querySelector('.cp-typing');
    if (typingEl && typingEl.parentElement) typingEl.parentElement.remove();

    streamBubble = document.createElement('div');
    streamBubble.className = 'cp-message assistant';
    messagesEl.appendChild(streamBubble);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch (e) { continue; }

        if (evt.type === 'session' && evt.session_id) {
          sessionId = evt.session_id;
          sessionIdEl.textContent = sessionId;
          saveSession();
        }

        if (evt.type === 'token' && evt.content) {
          assistantText += evt.content;
          if (streamBubble) {
            streamBubble.innerHTML = renderMarkdown(assistantText);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        }

        if (evt.type === 'tool_call') {
          // Tool calls processed silently — results handled via tool_result
        }

        if (evt.type === 'tool_result') {
          // evt.result is already a parsed object from SSE JSON
          let payload = evt.result;
          if (typeof payload === 'string') {
            payload = parseToolPayload(payload);
          }
          const resolved = resolvePayload(payload);
          if (resolved) {
            widgetPayloads.push(resolved);

            // Render venue_grid and uber_embed inline during streaming
            if (resolved.type === 'venue_grid' || resolved.type === 'uber_embed') {
              if (resolved.type === 'venue_grid') lastVenuePayload = resolved;
              const widgetHtml = renderWidget(resolved);
              if (widgetHtml && streamBubble) {
                // Convert current streaming text to a permanent bubble
                if (assistantText.trim()) {
                  const textBubble = document.createElement('div');
                  textBubble.className = 'cp-message assistant';
                  textBubble.innerHTML = renderMarkdown(stripLongLinks(assistantText.trim()));
                  messagesEl.insertBefore(textBubble, streamBubble);
                  messages.push({ role: 'assistant', content: stripLongLinks(assistantText.trim()) });
                }
                // Insert widget before stream bubble
                const widgetEl = document.createElement('div');
                widgetEl.className = 'cp-message assistant widget';
                widgetEl.innerHTML = widgetHtml;
                messagesEl.insertBefore(widgetEl, streamBubble);
                messages.push({ role: 'assistant', content: widgetHtml, isHtml: true });
                // Reset stream bubble for next turn text
                assistantText = '';
                streamBubble.innerHTML = '';
                // Activate QR codes and Uber widgets
                enhanceQrCodes();
                widgetEl.querySelectorAll('.cp-uber-widget').forEach(initUberWidget);
                messagesEl.scrollTop = messagesEl.scrollHeight;
                resolved._rendered = true;
              }
            }
          }
        }

        if (evt.type === 'error') {
          assistantText += `\n⚠️ ${evt.error}`;
          if (streamBubble) {
            streamBubble.innerHTML = renderMarkdown(assistantText);
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // User stopped
      if (assistantText) assistantText += '\n\n*(interrotto)*';
    } else {
      messages.push({ role: 'assistant', content: '⚠️ Errore di connessione.' });
    }
  } finally {
    abortController = null;

    // Remove streaming bubble, finalize into messages array
    if (streamBubble) streamBubble.remove();
    finalizeStream(assistantText, widgetPayloads);

    isThinking = false;
    renderMessages();
  }
};

const resizeTextarea = () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
};

const syncProfileState = () => {
  profileState.name = profileNameEl.value.trim();
  profileState.surname = profileSurnameEl.value.trim();
  profileState.phone = profilePhoneEl.value.trim();
  profileState.address = profileAddress.value.trim();
  profileState.budgetMin = budgetMinEl.value ? Number(budgetMinEl.value) : null;
  profileState.budgetMax = budgetMaxEl.value ? Number(budgetMaxEl.value) : null;
  profileState.partySize = partySizeEl.value ? Number(partySizeEl.value) : null;
  updateProfileSummary();
};

const runAddressSearch = async () => {
  const query = profileAddress.value.trim();
  if (!query) return;
  searchBtn.textContent = 'Cerca...';
  const result = await geocodeAddress(query);
  searchBtn.textContent = 'Cerca';
  if (!result) {
    messages.push({ role: 'assistant', content: '⚠️ Nessun indirizzo trovato, prova a essere più specifico.' });
    renderMessages();
    return;
  }
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  profileAddress.value = result.display_name || query;
  syncProfileState();
  setCoordinates(lat, lng);
};

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
  });
});

profileToggle.addEventListener('click', () => {
  const collapsed = profileCard.classList.toggle('collapsed');
  const collapseBtn = profileToggle.querySelector('.cp-collapse-btn');
  if (collapseBtn) {
    collapseBtn.textContent = collapsed ? 'Espandi' : 'Comprimi';
  }
});

[profileNameEl, profileSurnameEl, profilePhoneEl, profileAddress].forEach((el) => {
  el.addEventListener('input', syncProfileState);
});

[budgetMinEl, budgetMaxEl, partySizeEl].forEach((el) => {
  el.addEventListener('input', syncProfileState);
});

profileLat.addEventListener('input', () => {
  const latVal = parseFloat(profileLat.value);
  const lngVal = parseFloat(profileLng.value);
  if (Number.isFinite(latVal) && Number.isFinite(lngVal)) {
    setCoordinates(latVal, lngVal);
  } else {
    profileState.lat = Number.isFinite(latVal) ? latVal : null;
    updateProfileSummary();
  }
});

profileLng.addEventListener('input', () => {
  const latVal = parseFloat(profileLat.value);
  const lngVal = parseFloat(profileLng.value);
  if (Number.isFinite(latVal) && Number.isFinite(lngVal)) {
    setCoordinates(latVal, lngVal);
  } else {
    profileState.lng = Number.isFinite(lngVal) ? lngVal : null;
    updateProfileSummary();
  }
});

genreChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    const selected = [...genreChips]
      .filter((item) => item.classList.contains('active'))
      .map((item) => item.dataset.genre);
    profileState.genres = selected;
    updateProfileSummary();
  });
});

searchBtn.addEventListener('click', runAddressSearch);

profileAddress.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runAddressSearch();
  }
});

geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    messages.push({ role: 'assistant', content: '⚠️ Geolocalizzazione non supportata dal browser.' });
    renderMessages();
    return;
  }
  geoBtn.textContent = 'Individuazione...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      geoBtn.textContent = 'Usa posizione attuale';
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoordinates(lat, lng);
      if (!profileAddress.value) {
        profileAddress.value = 'Posizione attuale';
      }
      syncProfileState();
    },
    () => {
      geoBtn.textContent = 'Usa posizione attuale';
      messages.push({ role: 'assistant', content: '⚠️ Impossibile ottenere la posizione.' });
      renderMessages();
    }
  );
});

saveProfileBtn.addEventListener('click', () => {
  syncProfileState();
  updateProfileSummary(true);
  saveProfileBtn.textContent = 'Profilo salvato';
  setTimeout(() => {
    saveProfileBtn.textContent = 'Salva profilo';
  }, 1600);
});

inputEl.addEventListener('input', resizeTextarea);
inputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage(inputEl.value);
  }
});

sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

clearBtn.addEventListener('click', () => {
  messages = [];
  sessionId = null;
  sessionIdEl.textContent = 'Nuova sessione';
  lastVenuePayload = null;
  hasInjectedProfile = false;
  localStorage.removeItem('myafters_chat_session');
  renderMessages();
});

messagesEl.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'show-more') {
    if (!lastVenuePayload) return;
    const currentLimit = lastVenuePayload.venues ? lastVenuePayload.venues.length : (lastVenuePayload.limit || 6);
    const allVenues = lastVenuePayload.all_venues || [];
    const nextCount = Math.min(allVenues.length, currentLimit + (lastVenuePayload.limit || 6));

    if (allVenues.length > currentLimit) {
      const updatedPayload = {
        ...lastVenuePayload,
        offset: 0,
        limit: nextCount,
        venues: allVenues.slice(0, nextCount),
        all_venues: allVenues
      };

      lastVenuePayload = updatedPayload;
      const html = renderWidget(updatedPayload);
      if (html) {
        const lastWidgetIndex = [...messages].reverse().findIndex((msg) => msg.isHtml && msg.content.includes('cp-venue-grid'));
        if (lastWidgetIndex !== -1) {
          const actualIndex = messages.length - 1 - lastWidgetIndex;
          messages[actualIndex] = { role: 'assistant', content: html, isHtml: true };
        } else {
          messages.push({ role: 'assistant', content: html, isHtml: true });
        }
        renderMessages();
      }
    } else {
      sendMessage('Mostrami altri locali');
    }
    return;
  }

  if (action === 'book') {
    const venueName = target.dataset.name || 'locale';
    sendMessage(`Vorrei prenotare un tavolo al locale ${venueName}`);
  }
});

const quickButtons = document.querySelectorAll('.cp-quick-btn');
quickButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    sendMessage(btn.dataset.prompt || '');
  });
});

loadProfile();
loadSession();
initMap();
updateProfileSummary();
setActiveTab('chat');
renderMessages();
