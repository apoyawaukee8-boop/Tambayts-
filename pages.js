const { getAdminFoods, saveAdminFoods, getCart, saveCart, getFavorites, saveFavorites, syncFavoritesToDatabase, loadFavoritesFromDatabase, getOrders, saveOrders, getProfile, saveProfile, peso, escapeHtml, formatCategory, updateCartBadges, updateOrderBadges } = TamBayts;
const findFood = (name) => getAdminFoods().find((food) => food.name === name && food.available);
const toast = document.querySelector("#toast");
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}
function pulseCartBadges() {
  document.querySelectorAll(".cart-badge, .cart-count, #cart-badge").forEach((badge) => {
    badge.classList.remove("is-bumping");
    void badge.offsetWidth;
    badge.classList.add("is-bumping");
    setTimeout(() => badge.classList.remove("is-bumping"), 420);
  });
}
function renderCartPage() {
  const target = document.querySelector("#cart-page-items");
  if (!target) return;
  const items = getCart().map((cartItem) => ({ ...findFood(cartItem.name), quantity: cartItem.quantity })).filter((item) => item.name);
  target.innerHTML = items.length ? items.map((item, index) => `<article class="cart-page-line" style="--card-index:${Math.min(index, 8)}"><div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(formatCategory(item.category))}</p></div><strong>${peso(item.price * item.quantity)}</strong><div class="cart-quantity"><button data-decrease="${escapeHtml(item.name)}" aria-label="Remove one ${escapeHtml(item.name)}">−</button><span aria-label="Quantity ${item.quantity}">${item.quantity}</span><button data-increase="${escapeHtml(item.name)}" aria-label="Add one ${escapeHtml(item.name)}">+</button></div></article>`).join("")
    : '<div class="cart-empty"><span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L20 8H6"></path><circle cx="10" cy="19" r="1"></circle><circle cx="17" cy="19" r="1"></circle></svg></span><h2>Your cart is empty</h2><p>Add something tasty from the menu.</p><a href="index.html">Browse food</a></div>';
  const orderSummary = document.querySelector("#cart-order-summary");
  if (orderSummary) orderSummary.hidden = items.length === 0;
  document.querySelector("#cart-page-total").textContent = peso(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
}
function renderOrderReview() {
  const target = document.querySelector("#order-review-items");
  if (!target) return [];
  const items = getCart().map((cartItem) => ({ ...findFood(cartItem.name), quantity: cartItem.quantity })).filter((item) => item.name);
  target.innerHTML = items.length ? items.map((item, index) => `<article class="order-review-line" style="--card-index:${Math.min(index, 8)}"><div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(formatCategory(item.category))} · ${item.quantity} × ${peso(item.price)}</p></div><strong>${peso(item.price * item.quantity)}</strong></article>`).join("") : '<p class="order-review-empty">Your cart has no available foods to order.</p>';
  document.querySelector("#review-order-total").textContent = peso(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  return items;
}
function profileCourseLines(course, emptyLabel = "Not provided") {
  const parts = String(course || "").split(" — ").filter(Boolean);
  if (!parts.length) return `<span class="profile-course-context">${escapeHtml(emptyLabel)}</span>`;
  return parts.map((part, index) => `<span class="${index === 0 ? "profile-course-context" : "profile-course-line"}">${escapeHtml(part)}</span>`).join("");
}
function renderOrders(status = "active", animate = false) {
  const targets = [document.querySelector("#order-list"), document.querySelector("#profile-order-list")].filter(Boolean);
  if (!targets.length) return;
  const card = (order, isPastOrder) => {
    const ready = order.status === "Ready";
    const done = ["Picked up", "Completed"].includes(order.status);
    const pending = order.status === "Pending";
    const statusMessage = order.status === "Pending"
      ? "Waiting for the stall to confirm your order."
      : order.status === "Preparing" ? "The stall is preparing your order."
      : ready ? "Your order is ready for pickup."
      : done ? "Order completed. Thank you!" : `Placed ${order.createdAt}`;
    const activeStep = pending ? 0 : order.status === "Preparing" ? 1 : ready ? 2 : done ? 3 : 0;
    const statusClass = done ? "picked-up" : pending ? "pending" : order.status.toLowerCase();
    const progress = isPastOrder ? "" : `<div class="order-progress" role="list" aria-label="Order progress">${["Received", "Preparing", "Ready for pickup", "Picked up"].map((step, index) => {
      const stepClass = index < activeStep || (done && index === activeStep) ? "done" : index === activeStep ? "current" : "";
      const current = index === activeStep && !done ? ' aria-current="step"' : "";
      return `<span class="${stepClass}" role="listitem"${current} aria-label="${step}${stepClass ? `, ${stepClass === "current" ? "in progress" : "complete"}` : ", not started"}"></span>`;
    }).join("")}</div><div class="order-labels"><span>Received</span><span>Preparing</span><span>Ready for pickup</span><span>Picked up</span></div>`;
    const foodNames = (order.names || []).map(escapeHtml).filter(Boolean).join(", ") || "Food items";
    const isPaid = order.paymentStatus === "paid";
    const paymentStatus = isPaid ? "Paid in cash" : "Cash due at pickup";
    const reorderButton = isPastOrder ? `<button type="button" data-reorder-order="${escapeHtml(order.id)}">Reorder</button>` : "";
    return `<article class="order-card"><div class="order-top"><div><span class="order-status ${statusClass}">${escapeHtml(order.status)}</span><p class="order-reference">Order #${escapeHtml(order.id)}</p><h2 class="order-food-names">${foodNames}</h2></div><strong>${peso(order.total)}</strong></div>${progress}<p class="order-payment ${isPaid ? "paid" : "due"}">Payment: <strong>${paymentStatus}</strong></p><div class="order-action"><span>${escapeHtml(statusMessage)}</span>${reorderButton}</div></article>`;
  };
  targets.forEach((target) => {
    const selectedStatus = target.id === "profile-order-list" ? "past" : status;
    const shown = getOrders().filter((order) => selectedStatus === "past" ? ["Picked up", "Completed"].includes(order.status) : !["Picked up", "Completed"].includes(order.status));
    const emptyState = target.id === "profile-order-list" ? "" : '<article class="empty-order"><span class="empty-order-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"></path><path d="M9 8h6m-6 4h6m-6 4h4"></path></svg></span><h2>No orders here yet</h2><p>Browse the menu when you are ready for a meal.</p><a href="index.html">Browse food</a></article>';
    target.innerHTML = shown.length ? shown.map((order) => card(order, selectedStatus === "past")).join("") : emptyState;
    if (animate) {
      target.classList.remove("items-entering");
      void target.offsetWidth;
      target.classList.add("items-entering");
      setTimeout(() => target.classList.remove("items-entering"), 520);
    }
  });
}
function renderFavorites() {
  const target = document.querySelector("#saved-list");
  if (!target) return;
  const favorites = getFavorites().map(findFood).filter(Boolean);
  target.innerHTML = favorites.length ? favorites.map((item, index) => {
    const name = escapeHtml(item.name);
    return `<article class="favorite-meal" style="--card-index:${Math.min(index, 8)}"><div><h3>${name}</h3><small>${escapeHtml(formatCategory(item.category))} · ${escapeHtml(item.stall || "Stall unavailable")}</small></div><strong>${peso(item.price)}</strong><button class="favorite-meal-order" type="button" data-quick-order="${name}" aria-label="Add ${name} to cart"><span aria-hidden="true">＋</span> Add to cart</button><button class="favorite-meal-star is-favorite" type="button" data-toggle-favorite="${name}" aria-label="Remove ${name} from favorites" title="Remove from favorites">★</button></article>`;
  }).join("") : '<div class="no-favorites"><span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg></span><h3>No favorites yet</h3><a href="index.html">Explore the menu <span aria-hidden="true">→</span></a></div>';
}
function renderProfile() {
  const profile = getProfile();
  const name = document.querySelector("#profile-name");
  if (!name) return;
  name.textContent = profile.name;
  document.querySelector("#profile-course").innerHTML = profileCourseLines(profile.course, "Campus Student · 2026");
  document.querySelector("#profile-view-name").textContent = profile.name;
  document.querySelector("#profile-view-course").innerHTML = profileCourseLines(profile.course);
  document.querySelector("#profile-view-gender").textContent = profile.gender || "";
  renderFavorites();
}
async function loadSavedFoodMenu() {
  if (!document.querySelector("#saved-list, #cart-page-items, #order-review-items")) return;
  try {
    const response = await fetch("api/menu.php", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const result = await response.json();
    if (!Array.isArray(result.menu)) return;
    saveAdminFoods(result.menu);
    renderFavorites();
    renderCartPage();
    renderOrderReview();
  } catch {}
}
document.querySelector("#cart-page-items")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-increase], [data-decrease]");
  if (!button) return;
  const name = button.dataset.increase || button.dataset.decrease;
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.name === name);
  if (!item) return;
  const removingLast = Boolean(button.dataset.decrease) && item.quantity === 1;
  item.quantity += button.dataset.increase ? 1 : -1;
  saveCart(cart.filter((cartItem) => cartItem.quantity > 0));
  renderCartPage();
  updateCartBadges();
  pulseCartBadges();
  showToast(removingLast ? `${name} removed from your cart` : `${name} quantity updated`);
});
document.querySelector("#review-order")?.addEventListener("click", () => {
  if (!renderOrderReview().length) return showToast("Add food to your cart before placing an order.");
  document.querySelector("#cart-edit-view").hidden = true;
  document.querySelector("#order-review").hidden = false;
});
document.querySelector("#back-to-cart")?.addEventListener("click", () => {
  document.querySelector("#order-review").hidden = true;
  document.querySelector("#cart-edit-view").hidden = false;
});
document.querySelector("#confirm-place-order")?.addEventListener("click", async (event) => {
  const cart = getCart();
  if (!cart.length) return showToast("Your cart is empty.");
  const items = cart.map((cartItem) => ({ ...findFood(cartItem.name), quantity: cartItem.quantity })).filter((item) => item.name);
  if (!items.length) return showToast("Your cart has no valid items.");
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Placing order…";
  try {
    const response = await fetch("api/orders.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map(({ name, quantity }) => ({ name, quantity })),
      }),
    });
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      const isPhpPage = responseText.trimStart().startsWith("<");
      throw new Error(isPhpPage
        ? "The order API returned a server error. Open the site through XAMPP (http://localhost/...) and check the PHP error log."
        : "The order API returned an empty or invalid response. Make sure Apache and MySQL are running in XAMPP and open the site through http://localhost/...");
    }
    if (response.status === 401) { location.href = "login.html?role=student&next=cart.html"; return; }
    if (!response.ok) throw new Error(result.error || "Order could not be saved.");
    saveOrders([result.order, ...getOrders()]);
    saveCart([]);
    location.href = "orders.html";
  } catch (error) {
    showToast(error.message || "Could not connect to the order database.");
    button.disabled = false;
    button.textContent = "Confirm and place order";
  }
});
document.querySelectorAll("#order-tabs").forEach((tabs) => {
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (!button) return;
    tabs.querySelectorAll("button").forEach((tab) => tab.classList.toggle("selected", tab === button));
    tabs.querySelectorAll("button").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
    renderOrders(button.dataset.tab, true);
  });
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-reorder-order]");
  if (!button) return;
  button.disabled = true;
  try {
    try {
      const menuResponse = await fetch("api/menu.php", { headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (menuResponse.ok) {
        const menuResult = await menuResponse.json();
        if (Array.isArray(menuResult.menu)) saveAdminFoods(menuResult.menu);
      }
    } catch {}
    const order = getOrders().find((savedOrder) => String(savedOrder.id) === button.dataset.reorderOrder);
  if (!order) {
    showToast("Could not find that past order. Refresh your order history and try again.");
    return;
  }
  const requestedItems = Array.isArray(order.items) && order.items.length
    ? order.items.map((item) => ({ name: item.name, menuItemId: Number(item.menuItemId) || null, quantity: Math.max(1, Number(item.quantity) || 1) }))
    : (order.names || []).map((name) => ({ name, menuItemId: null, quantity: 1 }));
  const cart = getCart();
  let added = 0;
  let unavailable = 0;
  requestedItems.forEach(({ name, menuItemId, quantity }) => {
    const food = (menuItemId && getAdminFoods().find((item) => Number(item.id) === menuItemId && item.available)) || findFood(name);
    if (!food) {
      unavailable++;
      return;
    }
    const cartItem = cart.find((item) => item.name === food.name);
    if (cartItem) cartItem.quantity = Math.min(100, cartItem.quantity + quantity);
    else cart.push({ name: food.name, quantity: Math.min(100, quantity) });
    added++;
  });
  if (!added) {
    showToast("The meals from this order are currently unavailable.");
    return;
  }
  saveCart(cart);
  updateCartBadges();
  pulseCartBadges();
  showToast(unavailable ? `Available meals added. ${unavailable} item${unavailable === 1 ? " is" : "s are"} unavailable.` : "Past order added to your cart.");
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#edit-profile")?.addEventListener("click", () => {
  const profile = getProfile();
  const name = prompt("Your display name", profile.name);
  if (!name?.trim()) return;
  saveProfile({ ...profile, name: name.trim() });
  renderProfile();
  showToast("Profile updated");
});
const profileGradesByDepartment = {
  "Junior High School": ["Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  "Senior High School": ["Grade 11", "Grade 12"],
};
const profileProgramsByDepartment = {
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
const profileDepartmentSelect = document.querySelector("#profile-edit-department");
const profileGradeSelect = document.querySelector("#profile-edit-grade");
const profileGradeField = document.querySelector("#profile-edit-grade-field");
const profileProgramSelect = document.querySelector("#profile-edit-program");
const profileProgramField = document.querySelector("#profile-edit-program-field");
const profileCourseInput = document.querySelector("#profile-edit-course");
function updateProfileProgramCopy(department) {
  const label = document.querySelector("#profile-edit-program-label");
  const placeholder = profileProgramSelect?.options[0];
  const isCollege = department === "Tertiary Education";
  if (label) label.textContent = isCollege ? "Course" : "Strand";
  if (placeholder) placeholder.textContent = isCollege ? "Choose a course" : "Choose a strand";
}
function setProfileSelectOptions(select, placeholder, options) {
  select.replaceChildren(new Option(placeholder, ""));
  options.forEach((option) => select.add(new Option(option, option)));
  select.selectedIndex = 0;
}
function updateProfileCourse() {
  if (!profileCourseInput || !profileDepartmentSelect || !profileGradeSelect || !profileProgramSelect) return;
  profileCourseInput.value = [profileDepartmentSelect.value, profileGradeSelect.value, profileProgramSelect.value]
    .filter(Boolean)
    .join(" — ");
}
function showProfileCourseChoices(savedCourse = "") {
  const parts = savedCourse.split(" — ");
  const department = parts[0] || "";
  const grades = profileGradesByDepartment[department] || [];
  const programs = profileProgramsByDepartment[department] || [];
  const savedGrade = grades.includes(parts[1]) ? parts[1] : "";
  const savedProgram = department === "Tertiary Education" ? parts[1] : parts[2];

  profileDepartmentSelect.value = Object.hasOwn(profileProgramsByDepartment, department)
    || Object.hasOwn(profileGradesByDepartment, department) ? department : "";
  updateProfileProgramCopy(profileDepartmentSelect.value);
  setProfileSelectOptions(profileGradeSelect, "Choose a grade", grades);
  profileGradeSelect.disabled = grades.length === 0;
  profileGradeSelect.value = savedGrade;
  profileGradeField.hidden = grades.length === 0;
  setProfileSelectOptions(profileProgramSelect, profileProgramSelect.options[0]?.textContent || "Choose a strand", programs);
  profileProgramSelect.disabled = programs.length === 0 || (department === "Senior High School" && !savedGrade);
  if (programs.includes(savedProgram)) profileProgramSelect.value = savedProgram;
  profileProgramField.hidden = programs.length === 0;
  profileCourseInput.value = savedCourse;
}
profileDepartmentSelect?.addEventListener("change", () => {
  const department = profileDepartmentSelect.value;
  const grades = profileGradesByDepartment[department] || [];
  const programs = profileProgramsByDepartment[department] || [];
  updateProfileProgramCopy(department);
  setProfileSelectOptions(profileGradeSelect, "Choose a grade", grades);
  profileGradeSelect.disabled = grades.length === 0;
  profileGradeField.hidden = grades.length === 0;
  setProfileSelectOptions(profileProgramSelect, profileProgramSelect.options[0]?.textContent || "Choose a strand", programs);
  profileProgramSelect.disabled = programs.length === 0 || (department === "Senior High School" && !profileGradeSelect.value);
  profileProgramField.hidden = programs.length === 0;
  updateProfileCourse();
});
profileGradeSelect?.addEventListener("change", () => {
  profileProgramSelect.disabled = profileDepartmentSelect.value === "Senior High School" && !profileGradeSelect.value;
  updateProfileCourse();
});
profileProgramSelect?.addEventListener("change", updateProfileCourse);
function setProfileView(view) {
  const isDetail = ["favorites", "orders", "details", "help", "feedback"].includes(view);
  const profileNavItem = document.querySelector('.bottom-nav [aria-label="Profile"]');
  const favoriteNavItem = document.querySelector('.bottom-nav [aria-label="Favorites"]');
  profileNavItem?.classList.toggle("active", view !== "favorites");
  favoriteNavItem?.classList.toggle("active", view === "favorites");
  if (view !== "favorites") profileNavItem?.setAttribute("aria-current", "page");
  else profileNavItem?.removeAttribute("aria-current");
  if (view === "favorites") favoriteNavItem?.setAttribute("aria-current", "page");
  else favoriteNavItem?.removeAttribute("aria-current");
  document.querySelector("#profile-card")?.toggleAttribute("hidden", isDetail);
  document.querySelector(".profile-shortcuts")?.toggleAttribute("hidden", isDetail);
  document.querySelector("#profile-default-view")?.toggleAttribute("hidden", isDetail);
  document.querySelector("#profile-favorites-view")?.toggleAttribute("hidden", view !== "favorites");
  document.querySelector("#profile-orders-view")?.toggleAttribute("hidden", view !== "orders");
  document.querySelector("#profile-details-view")?.toggleAttribute("hidden", view !== "details");
  document.querySelector("#profile-help-view")?.toggleAttribute("hidden", view !== "help");
  document.querySelector("#profile-feedback-view")?.toggleAttribute("hidden", view !== "feedback");
  const title = document.querySelector("#profile-title");
  const viewTitle = view === "favorites" ? "Favorite Foods" : view === "orders" ? "Order History" : view === "details" ? "Profile Details" : view === "help" ? "FAQs" : view === "feedback" ? "Share feedback" : "Profile";
  if (title) title.textContent = viewTitle;
  document.title = `TamBayts | ${viewTitle}`;
  if (view === "favorites") renderFavorites();
  if (view === "orders") renderOrders("past");
  if (view === "help") loadHelpFaqs();
  if (view === "details") {
    const profile = getProfile();
    document.querySelector("#profile-edit-name").value = profile.name;
    document.querySelectorAll(".profile-inline-form").forEach((form) => { form.hidden = true; });
  }
}
document.querySelector(".profile-page, .favorite-page")?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-profile-view]");
  if (viewButton) setProfileView(viewButton.dataset.profileView);
  const favoriteButton = event.target.closest("[data-toggle-favorite]");
  if (favoriteButton) {
    const name = favoriteButton.dataset.toggleFavorite;
    const favorites = getFavorites();
    const isFavorite = !favorites.includes(name);
    const updatedFavorites = isFavorite ? [...favorites, name] : favorites.filter((favorite) => favorite !== name);
    saveFavorites(updatedFavorites);
    renderFavorites();
    syncFavoritesToDatabase(updatedFavorites).then(saveFavorites).then(renderFavorites).catch(() => showToast("Favorite saved here, but could not sync with the database."));
    showToast(isFavorite ? `${name} added to favorites` : `${name} removed from favorites`);
  }
  const quickOrderButton = event.target.closest("[data-quick-order]");
  if (quickOrderButton) {
    const name = quickOrderButton.dataset.quickOrder;
    const food = findFood(name);
    if (!food) {
      showToast("This food is currently unavailable.");
      return;
    }
    const cart = getCart();
    const cartItem = cart.find((item) => item.name === name);
    if (cartItem) cartItem.quantity += 1;
    else cart.push({ name, quantity: 1 });
    saveCart(cart);
    updateCartBadges();
    pulseCartBadges();
    showToast(`${name} added to your cart.`);
  }
});
if (document.querySelector(".profile-page")) {
  const initialView = new URLSearchParams(location.search).get("view");
  if (["favorites", "orders", "details", "help", "feedback"].includes(initialView)) setProfileView(initialView);
}
document.querySelectorAll("[data-edit-profile-field]").forEach((button) => {
  button.addEventListener("click", () => {
    const field = button.dataset.editProfileField;
    const input = field === "course" ? profileDepartmentSelect : document.querySelector(`#profile-edit-${field}`);
    document.querySelectorAll(".profile-inline-form").forEach((form) => { form.hidden = form.dataset.profileField !== field; });
    if (field === "name") input.value = getProfile().name;
    else if (field === "gender") input.value = getProfile().gender || "";
    else showProfileCourseChoices(getProfile().course || "");
    input.focus();
  });
});
document.querySelectorAll("[data-cancel-profile-field]").forEach((button) => {
  button.addEventListener("click", () => {
    const field = button.dataset.cancelProfileField;
    document.querySelector(`[data-profile-field="${field}"]`).hidden = true;
  });
});
document.querySelectorAll(".profile-inline-form").forEach((form) => form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const profile = getProfile();
  const field = form.dataset.profileField;
  // Rebuild the saved value from the current selections before submitting.
  if (field === "course") updateProfileCourse();
  const value = form.elements.namedItem(field).value.trim();
  if (field === "name" && !value) return showToast("Enter your name.");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const response = await fetch("api/auth.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "update-profile", [field]: value }),
    });
    const result = await response.json();
    if (response.status === 401) { location.href = "login.html?role=student&next=profile.html"; return; }
    if (!response.ok || !result.user) throw new Error(result.error || "Could not update your profile.");
    saveProfile({ ...profile, name: result.user.name, course: result.user.course || "", gender: result.user.gender || "" });
    renderProfile();
    form.hidden = true;
    showToast("Profile updated.");
  } catch (error) {
    showToast(error.message || "Could not update your profile.");
  } finally {
    button.disabled = false;
    button.textContent = "Save";
  }
}));
document.querySelector("#settings-list")?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button?.id === "student-sign-out") return;
  if (button?.dataset.setting) showToast(`${button.dataset.setting} settings will be available soon.`);
});
async function loadHelpFaqs() {
  const target = document.querySelector("#help-faq-list");
  if (!target || target.dataset.loaded === "true" || target.dataset.loading === "true") return;
  target.dataset.loading = "true";
  try {
    const response = await fetch("api/help.php", { credentials: "same-origin", headers: { Accept: "application/json" } });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.faqs)) throw new Error(result.error || "Could not load help articles.");
    target.innerHTML = result.faqs.map((faq) => `<article class="help-faq-item"><h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></article>`).join("");
    target.dataset.loaded = "true";
  } catch (error) {
    target.innerHTML = `<p class="help-faq-status" role="alert">${escapeHtml(error.message || "Could not load help articles.")} Please try again.</p><button class="help-faq-retry" type="button">Retry</button>`;
    target.querySelector(".help-faq-retry")?.addEventListener("click", loadHelpFaqs, { once: true });
  } finally {
    delete target.dataset.loading;
  }
}
document.querySelector("#feedback-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const textarea = form.elements.namedItem("message");
  const submitButton = form.querySelector("button[type='submit']");
  const status = document.querySelector("#feedback-status");
  const message = textarea.value.trim();
  if (!message) {
    status.textContent = "Please enter your feedback before sending.";
    textarea.focus();
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  status.textContent = "";
  try {
    const response = await fetch("api/feedback.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ message }),
    });
    const result = await response.json();
    if (response.status === 401) {
      location.href = "login.html?role=student&next=profile.html";
      return;
    }
    if (!response.ok) throw new Error(result.error || "Could not send your feedback.");
    form.reset();
    status.textContent = "Thanks for sharing your feedback!";
  } catch (error) {
    status.textContent = error.message || "Could not send your feedback. Please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send feedback";
  }
});
const signOutDialog = document.querySelector("#sign-out-dialog");
document.querySelector("#student-sign-out")?.addEventListener("click", () => signOutDialog?.showModal());
document.querySelector("#cancel-sign-out")?.addEventListener("click", () => signOutDialog?.close());
document.querySelector("#confirm-sign-out")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Signing out…";
  try {
    const response = await fetch("api/auth.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout", role: "student" }),
    });
    if (!response.ok) throw new Error("Could not sign out. Please try again.");
    location.replace("login.html?role=student");
  } catch (error) {
    showToast(error.message || "Could not sign out. Please try again.");
    button.disabled = false;
    button.textContent = "Sign out";
  }
});
let orderRefreshInFlight = false;
async function loadDatabaseOrders() {
  if (!document.querySelector("#order-list, #profile-order-list")) return;
  if (orderRefreshInFlight) return;
  orderRefreshInFlight = true;
  try {
    const response = await fetch("api/orders.php", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (response.status === 401) { location.href = `login.html?role=student&next=${document.querySelector("#profile-order-list") ? "profile.html?view=orders" : "orders.html"}`; return; }
    if (!response.ok) return;
    const result = await response.json();
    if (!Array.isArray(result.orders)) return;
    saveOrders(result.orders);
    renderOrders(document.querySelector("#order-tabs .selected")?.dataset.tab || "active");
  } catch {} finally {
    orderRefreshInFlight = false;
  }
}

document.addEventListener("tambayts-session", async (event) => {
  renderProfile();
  try {
    await loadFavoritesFromDatabase(event.detail?.clientId);
    renderFavorites();
  } catch {
    showToast("Favorites could not sync with the database. Your saved foods remain on this device.");
  }
});
document.addEventListener("tambayts-cart-loaded", () => {
  updateCartBadges();
  renderCartPage();
  renderOrderReview();
});
document.addEventListener("tambayts-cart-sync-error", (event) => showToast(event.detail?.message || "Your cart could not sync with the database."));
updateCartBadges();
updateOrderBadges();
renderCartPage();
renderOrders();
renderProfile();
loadSavedFoodMenu();
loadDatabaseOrders();
if (document.querySelector("#order-list, #profile-order-list")) {
  window.setInterval(() => {
    if (!document.hidden) loadDatabaseOrders();
  }, 5000);
  window.addEventListener("focus", loadDatabaseOrders);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadDatabaseOrders();
  });
}
