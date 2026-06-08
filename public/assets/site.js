/* IXIA Online — site.js */

// ── REVENUE CALCULATOR ─────────────────────────────────────────
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
});

document.querySelectorAll('[data-revenue-calculator]').forEach(calc => {
  const f = {
    leads:     calc.querySelector('[name="leads"]'),
    closeRate: calc.querySelector('[name="closeRate"]'),
    avgDeal:   calc.querySelector('[name="avgDeal"]'),
    leak:      calc.querySelector('[name="leak"]')
  };
  const out = {
    monthly:  calc.querySelector('[data-result="monthly"]'),
    annual:   calc.querySelector('[data-result="annual"]'),
    rescued:  calc.querySelector('[data-result="rescued"]')
  };
  if (!f.leads || !f.closeRate || !f.avgDeal || !f.leak) return;

  function update() {
    const leads     = Math.max(0, Number(f.leads.value)     || 0);
    const closeRate = Math.max(0, Number(f.closeRate.value) || 0) / 100;
    const avgDeal   = Math.max(0, Number(f.avgDeal.value)   || 0);
    const leak      = Math.max(0, Number(f.leak.value)      || 0) / 100;
    const monthly   = leads * closeRate * avgDeal * leak;
    const annual    = monthly * 12;
    const rescued   = leads * closeRate * leak;
    if (out.monthly) out.monthly.textContent = currency.format(monthly);
    if (out.annual)  out.annual.textContent  = currency.format(annual);
    if (out.rescued) out.rescued.textContent = rescued.toFixed(1) + ' deals/mo';
  }

  Object.values(f).forEach(el => el.addEventListener('input', update));
  update();
});

// ── FORM SUBMISSION ────────────────────────────────────────────
document.querySelectorAll('[data-mail-form]').forEach(form => {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;

  let statusEl = form.querySelector('.form-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'form-status';
    btn.closest('.stack-actions')?.after(statusEl)
       || form.appendChild(statusEl);
  }

  function setStatus(type, msg) {
    statusEl.className = 'form-status ' + type;
    statusEl.textContent = msg;
  }

  // Live validation: clear error on input
  form.querySelectorAll('[required]').forEach(input => {
    input.addEventListener('input', () => {
      input.closest('.field')?.classList.remove('field-error');
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) input.closest('.field')?.classList.add('field-error');
      else input.closest('.field')?.classList.remove('field-error');
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();

    // Validate required fields
    let valid = true;
    let firstBad = null;
    form.querySelectorAll('[required]').forEach(input => {
      const empty = !input.value.trim();
      input.closest('.field')?.classList.toggle('field-error', empty);
      if (empty) { valid = false; firstBad = firstBad || input; }
    });
    if (!valid) {
      firstBad?.focus();
      setStatus('error', 'Please fill in the required fields.');
      return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    statusEl.className = 'form-status';

    const data = new FormData(form);
    const endpoint = form.getAttribute('data-action');

    if (endpoint) {
      // Real API submission
      try {
        const body = {};
        data.forEach((v, k) => { body[k] = v; });
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        btn.textContent = 'Sent ✓';
        setStatus('success', 'Your brief is in. We reply within 1 business day — usually same day.');
        setTimeout(() => { window.location.href = '/thank-you/'; }, 1800);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = originalText;
        setStatus('error', 'Something went wrong. Please try again or email m@mmix.ua directly.');
      }
    } else {
      // Mailto fallback — open in new tab, show guidance
      const subject = data.get('subject') || 'IXIA Inquiry';
      const body = Array.from(data.entries())
        .filter(([k]) => k !== 'subject')
        .map(([k, v]) => labelize(k) + ': ' + String(v).trim())
        .join('\n');
      const href = 'mailto:m@mmix.ua?subject=' + encodeURIComponent(subject)
                   + '&body=' + encodeURIComponent(body);
      window.open(href, '_blank');
      btn.disabled = false;
      btn.textContent = originalText;
      setStatus('success',
        'Your email client should open with the form pre-filled. '
        + 'If it didn\'t, send the message directly to m@mmix.ua'
      );
    }
  });
});

function labelize(key) {
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── NAV ────────────────────────────────────────────────────────
(function () {
  const header    = document.querySelector('.site-header');
  const toggle    = document.querySelector('.nav-toggle');
  const navLinks  = document.querySelector('.nav-links');

  // Scroll shadow
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Mobile toggle
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', e => {
      if (!header?.contains(e.target)) {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();

// ── FADE-UP ANIMATIONS ─────────────────────────────────────────
(function () {
  const els = document.querySelectorAll('.fade-up');
  if (!els.length || !window.IntersectionObserver) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('visible');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
  els.forEach(el => io.observe(el));
})();
