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

/* ---------------------------------------------------------------------------
   Cost panel: the whole cost of owning the piece, before Add to bag.

   Delivery prices come from assets/sos-delivery-zones.json, generated from the
   same table that produced the Shopify Local delivery zones. Shopify gives the
   storefront no way to ask what a local delivery costs, so the table is
   mirrored rather than queried; regenerate the asset whenever a price or zone
   changes or the two will drift.

   Postcode matching copies Shopify's prefix rule. The lists are disjoint by
   construction, so at most one entry can match; no match means we have no
   published price for that address and the panel says so rather than guessing.

   Assembly is a real product, so ticking it adds a second line to the basket
   and Shopify charges it. Storage cannot be charged until a subscriptions app
   exists, and its first month is free anyway, so it rides along as a request.
--------------------------------------------------------------------------- */
(function () {
  var data = null;
  var loading = null;

  function money(pence) { return '£' + (pence / 100).toFixed(2); }

  function outward(raw) {
    if (!raw) return null;
    var s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = s.match(/^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/);
    if (m) return m[1];
    return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(s) ? s : null;
  }

  function bandFor(outcode) {
    if (!data || !outcode) return null;
    for (var len = outcode.length; len >= 1; len--) {
      var key = outcode.slice(0, len);
      if (Object.prototype.hasOwnProperty.call(data.zones, key)) {
        return data.bands[data.zones[key]];
      }
    }
    return null;
  }

  /** "Over 300 to 400 return miles" -> "300 to 400 miles there and back". */
  function humanRange(label) {
    var m = String(label).match(/(\d[\d,]*)\s*to\s*(\d[\d,]*)/);
    if (m) return m[1] + ' to ' + m[2] + ' miles there and back';
    var up = String(label).match(/Up to\s*(\d[\d,]*)/);
    if (up) return 'under ' + up[1] + ' miles there and back';
    return label;
  }

  function load(url) {
    if (data) return Promise.resolve(data);
    if (!loading) {
      loading = fetch(url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { data = j; return j; });
    }
    return loading;
  }

  function initPanel(root) {
    var price = parseInt(root.dataset.price, 10) || 0;
    var variantId = root.dataset.variant;
    var piece = root.dataset.piece || '';
    var enquiry = root.dataset.enquiry || '/pages/contact';
    var assemblyVariant = root.dataset.assemblyVariant || null;
    var assemblyPrice = parseInt(root.dataset.assemblyPrice, 10) || 0;

    var state = { method: 'collection', deliveryPence: null, postcode: '', assembly: false, storage: false };

    var q = function (sel) { return root.querySelector(sel); };
    var postcodeRow = q('[data-sos-postcode-row]');
    var postcodeInput = q('[data-sos-postcode]');
    var msg = q('[data-sos-postcode-msg]');
    var deliveryPriceEl = q('[data-sos-delivery-price]');
    var whereEl = q('[data-sos-delivery-where]');
    var prop = function (name) { return root.querySelector('[data-sos-prop="' + name + '"]'); };

    function setLine(name, text) {
      var line = root.querySelector('[data-sos-line="' + name + '"]');
      var amount = root.querySelector('[data-sos-amount="' + name + '"]');
      if (!line || !amount) return;
      if (text === null) { line.hidden = true; return; }
      line.hidden = false;
      amount.textContent = text;
    }

    function render() {
      var due = price;

      if (state.method === 'delivery' && state.deliveryPence !== null) {
        due += state.deliveryPence;
        setLine('delivery', money(state.deliveryPence));
        if (whereEl) whereEl.textContent = 'to ' + state.postcode;
      } else {
        setLine('delivery', null);
      }

      if (state.assembly && assemblyVariant) {
        due += assemblyPrice;
        setLine('assembly', money(assemblyPrice));
      } else {
        setLine('assembly', null);
      }

      setLine('storage', state.storage ? '£0.00' : null);
      root.querySelector('[data-sos-amount="due"]').textContent = money(due);

      prop('method').value = state.method === 'delivery'
        ? 'Personal delivery' + (state.postcode ? ' to ' + state.postcode : '')
        : 'Collection in London';

      var pc = prop('postcode');
      pc.disabled = !(state.method === 'delivery' && state.postcode);
      pc.value = state.postcode;

      var st = prop('storage');
      st.disabled = !state.storage;
      st.value = 'Requested — first month free from box collection, then £19.99 a month';
    }

    function quote(raw) {
      var code = outward(raw);

      if (!code) {
        state.deliveryPence = null;
        state.postcode = '';
        msg.textContent = raw && raw.trim()
          ? 'That does not look like a UK postcode — could you check it?'
          : 'Pop your postcode in and we will price it straight away.';
        msg.className = 'sos-costs__msg is-warn';
        deliveryPriceEl.textContent = 'Tell us where';
        render();
        return;
      }

      var band = bandFor(code);

      if (!band) {
        state.deliveryPence = null;
        state.postcode = code;
        msg.innerHTML = 'We would love to bring it to ' + code +
          ', but that journey needs a price from us rather than a table — ' +
          'a ferry, or simply a very long way. ' +
          '<a href="' + enquiry + '?piece=' + encodeURIComponent(piece) +
          '&about=delivery&postcode=' + encodeURIComponent(code) +
          '">Ask us for a delivery quote</a> and we will come back to you.';
        msg.className = 'sos-costs__msg is-warn';
        deliveryPriceEl.textContent = 'Quote on request';
        render();
        return;
      }

      state.deliveryPence = band.pence;
      state.postcode = code;
      msg.textContent = 'Good news — ' + code + ' is ' + humanRange(band.label) +
        ' from us, so personal delivery is ' + money(band.pence) + '.';
      msg.className = 'sos-costs__msg is-ok';
      deliveryPriceEl.textContent = money(band.pence);
      render();
    }

    Array.prototype.forEach.call(root.querySelectorAll('[data-sos-method]'), function (input) {
      input.addEventListener('change', function () {
        state.method = input.value;
        postcodeRow.hidden = state.method !== 'delivery';
        if (state.method === 'delivery') {
          load(root.dataset.zones).then(function () {
            if (postcodeInput.value) quote(postcodeInput.value);
          }).catch(function () {
            msg.textContent = 'We could not load delivery prices just now. Please ask us for a quote.';
            msg.className = 'sos-costs__msg is-warn';
          });
        }
        render();
      });
    });

    q('[data-sos-postcode-go]').addEventListener('click', function () {
      load(root.dataset.zones).then(function () { quote(postcodeInput.value); });
    });
    postcodeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        load(root.dataset.zones).then(function () { quote(postcodeInput.value); });
      }
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-sos-extra]'), function (box) {
      box.addEventListener('change', function () {
        state[box.dataset.sosExtra] = box.checked;
        render();
      });
    });

    /* Assembly is its own product, so the basket needs two lines. Shopify's
       plain form posts one. Intercept and post both together, so the buyer
       never ends up with the statue and no assembly because one call failed. */
    var form = document.getElementById('sos-add');
    if (form) {
      form.addEventListener('submit', function (e) {
        if (!state.assembly || !assemblyVariant) return; // plain form is fine
        e.preventDefault();
        var button = form.querySelector('[name="add"]');
        if (button) { button.disabled = true; button.dataset.busy = 'true'; }

        var props = {};
        Array.prototype.forEach.call(root.querySelectorAll('[data-sos-prop]'), function (input) {
          if (!input.disabled && input.value) {
            props[input.name.replace(/^properties\[|\]$/g, '')] = input.value;
          }
        });

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              { id: Number(variantId), quantity: 1, properties: props },
              { id: Number(assemblyVariant), quantity: 1, properties: { 'For': piece } }
            ]
          })
        })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function () { window.location.href = '/cart'; })
          .catch(function () {
            if (button) { button.disabled = false; delete button.dataset.busy; }
            msg.textContent = 'Something went wrong adding that to your bag. Please try again.';
            msg.className = 'sos-costs__msg is-warn';
          });
      });
    }

    render();
  }

  function bootCosts() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sos-costs]'), function (root) {
      if (root.dataset.sosReady === 'true') return;
      root.dataset.sosReady = 'true';
      initPanel(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootCosts);
  } else {
    bootCosts();
  }
  document.addEventListener('shopify:section:load', bootCosts);
})();
