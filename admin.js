const peso = (amount) => `₱${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const byId = (id) => document.getElementById(id);
const { escapeHtml, formatCategory } = TamBayts;

let dashboard = { menu: [], orders: [], students: [], feedback: [], summary: { ordersToday: 0, salesToday: 0, studentCount: 0 } };
let pendingMenuRemovalId = null;
let pendingOrderDeletionCode = null;
let dashboardPollStarted = false;
let dashboardRefreshInFlight = false;
let lastDashboardRefreshError = "";
let pendingMenuEditId = null;
let orderStatusFilter = "Pending";

const sideLinks = [...document.querySelectorAll(".sidebar .side-link")];
const standardStalls = Array.from({ length: 7 }, (_, index) => `Stall ${index + 1}`);
function selectMenuStall(select, currentStall = "") {
  select.querySelectorAll("[data-legacy-stall]").forEach((option) => option.remove());
  if (currentStall && !standardStalls.includes(currentStall)) {
    const legacyOption = new Option(`${currentStall} (current)`, currentStall);
    legacyOption.dataset.legacyStall = "true";
    select.add(legacyOption, 1);
  }
  select.value = currentStall;
}
function setActiveSideLink(hash = location.hash || "#overview") {
  const requestedView = hash.replace(/^#/, "");
  const view = ["overview", "orders", "menu", "students", "feedback"].includes(requestedView) ? requestedView : "overview";
  sideLinks.forEach((link) => {
    const active = link.getAttribute("href") === `#${view}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-dashboard-view]").forEach((panel) => {
    panel.hidden = panel.dataset.dashboardView !== view;
  });
  const viewTitles = { overview: "Dashboard", orders: "Orders", menu: "Menu", students: "Students", feedback: "Feedback" };
  byId("dashboard-view-title").textContent = viewTitles[view];
  document.title = `TamBayts | ${viewTitles[view]}`;
}
sideLinks.forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  history.pushState(null, "", link.hash);
  setActiveSideLink(link.hash);
}));
window.addEventListener("hashchange", () => setActiveSideLink());
window.addEventListener("popstate", () => setActiveSideLink());
setActiveSideLink(location.hash || "#overview");

