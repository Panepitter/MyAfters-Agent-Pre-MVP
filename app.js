const API_BASE = 'https://web-production-f8a2c.up.railway.app';
const AGENT_ID = 'agent_ae5b6a14';

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
let sessionId = `ui-session-${Date.now()}`;
let lastVenuePayload = null;
let lastServerMessageCount = 0;
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

sessionIdEl.textContent = sessionId;

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
    margin: 4,
    qrOptions: {
      errorCorrectionLevel: 'L'
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
    if (!mapMarker) {
      mapMarker = L.marker([profileState.lat, profileState.lng]).addTo(mapInstance);
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
  mapInstance = L.map(profileMap, { zoomControl: true }).setView([startLat, startLng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapInstance);

  if (profileState.lat !== null && profileState.lng !== null) {
    mapMarker = L.marker([profileState.lat, profileState.lng]).addTo(mapInstance);
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

  const cards = venues.map((venue) => {
    const tags = (venue.music_genres || []).slice(0, 3).map((tag) => `<span class="cp-tag">${tag}</span>`).join('');
    const distance = venue.distance_km !== null && venue.distance_km !== undefined ? `${venue.distance_km} km` : 'Distanza n/d';
    const score = venue.score ? `Score ${venue.score}` : '';
    const imageUrl = venue.image_url || '';
    const badges = buildBadges(venue)
      .slice(0, 3)
      .map((badge) => `<span class="cp-badge ${badge.className}">${badge.label}</span>`)
      .join('');
    return `
      <div class="cp-venue-card">
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

const buildUberEmbedHtml = (payload) => {
  return `
    <div class="cp-widget cp-uber-embed">
      <div class="cp-widget-header">
        <div>
          <div class="cp-widget-title">Prenota un Uber</div>
          <div class="cp-widget-subtitle">Viaggio precompilato verso la serata</div>
        </div>
        <a class="cp-action-btn" href="${payload.link || '#'}" target="_blank" rel="noopener">Apri Uber</a>
      </div>
      ${payload.html || ''}
    </div>
  `;
};

const renderWidget = (payload) => {
  if (!payload) return null;
  if (payload.type === 'venue_grid') return buildVenueGridHtml(payload);
  if (payload.type === 'uber_embed') return buildUberEmbedHtml(payload);
  return null;
};

const stripLongLinks = (text) => {
  if (!text) return '';
  return text.replace(/https?:\/\/\S+/g, (match) => {
    if (match.length > 35) return 'link disponibile nel widget';
    return match;
  });
};

const handleAgentResponse = (data) => {
  const widgetPayloads = [];
  let reservationOverlay = null;
  let reservationTrigger = '';

  if (Array.isArray(data.messages)) {
    const startIndex = Math.min(lastServerMessageCount, data.messages.length);
    const newMessages = data.messages.slice(startIndex);
    newMessages.forEach((msg) => {
      if (msg.role === 'tool') {
        const raw = msg.content || '';
        const parsed = resolvePayload(parseToolPayload(raw));
        if (parsed) widgetPayloads.push(parsed);
      }
    });
    lastServerMessageCount = data.messages.length;
  }

  widgetPayloads.forEach((payload) => {
    if (payload.type === 'venue_grid') {
      lastVenuePayload = payload;
    }
    if (payload.type === 'reservation_card') {
      reservationOverlay = buildReservationOverlayHtml(payload);
      reservationTrigger = `Tavolo ${reservationOverlay.tableLabel}`;
      return;
    }
    const html = renderWidget(payload);
    if (html) messages.push({ role: 'assistant', content: html, isHtml: true });
  });

  const responseText = typeof data.response === 'string' ? data.response.trim() : '';
  const safeResponse = stripLongLinks(responseText);
  const triggerHtml = reservationOverlay
    ? `<a class="cp-overlay-trigger" href="${reservationOverlay.reservationUrl}" target="_blank" rel="noopener">${reservationTrigger}</a>`
    : '';
  const combinedText = safeResponse
    ? `${safeResponse}${triggerHtml ? '<br/>' + triggerHtml : ''}`
    : triggerHtml;

  if (combinedText || reservationOverlay) {
    messages.push({
      role: 'assistant',
      content: combinedText || '',
      overlayHtml: reservationOverlay ? reservationOverlay.html : null
    });
  } else if (widgetPayloads.length === 0) {
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

  try {
    const resp = await fetch(`${API_BASE}/api/agents/${AGENT_ID}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: outboundMessage, session_id: sessionId })
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      messages.push({ role: 'assistant', content: `⚠️ Errore: ${data.error || 'Impossibile completare la richiesta.'}` });
    } else {
      handleAgentResponse(data);
    }
  } catch (err) {
    messages.push({ role: 'assistant', content: '⚠️ Errore di connessione.' });
  } finally {
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
  sessionId = `ui-session-${Date.now()}`;
  sessionIdEl.textContent = sessionId;
  lastVenuePayload = null;
  lastServerMessageCount = 0;
  hasInjectedProfile = false;
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
initMap();
updateProfileSummary();
setActiveTab('chat');
renderMessages();
