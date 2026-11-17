const {
  getCart, saveCart, getFavorites, saveFavorites,
  syncFavoritesToDatabase, loadFavoritesFromDatabase, peso, getFoodPhoto,
  escapeHtml, formatCategory, updateCartBadges, updateOrderBadges,
} = TamBayts;

const stallTabs = document.querySelector("#stall-tabs");
const foodGrid = document.querySelector("#stall-food-grid");
const detailDialog = document.querySelector("#food-detail-dialog");
const toast = document.querySelector("#toast");
let selectedStall = "Stall 1";
let selectedStallFoods = [];
let isStallMenuLoading = true;
let selectedFood = null;
let detailQuantity = 1;

stallTabs.addEventListener("wheel", (event) => {
  if (stallTabs.scrollWidth <= stallTabs.clientWidth) return;
  const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
  if (!horizontalDelta) return;
  event.preventDefault();
  stallTabs.scrollLeft += horizontalDelta;
}, { passive: false });

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2100);
}

function renderStallFoods() {
  const foods = selectedStallFoods.filter((food) => food.available);
  const favorites = new Set(getFavorites());
  const cart = getCart();
  document.title = `TamBayts | ${selectedStall}`;
  document.querySelector("#stall-food-title").textContent = `Foods at ${selectedStall}`;
  document.querySelector(".stall-food-section").setAttribute("aria-label", `Foods at ${selectedStall}`);
  document.querySelector("#stall-food-message").textContent = isStallMenuLoading
    ? "Loading this stall’s menu…"
    : `${foods.length} food${foods.length === 1 ? "" : "s"} available`;
  foodGrid.innerHTML = foods.length ? foods.map((food, index) => {
    const safeName = escapeHtml(food.name);
    const stallName = escapeHtml(food.stall);
    const imageUrl = getFoodPhoto(food);
    const photo = imageUrl
      ? `<img class="food-image" src="${escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy">`
      : '<span class="food-image-placeholder">Photo unavailable</span>';
    const favorite = favorites.has(food.name);
    const cartItem = cart.find((item) => item.name === food.name);
    const cartControl = cartItem
      ? `<div class="quantity-control" aria-label="Quantity for ${safeName}"><button data-decrease="${safeName}" aria-label="Remove one ${safeName}">−</button><strong>${cartItem.quantity} in cart</strong><button data-increase="${safeName}" aria-label="Add one ${safeName}">+</button></div>`
      : `<button class="add-button" data-add="${safeName}" aria-label="Add ${safeName} to cart">＋ Add</button>`;
    return `<article class="food-card" data-food-card="${safeName}" style="--card-index:${Math.min(index, 10)}"><div class="food-photo ${imageUrl ? "" : "food-photo-missing"}"><button class="food-image-trigger" type="button" data-food-open="${safeName}" aria-label="View ${safeName} details">${photo}</button></div><div class="card-body"><h2 class="food-name"><button class="food-name-trigger" type="button" data-food-open="${safeName}">${safeName}</button></h2><button class="favorite ${favorite ? "is-favorite" : ""}" type="button" data-favorite="${safeName}" aria-label="${favorite ? "Remove" : "Add"} ${safeName} ${favorite ? "from" : "to"} favorites" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button><span class="food-stall" title="${stallName}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.5 3.2 2h9.6L14 6.5M3 7v6.5h10V7M6 13.5V9h4v4.5M2 6.5a1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0"/></svg><span>${stallName}</span></span><span class="price">${peso(Number(food.price) || 0)}</span>${cartControl}</div></article>`;
  }).join("") : isStallMenuLoading
    ? '<div class="empty-results"><h2>Loading foods…</h2></div>'
    : '<div class="empty-results"><span aria-hidden="true">⌕</span><h2>No foods at this stall yet</h2><p>Choose another stall or check back later.</p></div>';
  foodGrid.classList.remove("is-animating");
  if (foods.length) {
    void foodGrid.offsetWidth;
    foodGrid.classList.add("is-animating");
  }
  updateCartBadges();
  updateOrderBadges();
}