function notify(message) {
  const toast = byId("admin-toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

async function requestAdmin(method = "GET", body = undefined) {
  const isFormData = body instanceof FormData;
  const response = await fetch("api/admin.php", {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body && !isFormData ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (response.status === 401) location.href = "login.html?role=admin&next=admin.html";
  if (!response.ok) throw new Error(result.error || "Admin request failed.");
  return result;
}

function renderStats() {
  const { ordersToday, salesToday, studentCount } = dashboard.summary;
  const unavailable = dashboard.menu.filter((item) => !item.available).length;
  byId("stat-orders").textContent = ordersToday;
  byId("stat-sales").textContent = peso(salesToday);
  byId("stat-menu").textContent = dashboard.menu.length - unavailable;
  byId("stat-students").textContent = studentCount;
  const activeOrderCount = dashboard.orders.filter((order) => !["Picked up", "Completed", "Cancelled"].includes(order.status)).length;
  byId("nav-order-count").textContent = activeOrderCount > 0 ? activeOrderCount : "";
  byId("nav-order-count").hidden = activeOrderCount === 0;
  const feedbackCount = dashboard.feedback?.length || 0;
  byId("nav-feedback-count").textContent = feedbackCount > 0 ? feedbackCount : "";
  byId("nav-feedback-count").hidden = feedbackCount === 0;
}

function renderOrders() {
  const counts = {
    Pending: dashboard.orders.filter((order) => order.status === "Pending").length,
    Preparing: dashboard.orders.filter((order) => order.status === "Preparing").length,
    Ready: dashboard.orders.filter((order) => order.status === "Ready").length,
    "Picked up": dashboard.orders.filter((order) => ["Picked up", "Completed"].includes(order.status)).length,
  };
  const countIds = { Pending: "orders-count-new", Preparing: "orders-count-preparing", Ready: "orders-count-ready", "Picked up": "orders-count-picked-up" };
  document.querySelectorAll("[data-order-filter]").forEach((button) => {
    const active = button.dataset.orderFilter === orderStatusFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    byId(countIds[button.dataset.orderFilter]).textContent = counts[button.dataset.orderFilter];
  });
  byId("admin-orders").setAttribute("aria-labelledby", document.querySelector(`[data-order-filter="${orderStatusFilter}"]`).id);
  const orders = dashboard.orders.filter((order) => orderStatusFilter === "Picked up"
    ? ["Picked up", "Completed"].includes(order.status)
    : order.status === orderStatusFilter);
  const empty = byId("no-orders");
  empty.classList.toggle("hidden", orders.length > 0);
  const stageName = orderStatusFilter === "Pending" ? "new" : orderStatusFilter.toLowerCase();
  empty.textContent = `No ${stageName} orders right now.`;
  byId("admin-orders").innerHTML = orders.map((order) => {
    const next = order.status === "Pending" ? "Preparing" : order.status === "Preparing" ? "Ready" : order.status === "Ready" ? "Picked up" : null;
    const statusClass = order.status === "Ready" ? "ready" : ["Picked up", "Completed"].includes(order.status) ? "picked" : order.status === "Cancelled" ? "cancelled" : "";
    const items = Array.isArray(order.items) ? order.items : (order.names || []).map((name) => ({ name, quantity: 1, unitPrice: 0 }));
    const paymentLabel = order.paymentStatus === "paid" ? "Paid in cash" : "Cash due at pickup";
    const details = items.map((item) => `<li><div class="queue-order-item-copy"><span>${escapeHtml(item.name)} <b>× ${Math.max(1, Number(item.quantity) || 1)}</b></span><small>${escapeHtml(item.stall || "Campus Stall")}</small></div><strong>${peso(Number(item.unitPrice) * Math.max(1, Number(item.quantity) || 1))}</strong></li>`).join("");
    const action = next
      ? `<button class="table-action" data-order="${escapeHtml(order.id)}">Mark ${next === "Picked up" ? "picked up & paid" : next}</button>`
      : '<span class="order-complete-label">Completed</span>';
    const displayStatus = order.status === "Pending" ? "New" : order.status;
    return `<article class="queue-order-card">
      <div class="queue-order-card-heading"><div><span class="order-code">#${escapeHtml(order.id)}</span><span class="status-pill ${statusClass}">${escapeHtml(displayStatus)}</span></div><strong>${peso(order.total)}</strong></div>
      <div class="queue-order-student"><span>Student</span><strong>${escapeHtml(order.student || "Student")}</strong></div>
      <ul class="queue-order-items">${details || "<li>No item details available.</li>"}</ul>
      <div class="queue-order-card-footer"><span class="payment-label ${order.paymentStatus === "paid" ? "paid" : "due"}">${paymentLabel}</span><div class="order-actions">${action}<button class="table-delete-action" type="button" data-delete-order="${escapeHtml(order.id)}" aria-label="Remove order #${escapeHtml(order.id)}">Remove</button></div></div>
    </article>`;
  }).join("");
}

function renderMenuCategoryOptions() {
  const select = byId("menu-category-filter");
  const selected = select.value || "all";
  const categories = [...new Set(dashboard.menu.map((food) => food.category).filter(Boolean))].sort((a, b) => formatCategory(a).localeCompare(formatCategory(b)));
  select.innerHTML = `<option value="all">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(formatCategory(category))}</option>`).join("")}`;
  select.value = categories.includes(selected) ? selected : "all";

  const stallSelect = byId("menu-stall-filter");
  const selectedStall = stallSelect.value || "all";
  const stalls = [...new Set([
    ...Array.from({ length: 7 }, (_, index) => `Stall ${index + 1}`),
    ...dashboard.menu.map((food) => food.stall).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  stallSelect.innerHTML = `<option value="all">All stalls</option>${stalls.map((stall) => `<option value="${escapeHtml(stall)}">${escapeHtml(stall)}</option>`).join("")}`;
  stallSelect.value = stalls.includes(selectedStall) ? selectedStall : "all";
}

function renderMenu() {
  renderMenuCategoryOptions();
  const search = byId("menu-search").value.trim().toLowerCase();
  const category = byId("menu-category-filter").value;
  const stall = byId("menu-stall-filter").value;
  const allFoods = dashboard.menu;
  const foods = allFoods.filter((food) => {
    const categoryMatch = category === "all" || food.category === category;
    const stallMatch = stall === "all" || food.stall === stall;
    const searchMatch = !search || `${food.name} ${food.stall} ${formatCategory(food.category)}`.toLowerCase().includes(search);
    return categoryMatch && stallMatch && searchMatch;
  });
  const empty = byId("no-menu-items");
  empty.classList.toggle("hidden", foods.length > 0);
  empty.textContent = allFoods.length ? "No menu items match those filters." : "Your menu is empty. Add a food item to get started.";
  byId("menu-result-count").textContent = `Showing ${foods.length} of ${allFoods.length}`;
  byId("admin-menu").innerHTML = foods.map((food) => {
    const imageUrl = TamBayts.getFoodPhoto(food);
    return `
    <div class="menu-row">
      ${imageUrl ? `<img class="food-swatch" src="${escapeHtml(imageUrl)}" alt="">` : '<span class="food-swatch"></span>'}
      <div class="menu-details"><strong>${escapeHtml(food.name)}</strong><small class="menu-stall">Stall: ${escapeHtml(food.stall || "Not set")}</small><small>${escapeHtml(formatCategory(food.category))} · ${peso(food.price)}</small></div>
      <label class="availability ${food.available ? "" : "off"}"><input type="checkbox" data-availability="${food.id}" ${food.available ? "checked" : ""}> ${food.available ? "Available" : "Hidden"}</label>
      <div class="menu-row-actions"><button class="edit-menu-item" type="button" data-edit-menu="${food.id}" aria-label="Edit ${escapeHtml(food.name)}">Edit</button><button class="remove-menu-item" type="button" data-remove-menu="${food.id}" aria-label="Remove ${escapeHtml(food.name)}">Remove</button></div>
    </div>`;
  }).join("");
}

function renderStudents() {
  const search = byId("student-search").value.trim().toLowerCase();
  const allStudents = dashboard.students;
  const students = allStudents.filter((student) => `${student.name || ""} ${student.email || ""} ${student.course || ""}`.toLowerCase().includes(search));
  const empty = byId("no-students");
  empty.classList.toggle("hidden", students.length > 0);
  empty.textContent = allStudents.length ? "No students match that search." : "No student profiles to show yet.";
  byId("admin-students").innerHTML = students.map((student) => {
    const name = student.name || "Student";
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const education = String(student.course || "").split(" — ").filter(Boolean);
    const programLabel = education[0]?.includes("Senior High") ? "Strand" : "Course";
    const courseDetails = education.length
      ? `<span class="student-course-context">${escapeHtml(education[0])}</span>${education.length > 2 ? `<span class="student-course-value"><small>Grade</small>${escapeHtml(education[1])}</span><span class="student-course-value"><small>${programLabel}</small>${escapeHtml(education[2])}</span>` : education.length === 2 ? `<span class="student-course-value"><small>${education[0].includes("Junior High") ? "Grade" : programLabel}</small>${escapeHtml(education[1])}</span>` : ""}`
      : '<span class="student-course-context">Education details not provided</span>';
    return `<div class="student-row"><span class="student-avatar">${escapeHtml(initials)}</span><div class="student-info"><strong>${escapeHtml(name)}</strong><small class="student-course">${courseDetails}</small><small class="student-email">${escapeHtml(student.email || "Student account")}</small></div></div>`;
  }).join("");
}

function renderFeedback() {
  const entries = dashboard.feedback || [];
  byId("no-feedback").classList.toggle("hidden", entries.length > 0);
  byId("admin-feedback").innerHTML = entries.map((entry) => `
    <article class="feedback-entry">
      <div class="feedback-entry-heading"><strong>${escapeHtml(entry.studentName || "Student")}</strong><time datetime="${escapeHtml(entry.createdAtIso || "")}">${escapeHtml(entry.createdAt || "")}</time></div>
      <p class="feedback-entry-email">${escapeHtml(entry.email || "")}</p>
      <p class="feedback-entry-message">${escapeHtml(entry.message)}</p>
    </article>`).join("");
}

function renderOverviewLists() {
  const pickedUpOrders = dashboard.orders.filter((order) => ["Picked up", "Completed"].includes(order.status));
  byId("overview-no-picked-orders").classList.toggle("hidden", pickedUpOrders.length > 0);
  byId("overview-picked-orders").innerHTML = pickedUpOrders.map((order) => `
    <div class="overview-list-row">
      <div class="overview-list-copy"><strong>#${escapeHtml(order.id)} <span class="status-pill picked">Picked up</span></strong><small>${escapeHtml(order.student || "Student")}</small></div>
      <strong class="overview-list-value">${peso(order.total)}</strong>
    </div>`).join("");

  const availableFoods = dashboard.menu.filter((food) => food.available);
  byId("overview-no-menu").classList.toggle("hidden", availableFoods.length > 0);
  byId("overview-available-menu").innerHTML = availableFoods.map((food) => `
    <div class="overview-list-row">
      <div class="overview-list-copy"><strong>${escapeHtml(food.name)}</strong><small>${escapeHtml(food.stall || "Campus Stall")} · ${escapeHtml(formatCategory(food.category))}</small></div>
      <strong class="overview-list-value">${peso(food.price)}</strong>
    </div>`).join("");

  byId("overview-no-students").classList.toggle("hidden", dashboard.students.length > 0);
  byId("overview-students").innerHTML = dashboard.students.slice(0, 5).map((student) => {
    const name = student.name || "Student";
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return `<div class="student-row"><span class="student-avatar">${escapeHtml(initials)}</span><div class="student-info"><strong>${escapeHtml(name)}</strong><small class="student-email">${escapeHtml(student.email || "Student account")}</small></div></div>`;
  }).join("");

  const recentFeedback = (dashboard.feedback || []).slice(0, 3);
  byId("overview-no-feedback").classList.toggle("hidden", recentFeedback.length > 0);
  byId("overview-feedback").innerHTML = recentFeedback.map((entry) => `
    <div class="overview-list-row feedback-preview-row">
      <div class="overview-list-copy"><strong>${escapeHtml(entry.studentName || "Student")}</strong><small>${escapeHtml(entry.message)}</small></div>
      <time>${escapeHtml(entry.createdAt || "")}</time>
    </div>`).join("");
}

function render() {
  renderStats();
  renderOrders();
  renderMenu();
  renderStudents();
  renderFeedback();
  renderOverviewLists();
}

document.querySelectorAll("[data-order-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    orderStatusFilter = button.dataset.orderFilter;
    renderOrders();
  });
});
byId("menu-search").addEventListener("input", renderMenu);
byId("menu-category-filter").addEventListener("change", renderMenu);
byId("menu-stall-filter").addEventListener("change", renderMenu);
byId("student-search").addEventListener("input", renderStudents);

async function loadDashboard() {
  const response = await fetch("api/auth.php?role=admin", { headers: { Accept: "application/json" }, credentials: "same-origin" });
  const session = await response.json();
  if (!response.ok) throw new Error(session.error || "Could not verify the admin session. Check the server and database.");
  if (session.user?.role !== "admin") {
    location.replace("login.html?role=admin&next=admin.html");
    return;
  }
  const accountLabel = document.querySelector(".sidebar-bottom strong");
  if (accountLabel) accountLabel.textContent = session.user.name;
  dashboard = await requestAdmin();
  render();
  if (!dashboardPollStarted) {
    dashboardPollStarted = true;
    window.setInterval(refreshDashboardData, 5000);
    window.addEventListener("focus", refreshDashboardData);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshDashboardData();
    });
  }
}

async function refreshDashboardData() {
  if (dashboardRefreshInFlight || document.hidden) return;
  dashboardRefreshInFlight = true;
  try {
    dashboard = await requestAdmin();
    render();
    lastDashboardRefreshError = "";
  } catch (error) {
    if (error.message !== lastDashboardRefreshError) {
      notify("Could not refresh the dashboard. Check the server and database.");
      lastDashboardRefreshError = error.message;
    }
  } finally {
    dashboardRefreshInFlight = false;
  }
}

const signOutDialog = byId("sign-out-dialog");
byId("sign-out")?.addEventListener("click", () => signOutDialog?.showModal());
byId("cancel-sign-out")?.addEventListener("click", () => signOutDialog?.close());
byId("confirm-sign-out")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Signing out…";
  try {
    const response = await fetch("api/auth.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout", role: "admin" }),
    });
    if (!response.ok) throw new Error("Could not sign out. Please try again.");
    location.replace("login.html?role=admin");
  } catch (error) {
    notify(error.message || "Could not sign out. Please try again.");
    button.disabled = false;
    button.textContent = "Sign out";
  }
});

byId("admin-orders").addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-order]");
  if (deleteButton) {
    const orderCode = deleteButton.dataset.deleteOrder;
    const order = dashboard.orders.find((item) => String(item.id) === orderCode);
    if (!order) return;
    pendingOrderDeletionCode = orderCode;
    byId("delete-order-copy").textContent = `Are you sure you want to remove order #${orderCode}? This action cannot be undone.`;
    byId("delete-order-dialog").showModal();
    return;
  }
  const button = event.target.closest("[data-order]");
  if (!button || button.disabled) return;
  const order = dashboard.orders.find((item) => String(item.id) === button.dataset.order);
  if (!order) return;
  const nextStatus = order.status === "Pending" ? "Preparing" : order.status === "Preparing" ? "Ready" : order.status === "Ready" ? "Picked up" : null;
  if (!nextStatus) return;
  button.disabled = true;
  try {
    await requestAdmin("PATCH", { action: "advance-order", orderCode: order.id, nextStatus });
    orderStatusFilter = nextStatus;
    await loadDashboard();
    notify(`Order #${order.id} updated to ${nextStatus}.`);
  } catch (error) {
    notify(error.message);
    button.disabled = false;
  }
});

