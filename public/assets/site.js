const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

document.querySelectorAll("[data-revenue-calculator]").forEach((calculator) => {
  const fields = {
    leads: calculator.querySelector("[name='leads']"),
    closeRate: calculator.querySelector("[name='closeRate']"),
    avgDeal: calculator.querySelector("[name='avgDeal']"),
    leak: calculator.querySelector("[name='leak']")
  };

  const outputs = {
    monthly: calculator.querySelector("[data-result='monthly']"),
    annual: calculator.querySelector("[data-result='annual']"),
    rescued: calculator.querySelector("[data-result='rescued']")
  };

  function update() {
    const leads = Number(fields.leads.value || 0);
    const closeRate = Number(fields.closeRate.value || 0) / 100;
    const avgDeal = Number(fields.avgDeal.value || 0);
    const leak = Number(fields.leak.value || 0) / 100;
    const monthlyRevenueAtRisk = leads * closeRate * avgDeal * leak;
    const annualRevenueAtRisk = monthlyRevenueAtRisk * 12;
    const rescuedDeals = leads * closeRate * leak;

    outputs.monthly.textContent = currency.format(monthlyRevenueAtRisk);
    outputs.annual.textContent = currency.format(annualRevenueAtRisk);
    outputs.rescued.textContent = `${rescuedDeals.toFixed(1)} deals`;
  }

  Object.values(fields).forEach((field) => field?.addEventListener("input", update));
  update();
});

document.querySelectorAll("[data-mail-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const subject = data.get("subject") || "IXIA inquiry";
    const body = Array.from(data.entries())
      .filter(([key]) => key !== "subject")
      .map(([key, value]) => `${labelize(key)}: ${String(value).trim()}`)
      .join("\n");

    const href = `mailto:m@mmix.ua?subject=${encodeURIComponent(String(subject))}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  });
});

function labelize(key) {
  return key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', navLinks.classList.contains('open'));
  });
}

// Fade-up scroll animation
const fadeEls = document.querySelectorAll('.fade-up');
if (fadeEls.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  fadeEls.forEach(el => observer.observe(el));
}
