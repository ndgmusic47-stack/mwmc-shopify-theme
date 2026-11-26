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
    var mobileBuy = document.querySelector('[data-sos-mobile-buy]');
    var mobileTotal = mobileBuy && mobileBuy.querySelector('[data-sos-mobile-total]');
    var mainButton = document.querySelector('#sos-add [name="add"]');
    if (mobileBuy && mainButton && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        mobileBuy.hidden = entries[0].isIntersecting || entries[0].boundingClientRect.top < 0;
      });
      observer.observe(mainButton);
      mobileBuy.querySelector('a').addEventListener('click', function () {
        root.querySelector('[data-sos-method]:checked').focus({ preventScroll: true });
      });
    }
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
      var awaitingQuote = state.method === 'delivery' && state.deliveryPence === null;
      root.querySelector('[data-sos-amount="due"]').textContent = awaitingQuote ? 'Get delivery price' : money(due);
      if (mobileTotal) mobileTotal.textContent = awaitingQuote ? 'Delivery quote needed' : money(due);


      prop('method').value = state.method === 'delivery'
        ? 'Personal delivery' + (state.postcode ? ' to ' + state.postcode : '')
        : 'Collection in London';

      var pc = prop('postcode');
      pc.disabled = !(state.method === 'delivery' && state.postcode);
      pc.value = state.postcode;

      var st = prop('storage');
      st.disabled = !state.storage;
      st.value = 'Interest registered. Nothing charged at checkout. First month free from box collection, then £19.99 a month, invoiced monthly once agreed';
    }

    function quote(raw) {
      var code = outward(raw);

      if (!code) {
        state.deliveryPence = null;
        state.postcode = '';
        msg.textContent = raw && raw.trim()
          ? 'Please check that you entered a valid UK postcode.'
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
          ', but that journey needs a price from us rather than a standard delivery band. ' +
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
      msg.textContent = code + ' is ' + humanRange(band.label) +
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

    postcodeInput.addEventListener('input', function () {
      state.deliveryPence = null;
      state.postcode = '';
      deliveryPriceEl.textContent = 'By postcode';
      msg.textContent = '';
      render();
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
        var button = form.querySelector('[name="add"]');
        if (button && button.dataset.busy === 'true') { e.preventDefault(); return; }
        if (state.method === 'delivery' && state.deliveryPence === null) {
          e.preventDefault();
          msg.textContent = 'Enter your postcode and get a delivery price before adding this statue.';
          msg.className = 'sos-costs__msg is-warn';
          postcodeInput.focus();
          return;
        }
        if (button) button.dataset.busy = 'true';
        if (!state.assembly || !assemblyVariant) return;
        e.preventDefault();
        if (button) { button.disabled = true; button.dataset.busy = 'true'; }

        var chosenVariant = Number(new FormData(form).get('id') || variantId);
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
              { id: chosenVariant, quantity: 1, properties: props },
              { id: Number(assemblyVariant), quantity: 1, properties: { 'For': piece, '_sos_parent': String(chosenVariant) } }
            ]
          })
        })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function () { window.location.href = '/cart'; })
          .catch(function () {
            if (button) { button.disabled = false; delete button.dataset.busy; }
            document.querySelector('[data-sos-add-status]').textContent = 'Could not add this configuration. Check your bag before trying again.';
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

/* The bag names the delivery charge rather than letting the total jump at
   checkout. Shopify will not quote a local delivery rate before the address
   is confirmed, so this is the figure quoted on the product page, from the
   same mirrored table, labelled as what it is. */
(function () {
  var el = document.querySelector('[data-sos-cart-delivery]');
  if (!el) return;
  var postcodes = new Set(Array.from(document.querySelectorAll('[data-sos-bag-line][data-postcode]'))
    .map(function (line) { return line.dataset.postcode; }).filter(Boolean));
  if (postcodes.size > 1) {
    el.closest('.sos-cart__row').hidden = true;
    var handoff = document.querySelector('.sos-cart__handoff');
    handoff.textContent = 'Your bag has more than one delivery postcode. Place separate orders for different addresses.';
    return;
  }
  var code = (el.dataset.postcode || '').toUpperCase().replace(/\s+/g, '');
  var out = code.match(/^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/);
  code = out ? out[1] : code;
  fetch(el.dataset.zones)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      for (var len = code.length; len >= 1; len--) {
        var key = code.slice(0, len);
        if (Object.prototype.hasOwnProperty.call(d.zones, key)) {
          var band = d.bands[d.zones[key]];
          el.textContent = '£' + (band.pence / 100).toFixed(2);
          var total = document.querySelector('[data-sos-order-total]');
          total.textContent = '£' + ((Number(el.dataset.subtotal) + band.pence) / 100).toFixed(2);
          total.closest('[data-sos-order-row]').hidden = false;
          return;
        }
      }
    })
    .catch(function () { /* leave the honest fallback text in place */ });
})();