function closeOrderDeletionDialog() {
  byId("delete-order-dialog").close();
  pendingOrderDeletionCode = null;
}

byId("close-delete-order").addEventListener("click", closeOrderDeletionDialog);
byId("cancel-delete-order").addEventListener("click", closeOrderDeletionDialog);
byId("delete-order-dialog").addEventListener("close", () => { pendingOrderDeletionCode = null; });
byId("confirm-delete-order").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const orderCode = pendingOrderDeletionCode;
  if (!orderCode || button.disabled) return;
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    await requestAdmin("DELETE", { action: "delete-order", orderCode });
    closeOrderDeletionDialog();
    await loadDashboard();
    notify(`Order #${orderCode} removed.`);
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Remove order";
  }
});

byId("admin-menu").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-availability]");
  if (!input || input.disabled) return;
  input.disabled = true;
  try {
    await requestAdmin("PATCH", { action: "set-menu-availability", id: Number(input.dataset.availability), available: input.checked });
    await loadDashboard();
    const item = dashboard.menu.find((food) => food.id === Number(input.dataset.availability));
    notify(`${item?.name || "Menu item"} availability updated.`);
  } catch (error) {
    notify(error.message);
    await loadDashboard();
    input.disabled = false;
  }
});

byId("admin-menu").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-menu]");
  if (editButton && !editButton.disabled) {
    const item = dashboard.menu.find((food) => food.id === Number(editButton.dataset.editMenu));
    if (!item) return;
    pendingMenuEditId = item.id;
    const form = byId("edit-menu-form");
    form.elements.namedItem("id").value = item.id;
    form.elements.namedItem("name").value = item.name;
    form.elements.namedItem("price").value = Number(item.price).toFixed(2);
    const stallSelect = form.elements.namedItem("stall");
    stallSelect.value = "";
    selectMenuStall(stallSelect, item.stall || "");
    if (editMenuImagePreviewUrl) URL.revokeObjectURL(editMenuImagePreviewUrl);
    editMenuImagePreviewUrl = "";
    const editImageInput = byId("edit-menu-image");
    const editImagePreview = byId("edit-menu-image-preview");
    editImageInput.value = "";
    editImagePreview.src = TamBayts.getFoodPhoto(item) || "";
    editImagePreview.hidden = !editImagePreview.src;
    byId("edit-menu-image-title").textContent = "Drop, paste, or browse for a new photo";
    byId("edit-menu-image-name").textContent = "Paste an image with Ctrl+V · JPEG, PNG, or WebP · up to 5 MB";
    byId("edit-menu-image-dropzone").classList.remove("has-image");
    byId("edit-menu-dialog").showModal();
    return;
  }
  const button = event.target.closest("[data-remove-menu]");
  if (!button || button.disabled) return;
  const item = dashboard.menu.find((food) => food.id === Number(button.dataset.removeMenu));
  if (!item) return;
  pendingMenuRemovalId = item.id;
  byId("remove-menu-name").textContent = item.name;
  byId("remove-menu-dialog").showModal();
});

