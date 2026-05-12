/*!
 * Vitralis Configurator v1.0.0
 * Copyright (c) 2026 owlos s.r.o.
 * MIT License — https://owlos.sk
 */

/* ── Vitralis Configurator — Three.js scene + price logic ── */
(() => {
  if (!window.THREE) return;

  // ── State ────────────────────────────────────────────
  const state = {
    width:    1400,    // mm
    height:   1500,    // mm
    panes:    3,       // 2 | 3 | 4 (glass layers)
    sections: 2,       // 1..4
    profile:  70,      // 60 | 70 | 82
    color:    'white', // white | anthracite | oak | mahogany
    glass:    'energy', // standard | energy | multi | triplex
    sashes:   ['fixed','tilt-turn','fixed','fixed'], // per section
    view:     'window' // 'window' | 'cross'
  };

  // ── Pricing ──────────────────────────────────────────
  // Base €/m² by profile depth
  const PROFILE_PRICE = { 60: 180, 70: 240, 82: 320 };
  // Glazing surcharge €/m²
  const GLASS_PRICE   = { standard: 0, energy: 35, multi: 70, triplex: 110 };
  // Glass count multiplier €/m²
  const PANE_SURCHARGE = { 2: 0, 3: 25, 4: 55 };
  // Per-sash surcharge by type (€)
  const SASH_PRICE = { 'fixed': 0, 'turn': 65, 'tilt': 85, 'tilt-turn': 120 };
  // Color surcharge multiplier
  const COLOR_MULT = { white: 1.0, anthracite: 1.10, oak: 1.18, mahogany: 1.18 };

  function calcPrice() {
    const m2 = (state.width/1000) * (state.height/1000);
    const base   = PROFILE_PRICE[state.profile] * m2;
    const glass  = GLASS_PRICE[state.glass]     * m2;
    const panes  = PANE_SURCHARGE[state.panes]  * m2;
    const sashes = state.sashes.slice(0, state.sections).reduce((s,t)=>s+SASH_PRICE[t], 0);
    const colorMult = COLOR_MULT[state.color];
    const subtotal = (base + glass + panes + sashes) * colorMult;
    const vat = subtotal * 0.20;
    return {
      base, glass, panes, sashes, color: subtotal - (base+glass+panes+sashes),
      subtotal, vat, total: subtotal + vat, m2
    };
  }

  // ── DOM refs ─────────────────────────────────────────
  const refs = {};
  ['stageCanvas','wRange','hRange','wVal','hVal','m2Val',
   'panes','sectionsGroup','profile','colorRow','glass','sashGroup',
   'tabWindow','tabCross','readW','readH','readM2',
   'priceTotal','priceRows','sectionsCount'
  ].forEach(id => refs[id] = document.getElementById(id));

  // ── Three.js setup ───────────────────────────────────
  const canvas = refs.stageCanvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  resize(); window.addEventListener('resize', resize);

  // ── Lighting ─────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4ec3d6, 0.8);
  rim.position.set(-5, 2, -2); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x88aabb, 0.35);
  fill.position.set(2, -3, 4); scene.add(fill);

  // env reflection (simple gradient cube)
  const envGeo = new THREE.BoxGeometry(40,40,40);
  const envMat = new THREE.MeshBasicMaterial({ color: 0x223344, side: THREE.BackSide });
  scene.add(new THREE.Mesh(envGeo, envMat));

  // ── Frame builder ────────────────────────────────────
  const root = new THREE.Group(); scene.add(root);
  const crossGroup = new THREE.Group(); scene.add(crossGroup); crossGroup.visible = false;

  const COLORS = {
    white:      0xf4f6f7,
    anthracite: 0x2a2f36,
    oak:        0xb38a4d,
    mahogany:   0x6b2f1f
  };

  function clearGroup(g) { while (g.children.length) { const c = g.children[0]; g.remove(c); c.geometry?.dispose(); } }

  function buildFrame() {
    clearGroup(root);

    // scale: 1m == 1 unit, but cap at 4 units for camera framing
    const scale = 3.0 / Math.max(state.width, state.height) * 1000;
    const W = (state.width  / 1000) * scale;
    const H = (state.height / 1000) * scale;
    const D = (state.profile / 1000) * scale * 1.6; // visual depth (exaggerated 1.6x)
    const F = 0.10 * scale * (state.profile/70);    // frame thickness

    const frameMat = new THREE.MeshStandardMaterial({
      color: COLORS[state.color], roughness: 0.55, metalness: 0.05
    });

    // outer frame — 4 bars
    function bar(w, h, d, x, y, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      m.position.set(x, y, z);
      return m;
    }
    root.add(bar(W,    F,    D,  0,  H/2 - F/2,  0)); // top
    root.add(bar(W,    F,    D,  0, -H/2 + F/2,  0)); // bottom
    root.add(bar(F,    H-F*2,D, -W/2 + F/2, 0, 0));   // left
    root.add(bar(F,    H-F*2,D,  W/2 - F/2, 0, 0));   // right

    // mullions (impostas) between sections
    const innerW = W - F*2;
    const sectionW = innerW / state.sections;
    for (let i = 1; i < state.sections; i++) {
      const x = -W/2 + F + i*sectionW;
      const mullion = bar(F*0.7, H-F*2, D, x, 0, 0);
      root.add(mullion);
    }

    // glazing — visualize multiple panes by stacking thin transparent boxes
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf3f5, transparent: true, opacity: 0.22,
      roughness: 0.05, metalness: 0.0, transmission: 0.85, ior: 1.45,
      clearcoat: 1.0, clearcoatRoughness: 0.05
    });
    const tintGlassMat = glassMat.clone();
    tintGlassMat.color = new THREE.Color(state.glass === 'energy' ? 0xd9efef : state.glass === 'multi' ? 0xc7e6e8 : state.glass === 'triplex' ? 0xb6dcdf : 0xeaf3f5);

    const sashes = [];
    for (let i = 0; i < state.sections; i++) {
      const sashGroup = new THREE.Group();
      const sx = -W/2 + F + sectionW * (i + 0.5);
      const sashFrameInset = F * 0.55;

      // inner sash frame
      const sashOuterW = sectionW - F*0.35;
      const sashOuterH = H - F*2 - F*0.35;
      const innerGlassW = sashOuterW - sashFrameInset*2;
      const innerGlassH = sashOuterH - sashFrameInset*2;

      // sash bars
      sashGroup.add(bar(sashOuterW, sashFrameInset, D*0.7, 0,  sashOuterH/2 - sashFrameInset/2, D*0.05));
      sashGroup.add(bar(sashOuterW, sashFrameInset, D*0.7, 0, -sashOuterH/2 + sashFrameInset/2, D*0.05));
      sashGroup.add(bar(sashFrameInset, sashOuterH-sashFrameInset*2, D*0.7, -sashOuterW/2 + sashFrameInset/2, 0, D*0.05));
      sashGroup.add(bar(sashFrameInset, sashOuterH-sashFrameInset*2, D*0.7,  sashOuterW/2 - sashFrameInset/2, 0, D*0.05));

      // glass panes (n = state.panes), separated by depth
      const totalGlassDepth = D * 0.35;
      const paneSpacing = totalGlassDepth / Math.max(1, state.panes - 1);
      for (let p = 0; p < state.panes; p++) {
        const z = -totalGlassDepth/2 + p * paneSpacing + D*0.05;
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(innerGlassW, innerGlassH, 0.012 * scale),
          tintGlassMat
        );
        pane.position.z = z;
        sashGroup.add(pane);
      }

      // handle (only for openable sashes)
      const sashType = state.sashes[i] || 'fixed';
      if (sashType !== 'fixed') {
        const handleMat = new THREE.MeshStandardMaterial({ color: 0xb8c1cc, metalness: 0.85, roughness: 0.25 });
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04*scale, 0.18*scale, 0.05*scale), handleMat);
        // place on right or left depending on hinge logic — keep right for simplicity
        const hingeRight = (i % 2 === 0);
        handle.position.set(hingeRight ? -sashOuterW/2 + sashFrameInset*1.3 : sashOuterW/2 - sashFrameInset*1.3, 0, D*0.45);
        sashGroup.add(handle);
        sashGroup.userData.hinge = hingeRight ? 'right' : 'left';
        sashGroup.userData.openable = true;
      }

      sashGroup.position.set(sx, 0, 0);
      sashGroup.userData.type = sashType;
      sashGroup.userData.idx = i;
      root.add(sashGroup);
      sashes.push(sashGroup);
    }
    root.userData.sashes = sashes;

    // open one tilt-turn sash slightly to demonstrate
    sashes.forEach(s => {
      if (s.userData.type === 'tilt-turn' || s.userData.type === 'turn') {
        const hinge = s.userData.hinge === 'right';
        // shift pivot — using a child wrapper approach: rotate around the hinge edge
        const pivot = new THREE.Group();
        const sectionWLocal = sectionW;
        const offset = (hinge ? -1 : 1) * sectionWLocal/2;
        // rebuild by reparenting
        s.children.forEach(c => c.position.x -= offset);
        s.position.x += offset;
        s.rotation.y = (hinge ? -1 : 1) * 0.32;
      } else if (s.userData.type === 'tilt') {
        const sectionHLocal = H - F*2;
        s.children.forEach(c => c.position.y += sectionHLocal/2);
        s.position.y -= sectionHLocal/2;
        s.rotation.x = -0.18;
      }
    });
  }

  // ── Cross-section view ───────────────────────────────
  function buildCrossSection() {
    clearGroup(crossGroup);

    // stylized horizontal cross-section showing N panes + spacers
    const panes = state.panes;
    const spacers = panes - 1;
    const totalW = 6.0;
    const margin = 0.5;
    const usableW = totalW - margin*2;

    // glass thickness (visual)
    const glassT = 0.12;
    // chamber width
    const totalGlass = panes * glassT;
    const totalChamber = usableW - totalGlass;
    const chamberW = totalChamber / spacers;

    let x = -usableW/2;

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: state.glass === 'energy' ? 0xd9efef : state.glass === 'multi' ? 0xc0dee0 : state.glass === 'triplex' ? 0xafd0d3 : 0xeaf3f5,
      transparent: true, opacity: 0.62,
      roughness: 0.05, metalness: 0.0, transmission: 0.6, ior: 1.5,
      clearcoat: 1.0
    });
    const argonMat = new THREE.MeshBasicMaterial({ color: 0x4ec3d6, transparent: true, opacity: 0.10 });
    const spacerMat = new THREE.MeshStandardMaterial({ color: 0xb8c1cc, metalness: 0.6, roughness: 0.4 });

    const H = 3.6;
    for (let i = 0; i < panes; i++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(glassT, H, 1.0), glassMat);
      g.position.x = x + glassT/2;
      crossGroup.add(g);
      x += glassT;

      if (i < panes - 1) {
        // argon-filled chamber
        const c = new THREE.Mesh(new THREE.BoxGeometry(chamberW, H*0.94, 0.95), argonMat);
        c.position.x = x + chamberW/2;
        crossGroup.add(c);

        // top + bottom spacer bars
        const sTop = new THREE.Mesh(new THREE.BoxGeometry(chamberW, H*0.04, 0.96), spacerMat);
        sTop.position.set(x + chamberW/2, H*0.48, 0);
        const sBot = sTop.clone(); sBot.position.y = -H*0.48;
        crossGroup.add(sTop, sBot);

        x += chamberW;
      }
    }

    // frame brackets on either side
    const frameMat = new THREE.MeshStandardMaterial({ color: COLORS[state.color], roughness: 0.55 });
    const fL = new THREE.Mesh(new THREE.BoxGeometry(margin, H, 1.4), frameMat);
    fL.position.set(-totalW/2 + margin/2, 0, 0);
    const fR = fL.clone(); fR.position.x = totalW/2 - margin/2;
    crossGroup.add(fL, fR);

    // labels (using sprites)
    function makeLabel(text, x, y) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,256,64);
      ctx.font = 'bold 22px "DM Mono", monospace';
      ctx.fillStyle = '#4ec3d6';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);
      const tex = new THREE.CanvasTexture(c);
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      m.scale.set(2.4, 0.6, 1);
      m.position.set(x, y, 1);
      return m;
    }
    crossGroup.add(makeLabel(`${panes} GLASS PANES`, 0, 2.3));
    crossGroup.add(makeLabel(`${spacers}× ARGON CHAMBER`, 0, -2.3));
  }

  // ── Camera & view modes ──────────────────────────────
  function setView(v) {
    state.view = v;
    root.visible = v === 'window';
    crossGroup.visible = v === 'cross';
    refs.tabWindow?.classList.toggle('active', v === 'window');
    refs.tabCross?.classList.toggle('active',  v === 'cross');
    if (v === 'window')      camera.position.set(0, 0, 9);
    else                     camera.position.set(0, 0, 7);
  }

  // ── Mouse interaction (orbit) ───────────────────────
  let dragging = false, lastX = 0, lastY = 0;
  let rotY = 0.18, rotX = -0.06, targetRotY = 0.18, targetRotX = -0.06;
  canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('pointerup',   () => { dragging = false; });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    targetRotY += (e.clientX - lastX) * 0.005;
    targetRotX += (e.clientY - lastY) * 0.005;
    targetRotX = Math.max(-0.5, Math.min(0.5, targetRotX));
    lastX = e.clientX; lastY = e.clientY;
  });

  // ── Render loop ──────────────────────────────────────
  function loop() {
    rotY += (targetRotY - rotY) * 0.08;
    rotX += (targetRotX - rotX) * 0.08;
    root.rotation.y = rotY;
    root.rotation.x = rotX;
    crossGroup.rotation.y = rotY * 0.5;
    crossGroup.rotation.x = rotX * 0.3;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // ── UI wiring ────────────────────────────────────────
  function rebuild() {
    buildFrame();
    buildCrossSection();
    updateReadout();
    updatePrice();
  }

  function updateReadout() {
    refs.wVal.textContent  = state.width  + ' mm';
    refs.hVal.textContent  = state.height + ' mm';
    const m2 = ((state.width/1000)*(state.height/1000)).toFixed(2);
    refs.m2Val.textContent = m2 + ' m²';
    refs.readW.innerHTML = `Width <em>${state.width}mm</em>`;
    refs.readH.innerHTML = `Height <em>${state.height}mm</em>`;
    refs.readM2.innerHTML = `Area <em>${m2}m²</em>`;
    refs.sectionsCount.textContent = state.sections;
  }

  function fmt(n) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)); }

  function updatePrice() {
    const p = calcPrice();
    refs.priceTotal.innerHTML = `€${fmt(p.total)} <span>incl. 20% VAT</span>`;
    refs.priceRows.innerHTML = `
      <div class="cfg-price-row"><span>Profile · ${state.profile}mm × ${p.m2.toFixed(2)}m²</span><em>€${fmt(p.base)}</em></div>
      <div class="cfg-price-row"><span>Glazing · ${state.glass}</span><em>€${fmt(p.glass)}</em></div>
      <div class="cfg-price-row"><span>${state.panes}-pane unit</span><em>€${fmt(p.panes)}</em></div>
      <div class="cfg-price-row"><span>Sashes (${state.sections})</span><em>€${fmt(p.sashes)}</em></div>
      <div class="cfg-price-row"><span>Color · ${state.color}</span><em>€${fmt(p.color)}</em></div>
      <div class="cfg-price-row" style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.10)"><span>Subtotal</span><em>€${fmt(p.subtotal)}</em></div>
      <div class="cfg-price-row"><span>VAT 20%</span><em>€${fmt(p.vat)}</em></div>
    `;
  }

  // sliders
  refs.wRange.addEventListener('input', e => { state.width  = +e.target.value; rebuild(); });
  refs.hRange.addEventListener('input', e => { state.height = +e.target.value; rebuild(); });

  // option buttons
  function bindOptions(container, key, parseFn = v => v) {
    if (!container) return;
    container.querySelectorAll('.cfg-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.cfg-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state[key] = parseFn(btn.dataset.value);
        if (key === 'sections') rebuildSashUI();
        rebuild();
      });
    });
  }
  bindOptions(refs.panes,    'panes', v => +v);
  bindOptions(refs.sectionsGroup, 'sections', v => +v);
  bindOptions(refs.profile,  'profile', v => +v);
  bindOptions(refs.glass,    'glass');

  // colors
  if (refs.colorRow) {
    refs.colorRow.querySelectorAll('.cfg-color').forEach(el => {
      el.addEventListener('click', () => {
        refs.colorRow.querySelectorAll('.cfg-color').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
        state.color = el.dataset.value;
        rebuild();
      });
    });
  }

  // tabs
  refs.tabWindow?.addEventListener('click', () => setView('window'));
  refs.tabCross ?.addEventListener('click', () => setView('cross'));

  // sash UI per-section
  function rebuildSashUI() {
    const cont = refs.sashGroup;
    cont.innerHTML = '';
    for (let i = 0; i < state.sections; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'cfg-group';
      wrap.innerHTML = `
        <div class="cfg-h">Section ${i+1} · <em data-sash-label="${i}">${state.sashes[i]}</em></div>
        <div class="cfg-options cols4" data-sash-row="${i}">
          <button class="cfg-opt ${state.sashes[i]==='fixed'?'active':''}" data-v="fixed">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16"/></svg>
            Fixed<small>—</small>
          </button>
          <button class="cfg-opt ${state.sashes[i]==='turn'?'active':''}" data-v="turn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M20 4 4 20"/></svg>
            Turn<small>+€65</small>
          </button>
          <button class="cfg-opt ${state.sashes[i]==='tilt'?'active':''}" data-v="tilt">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16"/><path d="M4 4l8 16 8-16"/></svg>
            Tilt<small>+€85</small>
          </button>
          <button class="cfg-opt ${state.sashes[i]==='tilt-turn'?'active':''}" data-v="tilt-turn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16"/><path d="M4 4l16 16M4 4l8 16 8-16"/></svg>
            T-Turn<small>+€120</small>
          </button>
        </div>`;
      cont.appendChild(wrap);
    }
    cont.querySelectorAll('[data-sash-row]').forEach(row => {
      const idx = +row.dataset.sashRow;
      row.querySelectorAll('.cfg-opt').forEach(b => {
        b.addEventListener('click', () => {
          row.querySelectorAll('.cfg-opt').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          state.sashes[idx] = b.dataset.v;
          row.parentElement.querySelector('[data-sash-label]').textContent = b.dataset.v;
          rebuild();
        });
      });
    });
  }

  // initial paint
  rebuildSashUI();
  rebuild();
  loop();
})();
