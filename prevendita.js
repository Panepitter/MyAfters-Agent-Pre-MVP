const API_BASE = window.location.origin;

// DOM Elements
const heroIcon = document.getElementById('heroIcon');
const heroTitle = document.getElementById('heroTitle');
const heroSub = document.getElementById('heroSub');
const statusPill = document.getElementById('statusPill');
const roleBadge = document.getElementById('roleBadge');
const hostView = document.getElementById('hostView');
const guestView = document.getElementById('guestView');
const infoGrid = document.getElementById('infoGrid');
const guestInfoGrid = document.getElementById('guestInfoGrid');
const qrWrapper = document.getElementById('qrWrapper');
const guestLinkBox = document.getElementById('guestLinkBox');

// URL params
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const roleParam = params.get('role');

// State
let currentData = null;
let guestRequestState = null;

const guestRequestStorageKey = token ? `myafters_prevendita_guest_${token}` : 'myafters_prevendita_guest';

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
  // Placeholder for future polling
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
          { offset: 0, color: '#ec4899' },
          { offset: 0.6, color: '#db2777' },
          { offset: 1, color: '#be185d' }
        ]
      }
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      color: '#ec4899'
    },
    cornersDotOptions: {
      type: 'dot',
      color: '#db2777'
    },
    backgroundOptions: {
      color: 'transparent'
    }
  });
  qr.append(element);
  return true;
};

const renderInfoGrid = (container, prevendita) => {
  const items = [
    { label: 'Intestatario', value: prevendita.user_name || 'Ospite' },
    { label: 'Persone', value: prevendita.party_size || '—' },
    { label: 'Telefono', value: prevendita.user_phone || '—' },
    { label: 'Data/Ora', value: formatDate(prevendita.event_datetime) },
    { label: 'Locale', value: `#${prevendita.venue_id || '—'}` },
    { label: 'Tipo', value: prevendita.ticket_type ? prevendita.ticket_type.charAt(0).toUpperCase() + prevendita.ticket_type.slice(1) : 'Standard' },
    { label: 'ID', value: prevendita.id || '—' }
  ];

  container.innerHTML = items.map(item => `
    <div class="cp-prev-info-item">
      <span class="cp-prev-info-label">${item.label}</span>
      <span class="cp-prev-info-value">${item.value}</span>
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
  const prevendita = data.prevendita || {};

  // Hero
  heroIcon.textContent = '🎟️';
  heroTitle.textContent = `Prevendita ${prevendita.ticket_type ? prevendita.ticket_type.charAt(0).toUpperCase() + prevendita.ticket_type.slice(1) : 'Standard'}`;
  heroSub.textContent = `Locale #${prevendita.venue_id || '—'} · ${formatDate(prevendita.event_datetime)}`;
  updateStatusDisplay(data.status);

  // Role badge
  roleBadge.textContent = '👑 Creator';
  roleBadge.className = 'cp-prev-role-badge host';
  roleBadge.hidden = false;

  // Info grid
  renderInfoGrid(infoGrid, prevendita);

  // QR Code
  if (data.guest_url) {
    buildGradientQr(qrWrapper, data.guest_url, 160);
    guestLinkBox.innerHTML = `<a href="${data.guest_url}" target="_blank">${data.guest_url}</a>`;
  }

  clearIntervals();

  // Show host view
  hostView.hidden = false;
  guestView.hidden = true;
};

const renderGuestView = (data) => {
  const prevendita = data.prevendita || {};
  const status = data.status || 'pending';

  // Hero
  heroIcon.textContent = status === 'accepted' ? '🎊' : status === 'rejected' ? '😔' : '🎟️';
  heroTitle.textContent = `Prevendita ${prevendita.ticket_type ? prevendita.ticket_type.charAt(0).toUpperCase() + prevendita.ticket_type.slice(1) : 'Standard'}`;
  heroSub.textContent = `Locale #${prevendita.venue_id || '—'} · ${formatDate(prevendita.event_datetime)}`;
  updateStatusDisplay(status);

  // Role badge
  roleBadge.textContent = '🎫 Ospite';
  roleBadge.className = 'cp-prev-role-badge guest';
  roleBadge.hidden = false;

  // Info grid (limited info for guests)
  const guestItems = [
    { label: 'Tipo', value: prevendita.ticket_type ? prevendita.ticket_type.charAt(0).toUpperCase() + prevendita.ticket_type.slice(1) : 'Standard' },
    { label: 'Persone', value: prevendita.party_size || '—' },
    { label: 'Data/Ora', value: formatDate(prevendita.event_datetime) },
    { label: 'Locale', value: `#${prevendita.venue_id || '—'}` }
  ];

  guestInfoGrid.innerHTML = guestItems.map(item => `
    <div class="cp-prev-info-item">
      <div class="cp-prev-info-label">${item.label}</div>
      <div class="cp-prev-info-value">${item.value}</div>
    </div>
  `).join('');

  // Guest notice based on status
  const noticeConfig = {
    pending: {
      icon: '⏳',
      text: 'Prevendita in attesa di conferma',
      sub: 'Il creatore della prevendita deve confermare il tuo biglietto',
      class: 'cp-prev-status-pending'
    },
    accepted: {
      icon: '🎉',
      text: 'La tua prevendita è confermata!',
      sub: 'Presentati al locale con questo QR code',
      class: 'cp-prev-status-accepted'
    },
    rejected: {
      icon: '😔',
      text: 'Prevendita non confermata',
      sub: 'Il creatore della prevendita ha rifiutato il biglietto',
      class: 'cp-prev-status-rejected'
    }
  };

  const notice = noticeConfig[status] || noticeConfig.pending;
  guestNoticeSection.className = `cp-prev-section ${notice.class}`;
  guestNotice.innerHTML = `
    <div class="cp-prev-guest-notice-icon">${notice.icon}</div>
    <div class="cp-prev-guest-notice-text">${notice.text}</div>
    <div class="cp-prev-guest-notice-sub">${notice.sub}</div>
  `;

  clearIntervals();

  // Show guest view
  hostView.hidden = true;
  guestView.hidden = false;
};

const renderPrevendita = (data) => {
  currentData = data;
  const role = data.role;

  if (role === 'host') {
    renderHostView(data);
  } else {
    renderGuestView(data);
  }
};

const fetchPrevendita = async () => {
  if (!token) {
    heroSub.textContent = 'Token mancante. Usa il link del QR code.';
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/api/prevendite/${token}`);

    if (!resp.ok) {
      heroSub.textContent = 'Prevendita non trovata.';
      return;
    }

    const data = await resp.json();

    renderPrevendita(data);
  } catch (err) {
    heroSub.textContent = 'Errore nel caricamento della prevendita.';
    console.error(err);
  }
};

// Event listeners for host view
// (Placeholder for future functionality like guest requests)

// Init
fetchPrevendita();