function closeMenuRemovalDialog() {
  byId("remove-menu-dialog").close();
  pendingMenuRemovalId = null;
}

byId("close-remove-menu").addEventListener("click", closeMenuRemovalDialog);
byId("cancel-remove-menu").addEventListener("click", closeMenuRemovalDialog);
byId("remove-menu-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const item = dashboard.menu.find((food) => food.id === pendingMenuRemovalId);
  if (!item) return closeMenuRemovalDialog();
  const submit = byId("confirm-remove-menu");
  if (submit.disabled) return;
  submit.disabled = true;
  submit.textContent = "Removing…";
  try {
    await requestAdmin("DELETE", { action: "delete-menu", id: item.id });
    closeMenuRemovalDialog();
    await loadDashboard();
    notify(`${item.name} removed from the menu.`);
  } catch (error) {
    notify(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Remove food";
  }
});

function closeMenuEditDialog() {
  byId("edit-menu-dialog").close();
  pendingMenuEditId = null;
}
byId("close-edit-menu").addEventListener("click", closeMenuEditDialog);
byId("cancel-edit-menu").addEventListener("click", closeMenuEditDialog);
byId("edit-menu-dialog").addEventListener("close", () => { pendingMenuEditId = null; });
byId("edit-menu-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = pendingMenuEditId;
  if (!id || form.dataset.submitting === "true") return;
  form.dataset.submitting = "true";
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  submit.textContent = "Saving…";
  try {
    const formData = new FormData(form);
    formData.set("action", "edit-menu");
    formData.set("id", String(id));
    await requestAdmin("POST", formData);
    closeMenuEditDialog();
    await loadDashboard();
    notify("Menu item updated.");
  } catch (error) {
    notify(error.message);
  } finally {
    delete form.dataset.submitting;
    submit.disabled = false;
    submit.textContent = "Save changes";
  }
});

