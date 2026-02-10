const API_BASE = window.location.origin;

// DOM Elements
const heroIcon = document.getElementById('heroIcon');
const heroTitle = document.getElementById('heroTitle');
const heroSub = document.getElementById('heroSub');
const statusPill = document.getElementById('statusPill');
const roleBadge = document.getElementById('roleBadge');
const hostView = document.getElementById('hostView');
const guestView = document.getElementById('guestView');
const unlockView = document.getElementById('unlockView');
const infoGrid = document.getElementById('infoGrid');
const guestInfoGrid = document.getElementById('guestInfoGrid');
const passcodeValue = document.getElementById('passcodeValue');
const qrWrapper = document.getElementById('qrWrapper');
const guestLinkBox = document.getElementById('guestLinkBox');
const hostActionsSection = document.getElementById('hostActionsSection');
const acceptBtn = document.getElementById('acceptBtn');
const rejectBtn = document.getElementById('rejectBtn');
const guestNoticeSection = document.getElementById('guestNoticeSection');
const guestNotice = document.getElementById('guestNotice');
const passcodeInput = document.getElementById('passcodeInput');
const unlockBtn = document.getElementById('unlockBtn');
const hostRequestsSection = document.getElementById('hostRequestsSection');
const hostRequestsList = document.getElementById('hostRequestsList');
const guestNameInput = document.getElementById('guestNameInput');
const guestSurnameInput = document.getElementById('guestSurnameInput');
const guestPhoneInput = document.getElementById('guestPhoneInput');
const guestRequestBtn = document.getElementById('guestRequestBtn');
const guestRequestStatus = document.getElementById('guestRequestStatus');
const guestRequestSection = document.getElementById('guestRequestSection');

// URL params
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const roleParam = params.get('role');
const urlPasscode = params.get('passcode');

// State
let currentData = null;
let currentPasscode = urlPasscode || '';
let guestRequestState = null;
let hostPollInterval = null;
let guestStatusInterval = null;

const guestRequestStorageKey = token ? `myafters_guest_request_${token}` : 'myafters_guest_request';

