(() => {
  document.querySelectorAll("[data-no-autofill]").forEach((input) => {
    input.addEventListener("focus", () => input.removeAttribute("readonly"), { once: true });
  });
  const showError = (form, message) => { const errorBox = form?.querySelector(".form-error"); if (!errorBox) return; errorBox.textContent = message; errorBox.classList.add("show"); };
  const safeNext = (role) => {
    const requested = new URLSearchParams(location.search).get("next");
    const allowed = role === "admin" ? ["admin/dashboard.php", "admin.html"] : ["index.html", "home.html", "cart.html", "orders.html", "profile.html", "favorites.html", "stalls.html", "profile.html?view=favorites", "profile.html?view=orders"];
    return allowed.includes(requested) ? requested : role === "admin" ? "admin/dashboard.php" : "index.html";
  };
  const syncStudent = (user) => {
    if (user?.role !== "student") return;
    if (user.clientId) localStorage.setItem("tambayts-client-id", user.clientId);
    const prior = (() => { try { return JSON.parse(localStorage.getItem("tambayts-profile") || "{}"); } catch { return {}; } })();
    localStorage.setItem("tambayts-profile", JSON.stringify({ ...prior, name: user.name, course: user.course || prior.course || "Student", gender: user.gender ?? prior.gender ?? "" }));
    document.dispatchEvent(new CustomEvent("tambayts-session", { detail: user }));
  };
  async function protectPage() {
    const protectedPage = document.body.dataset.auth;
    if (!protectedPage) return;
    try {
      const readSession = async () => {
        const response = await fetch(`api/auth.php?role=${encodeURIComponent(protectedPage)}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Session verification is temporarily unavailable.");
        return result;
      };
      let result = await readSession();
      if (result.user?.role !== protectedPage) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        result = await readSession();
      }
      const { user } = result;
      if (user?.role !== protectedPage) {
        const next = `${location.pathname.split("/").pop()}${location.search}`;
        location.replace(`login.html?next=${encodeURIComponent(next)}`);
        return;
      }
      syncStudent(user);
      document.body.classList.add("authenticated");
    } catch (error) {
      console.error("Could not verify the current session:", error);
      const toast = document.querySelector("#toast");
      if (toast) {
        toast.textContent = "Could not verify your sign-in. Check the server and database, then refresh.";
        toast.classList.add("show");
      }
    }
  }
  document.querySelectorAll(".reveal").forEach((button) => button.addEventListener("click", (event) => {
    const input = event.currentTarget.closest(".password-row")?.querySelector("input");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    const visible = input.type === "text";
    event.currentTarget.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    event.currentTarget.setAttribute("aria-pressed", String(visible));
    event.currentTarget.classList.toggle("is-visible", visible);
    event.currentTarget.classList.toggle("is-hidden", !visible);
  }));
  const authCard = document.querySelector("#auth-card");
  if (authCard) {
    const setAuthMode = (mode, focus = false) => {
      const isRegister = mode === "register";
      authCard.classList.toggle("is-register", isRegister);
      authCard.querySelectorAll("[data-auth-view]").forEach((view) => {
        const active = view.dataset.authView === mode;
        view.classList.toggle("is-active", active);
        view.setAttribute("aria-hidden", String(!active));
        view.inert = !active;
      });
      authCard.querySelectorAll("[data-auth-message]").forEach((message) => {
        const active = message.dataset.authMessage === mode;
        message.classList.toggle("is-active", active);
        message.setAttribute("aria-hidden", String(!active));
        message.inert = !active;
      });
      authCard.querySelectorAll(".form-error").forEach((box) => box.classList.remove("show"));
      document.title = isRegister ? "TamBayts | Create Account" : "TamBayts | Sign In";
      if (focus) authCard.querySelector(`[data-auth-view="${mode}"] input:not([type="hidden"])`)?.focus({ preventScroll: true });
    };
    authCard.addEventListener("click", (event) => {
      const switchButton = event.target.closest("[data-auth-mode]");
      if (switchButton) setAuthMode(switchButton.dataset.authMode, true);
    });
  }
  const loginForm = document.querySelector("#login-form");
  if (loginForm) {
    if (new URLSearchParams(location.search).get("registered") === "1") {
      const registrationNotice = document.querySelector("#register-success");
      if (registrationNotice) registrationNotice.hidden = false;
    }
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault(); loginForm.querySelector(".form-error")?.classList.remove("show");
      const button = loginForm.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Signing in…";
      try {
        const response = await fetch("api/auth.php", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "login", email: loginForm.elements.accountEmail.value.trim(), password: loginForm.elements.password.value }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to sign in.");
        syncStudent(result.user);
        location.replace(safeNext(result.user.role));
      } catch (error) { showError(loginForm, error.message); button.disabled = false; button.innerHTML = 'Sign in <span>→</span>'; }
    });
  }
  const registerForm = document.querySelector("#register-form");
  if (registerForm) {
    const departmentSelect = registerForm.elements.department;
    const gradeField = document.querySelector("#student-grade-field");
    const gradeSelect = registerForm.querySelector("#student-grade");
    const programField = document.querySelector("#student-program-field");
    const programSelect = registerForm.querySelector("#student-program");
    const programLabel = registerForm.querySelector("#student-program-label");
    const courseInput = registerForm.elements.course;
    const gradesByDepartment = {
      "Junior High School": ["Grade 7", "Grade 8", "Grade 9", "Grade 10"],
      "Senior High School": ["Grade 11", "Grade 12"],
    };
    const programsByDepartment = {
      "Senior High School": [
        "Accountancy, Business and Management (ABM)",
        "General Academic Strand (GAS)",
        "Humanities and Social Sciences (HUMSS)",
        "Science, Technology, Engineering and Mathematics (STEM)",
        "Arts & Design",
        "Technical-Vocational-Livelihood – Home Economics (TVL-HE)",
        "Technical-Vocational-Livelihood – Information and Communication Technologies (TVL-ICT)",
      ],
      "Tertiary Education": [
        "Bachelor of Multimedia Arts (BMMA)",
        "Bachelor of Science in Business Administration (BSBA)",
        "Bachelor of Science in Information Technology (BSIT)",
        "Bachelor of Science in Psychology (BSPsy)",
        "Associate in Computer Technology (ACT)",
      ],
    };
    const setOptions = (select, placeholder, options) => {
      select.replaceChildren(new Option(placeholder, ""));
      options.forEach((option) => select.add(new Option(option, option)));
      select.selectedIndex = 0;
    };
    const updateCourse = () => {
      const department = departmentSelect.value;
      const grade = gradeSelect.value;
      const program = programSelect.value;
      courseInput.value = [department, grade, program].filter(Boolean).join(" — ");
    };
    departmentSelect.addEventListener("change", () => {
      const department = departmentSelect.value;
      const grades = gradesByDepartment[department] || [];
      const programs = programsByDepartment[department] || [];
      const college = department === "Tertiary Education";
      if (programLabel) programLabel.textContent = college ? "Course" : "Strand";
      gradeField.style.display = grades.length ? "grid" : "none";
      gradeSelect.disabled = grades.length === 0;
      setOptions(gradeSelect, "Choose a grade", grades);
      programField.style.display = programs.length ? "grid" : "none";
      programSelect.disabled = programs.length === 0 || (grades.length > 0 && !gradeSelect.value);
      setOptions(programSelect, programs.length ? (college ? "Choose a course" : "Choose a strand") : "Choose a grade first", programs);
      updateCourse();
    });
    gradeSelect.addEventListener("change", () => {
      programSelect.disabled = !departmentSelect.value || (departmentSelect.value === "Senior High School" && !gradeSelect.value);
      updateCourse();
    });
    programSelect.addEventListener("change", updateCourse);
  }
  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault(); registerForm.querySelector(".form-error")?.classList.remove("show");
    const button = registerForm.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Creating account…";
    try {
      const response = await fetch("api/auth.php", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "register", name: registerForm.elements.name.value.trim(), email: registerForm.elements.accountEmail.value.trim(), course: registerForm.elements.course.value.trim(), gender: registerForm.elements.gender?.value || "", password: registerForm.elements.password.value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create account.");
      location.replace("login.html?registered=1");
    } catch (error) { showError(registerForm, error.message); button.disabled = false; button.textContent = "Create student account →"; }
  });
  protectPage();
})();