/* Keep assembly next to its statue and remove both in a single basket update. */
(function () {
  var form = document.querySelector('.sos-cart__form');
  if (!form) return;
  var lines = Array.from(form.querySelectorAll('[data-sos-bag-line]'));
  var statues = lines.filter(function (line) { return !line.classList.contains('sos-cart__line--extra'); });
  var extras = lines.filter(function (line) { return line.classList.contains('sos-cart__line--extra'); });
  var status = form.querySelector('[data-sos-bag-status]');
  var removing = false;
  form.addEventListener('submit', function (event) {
    if (!event.submitter || event.submitter.name !== 'checkout') return;
    var configured = statues.filter(function (line) { return line.dataset.fulfilment; });
    var destinations = new Set(configured.map(function (line) {
      return line.dataset.postcode || (line.dataset.fulfilment === 'Collection in London' ? 'collection' : '');
    }));
    if (destinations.size > 1 || destinations.has('')) {
      event.preventDefault();
      status.textContent = 'Use one fulfilment method and delivery postcode per order. Remove the affected statue and add it again with the correct option.';
    }
  });

  statues.forEach(function (statue, index) {
    statue.style.order = index * 2;
    var related = extras.filter(function (extra) {
      return extra.dataset.parent
        ? extra.dataset.parent === statue.dataset.variant
        : extra.dataset.extraFor && extra.dataset.extraFor === statue.dataset.title;
    });
    if (!related.length) return;
    related.forEach(function (extra) { extra.style.order = index * 2 + 1; });
    statue.querySelector('.sos-cart__remove').addEventListener('click', function (event) {
      event.preventDefault();
      if (removing) return;
      removing = true;
      var updates = {};
      [statue].concat(related).forEach(function (line) { updates[line.dataset.key] = 0; });
      fetch(window.Shopify.routes.root + 'cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: updates })
      }).then(function (response) {
        if (!response.ok) throw new Error(response.status);
        window.location.reload();
      }).catch(function () {
        status.textContent = 'Could not remove this statue and its assembly. Please try again.';
        removing = false;
      });
    });
    statue.querySelector('input[name="updates[]"]').addEventListener('input', function (event) {
      if (event.target.value === '') return;
      related.forEach(function (extra) {
        var quantity = extra.querySelector('input[name="updates[]"]');
        if (event.target.value === '0') {
          if (quantity.dataset.beforeRemoval === undefined) quantity.dataset.beforeRemoval = quantity.value;
          quantity.value = '0';
        } else if (quantity.dataset.beforeRemoval !== undefined) {
          quantity.value = quantity.dataset.beforeRemoval;
          delete quantity.dataset.beforeRemoval;
        }
      });
    });
  });
  extras.forEach(function (extra) { if (!extra.style.order) extra.style.order = statues.length * 2; });
})();