function openFoodDetails(name) {
  const food = selectedStallFoods.find((item) => item.name === name && item.available);
  if (!food) return;
  selectedFood = food;
  detailQuantity = 1;
  const photo = document.querySelector("#food-detail-photo");
  const imageUrl = getFoodPhoto(food);
  photo.classList.toggle("food-photo-missing", !imageUrl);
  photo.innerHTML = `${imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(food.name)}">`
    : '<span class="food-image-placeholder">Photo unavailable</span>'}<span class="food-detail-stall-badge">${escapeHtml(food.stall)}</span>`;
  document.querySelector("#food-detail-stall").textContent = `${food.stall} · ${formatCategory(food.category)}`;
  document.querySelector("#food-detail-name").textContent = food.name;
  document.querySelector("#food-detail-price").textContent = peso(Number(food.price) || 0);
  const description = document.querySelector("#food-detail-description");
  description.textContent = food.description || "";
  description.hidden = !food.description;
  document.querySelector("#food-detail-count").value = detailQuantity;
  detailDialog.showModal();
}

function changeDetailQuantity(amount) {
  detailQuantity = Math.max(1, Math.min(100, detailQuantity + amount));
  document.querySelector("#food-detail-count").value = detailQuantity;
}

stallTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-stall]");
  if (!tab) return;
  selectedStall = tab.dataset.stall;
  selectedStallFoods = [];
  isStallMenuLoading = true;
  stallTabs.querySelectorAll("[data-stall]").forEach((item) => {
    const active = item === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  document.querySelector("#stall-food-panel").setAttribute("aria-labelledby", tab.id);
  renderStallFoods();
  loadStallMenu(selectedStall);
});

foodGrid.addEventListener("click", (event) => {
  const foodName = event.target.closest("[data-food-open]");
  if (foodName) return openFoodDetails(foodName.dataset.foodOpen);

  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    const name = favoriteButton.dataset.favorite;
    const favorites = getFavorites();
    const updated = favorites.includes(name) ? favorites.filter((item) => item !== name) : [...favorites, name];
    saveFavorites(updated);
    renderStallFoods();
    syncFavoritesToDatabase(updated).then(saveFavorites).catch(() => showToast("Favorite saved on this device, but could not sync."));
    showToast(updated.includes(name) ? `${name} added to favorites` : `${name} removed from favorites`);
    return;
  }

  const control = event.target.closest("[data-add], [data-increase], [data-decrease]");
  if (control?.hasAttribute("data-add")) return openFoodDetails(control.dataset.add);
  if (control) {
    const name = control.dataset.increase || control.dataset.decrease;
    const cart = getCart();
    const item = cart.find((entry) => entry.name === name);
    if (control.hasAttribute("data-increase") && item) item.quantity = Math.min(100, item.quantity + 1);
    if (control.hasAttribute("data-decrease") && item) item.quantity -= 1;
    saveCart(cart.filter((entry) => entry.quantity > 0));
    renderStallFoods();
    return;
  }

  const card = event.target.closest("[data-food-card]");
  if (card) openFoodDetails(card.dataset.foodCard);
});

document.querySelector("#food-detail-close").addEventListener("click", () => detailDialog.close());
detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
document.querySelector("#food-detail-decrease").addEventListener("click", () => changeDetailQuantity(-1));
document.querySelector("#food-detail-increase").addEventListener("click", () => changeDetailQuantity(1));
document.querySelector("#food-detail-add").addEventListener("click", () => {
  if (!selectedFood) return;
  const cart = getCart();
  const existing = cart.find((item) => item.name === selectedFood.name);
  if (existing) existing.quantity = Math.min(100, existing.quantity + detailQuantity);
  else cart.push({ name: selectedFood.name, quantity: detailQuantity });
  saveCart(cart);
  detailDialog.close();
  showToast(`${selectedFood.name} added to your cart`);
  renderStallFoods();
});

document.addEventListener("tambayts-session", async (event) => {
  try {
    await loadFavoritesFromDatabase(event.detail?.clientId);
    renderStallFoods();
  } catch {
    showToast("Favorites could not sync with the database.");
  }
});
document.addEventListener("tambayts-cart-loaded", renderStallFoods);
document.addEventListener("tambayts-cart-sync-error", (event) => showToast(event.detail?.message || "Your cart could not sync with the database."));

async function loadStallMenu(stall = selectedStall) {
  try {
    const response = await fetch(`api/menu.php?stall=${encodeURIComponent(stall)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Stall menu unavailable.");
    const result = await response.json();
    if (!Array.isArray(result.menu)) throw new Error("Stall menu unavailable.");
    if (stall !== selectedStall) return;
    selectedStallFoods = result.menu;
    isStallMenuLoading = false;
    renderStallFoods();
  } catch {
    if (stall !== selectedStall) return;
    selectedStallFoods = [];
    isStallMenuLoading = false;
    renderStallFoods();
    showToast("Could not load this stall’s menu from the database.");
  }
}

renderStallFoods();
loadStallMenu();
