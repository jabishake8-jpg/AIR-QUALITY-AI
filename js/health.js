 (async () => {
  const { categories, profiles, guidance, categoryFor, stationByCity } = window.AirData;
  const authUser = await window.Auth.ready;
  const byId = (id) => document.getElementById(id);
  const profileSelect = byId("health-profile");
  let activeCategory;
  let hasManualCategorySelection = false;

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    profileSelect.appendChild(option);
  }
  const savedProfile = authUser?.profile || localStorage.getItem("air-india-profile") || "general";
  profileSelect.value = profiles.some((profile) => profile.id === savedProfile) ? savedProfile : "general";

  function renderBandButtons() {
    const parent = byId("health-band-selector");
    for (const category of categories) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "health-band-button";
      button.dataset.category = category.name;
      button.setAttribute("aria-pressed", "false");
      button.style.setProperty("--band-color", category.color);
      const name = document.createElement("strong");
      name.textContent = category.name;
      const range = document.createElement("span");
      range.textContent = `${category.min}–${category.max}`;
      button.append(name, range);
      button.addEventListener("click", () => {
        hasManualCategorySelection = true;
        selectCategory(category.name);
      });
      parent.appendChild(button);
    }
  }

  function renderReference() {
    const parent = byId("aqi-reference-list");
    for (const category of categories) {
      const row = document.createElement("div");
      row.className = "aqi-reference-row";
      row.style.setProperty("--band-color", category.color);
      const name = document.createElement("strong");
      name.textContent = category.name;
      const range = document.createElement("span");
      range.textContent = `${category.min}–${category.max}`;
      const note = document.createElement("p");
      note.textContent = guidance.general[category.name];
      row.append(name, range, note);
      parent.appendChild(row);
    }
  }

  function updateContext() {
    const station = stationByCity(authUser?.city || localStorage.getItem("air-india-city"));
    const category = categoryFor(station.aqi);
    byId("health-city").textContent = station.city;
    byId("health-current-aqi").textContent = station.aqi;
    byId("health-current-category").textContent = category;
    byId("health-current-category").style.color = categories.find((item) => item.name === category).color;
    if (!hasManualCategorySelection) activeCategory = category;
    localStorage.setItem("air-india-city", station.city);
  }

  function selectCategory(categoryName) {
    const category = categories.find((item) => item.name === categoryName);
    if (!category) return;
    activeCategory = categoryName;
    document.querySelectorAll(".health-band-button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.category === categoryName));
    });
    byId("example-aqi").textContent = Math.round((category.min + category.max) / 2);
    byId("example-range").textContent = `AQI ${category.min}–${category.max}`;
    byId("health-category-title").textContent = category.name;
    byId("health-category-title").style.color = category.color;
    byId("health-advice").textContent = guidance[profileSelect.value][categoryName];
    byId("health-sensitivity").textContent = category.min >= 101
      ? "People with heart or lung conditions, children, and older adults may be more sensitive to poor air quality."
      : category.min >= 51
        ? "Unusually sensitive people may notice symptoms during prolonged or strenuous activity."
        : "This category generally presents the fewest air-quality concerns for outdoor activity.";
  }

  profileSelect.addEventListener("change", () => {
    localStorage.setItem("air-india-profile", profileSelect.value);
    if (window.Auth.user) {
      void window.Auth.patchMe({ profile: profileSelect.value })
        .then(() => {
          byId("health-account-status").textContent = "Health profile saved to your account.";
        })
        .catch((error) => {
          profileSelect.value = window.Auth.user.profile;
          localStorage.setItem("air-india-profile", profileSelect.value);
          byId("profile-label").textContent = profiles.find((profile) => profile.id === profileSelect.value).label.toLocaleUpperCase();
          byId("health-account-status").textContent = `Could not save health profile: ${error.message}`;
          selectCategory(activeCategory);
        });
    }
    byId("profile-label").textContent = profiles.find((profile) => profile.id === profileSelect.value).label.toLocaleUpperCase();
    selectCategory(activeCategory);
  });

  renderBandButtons();
  renderReference();
  updateContext();
  byId("profile-label").textContent = profiles.find((profile) => profile.id === profileSelect.value).label.toLocaleUpperCase();
  selectCategory(activeCategory);
  window.addEventListener("airdata:updated", () => {
    updateContext();
    selectCategory(activeCategory);
  });
})();