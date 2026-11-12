(function () {
  var root = document.documentElement, on = null;
  function check() {
    var show = (window.scrollY || window.pageYOffset || 0) > window.innerHeight * 0.6;
    if (show !== on) { on = show; root.classList.toggle('ix-cta-on', show); }
  }
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  check();
})();
