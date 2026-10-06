(() => {
  const stage = document.getElementById("lungs-stage");
  const canvas = document.getElementById("lungs-canvas");
  const $ = (id) => document.getElementById(id);
  if (!stage || !canvas) return;
  if (typeof THREE === "undefined") {
    stage.insertAdjacentHTML("beforeend", '<p class="lungs-fallback">The 3D viewer could not load. Check your internet connection and refresh.</p>');
    return;
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bands = [
    { max: 50, name: "Good", color: "#22c55e", effect: "Easy breathing. The air sacs pass oxygen into the blood without extra effort." },
    { max: 100, name: "Moderate", color: "#eab308", effect: "Most people feel fine. Very sensitive lungs may notice mild irritation." },
    { max: 150, name: "Unhealthy for Sensitive Groups", color: "#f97316", effect: "Fine particles reach deeper. Children, older adults and people with asthma may cough or wheeze." },
    { max: 200, name: "Unhealthy", color: "#ef4444", effect: "Airways can become inflamed. Breathing gets faster and heavier during activity." },
    { max: 300, name: "Very Unhealthy", color: "#a855f7", effect: "Particles build up in the airways. Even healthy people may feel chest tightness." },
    { max: 9999, name: "Hazardous", color: "#be123c", effect: "Serious strain on the lungs. Stay indoors and avoid physical effort." },
  ];
  const parts = {
    lung: ["Lungs", "Each lung holds millions of tiny air sacs called alveoli, where oxygen enters the blood. PM2.5 particles are small enough to reach this deep."],
    trachea: ["Windpipe (trachea)", "The main air tube. Its lining traps dust in mucus, and tiny hairs called cilia sweep it upward so you can cough it out."],
    bronchi: ["Bronchi and airways", "The branching tubes that carry air into each lung. Pollution can irritate them, causing cough, wheeze and asthma flare-ups."],
  };
  const bandFor = (aqi) => bands.find((band) => aqi <= band.max);

  /* ---------- scene ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.6, 11);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rimTeal = new THREE.PointLight(0x2dd4bf, 0.6, 30);
  rimTeal.position.set(-6, 2, 3);
  scene.add(rimTeal);
  const rimViolet = new THREE.PointLight(0x8b5cf6, 0.5, 30);
  rimViolet.position.set(6, -2, -3);
  scene.add(rimViolet);

  const root = new THREE.Group();
  const lungGroup = new THREE.Group();
  root.add(lungGroup);
  scene.add(root);

  /* ---------- lungs ---------- */
  const lungMats = [];
  function makeLung(side) {
    const geometry = new THREE.SphereGeometry(1, 72, 56);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      let x = pos.getX(i) * 0.8;
      let y = pos.getY(i) * 1.55;
      let z = pos.getZ(i) * 0.64;
      const u = y / 1.55;
      const width = 0.55 + 0.45 * (1 - Math.pow(Math.max(0, u), 2));
      x *= width;
      z *= width;
      if (y < -1.15) y = -1.15 + (y + 1.15) * 0.3;
      const medial = x * -side;
      if (medial > 0) x *= 0.62;
      if (side > 0 && medial > 0.05 && u < -0.05 && u > -0.75) x += side * 0.32 * Math.sin(((u + 0.75) / 0.7) * Math.PI);
      x += 0.03 * Math.sin(y * 7 + z * 4);
      z += 0.03 * Math.cos(y * 6 + x * 5);
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xe88ea0, roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.6,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false,
    });
    lungMats.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = side * 1.2;
    mesh.userData.part = "lung";
    if (side > 0) mesh.scale.setScalar(0.94);
    return mesh;
  }
  lungGroup.add(makeLung(-1), makeLung(1));

  /* ---------- airways ---------- */
  const airMat = new THREE.MeshStandardMaterial({ color: 0xf1d9c9, roughness: 0.55 });
  const tracheaMat = new THREE.MeshStandardMaterial({ color: 0xf1d9c9, roughness: 0.55 });
  const trachea = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.5, 28), tracheaMat);
  trachea.position.y = 2.45;
  trachea.userData.part = "trachea";
  root.add(trachea);

  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  function branch(start, dir, len, radius, depth) {
    const end = start.clone().addScaledVector(dir, len);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, mid, end]), 8, radius, 8, false), airMat);
    tube.userData.part = "bronchi";
    lungGroup.add(tube);
    if (depth <= 0) return;
    for (let k = 0; k < 2; k += 1) {
      const next = dir.clone().applyAxisAngle(zAxis, (k ? 1 : -1) * (0.4 + rnd() * 0.4)).applyAxisAngle(yAxis, (rnd() - 0.5) * 1.3).normalize();
      branch(end, next, len * 0.7, radius * 0.68, depth - 1);
    }
  }
  [-1, 1].forEach((side) => branch(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(side * 0.45, -0.89, 0).normalize(), 0.85, 0.13, 4));

  /* ---------- PM2.5 particles ---------- */
  const maxParticles = 500;
  const positions = new Float32Array(maxParticles * 3);
  const flow = Array.from({ length: maxParticles }, () => {
    const side = rnd() < 0.5 ? -1 : 1;
    return {
      p: rnd(), speed: 0.12 + rnd() * 0.1,
      a: new THREE.Vector3((rnd() - 0.5) * 5, 5 + rnd() * 1.5, (rnd() - 0.5) * 2),
      d: new THREE.Vector3(side * (1 + rnd() * 0.5), -0.9 + rnd() * 1.8, (rnd() - 0.5) * 0.7),
    };
  });
  const B = new THREE.Vector3(0, 3.5, 0);
  const C = new THREE.Vector3(0, 1.2, 0);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0xf59e0b, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
  root.add(particles);
  const tmp = new THREE.Vector3();

  /* ---------- state ---------- */
  const stops = [
    [0, "#ff7fa3"],
    [50, "#f2607f"],
    [100, "#dc4a62"],
    [150, "#b83a4a"],
    [200, "#84293a"],
    [300, "#4a1f28"],
    [400, "#1c1316"],
  ].map(([at, hex]) => [at, new THREE.Color(hex)]);
  function tintFor(value) {
    for (let i = 1; i < stops.length; i += 1) {
      if (value <= stops[i][0]) {
        const [a, colorA] = stops[i - 1];
        const [b, colorB] = stops[i];
        return colorA.clone().lerp(colorB, (value - a) / (b - a));
      }
    }
    return stops[stops.length - 1][1].clone();
  }
  let aqi = 90;
  let selected = "lung";

  function applyState() {
    const tint = tintFor(aqi);
    const selfLight = Math.max(0, 1 - aqi / 300) * 0.3;
    lungMats.forEach((m) => {
      m.color.copy(tint);
      m.emissive.copy(tint).multiplyScalar(selfLight);
      if (selected === "lung") m.emissive.lerp(new THREE.Color("#2dd4bf"), 0.08);
    });
    airMat.emissive.set(selected === "bronchi" ? "#2dd4bf" : "#000000").multiplyScalar(0.45);
    tracheaMat.emissive.set(selected === "trachea" ? "#2dd4bf" : "#000000").multiplyScalar(0.45);
    particleGeometry.setDrawRange(0, Math.min(maxParticles, Math.round(20 + (aqi / 500) * 480)));

    const band = bandFor(aqi);
    $("lungs-aqi-value").textContent = aqi;
    const badge = $("lungs-category");
    badge.textContent = band.name;
    badge.style.color = band.color;
    $("lungs-effect").textContent = band.effect;
    const info = parts[selected];
    $("lungs-part-title").textContent = info[0];
    $("lungs-part-text").textContent = info[1];
  }

  function setAqi(value) {
    aqi = Math.max(0, Math.min(400, Math.round(Number(value) || 0)));
    $("lungs-aqi").value = aqi;
    applyState();
  }

  /* ---------- city + slider ---------- */
  const citySelect = $("lungs-city");
  const stations = (window.AirData && window.AirData.stations) || [];
  let touched = false;
  function fillCities() {
    citySelect.innerHTML = "";
    const custom = new Option("Custom (use slider)", "");
    citySelect.add(custom);
    stations.forEach((station) => citySelect.add(new Option(`${station.city} · AQI ${station.aqi}`, station.city)));
  }
  fillCities();
  const saved = window.AirData && window.AirData.stationByCity ? window.AirData.stationByCity(localStorage.getItem("air-india-city")) : null;
  if (saved) { citySelect.value = saved.city; setAqi(saved.aqi); } else setAqi(aqi);
  citySelect.addEventListener("change", () => {
    touched = true;
    const station = stations.find((item) => item.city === citySelect.value);
    if (station) setAqi(station.aqi);
  });
  $("lungs-aqi").addEventListener("input", (event) => { touched = true; citySelect.value = ""; setAqi(event.target.value); });
  window.addEventListener("airdata:updated", () => {
    if (touched || !citySelect.value) return;
    const station = stations.find((item) => item.city === citySelect.value);
    if (station) { fillCities(); citySelect.value = station.city; setAqi(station.aqi); }
  });

  /* ---------- interaction ---------- */
  let rotY = -0.4;
  let rotX = 0.05;
  let idleAt = 0;
  let drag = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([trachea, ...lungGroup.children], false);
    if (!hits.length) return;
    const hit = hits.find((item) => item.object.userData.part !== "lung") || hits[0];
    selected = hit.object.userData.part;
    applyState();
  }
  canvas.addEventListener("pointerdown", (event) => { drag = { x: event.clientX, y: event.clientY, moved: 0 }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    rotY += dx * 0.008;
    rotX = Math.max(-0.6, Math.min(0.6, rotX + dy * 0.006));
    idleAt = performance.now() + 2500;
  });
  canvas.addEventListener("pointerup", (event) => { if (drag && drag.moved < 5) pick(event); drag = null; });
  canvas.addEventListener("pointercancel", () => { drag = null; });

  /* ---------- render loop ---------- */
  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    if (!reduce && !drag && performance.now() > idleAt) rotY += dt * 0.25;
    root.rotation.y += (rotY - root.rotation.y) * 0.12;
    root.rotation.x += (rotX - root.rotation.x) * 0.12;

    const breath = reduce ? 0 : Math.sin(time * (1.3 + aqi / 220));
    lungGroup.scale.set(1 + 0.04 * breath, 1 + 0.05 * breath, 1 + 0.04 * breath);

    if (!reduce) {
      const active = Math.min(maxParticles, Math.round(20 + (aqi / 500) * 480));
      for (let i = 0; i < active; i += 1) {
        const item = flow[i];
        item.p += item.speed * dt;
        if (item.p >= 1) item.p -= 1;
        if (item.p < 0.4) tmp.copy(item.a).lerp(B, item.p / 0.4);
        else if (item.p < 0.55) tmp.copy(B).lerp(C, (item.p - 0.4) / 0.15);
        else tmp.copy(C).lerp(item.d, (item.p - 0.55) / 0.45);
        positions[i * 3] = tmp.x;
        positions[i * 3 + 1] = tmp.y;
        positions[i * 3 + 2] = tmp.z;
      }
      particleGeometry.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
})();