const API_BASE = window.location.origin;

const reservationTitle = document.getElementById('reservationTitle');
const reservationSubtitle = document.getElementById('reservationSubtitle');
const reservationStatus = document.getElementById('reservationStatus');
const reservationDetails = document.getElementById('reservationDetails');
const qrWrapper = document.getElementById('qrWrapper');
const guestLink = document.getElementById('guestLink');
const hostActions = document.getElementById('hostActions');
const hostUnlock = document.getElementById('hostUnlock');
const hostPasscodeInput = document.getElementById('hostPasscode');
const unlockBtn = document.getElementById('unlockBtn');
const acceptBtn = document.getElementById('acceptBtn');
const rejectBtn = document.getElementById('rejectBtn');

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const roleParam = params.get('role');

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('it-IT');
  } catch (err) {
    return value;
  }
};

const renderReservation = (payload) => {
  const reservation = payload.reservation || {};
  reservationTitle.textContent = `Tavolo ${reservation.table_number || '—'}`;
  reservationSubtitle.textContent = `Locale #${reservation.venue_id || '—'} · ${formatDate(reservation.reservation_datetime)}`;
  const status = (payload.status || reservation.status || 'pending').toLowerCase();
  reservationStatus.textContent = status.toUpperCase();
  reservationStatus.className = `cp-status-pill ${status}`;

  const accessLine = payload.role === 'guest' && status !== 'accepted'
    ? `<span class="cp-reservation-warning">Accesso in attesa di approvazione</span>`
    : '';

  reservationDetails.innerHTML = `
    <strong>${reservation.user_name || 'Ospite'}</strong>
    <span>Telefono: ${reservation.user_phone || '—'}</span>
    <span>Persone: ${reservation.party_size || '—'}</span>
    <span>ID prenotazione: ${reservation.id || '—'}</span>
    ${accessLine}
  `;

  qrWrapper.innerHTML = payload.qrcode_url ? `<img src="${payload.qrcode_url}" alt="QR Code" />` : 'QR non disponibile';
  if (payload.guest_url) {
    guestLink.innerHTML = `Link ospiti: <a href="${payload.guest_url}" target="_blank" rel="noopener">${payload.guest_url}</a>`;
  }

  const needsUnlock = payload.requires_passcode && payload.role !== 'host';
  hostUnlock.hidden = !(roleParam === 'host' && needsUnlock);
  hostActions.hidden = payload.role !== 'host';
  if (payload.host_passcode && payload.role === 'host') {
    hostPasscodeInput.value = payload.host_passcode;
    hostPasscodeInput.setAttribute('readonly', 'readonly');
  }
};

const fetchReservation = async () => {
  if (!token) {
    reservationSubtitle.textContent = 'Token mancante. Usa il link del QR code.';
    return;
  }
  try {
    const storedPasscode = localStorage.getItem(`myafters_host_pass_${token}`);
    if (storedPasscode && !hostPasscodeInput.value) {
      hostPasscodeInput.value = storedPasscode;
    }
    const query = hostPasscodeInput.value ? `?passcode=${encodeURIComponent(hostPasscodeInput.value)}` : '';
    const resp = await fetch(`${API_BASE}/api/reservations/${token}${query}`);
    if (!resp.ok) {
      reservationSubtitle.textContent = 'Prenotazione non trovata.';
      return;
    }
    const data = await resp.json();
    renderReservation(data);
  } catch (err) {
    reservationSubtitle.textContent = 'Errore nel caricamento della prenotazione.';
  }
};

const updateStatus = async (action) => {
  if (!token) return;
  acceptBtn.disabled = true;
  rejectBtn.disabled = true;
  try {
    const passcode = hostPasscodeInput.value || localStorage.getItem(`myafters_host_pass_${token}`) || '';
    const query = passcode ? `?passcode=${encodeURIComponent(passcode)}` : '';
    const resp = await fetch(`${API_BASE}/api/reservations/${token}/${action}${query}`, { method: 'POST' });
    if (resp.ok) {
      const data = await resp.json();
      renderReservation(data);
    }
  } catch (err) {
    // ignore
  } finally {
    acceptBtn.disabled = false;
    rejectBtn.disabled = false;
  }
};

unlockBtn.addEventListener('click', () => {
  if (!hostPasscodeInput.value) return;
  localStorage.setItem(`myafters_host_pass_${token}`, hostPasscodeInput.value);
  fetchReservation();
});

acceptBtn.addEventListener('click', () => updateStatus('accept'));
rejectBtn.addEventListener('click', () => updateStatus('reject'));

fetchReservation();