/* Collection controls progressively enhance the pre-rendered product links. */
(function () {
  function boot() {
    document.querySelectorAll('[data-sos-catalogue]').forEach(function (catalogue) {
      var tools = catalogue.querySelector('[data-sos-catalogue-tools]');
      if (!tools || tools.dataset.ready) return;
      var grid = catalogue.querySelector('.sos-grid');
      var cards = Array.from(grid.querySelectorAll('[data-sos-retail-card]'));
      if (!cards.length) return;
      var studio = tools.querySelector('[data-sos-studio]');
      var sort = tools.querySelector('[data-sos-sort]');
      var stock = tools.querySelector('[data-sos-in-stock]');
      var count = tools.querySelector('[data-sos-count]');
      Array.from(new Set(cards.map(function (card) { return card.dataset.studio; })))
        .filter(Boolean).sort().forEach(function (name) { studio.add(new Option(name, name)); });

      function update() {
        var ordered = cards.slice();
        if (sort.value) ordered.sort(function (a, b) {
          return (Number(a.dataset.price) - Number(b.dataset.price)) * (sort.value === 'low' ? 1 : -1);
        });
        var visible = 0;
        ordered.forEach(function (card) {
          card.hidden = (studio.value && card.dataset.studio !== studio.value) ||
            (stock.checked && card.dataset.available !== 'true');
          if (!card.hidden) visible += 1;
          grid.append(card);
        });
        count.textContent = visible ? visible + (visible === 1 ? ' statue' : ' statues') : 'No statues match these filters.';
      }

      tools.dataset.ready = 'true';
      tools.hidden = false;
      tools.addEventListener('change', update);
      update();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
})();

/* ---------------------------------------------------------------------------
   Product gallery.

   Progressive enhancement: the markup ships every photograph stacked, which
   is what a crawler and a no-JS visitor get. This adds .is-ready, which
   collapses the stack to a single frame with thumbnails, arrows, a counter
   and a lightbox.

   The stacked version was the reason a nine-photograph piece pushed its own
   name 2,184px down a 390px phone and its buy button to 2.7 screens.
--------------------------------------------------------------------------- */
(function () {
  function initGallery(root) {
    var shots = [].slice.call(root.querySelectorAll('[data-sos-shot]'));
    if (shots.length === 0) return;

    var thumbs = [].slice.call(root.querySelectorAll('[data-sos-gal-go]'));
    var countEl = root.querySelector('[data-sos-gal-count]');
    var prev = root.querySelector('[data-sos-gal-prev]');
    var next = root.querySelector('[data-sos-gal-next]');
    var zoom = root.querySelector('[data-sos-gal-zoom]');
    var index = 0;

    root.classList.add('is-ready');

    function show(i) {
      index = (i + shots.length) % shots.length;
      shots.forEach(function (f, n) { f.classList.toggle('is-active', n === index); });
      thumbs.forEach(function (t, n) {
        var on = n === index;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-current', on ? 'true' : 'false');
        /* Keep the active thumbnail in view — with nine of them the strip
           scrolls, and arrowing past the fifth otherwise left the highlight
           off-screen. */
        if (on && t.scrollIntoView) {
          try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* older browsers */ }
        }
      });
      if (countEl) countEl.textContent = (index + 1) + ' / ' + shots.length;
    }

    thumbs.forEach(function (t) {
      t.addEventListener('click', function () { show(parseInt(t.dataset.sosGalGo, 10) || 0); });
    });
    if (prev) prev.addEventListener('click', function () { show(index - 1); });
    if (next) next.addEventListener('click', function () { show(index + 1); });

    /* Arrow keys while the gallery has focus within it. */
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });

    /* Swipe. Horizontal intent only, so a vertical scroll is never hijacked. */
    var x0 = null, y0 = null;
    var stage = root.querySelector('.sos-product__stage');
    if (stage) {
      stage.addEventListener('touchstart', function (e) {
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      }, { passive: true });
      stage.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        var dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { show(index + (dx < 0 ? 1 : -1)); }
        x0 = null; y0 = null;
      }, { passive: true });
    }

    /* Lightbox. <dialog> gives Escape, the backdrop and focus handling. */
    var dialog = null;
    function renderZoom() {
      var img = shots[index].querySelector('img');
      var big = dialog.querySelector('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt || '';
      var status = dialog.querySelector('[data-sos-zoom-count]');
      if (status) status.textContent = (index + 1) + ' / ' + shots.length;
    }

    function stepZoom(direction) {
      show(index + direction);
      renderZoom();
    }

    function openZoom() {
      if (!shots[index].querySelector('img')) return;
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'sos-gal__dialog';
        dialog.innerHTML =
          '<button type="button" class="sos-gal__close" aria-label="Close">&times;</button>' +
          '<img class="sos-gal__dialogImg" alt="">' +
          (shots.length > 1
            ? '<div class="sos-gal__dialog-controls"><button type="button" class="sos-btn" data-sos-zoom-prev>Previous</button><span data-sos-zoom-count aria-live="polite"></span><button type="button" class="sos-btn" data-sos-zoom-next>Next</button></div>'
            : '');
        dialog.setAttribute('aria-label', 'Enlarged product photographs');
        if (shots.length > 1) {
          dialog.querySelector('[data-sos-zoom-prev]').addEventListener('click', function () { stepZoom(-1); });
          dialog.querySelector('[data-sos-zoom-next]').addEventListener('click', function () { stepZoom(1); });
          dialog.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            stepZoom(event.key === 'ArrowLeft' ? -1 : 1);
          });
          var start = null;
          var enlarged = dialog.querySelector('img');
          enlarged.addEventListener('touchstart', function (event) {
            var point = event.touches[0];
            start = event.touches.length === 1 ? [point.clientX, point.clientY] : null;
          }, { passive: true });
          enlarged.addEventListener('touchcancel', function () { start = null; });
          enlarged.addEventListener('touchend', function (event) {
            if (!start) return;
            var point = event.changedTouches[0];
            var dx = point.clientX - start[0];
            var dy = point.clientY - start[1];
            start = null;
            if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy)) stepZoom(dx < 0 ? 1 : -1);
          }, { passive: true });
        }
        document.body.appendChild(dialog);
        dialog.querySelector('.sos-gal__close').addEventListener('click', function () { dialog.close(); });
        dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
      }
      renderZoom();
      if (typeof dialog.showModal === 'function') { dialog.showModal(); } else { dialog.setAttribute('open', ''); }
    }
    if (zoom) zoom.addEventListener('click', openZoom);
    shots.forEach(function (f) {
      var img = f.querySelector('img');
      if (!img) return;
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', openZoom);
    });

    show(0);
  }

  function boot() {
    [].forEach.call(document.querySelectorAll('[data-sos-gallery]'), function (root) {
      if (root.dataset.sosGalReady === 'true') return;
      root.dataset.sosGalReady = 'true';
      initGallery(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('shopify:section:load', boot);
})();

/* ---------------------------------------------------------------------------
   Trustpilot widgets.

   The bootstrap script auto-initialises only on first load, so a widget that
   arrives later — a Shopify section reload in the theme editor, or a second
   placement injected after boot — renders as an empty box. This initialises
   every widget explicitly once the script is available, and again after any
   section reload.
--------------------------------------------------------------------------- */
(function () {
  function initAll() {
    if (!window.Trustpilot || typeof window.Trustpilot.loadFromElement !== 'function') return false;
    var found = document.querySelectorAll('.trustpilot-widget');
    if (!found.length) return true;
    [].forEach.call(found, function (el) {
      try { window.Trustpilot.loadFromElement(el, true); } catch (e) { /* widget stays as its fallback link */ }
    });
    return true;
  }

  /* The bootstrap is async, so poll briefly rather than racing it. Gives up
     after ~10s and leaves the fallback Trustpilot link in place. */
  function waitThenInit() {
    if (initAll()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (initAll() || tries > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitThenInit);
  } else {
    waitThenInit();
  }
  document.addEventListener('shopify:section:load', waitThenInit);
})();

/* Desktop exit prompt. Always keep the social links available in the footer. */
(function () {
  var dialog = document.querySelector('[data-sos-social-exit]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var storageKey = 'sos-social-prompt-seen';
  try { if (sessionStorage.getItem(storageKey)) return; } catch (error) { /* private browser */ }

  var readyAt = Date.now() + 8000;
  var close = dialog.querySelector('[data-sos-social-close]');
  close.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });

  document.addEventListener('mouseout', function onExit(event) {
    if (event.relatedTarget || event.clientY > 4 || Date.now() < readyAt) return;
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]:not([hidden])')) return;
    if (document.activeElement && document.activeElement.matches('input, textarea, select, [contenteditable="true"]')) return;
    document.removeEventListener('mouseout', onExit);
    dialog.showModal();
    try { sessionStorage.setItem(storageKey, '1'); } catch (error) { /* once on this page */ }
  });
})();
