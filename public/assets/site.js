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

// ── LIVE INTAKE MONITOR ────────────────────────────────────────
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── COUNT-UP (monitor-foot .mf-num + hero stat numbers) ──────
  (function () {
    const nums = document.querySelectorAll('.mf-num');
    if (!nums.length) return;

    function run(el) {
      const raw = el.textContent.trim();
      const m = raw.match(/^([^\d-]*)(-?\d+)(.*)$/);
      if (!m) return;
      const prefix = m[1], target = parseInt(m[2], 10), suffix = m[3];
      if (reduce || !window.requestAnimationFrame) {
        el.textContent = prefix + target + suffix;
        return;
      }
      const duration = 1100;
      const start = performance.now();
      const easeOut = t => 1 - Math.pow(1 - t, 3);
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const val = Math.round(target * easeOut(t));
        el.textContent = prefix + val + suffix;
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = prefix + target + suffix;
      }
      requestAnimationFrame(tick);
    }

    if (!window.IntersectionObserver) { nums.forEach(run); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { run(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.5 });
    nums.forEach(el => io.observe(el));
  })();

  // ── ANIMATE THE FEED ─────────────────────────────────────────
  if (reduce) return;
  const feed = document.querySelector('.hero .feed');
  if (!feed) return;

  const MAX_ROWS = 5;
  const INTERVAL = 4500;

  // Inline icons reused from the existing markup, keyed per channel.
  const ICONS = {
    'Website form': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 6 12 13 2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>',
    'Missed call':  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 3.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>',
    'Live chat':    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    'Inbox enquiry':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 4 12 12 20 4"/></svg>'
  };

  // Fixed rotating pool — reuses ONLY channel labels, status pills, and
  // sub-text fragments already present in the hand-authored markup, so no
  // new visible English copy is introduced (no i18n key needed).
  const POOL = [
    { ch: 'Website form',  sub: '09:41 · qualified lead',       pill: 'pill-go',   status: 'Replied 38s' },
    { ch: 'Live chat',     sub: '10:06 · pricing question',     pill: 'pill-go',   status: 'Captured' },
    { ch: 'Inbox enquiry', sub: 'Fri 16:47 · no follow-up',     pill: 'pill-go',   status: 'Captured' },
    { ch: 'Missed call',   sub: 'after hours · unrecovered',    pill: 'pill-leak', status: 'Leaking' },
    { ch: 'Website form',  sub: '10:06 · pricing question',     pill: 'pill-go',   status: 'Replied 38s' },
    { ch: 'Missed call',   sub: '17:52 · after hours',          pill: 'pill-leak', status: 'Leaking' }
  ];

  let idx = 0;

  function buildRow(item) {
    const row = document.createElement('div');
    row.className = 'feed-row feed-row--in';

    const icon = document.createElement('span');
    icon.className = 'feed-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICONS[item.ch] || ICONS['Website form'];

    const main = document.createElement('span');
    main.className = 'feed-main';
    const ch = document.createElement('span');
    ch.className = 'feed-ch';
    ch.textContent = item.ch;
    const sub = document.createElement('span');
    sub.className = 'feed-sub';
    sub.textContent = item.sub;
    main.appendChild(ch);
    main.appendChild(sub);

    const pill = document.createElement('span');
    pill.className = 'pill ' + item.pill;
    pill.textContent = item.status;

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(pill);
    return row;
  }

  function step() {
    if (document.hidden) return;
    const item = POOL[idx % POOL.length];
    idx += 1;
    const row = buildRow(item);
    feed.insertBefore(row, feed.firstChild);

    // drop the flash class after the entrance so it can re-trigger next time
    setTimeout(() => row.classList.remove('feed-row--in'), 700);

    while (feed.children.length > MAX_ROWS) {
      feed.removeChild(feed.lastChild);
    }
  }

  setInterval(step, INTERVAL);
})();

// ── FADE-UP ANIMATIONS (staggered by sibling order) ────────────
(function () {
  const els = document.querySelectorAll('.fade-up');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!els.length || reduce || !window.IntersectionObserver) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        // stagger reveal among fade-up siblings sharing a parent
        const sibs = Array.from(en.target.parentElement?.children || [])
          .filter(c => c.classList.contains('fade-up'));
        const i = Math.max(0, sibs.indexOf(en.target));
        en.target.style.transitionDelay = (i * 90) + 'ms';
        en.target.classList.add('visible');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach(el => io.observe(el));
})();
