/* Sultan of Statues — Modern Palace header behaviour.
   Self-contained; does not touch Savor's own scripts. */
(function () {
  'use strict';

  function initDropdowns(root) {
    var items = root.querySelectorAll('[data-sos-dropdown]');
    Array.prototype.forEach.call(items, function (item) {
      var trigger = item.querySelector('[data-sos-dropdown-trigger]');
      if (!trigger) return;

      function open(state) {
        item.setAttribute('data-open', state ? 'true' : 'false');
        trigger.setAttribute('aria-expanded', state ? 'true' : 'false');
      }

      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        open(item.getAttribute('data-open') !== 'true');
      });
      item.addEventListener('mouseenter', function () { open(true); });
      item.addEventListener('mouseleave', function () { open(false); });
      item.addEventListener('focusout', function (e) {
        if (!item.contains(e.relatedTarget)) open(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') open(false);
      });
    });
  }

  function initDrawer(root) {
    var drawer = root.querySelector('[data-sos-drawer]');
    if (!drawer) return;
    var openers = root.querySelectorAll('[data-sos-drawer-open]');
    var closers = drawer.querySelectorAll('[data-sos-drawer-close]');
    var lastFocus = null;

    function setState(state) {
      drawer.setAttribute('data-open', state ? 'true' : 'false');
      drawer.setAttribute('aria-hidden', state ? 'false' : 'true');
      document.documentElement.style.overflow = state ? 'hidden' : '';
      if (state) {
        lastFocus = document.activeElement;
        var first = drawer.querySelector('a, button');
        if (first) first.focus();
      } else if (lastFocus) {
        lastFocus.focus();
      }
    }

    Array.prototype.forEach.call(openers, function (el) {
      el.addEventListener('click', function () { setState(true); });
    });
    Array.prototype.forEach.call(closers, function (el) {
      el.addEventListener('click', function () { setState(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.getAttribute('data-open') === 'true') setState(false);
    });
  }

  function boot() {
    var headers = document.querySelectorAll('[data-sos-header]');
    Array.prototype.forEach.call(headers, function (root) {
      if (root.dataset.sosReady === 'true') return;
      root.dataset.sosReady = 'true';
      initDropdowns(root);
      initDrawer(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Re-bind when the Shopify theme editor re-renders a section.
  document.addEventListener('shopify:section:load', boot);
})();
