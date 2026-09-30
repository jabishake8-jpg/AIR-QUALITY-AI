(() => {
  const airGuidance = window.AirGuidance;
  const validDestinations = new Set(["index.html", "compare.html", "forecast.html", "planner.html", "health.html", "account.html"]);
  let currentUser = null;

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
    return payload;
  }

  function syncLocalPreferences(user) {
    if (!user) return;
    localStorage.setItem("air-india-profile", user.profile);
    localStorage.setItem("air-india-city", user.city);
  }

  function updateAccountLinks() {
    document.querySelectorAll("[data-account-link]").forEach((link) => {
      link.href = currentUser ? "account.html" : "login.html";
      link.textContent = currentUser ? "Account" : "Log in";
      link.setAttribute("aria-label", currentUser ? "Account settings" : "Log in");
    });
  }

  function setCurrentUser(user) {
    currentUser = user;
    syncLocalPreferences(user);
    updateAccountLinks();
    window.dispatchEvent(new CustomEvent("auth:changed", { detail: { user } }));
    return user;
  }

  const ready = request("/api/me")
    .then(({ user }) => setCurrentUser(user))
    .catch(() => {
      currentUser = null;
      updateAccountLinks();
      return null;
    });

  function populateSelect(select, items, selectedValue) {
    if (!select) return;
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    }
    select.value = selectedValue;
  }

  function showMessage(element, message, kind = "info") {
    if (!element) return;
    element.classList.remove("is-shake", "is-success");
    element.textContent = message;
    element.dataset.kind = kind;
    if (kind === "error" || kind === "success") {
      void element.offsetWidth;
      element.classList.add(kind === "error" ? "is-shake" : "is-success");
    }
  }

  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    populateSelect(
      document.getElementById("register-profile"),
      airGuidance.profiles.map(({ id, label }) => ({ value: id, label })),
      "general",
    );
    populateSelect(
      document.getElementById("register-city"),
      airGuidance.locations.map(({ city }) => ({ value: city, label: city })),
      "Delhi",
    );
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(registerForm);
      const message = document.getElementById("register-status");
      const password = String(form.get("password") || "");
      const confirmation = String(form.get("confirm-password") || "");
      if (password !== confirmation) {
        showMessage(message, "Passwords do not match.", "error");
        return;
      }
      const submit = registerForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const result = await request("/api/register", {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password,
            profile: form.get("profile"),
            city: form.get("city"),
            consent: form.get("consent") === "on",
          }),
        });
        showMessage(message, result.message, "success");
        registerForm.reset();
      } catch (error) {
        showMessage(message, error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(loginForm);
      const message = document.getElementById("login-status");
      const submit = loginForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const { user } = await request("/api/login", {
          method: "POST",
          body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
        });
        setCurrentUser(user);
        const destination = new URLSearchParams(location.search).get("next");
        location.href = validDestinations.has(destination) ? destination : "account.html";
      } catch (error) {
        showMessage(message, error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });
  }

  const accountContent = document.getElementById("account-content");
  if (accountContent) {
    const profile = document.getElementById("account-profile");
    const city = document.getElementById("account-city");
    const subscription = document.getElementById("account-subscribed");
    const message = document.getElementById("account-status");
    const signedOut = document.getElementById("account-signed-out");
    const logoutButton = document.getElementById("logout-button");
    const deleteButton = document.getElementById("delete-account-button");
    populateSelect(profile, airGuidance.profiles.map(({ id, label }) => ({ value: id, label })), "general");
    populateSelect(city, airGuidance.locations.map(({ city: name }) => ({ value: name, label: name })), "Delhi");

    async function loadAccount() {
      const user = await ready;
      if (!user) {
        signedOut.hidden = false;
        accountContent.hidden = true;
        return;
      }
      signedOut.hidden = true;
      accountContent.hidden = false;
      document.getElementById("account-email").textContent = user.email;
      document.getElementById("account-verification").textContent = user.emailVerified ? "Verified" : "Not verified";
      profile.value = user.profile;
      city.value = user.city;
      subscription.checked = user.subscribed;
    }

    async function savePreference(change) {
      try {
        const { user } = await request("/api/me", { method: "PATCH", body: JSON.stringify(change) });
        setCurrentUser(user);
        showMessage(message, "Account settings saved.", "success");
      } catch (error) {
        showMessage(message, error.message, "error");
        await loadAccount();
      }
    }

    profile.addEventListener("change", () => void savePreference({ profile: profile.value }));
    city.addEventListener("change", () => void savePreference({ city: city.value }));
    subscription.addEventListener("change", () => void savePreference({ subscribed: subscription.checked }));
    logoutButton.addEventListener("click", async () => {
      try {
        await request("/api/logout", { method: "POST" });
      } finally {
        setCurrentUser(null);
        localStorage.removeItem("air-india-profile");
        localStorage.removeItem("air-india-city");
        location.href = "index.html";
      }
    });
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Delete your account and its saved preferences? This cannot be undone.")) return;
      deleteButton.disabled = true;
      try {
        await request("/api/me", { method: "DELETE" });
        setCurrentUser(null);
        localStorage.removeItem("air-india-profile");
        localStorage.removeItem("air-india-city");
        location.href = "index.html";
      } catch (error) {
        showMessage(message, error.message, "error");
        deleteButton.disabled = false;
      }
    });
    void loadAccount();
  }

  window.Auth = {
    get user() { return currentUser; },
    ready,
    request,
    register: (data) => request("/api/register", { method: "POST", body: JSON.stringify(data) }),
    login: async (data) => {
      const result = await request("/api/login", { method: "POST", body: JSON.stringify(data) });
      setCurrentUser(result.user);
      return result.user;
    },
    patchMe: async (data) => {
      if (!currentUser) return null;
      const result = await request("/api/me", { method: "PATCH", body: JSON.stringify(data) });
      setCurrentUser(result.user);
      return result.user;
    },
    setCurrentUser,
  };
  updateAccountLinks();
})();