const loadGuestRequestState = () => {
  if (!token) return null;
  try {
    const raw = localStorage.getItem(guestRequestStorageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
};

const saveGuestRequestState = (payload) => {
  if (!token) return;
  if (!payload) {
    localStorage.removeItem(guestRequestStorageKey);
    return;
  }
  localStorage.setItem(guestRequestStorageKey, JSON.stringify(payload));
};

const clearIntervals = () => {
  if (hostPollInterval) {
    clearInterval(hostPollInterval);
    hostPollInterval = null;
  }
  if (guestStatusInterval) {
    clearInterval(guestStatusInterval);
    guestStatusInterval = null;
  }
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (err) {
    return value;
  }
};

const buildGradientQr = (element, text, size = 170) => {
  if (!window.QRCodeStyling || !element || !text) return false;
  element.innerHTML = '';
  const qr = new QRCodeStyling({
    width: size,
    height: size,
    type: 'svg',
    data: text,
    margin: 8,
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

const renderInfoGrid = (container, reservation) => {
  const items = [
    { label: 'Intestatario', value: reservation.user_name || 'Ospite' },
    { label: 'Persone', value: reservation.party_size || '—' },
    { label: 'Telefono', value: reservation.user_phone || '—' },
    { label: 'Data/Ora', value: formatDate(reservation.reservation_datetime) },
    { label: 'Locale', value: `#${reservation.venue_id || '—'}` },
    { label: 'ID', value: reservation.id || '—' }
  ];
  
  container.innerHTML = items.map(item => `
    <div class="cp-res-info-item">
      <span class="cp-res-info-label">${item.label}</span>
      <span class="cp-res-info-value">${item.value}</span>
    </div>
  `).join('');
};

const updateStatusDisplay = (status) => {
  const statusConfig = {
    pending: { label: 'In attesa', class: 'pending', icon: '⏳' },
    accepted: { label: 'Confermata', class: 'accepted', icon: '✓' },
    rejected: { label: 'Rifiutata', class: 'rejected', icon: '✕' }
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  statusPill.textContent = config.label;
  statusPill.className = `cp-status-pill ${config.class}`;
  return config;
};

const renderHostView = (data) => {
  const reservation = data.reservation || {};
  
  // Hero
  heroIcon.textContent = '🎉';
  heroTitle.textContent = `Tavolo ${reservation.table_number || '—'}`;
  heroSub.textContent = `Locale #${reservation.venue_id || '—'} · ${formatDate(reservation.reservation_datetime)}`;
  updateStatusDisplay(data.status);
  
  // Role badge
  roleBadge.textContent = '👑 Creator';
  roleBadge.className = 'cp-res-role-badge host';
  roleBadge.hidden = false;
  
  // Info grid
  renderInfoGrid(infoGrid, reservation);
  
  // Passcode
  passcodeValue.textContent = data.host_passcode || '—';
  
  // QR Code
  if (data.guest_url) {
    buildGradientQr(qrWrapper, data.guest_url, 160);
    guestLinkBox.innerHTML = `<a href="${data.guest_url}" target="_blank">${data.guest_url}</a>`;
  }
  
  // Actions (show only if there are pending requests - for now always hidden since we don't track individual guest requests)
  hostActionsSection.hidden = true;

  clearIntervals();
  fetchGuestRequests();
  hostPollInterval = setInterval(fetchGuestRequests, 6000);
  
  // Show host view
  hostView.hidden = false;
  guestView.hidden = true;
  unlockView.hidden = true;
};

const renderGuestView = (data) => {
  const reservation = data.reservation || {};
  const status = data.status || 'pending';
  
  // Hero
  heroIcon.textContent = status === 'accepted' ? '🎊' : status === 'rejected' ? '😔' : '🎟️';
  heroTitle.textContent = `Tavolo ${reservation.table_number || '—'}`;
  heroSub.textContent = `Locale #${reservation.venue_id || '—'} · ${formatDate(reservation.reservation_datetime)}`;
  updateStatusDisplay(status);
  
  // Role badge
  roleBadge.textContent = '🎫 Ospite';
  roleBadge.className = 'cp-res-role-badge guest';
  roleBadge.hidden = false;
  
  // Info grid (limited info for guests)
  const guestItems = [
    { label: 'Tavolo', value: reservation.table_number || '—' },
    { label: 'Persone', value: reservation.party_size || '—' },
    { label: 'Data/Ora', value: formatDate(reservation.reservation_datetime) },
    { label: 'Locale', value: `#${reservation.venue_id || '—'}` }
  ];
  
  guestInfoGrid.innerHTML = guestItems.map(item => `
    <div class="cp-res-info-item">
      <div class="cp-res-info-label">${item.label}</div>
      <div class="cp-res-info-value">${item.value}</div>
    </div>
  `).join('');
  
  // Guest notice based on status
  const noticeConfig = {
    pending: {
      icon: '⏳',
      text: 'Richiesta in attesa di approvazione',
      sub: 'Il creatore del tavolo deve accettare la tua richiesta',
      class: 'cp-res-status-pending'
    },
    accepted: {
      icon: '🎉',
      text: 'Sei stato accettato al tavolo!',
      sub: 'Presentati al locale con questo QR code',
      class: 'cp-res-status-accepted'
    },
    rejected: {
      icon: '😔',
      text: 'Richiesta non accettata',
      sub: 'Il creatore del tavolo ha rifiutato la richiesta',
      class: 'cp-res-status-rejected'
    }
  };

  if (guestRequestState && guestRequestState.status) {
    applyGuestRequestStatus(guestRequestState.status);
  } else {
    const notice = noticeConfig[status] || noticeConfig.pending;
    guestNoticeSection.className = `cp-res-section ${notice.class}`;
    guestNotice.innerHTML = `
      <div class="cp-res-guest-notice-icon">${notice.icon}</div>
      <div class="cp-res-guest-notice-text">${notice.text}</div>
      <div class="cp-res-guest-notice-sub">${notice.sub}</div>
    `;
    setGuestFormDisabled(false);
    setGuestRequestStatus('');
  }

  clearIntervals();
  if (guestRequestState && guestRequestState.phone) {
    fetchGuestRequestStatus();
    guestStatusInterval = setInterval(fetchGuestRequestStatus, 6000);
  }
  
  // Show guest view
  hostView.hidden = true;
  guestView.hidden = false;
  unlockView.hidden = true;
};

const renderUnlockView = (data) => {
  const reservation = data.reservation || {};
  
  // Hero
  heroIcon.textContent = '🔐';
  heroTitle.textContent = `Tavolo ${reservation.table_number || '—'}`;
  heroSub.textContent = 'Inserisci il codice creator per gestire';
  updateStatusDisplay(data.status);
  
  roleBadge.hidden = true;

  clearIntervals();
  
  // Show unlock view
  hostView.hidden = true;
  guestView.hidden = true;
  unlockView.hidden = false;
};

const renderReservation = (data) => {
  currentData = data;
  const role = data.role;
  const requiresPasscode = data.requires_passcode;
  
  if (role === 'host') {
    renderHostView(data);
  } else if (roleParam === 'host' && requiresPasscode) {
    renderUnlockView(data);
  } else {
    renderGuestView(data);
  }
};

const fetchReservation = async () => {
  if (!token) {
    heroSub.textContent = 'Token mancante. Usa il link del QR code.';
    return;
  }
  
  try {
    // Priority: URL param (first load) > input > current state > localStorage
    const storedPasscode = localStorage.getItem(`myafters_host_pass_${token}`);
    const inputPasscode = passcodeInput?.value?.trim() || '';
    
    // Determine best passcode to use
    if (inputPasscode) {
      currentPasscode = inputPasscode;
    } else if (!currentPasscode) {
      // First load - check URL param first, then localStorage
      currentPasscode = urlPasscode || storedPasscode || '';
    }
    
    // Store valid passcode
    if (currentPasscode) {
      localStorage.setItem(`myafters_host_pass_${token}`, currentPasscode);
    }
    
    const query = currentPasscode ? `?passcode=${encodeURIComponent(currentPasscode)}` : '';
    const resp = await fetch(`${API_BASE}/api/reservations/${token}${query}`);
    
    if (!resp.ok) {
      heroSub.textContent = 'Prenotazione non trovata.';
      return;
    }
    
    const data = await resp.json();
    
    // If we got host role, store the passcode
    if (data.role === 'host' && data.host_passcode) {
      currentPasscode = data.host_passcode;
      localStorage.setItem(`myafters_host_pass_${token}`, data.host_passcode);
    }

    if (!guestRequestState) {
      guestRequestState = loadGuestRequestState();
      if (guestRequestState) {
        if (guestNameInput && guestRequestState.name) guestNameInput.value = guestRequestState.name;
        if (guestSurnameInput && guestRequestState.surname) guestSurnameInput.value = guestRequestState.surname;
        if (guestPhoneInput && guestRequestState.phone) guestPhoneInput.value = guestRequestState.phone;
      }
    }
    
    renderReservation(data);
  } catch (err) {
    heroSub.textContent = 'Errore nel caricamento della prenotazione.';
    console.error(err);
  }
};

const updateStatus = async (action) => {
  if (!token || !currentData) return;
  
  acceptBtn.disabled = true;
  rejectBtn.disabled = true;
  
  try {
    const query = currentPasscode ? `?passcode=${encodeURIComponent(currentPasscode)}` : '';
    const resp = await fetch(`${API_BASE}/api/reservations/${token}/${action}${query}`, { method: 'POST' });
    
    if (resp.ok) {
      const data = await resp.json();
      renderReservation(data);
    }
  } catch (err) {
    console.error(err);
  } finally {
    acceptBtn.disabled = false;
    rejectBtn.disabled = false;
  }
};

const setGuestRequestStatus = (message, isError = false) => {
  if (!guestRequestStatus) return;
  guestRequestStatus.textContent = message || '';
  guestRequestStatus.style.color = isError ? '#fca5a5' : 'rgba(148, 163, 184, 0.8)';
};

const setGuestFormDisabled = (disabled = false) => {
  if (guestNameInput) guestNameInput.disabled = disabled;
  if (guestSurnameInput) guestSurnameInput.disabled = disabled;
  if (guestPhoneInput) guestPhoneInput.disabled = disabled;
  if (guestRequestBtn) guestRequestBtn.disabled = disabled;
  if (guestRequestSection) guestRequestSection.hidden = disabled;
};

const applyGuestRequestStatus = (status) => {
  if (!status) {
    setGuestFormDisabled(false);
    return;
  }
  setGuestFormDisabled(true);

  const noticeConfig = {
    pending: {
      icon: '⏳',
      text: 'Richiesta in attesa di approvazione',
      sub: 'Il creatore del tavolo deve accettare la tua richiesta',
      class: 'cp-res-status-pending'
    },
    accepted: {
      icon: '🎉',
      text: 'Sei stato accettato al tavolo!',
      sub: 'Presentati al locale con questo QR code',
      class: 'cp-res-status-accepted'
    },
    rejected: {
      icon: '😔',
      text: 'Richiesta non accettata',
      sub: 'Il creatore del tavolo ha rifiutato la richiesta',
      class: 'cp-res-status-rejected'
    }
  };

  const notice = noticeConfig[status] || noticeConfig.pending;
  guestNoticeSection.className = `cp-res-section ${notice.class}`;
  guestNotice.innerHTML = `
    <div class="cp-res-guest-notice-icon">${notice.icon}</div>
    <div class="cp-res-guest-notice-text">${notice.text}</div>
    <div class="cp-res-guest-notice-sub">${notice.sub}</div>
  `;
};

const renderGuestRequests = (items = []) => {
  if (!hostRequestsList || !hostRequestsSection) return;
  if (!items.length) {
    hostRequestsList.innerHTML = '<div class="cp-res-request-status">Nessuna richiesta al momento.</div>';
    hostRequestsSection.hidden = false;
    return;
  }

  hostRequestsList.innerHTML = items.map((req) => {
    const actions = req.status === 'pending'
      ? `
        <div class="cp-res-request-actions">
          <button class="cp-res-btn cp-res-btn-primary" data-action="accept" data-id="${req.id}">✓ Accetta</button>
          <button class="cp-res-btn cp-res-btn-danger" data-action="reject" data-id="${req.id}">✕ Rifiuta</button>
        </div>
      `
      : `
        <div class="cp-res-request-meta">Stato: ${req.status === 'accepted' ? 'Accettata' : 'Rifiutata'}</div>
      `;

    return `
      <div class="cp-res-request-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <strong style="font-size:0.85rem;color:#e2e8f0;">${req.guest_name} ${req.guest_surname}</strong>
          <span class="cp-res-request-meta">${req.guest_phone}</span>
        </div>
        ${actions}
      </div>
    `;
  }).join('');

  hostRequestsSection.hidden = false;
};

const fetchGuestRequests = async () => {
  if (!token || !currentData || currentData.role !== 'host') return;
  if (!hostRequestsList) return;

  try {
    const query = currentPasscode ? `?passcode=${encodeURIComponent(currentPasscode)}` : '';
    const resp = await fetch(`${API_BASE}/api/reservations/${token}/guest-requests${query}`);
    if (!resp.ok) return;
    const data = await resp.json();
    renderGuestRequests(data.requests || []);
  } catch (err) {
    console.error(err);
  }
};

const fetchGuestRequestStatus = async () => {
  if (!token) return;
  const phone = guestRequestState?.phone || guestPhoneInput?.value?.trim();
  if (!phone) return;

  try {
    const resp = await fetch(`${API_BASE}/api/reservations/${token}/guest-request-status?phone=${encodeURIComponent(phone)}`);
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.request) return;
    guestRequestState = {
      name: data.request.guest_name,
      surname: data.request.guest_surname,
      phone: data.request.guest_phone,
      status: data.request.status
    };
    saveGuestRequestState(guestRequestState);
    applyGuestRequestStatus(guestRequestState.status);
  } catch (err) {
    console.error(err);
  }
};

const submitGuestRequest = async () => {
  if (!token) return;
  const name = guestNameInput?.value?.trim();
  const surname = guestSurnameInput?.value?.trim();
  const phone = guestPhoneInput?.value?.trim();

  if (!name || !surname || !phone) {
    setGuestRequestStatus('Compila tutti i campi richiesti.', true);
    return;
  }

  if (guestRequestBtn) {
    guestRequestBtn.disabled = true;
    guestRequestBtn.textContent = 'Invio...';
  }
  setGuestRequestStatus('Invio richiesta in corso...');

  try {
    const resp = await fetch(`${API_BASE}/api/reservations/${token}/guest-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, surname, phone })
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      setGuestRequestStatus(errorData.error || 'Errore durante l\'invio.', true);
      return;
    }

    await resp.json();
    guestRequestState = { name, surname, phone, status: 'pending' };
    saveGuestRequestState(guestRequestState);
    applyGuestRequestStatus('pending');
    setGuestRequestStatus('Richiesta inviata! In attesa di approvazione.');

    if (!guestStatusInterval) {
      guestStatusInterval = setInterval(fetchGuestRequestStatus, 6000);
    }
  } catch (err) {
    console.error(err);
    setGuestRequestStatus('Errore durante l\'invio.', true);
  } finally {
    if (guestRequestBtn) {
      guestRequestBtn.disabled = false;
      guestRequestBtn.textContent = 'Invia richiesta';
    }
  }
};

const handleGuestRequestAction = async (reqId, action) => {
  if (!token || !currentData || currentData.role !== 'host') return;
  try {
    const query = currentPasscode ? `?passcode=${encodeURIComponent(currentPasscode)}` : '';
    const resp = await fetch(`${API_BASE}/api/reservations/${token}/guest-requests/${reqId}/${action}${query}`, { method: 'POST' });
    if (!resp.ok) return;
    await fetchGuestRequests();
  } catch (err) {
    console.error(err);
  }
};

// Event listeners
unlockBtn?.addEventListener('click', async () => {
  const code = passcodeInput?.value?.trim();
  if (!code) return;
  
  unlockBtn.disabled = true;
  unlockBtn.textContent = 'Verifica...';
  
  currentPasscode = code;
  localStorage.setItem(`myafters_host_pass_${token}`, code);
  
  await fetchReservation();
  
  unlockBtn.disabled = false;
  unlockBtn.textContent = 'Sblocca';
});

passcodeInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    unlockBtn?.click();
  }
});

acceptBtn?.addEventListener('click', () => updateStatus('accept'));
rejectBtn?.addEventListener('click', () => updateStatus('reject'));

guestRequestBtn?.addEventListener('click', () => submitGuestRequest());

guestPhoneInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    submitGuestRequest();
  }
});

hostRequestsList?.addEventListener('click', (event) => {
  const target = event.target.closest('button[data-action][data-id]');
  if (!target) return;
  const reqId = Number(target.dataset.id);
  const action = target.dataset.action;
  if (!reqId || !action) return;
  handleGuestRequestAction(reqId, action);
});

// Init
fetchReservation();