byId("add-menu-item").addEventListener("click", () => {
  const dialog = byId("menu-item-dialog");
  if (!dialog.open) dialog.showModal();
});
byId("cancel-add-menu-item").addEventListener("click", () => byId("menu-item-dialog").close());
byId("cancel-add-menu-item-secondary").addEventListener("click", () => byId("menu-item-dialog").close());
const menuImageInput = byId("menu-image");
const menuImageDropzone = byId("menu-image-dropzone");
const menuImagePreview = byId("menu-image-preview");
let menuImagePreviewUrl = "";
const editMenuImageInput = byId("edit-menu-image");
const editMenuImageDropzone = byId("edit-menu-image-dropzone");
const editMenuImagePreview = byId("edit-menu-image-preview");
let editMenuImagePreviewUrl = "";

function selectEditMenuImage(file) {
  if (!file) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
    editMenuImageInput.value = "";
    notify("Choose a JPEG, PNG, or WebP image up to 5 MB.");
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  editMenuImageInput.files = transfer.files;
  if (editMenuImagePreviewUrl) URL.revokeObjectURL(editMenuImagePreviewUrl);
  editMenuImagePreviewUrl = URL.createObjectURL(file);
  editMenuImagePreview.src = editMenuImagePreviewUrl;
  editMenuImagePreview.hidden = false;
  byId("edit-menu-image-title").textContent = file.name;
  byId("edit-menu-image-name").textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB · click to change`;
  editMenuImageDropzone.classList.add("has-image");
}

editMenuImageDropzone.addEventListener("click", (event) => {
  if (event.target !== editMenuImageInput) editMenuImageInput.click();
});
editMenuImageDropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    editMenuImageInput.click();
  }
});
editMenuImageInput.addEventListener("change", () => selectEditMenuImage(editMenuImageInput.files[0]));
document.addEventListener("paste", (event) => {
  if (!byId("edit-menu-dialog").open) return;
  const clipboardItems = [...(event.clipboardData?.items || [])];
  const imageItem = clipboardItems.find((item) => item.kind === "file" && item.type.startsWith("image/"));
  const imageFile = imageItem?.getAsFile();
  if (!imageFile) return;
  event.preventDefault();
  const extension = imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : "jpg";
  const namedImage = new File([imageFile], `pasted-menu-photo.${extension}`, { type: imageFile.type });
  selectEditMenuImage(namedImage);
});
editMenuImageDropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  editMenuImageDropzone.classList.add("drag-over");
});
editMenuImageDropzone.addEventListener("dragleave", () => editMenuImageDropzone.classList.remove("drag-over"));
editMenuImageDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  editMenuImageDropzone.classList.remove("drag-over");
  const file = [...(event.dataTransfer?.files || [])].find((candidate) => candidate.type.startsWith("image/"));
  if (file) selectEditMenuImage(file);
  else notify("Drop an image file here, or copy an image and press Ctrl+V.");
});

function clearMenuImagePreview() {
  if (menuImagePreviewUrl) URL.revokeObjectURL(menuImagePreviewUrl);
  menuImagePreviewUrl = "";
  menuImageInput.value = "";
  menuImagePreview.removeAttribute("src");
  menuImagePreview.hidden = true;
  byId("menu-image-title").textContent = "Drop a photo here or browse";
  byId("menu-image-name").textContent = "JPEG, PNG, or WebP · up to 5 MB";
  menuImageDropzone.classList.remove("has-image");
}

function selectMenuImage(file) {
  if (!file) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
    clearMenuImagePreview();
    notify("Choose a JPEG, PNG, or WebP image up to 5 MB.");
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  menuImageInput.files = transfer.files;
  if (menuImagePreviewUrl) URL.revokeObjectURL(menuImagePreviewUrl);
  menuImagePreviewUrl = URL.createObjectURL(file);
  menuImagePreview.src = menuImagePreviewUrl;
  menuImagePreview.hidden = false;
  byId("menu-image-title").textContent = file.name;
  byId("menu-image-name").textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB · click to change`;
  menuImageDropzone.classList.add("has-image");
}

menuImageDropzone.addEventListener("click", (event) => {
  if (event.target !== menuImageInput) menuImageInput.click();
});
menuImageDropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    menuImageInput.click();
  }
});
menuImageInput.addEventListener("change", () => selectMenuImage(menuImageInput.files[0]));
menuImageDropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  menuImageDropzone.classList.add("drag-over");
});
menuImageDropzone.addEventListener("dragleave", () => menuImageDropzone.classList.remove("drag-over"));
menuImageDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  menuImageDropzone.classList.remove("drag-over");
  selectMenuImage(event.dataTransfer.files[0]);
});

byId("menu-item-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting === "true") return;
  form.dataset.submitting = "true";
  const formData = new FormData(form);
  formData.set("action", "add-menu");
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  try {
    await requestAdmin("POST", formData);
    form.reset();
    clearMenuImagePreview();
    byId("menu-item-dialog").close();
    await loadDashboard();
    notify("Menu item added.");
  } catch (error) {
    notify(error.message);
  } finally {
    delete form.dataset.submitting;
    submit.disabled = false;
  }
});

loadDashboard().catch((error) => notify(error.message));
