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
const hostQrWrapper = document.getElementById('hostQrWrapper');
const guestQrWrapper = document.getElementById('guestQrWrapper');
const downloadBtn = document.getElementById('downloadBtn');

// URL params
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const roleParam = params.get('role');

// State
let currentData = null;

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

// Build styled QR code using QRCodeStyling (same as chat widget)
const buildGradientQr = (element, text, size = 180) => {
  if (!window.QRCodeStyling || !element || !text) return null;
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
  return qr;
};

// Render QR code in a DOM element
const renderQrCode = (element, text, size = 180) => {
  if (!element || !text) return null;
  return buildGradientQr(element, text, size);
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
    pending: { label: 'In attesa', class: 'pending' },
    accepted: { label: 'Confermata', class: 'accepted' },
    rejected: { label: 'Rifiutata', class: 'rejected' }
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
    renderQrCode(hostQrWrapper, data.guest_url, 180);
  }

  clearIntervals();

  // Show host view
  hostView.hidden = false;
  guestView.hidden = true;
};

const renderGuestView = (data) => {
  const prevendita = data.prevendita || {};

  // Hero - Guest sees their ticket directly (no pending status)
  heroIcon.textContent = '🎟️';
  heroTitle.textContent = `Il tuo biglietto - ${prevendita.ticket_type ? prevendita.ticket_type.charAt(0).toUpperCase() + prevendita.ticket_type.slice(1) : 'Standard'}`;
  heroSub.textContent = `Locale #${prevendita.venue_id || '—'} · ${formatDate(prevendita.event_datetime)}`;

  // Status pill shows active ticket
  statusPill.textContent = '🎫 Biglietto attivo';
  statusPill.className = 'cp-status-pill accepted';
  roleBadge.textContent = '🎫 Ospite';
  roleBadge.className = 'cp-prev-role-badge guest';
  roleBadge.hidden = false;

  // Info grid (guest sees full info)
  renderInfoGrid(guestInfoGrid, prevendita);

  // QR Code for guest
  if (data.guest_url) {
    renderQrCode(guestQrWrapper, data.guest_url, 180);
  }

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

// Convert QRCodeStyling SVG to a PNG data URL via canvas
const qrToDataUrl = (text, size = 300) => {
  return new Promise((resolve, reject) => {
    if (!window.QRCodeStyling || !text) {
      reject(new Error('QRCodeStyling not available'));
      return;
    }
    const qr = new QRCodeStyling({
      width: size,
      height: size,
      type: 'canvas',
      data: text,
      margin: 8,
      qrOptions: { errorCorrectionLevel: 'L' },
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
      cornersSquareOptions: { type: 'extra-rounded', color: '#6366f1' },
      cornersDotOptions: { type: 'dot', color: '#7c3aed' },
      backgroundOptions: { color: '#0f172a' }
    });
    qr.getRawData('png').then((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }).catch(reject);
  });
};

// PDF Download functionality
const downloadTicketPDF = async () => {
  if (!currentData || !currentData.prevendita) {
    alert('Impossibile scaricare il biglietto. Riprova.');
    return;
  }

  const prevendita = currentData.prevendita;
  const guestUrl = currentData.guest_url;

  // Load jsPDF
  const loadScript = (src) => new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    // Generate QR as data URL first
    const qrText = guestUrl || (prevendita.guest_token ? `${window.location.origin}/prevendita.html?token=${prevendita.guest_token}` : '');
    let qrDataUrl = null;
    if (qrText) {
      try {
        qrDataUrl = await qrToDataUrl(qrText, 300);
      } catch (e) {
        console.warn('QR generation failed for PDF:', e);
      }
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [54, 95]
    });

    const primary = { r: 99, g: 102, b: 241 }; // indigo-500 matching QR gradient
    const dark = { r: 15, g: 23, b: 42 };

    // Full dark background
    doc.setFillColor(dark.r, dark.g, dark.b);
    doc.rect(0, 0, 54, 95, 'F');

    // Header
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('MyAfters', 27, 8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Prevendita Biglietto', 27, 13, { align: 'center' });

    // Decorative line
    doc.setDrawColor(primary.r, primary.g, primary.b);
    doc.setLineWidth(0.5);
    doc.line(4, 16, 50, 16);

    // Info Section
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);

    let yPos = 22;
    doc.setFont('helvetica', 'bold');
    doc.text(`Tipo: ${prevendita.ticket_type ? prevendita.ticket_type.charAt(0).toUpperCase() + prevendita.ticket_type.slice(1) : 'Standard'}`, 4, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    doc.text(`Intestatario: ${prevendita.user_name || 'Ospite'}`, 4, yPos);
    yPos += 4.5;
    doc.text(`Persone: ${prevendita.party_size || 1}`, 4, yPos);
    yPos += 4.5;

    const dateStr = formatDate(prevendita.event_datetime);
    doc.text(`Data: ${dateStr}`, 4, yPos);
    yPos += 4.5;
    doc.text(`Locale: #${prevendita.venue_id || '—'}`, 4, yPos);
    yPos += 4.5;
    doc.text(`ID: #${prevendita.id}`, 4, yPos);

    // QR Code
    const qrY = yPos + 5;
    const qrSize = 32;
    if (qrDataUrl) {
      doc.addImage(qrDataUrl, 'PNG', (54 - qrSize) / 2, qrY, qrSize, qrSize);
    }

    // Footer
    doc.setFillColor(primary.r, primary.g, primary.b);
    doc.rect(0, 87, 54, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Scansiona per ingresso', 27, 92, { align: 'center' });

    // Download
    doc.save(`myafters_prevendita_${prevendita.id}.pdf`);
  } catch (err) {
    console.error('Error generating PDF:', err);
    alert('Errore nel caricamento della libreria PDF. Riprova.');
  }
};

// Event listeners
if (downloadBtn) {
  downloadBtn.addEventListener('click', async () => {
    await downloadTicketPDF();
  });
}

// Init
fetchPrevendita();