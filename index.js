const { getAdminFoods, getCart, saveCart, getFavorites, saveFavorites, syncFavoritesToDatabase, loadFavoritesFromDatabase, peso, getFoodPhoto, escapeHtml, formatCategory, updateCartBadges, updateOrderBadges, pulseCartBadges } = TamBayts;
const grid = document.querySelector("#food-grid");
const search = document.querySelector("#food-search");
const toast = document.querySelector("#toast");
const foodDetailDialog = document.querySelector("#food-detail-dialog");
let selectedDetailFood = null;
let detailQuantity = 1;
let currentCategory = "all";
let priceSort = "default";
const requestedStall = new URLSearchParams(location.search).get("stall") || "";
const currentStall = /^Stall [1-7]$/.test(requestedStall) ? requestedStall : "";
function renderCategories(foods) {
  const available = [...new Set(foods.map((food) => String(food.category).toLowerCase()))];
  const preferred = ["meals", "add_ons", "drinks", "snacks", "healthy", "pasta"];
  const categories = [...preferred.filter((category) => available.includes(category)), ...available.filter((category) => !preferred.includes(category)).sort()];
  const labelFor = formatCategory;
  document.querySelector(".category-row").innerHTML = [
    `<button class="category ${currentCategory === "all" ? "active" : ""}" data-category="all"><span>All</span></button>`,
    ...categories.map((category) => `<button class="category ${currentCategory === category ? "active" : ""}" data-category="${escapeHtml(category)}"><span>${escapeHtml(labelFor(category))}</span></button>`),
  ].join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2000);
}
function showFoodDetails(name) {
  const food = getAdminFoods().find((item) => item.name === name && item.available);
  if (!food || !foodDetailDialog) return;
  selectedDetailFood = food;
  detailQuantity = 1;
  const photo = document.querySelector("#food-detail-photo");
  const imageUrl = getFoodPhoto(food);
  photo.classList.toggle("food-photo-missing", !imageUrl);
  photo.innerHTML = `${imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(food.name)}">`
    : '<span class="food-image-placeholder">Photo unavailable</span>'}<span class="food-detail-stall-badge">${escapeHtml(food.stall || "Campus pick")}</span>`;
  document.querySelector("#food-detail-stall").textContent = `${food.stall || "Campus pick"} · ${formatCategory(food.category)}`;
  document.querySelector("#food-detail-name").textContent = food.name;
  document.querySelector("#food-detail-price").textContent = peso(Number(food.price) || 0);
  const description = document.querySelector("#food-detail-description");
  description.textContent = food.description || "";
  description.hidden = !food.description;
  document.querySelector("#food-detail-count").value = detailQuantity;
  foodDetailDialog.showModal();
}
function updateDetailQuantity(change) {
  detailQuantity = Math.max(1, Math.min(100, detailQuantity + change));
  document.querySelector("#food-detail-count").value = detailQuantity;
}
async function refreshFavoritesFromDatabase(clientId) {
  try {
    await loadFavoritesFromDatabase(clientId);
    renderFood();
  } catch {
    showToast("Favorites could not sync with the database. Your saved foods remain on this device.");
  }
}
function renderFood(animate = false) {
  const term = search.value.trim().toLowerCase();
  const cart = getCart();
  const favorites = new Set(getFavorites());
  const menuTitle = document.querySelector("#recommended-title");
  const categoryTitle = currentCategory === "all"
    ? "Foods"
    : formatCategory(currentCategory).replace(/\b\w/g, (letter) => letter.toUpperCase());
  const pageTitle = `${currentStall ? `${currentStall} · ` : ""}${term ? "Search Results" : categoryTitle}`;
  if (menuTitle) menuTitle.textContent = pageTitle;
  document.title = `TamBayts | ${pageTitle}`;
  let shown = getAdminFoods().filter((food) => food.available && (!currentStall || food.stall === currentStall) && (currentCategory === "all" || food.category === currentCategory) && food.name.toLowerCase().includes(term));
  if (priceSort === "low") shown = [...shown].sort((first, second) => Number(first.price) - Number(second.price));
  if (priceSort === "high") shown = [...shown].sort((first, second) => Number(second.price) - Number(first.price));
  const sortDescription = priceSort === "low" ? " · sorted by lowest price" : priceSort === "high" ? " · sorted by highest price" : "";
  document.querySelector("#results-message").textContent = term
    ? `${shown.length} result${shown.length === 1 ? "" : "s"} for “${search.value.trim()}”${currentStall ? ` at ${currentStall}` : ""}${sortDescription}`
    : currentStall && priceSort === "default" ? `Showing foods at ${currentStall}`
    : priceSort === "low" ? "Sorted by lowest price" : priceSort === "high" ? "Sorted by highest price" : "";
  grid.innerHTML = shown.length ? shown.map((food, index) => {
    const item = cart.find((cartItem) => cartItem.name === food.name);
    const isFavorite = favorites.has(food.name);
    const safeName = escapeHtml(food.name);
    const imageUrl = getFoodPhoto(food);
    const foodImage = imageUrl
      ? `<img class="food-image" src="${escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" onerror="const p=this.parentElement;this.remove();p.classList.add('food-photo-missing');const s=document.createElement('span');s.className='food-image-placeholder';s.textContent='Photo unavailable';p.prepend(s)">`
      : '<span class="food-image-placeholder">Photo unavailable</span>';
    const quantityControl = item
      ? `<div class="quantity-control" aria-label="Quantity for ${safeName}"><button data-decrease="${safeName}" aria-label="Remove one ${safeName}">−</button><strong>${item.quantity} in cart</strong><button data-increase="${safeName}" aria-label="Add one ${safeName}">+</button></div>`
      : `<button class="add-button" data-add="${safeName}" aria-label="Add ${safeName} to cart">＋ Add</button>`;
    const stallName = escapeHtml(food.stall || "Campus pick");
    return `<article class="food-card ${item ? "is-added" : ""}" data-food-card="${safeName}" style="--card-index:${Math.min(index, 10)}"><div class="food-photo ${imageUrl ? "" : "food-photo-missing"}"><button class="food-image-trigger" type="button" data-food-open="${safeName}" aria-label="View ${safeName} details">${foodImage}</button></div><div class="card-body"><h2 class="food-name"><button class="food-name-trigger" type="button" data-food-open="${safeName}">${safeName}</button></h2><button class="favorite ${isFavorite ? "is-favorite" : ""}" data-favorite="${safeName}" aria-label="${isFavorite ? "Remove" : "Add"} ${safeName} ${isFavorite ? "from" : "to"} favorites" aria-pressed="${isFavorite}">${isFavorite ? "★" : "☆"}</button><span class="food-stall" title="${stallName}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.5 3.2 2h9.6L14 6.5M3 7v6.5h10V7M6 13.5V9h4v4.5M2 6.5a1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0"/></svg><span>${stallName}</span></span><span class="price">${peso(Number(food.price) || 0)}</span>${quantityControl}</div></article>`;
  }).join("") : '<div class="empty-results"><span aria-hidden="true">⌕</span><h2>No food found</h2><p>Try another search or clear the filters.</p><button type="button" data-reset-search>Clear search &amp; filters</button></div>';
  grid.classList.remove("is-animating");
  if (animate && shown.length) {
    void grid.offsetWidth;
    grid.classList.add("is-animating");
  }
  updateCartBadges();
  updateOrderBadges();
}
async function loadDatabaseMenu() {
  try {
    const response = await fetch("api/menu.php", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const result = await response.json();
    if (!Array.isArray(result.menu)) return;
    TamBayts.saveAdminFoods(result.menu);
    renderCategories(result.menu);
    renderFood(true);
  } catch {}
}
document.querySelector(".category-row").addEventListener("click", (event) => {
  const button = event.target.closest(".category");
  if (!button) return;
  currentCategory = button.dataset.category;
  document.querySelectorAll(".category").forEach((category) => category.classList.toggle("active", category === button));
  renderFood(true);
});
document.querySelector("#filter-button").addEventListener("click", () => {
  priceSort = priceSort === "default" ? "low" : priceSort === "low" ? "high" : "default";
  const labels = {
    default: "Sort by price <span>⌄</span>",
    low: "Lowest price <span>↑</span>",
    high: "Highest price <span>↓</span>",
  };
  document.querySelector("#filter-button").innerHTML = labels[priceSort];
  renderFood(true);
});
grid.addEventListener("click", (event) => {
  const detailTrigger = event.target.closest("[data-food-open]");
  if (detailTrigger) {
    showFoodDetails(detailTrigger.dataset.foodOpen);
    return;
  }
  const resetButton = event.target.closest("[data-reset-search]");
  if (resetButton) {
    currentCategory = "all";
    priceSort = "default";
    search.value = "";
    document.querySelector("#filter-button").innerHTML = "Sort by price <span>⌄</span>";
    renderCategories(getAdminFoods());
    renderFood(true);
    search.focus();
    return;
  }
  const favorite = event.target.closest("[data-favorite]");
  const control = event.target.closest("[data-add], [data-increase], [data-decrease]");
  if (favorite) {
    const favorites = getFavorites();
    const name = favorite.dataset.favorite;
    const isFavorite = !favorites.includes(name);
    const updatedFavorites = isFavorite ? [...favorites, name] : favorites.filter((item) => item !== name);
    saveFavorites(updatedFavorites);
    syncFavoritesToDatabase(updatedFavorites).then(saveFavorites).then(() => renderFood()).catch(() => showToast("Favorite saved here, but could not sync with the database."));
    renderFood();
    showToast(isFavorite ? `${name} added to favorites` : `${name} removed from favorites`);
    [...grid.querySelectorAll("[data-favorite]")].find((button) => button.dataset.favorite === name)?.classList.add("is-bumping");
    setTimeout(() => grid.querySelector(".favorite.is-bumping")?.classList.remove("is-bumping"), 420);
  }
  if (!control) {
    const card = event.target.closest("[data-food-card]");
    if (card && !favorite) showFoodDetails(card.dataset.foodCard);
    return;
  }
  if (control.hasAttribute("data-add")) {
    showFoodDetails(control.dataset.add);
    return;
  }
  const name = control.dataset.add || control.dataset.increase || control.dataset.decrease;
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.name === name);
  const isDecrease = control.hasAttribute("data-decrease");
  if (isDecrease && item) item.quantity -= 1;
  else if (item) item.quantity += 1;
  else cart.push({ name, quantity: 1 });
  saveCart(cart.filter((cartItem) => cartItem.quantity > 0));
  showToast(control.hasAttribute("data-add") ? `${name} added to your cart` : isDecrease && item?.quantity === 0 ? `${name} removed from your cart` : `${name} quantity updated`);
  renderFood();
  pulseCartBadges();
});
search.addEventListener("input", renderFood);
document.querySelector("#food-detail-close").addEventListener("click", () => foodDetailDialog.close());
foodDetailDialog.addEventListener("click", (event) => {
  if (event.target === foodDetailDialog) foodDetailDialog.close();
});
document.querySelector("#food-detail-decrease").addEventListener("click", () => updateDetailQuantity(-1));
document.querySelector("#food-detail-increase").addEventListener("click", () => updateDetailQuantity(1));
document.querySelector("#food-detail-add").addEventListener("click", () => {
  if (!selectedDetailFood) return;
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.name === selectedDetailFood.name);
  if (item) item.quantity = Math.min(100, item.quantity + detailQuantity);
  else cart.push({ name: selectedDetailFood.name, quantity: detailQuantity });
  saveCart(cart);
  updateCartBadges();
  foodDetailDialog.close();
  showToast(`${selectedDetailFood.name} added to your cart`);
  renderFood();
});
renderCategories(getAdminFoods());
renderFood(true);
loadDatabaseMenu();
document.addEventListener("tambayts-session", (event) => refreshFavoritesFromDatabase(event.detail?.clientId));
document.addEventListener("tambayts-cart-loaded", () => { updateCartBadges(); renderFood(); });
document.addEventListener("tambayts-cart-sync-error", (event) => showToast(event.detail?.message || "Your cart could not sync with the database."));
fetch("api/auth.php?role=student", { headers: { Accept: "application/json" }, credentials: "same-origin" })
  .then((response) => response.ok ? response.json() : null)
  .then((result) => {
    if (result?.user?.role === "student") {
      document.dispatchEvent(new CustomEvent("tambayts-session", { detail: result.user }));
    }
  })
  .catch(() => {});
