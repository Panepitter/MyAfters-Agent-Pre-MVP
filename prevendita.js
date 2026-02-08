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

const buildGradientQr = (element, text, size = 180) => {
  return new Promise((resolve) => {
    // Check if library is loaded, otherwise wait
    const checkLibrary = () => {
      if (!window.QRCodeStyling) {
        setTimeout(checkLibrary, 50);
        return;
      }

      if (!element || !text) {
        resolve(false);
        return;
      }

      element.innerHTML = '';

      // Ensure element has proper sizing - set directly on element
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
      element.style.display = 'flex';
      element.style.alignItems = 'center';
      element.style.justifyContent = 'center';

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

      // Use append with callback for better reliability
      qr.append(element, () => {
        resolve(true);
      });
    };

    checkLibrary();
  });
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

  clearIntervals();

  // Show host view
  hostView.hidden = false;
  guestView.hidden = true;
};

const renderGuestView = async (data) => {
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
    await buildGradientQr(qrWrapper, data.guest_url, 180);
  }

  clearIntervals();

  // Show guest view
  hostView.hidden = true;
  guestView.hidden = false;
};

const renderPrevendita = async (data) => {
  currentData = data;
  const role = data.role;

  if (role === 'host') {
    renderHostView(data);
  } else {
    await renderGuestView(data);
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

    await renderPrevendita(data);
  } catch (err) {
    heroSub.textContent = 'Errore nel caricamento della prevendita.';
    console.error(err);
  }
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
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [54, 95] // Small ticket size
    });

    // Colors - Pink gradient theme matching the widget
    const primary = { r: 236, g: 72, b: 153 }; // pink-500
    const secondary = { r: 219, g: 39, b: 119 }; // pink-600
    const dark = { r: 15, g: 23, b: 42 }; // dark bg

    // Header
    doc.setFillColor(dark.r, dark.g, dark.b);
    doc.rect(0, 0, 54, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('MyAfters', 27, 8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Prevendita Biglietto', 27, 12, { align: 'center' });

    // Decorative line
    doc.setDrawColor(primary.r, primary.g, primary.b);
    doc.setLineWidth(0.5);
    doc.line(4, 18, 50, 18);

    // Ticket Icon
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(20);
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.text('🎟️', 27, 22, { align: 'center' });

    // Info Section
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);

    let yPos = 32;
    doc.setFont('helvetica', 'bold');
    doc.text(`Tipo: ${prevendita.ticket_type ? prevendita.ticket_type.charAt(0).toUpperCase() + prevendita.ticket_type.slice(1) : 'Standard'}`, 4, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'normal');
    doc.text(`Intestatario: ${prevendita.user_name || 'Ospite'}`, 4, yPos);
    yPos += 5;
    doc.text(`Persone: ${prevendita.party_size || 1}`, 4, yPos);
    yPos += 5;

    const dateStr = formatDate(prevendita.event_datetime);
    doc.text(`Data: ${dateStr}`, 4, yPos);
    yPos += 5;
    doc.text(`Locale: #${prevendita.venue_id || '—'}`, 4, yPos);
    yPos += 5;
    doc.text(`ID: #${prevendita.id}`, 4, yPos);

    // Generate QR code with pink gradient using QuickChart
    // Using the same colors as the widget: #ec4899, #db2777, #be185d
    const qrY = yPos + 8;
    const qrWidth = 30;
    const qrHeight = 30;

    // Build QR URL with pink gradient colors
    const qrText = guestUrl || (prevendita.guest_token ? `${window.location.origin}/prevendita.html?token=${prevendita.guest_token}` : '');
    const qrImgUrl = `https://quickchart.io/qr?text=${encodeURIComponent(qrText)}&size=120&margin=2&color=ec4899&bgcolor=0b0b10&dot=gradient&dotGradient=linear&dotGradientRotation=2.2&dotGradientColors=ec4899%2Cdb2777%2Cbe185d`;

    // Add QR image to PDF
    doc.addImage(qrImgUrl, 'PNG', 12, qrY, qrWidth, qrHeight);

    // Footer
    doc.setFillColor(primary.r, primary.g, primary.b);
    doc.rect(0, qrY + 38, 54, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Scansiona per ingresso', 27, qrY + 43, { align: 'center' });

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