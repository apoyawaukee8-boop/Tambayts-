window.TamBayts = (() => {
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const categoryLabels = {
    meals: "Rice meals",
    add_ons: "Add Ons",
    drinks: "Drinks",
    snacks: "Snacks",
    healthy: "Healthy",
    pasta: "Pasta",
  };
  const formatCategory = (category) => {
    const value = String(category ?? "").trim().toLowerCase();
    return categoryLabels[value] || value.replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const read = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  const readArray = (key, fallback) => {
    const value = read(key, fallback);
    return Array.isArray(value) ? value : fallback;
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let favoritesSyncQueue = Promise.resolve();
  let favoritesClientId = "";
  let cartClientId = "";
  let cartLoadedClientId = "";
  let cartLoadingClientId = "";
  let cartLoadPromise = null;
  let cartSyncQueue = Promise.resolve();
  const favoritesStorageKey = () => favoritesClientId
    ? `tambayts-favorites-${favoritesClientId}`
    : "tambayts-favorites-guest";
  const cartStorageKey = () => cartClientId ? `tambayts-cart-${cartClientId}` : "tambayts-cart";
  document.addEventListener("tambayts-session", (event) => {
    if (event.detail?.role === "student" && event.detail.clientId) {
      favoritesClientId = event.detail.clientId;
      loadCartFromDatabase(event.detail.clientId).catch(() => {});
    }
  });
  const syncFavoritesToDatabase = (favorites) => {
    const update = async () => {
      const response = await fetch("api/favorites.php", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ favorites }),
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.favorites)) throw new Error(result.error || "Could not save favorites.");
      return result.favorites;
    };
    favoritesSyncQueue = favoritesSyncQueue.catch(() => {}).then(update);
    return favoritesSyncQueue;
  };
  const loadFavoritesFromDatabase = async (clientId) => {
    if (clientId) favoritesClientId = clientId;
    const response = await fetch("api/favorites.php", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.favorites)) throw new Error(result.error || "Could not load favorites.");
    write(favoritesStorageKey(), result.favorites);
    return result.favorites;
  };
  const getCart = () => readArray(cartStorageKey(), []).map((item) =>
    typeof item === "string" ? { name: item, quantity: 1 } :
      item && typeof item.name === "string" ? { name: item.name, quantity: Math.max(1, Number(item.quantity) || 1) } : null,
  ).filter(Boolean);
  const syncCartToDatabase = (items) => {
    const update = async () => {
      const response = await fetch("api/cart.php", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items }),
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.items)) throw new Error(result.error || "Could not save cart.");
      return result.items;
    };
    cartSyncQueue = cartSyncQueue.catch(() => {}).then(update);
    return cartSyncQueue;
  };
  const loadCartFromDatabase = (clientId) => {
    if (!clientId) return Promise.resolve(getCart());
    cartClientId = clientId;
    if (cartLoadedClientId === clientId) return Promise.resolve(getCart());
    if (cartLoadingClientId === clientId && cartLoadPromise) return cartLoadPromise;
    cartLoadingClientId = clientId;
    cartLoadPromise = (async () => {
      try {
        const response = await fetch("api/cart.php", { headers: { Accept: "application/json" }, credentials: "same-origin" });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.items)) throw new Error(result.error || "Could not load cart.");
        const accountCart = readArray(cartStorageKey(), []);
        const guestCart = readArray("tambayts-cart", []);
        const items = result.items.length ? result.items : accountCart.length ? accountCart : guestCart;
        write(cartStorageKey(), items);
        localStorage.removeItem("tambayts-cart");
        cartLoadedClientId = clientId;
        if (!result.items.length && items.length) await syncCartToDatabase(items);
        document.dispatchEvent(new CustomEvent("tambayts-cart-loaded", { detail: { items } }));
        return items;
      } catch (error) {
        document.dispatchEvent(new CustomEvent("tambayts-cart-sync-error", { detail: { message: error.message } }));
        throw error;
      } finally {
        cartLoadingClientId = "";
        cartLoadPromise = null;
      }
    })();
    return cartLoadPromise;
  };
  const saveCart = (value) => {
    write(cartStorageKey(), value);
    if (cartClientId) syncCartToDatabase(value).catch((error) => {
      document.dispatchEvent(new CustomEvent("tambayts-cart-sync-error", { detail: { message: error.message } }));
    });
  };
  const getOrders = () => readArray("tambayts-orders", []);
  const updateOrderBadges = () => {
    const count = getOrders().filter((order) => !["Picked up", "Completed", "Cancelled"].includes(order.status)).length;
    document.querySelectorAll(".order-badge").forEach((badge) => {
      badge.textContent = count > 0 ? count : "";
      badge.hidden = count === 0;
    });
  };
  const updateCartBadges = () => {
    const count = getCart().reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll(".cart-badge, .cart-count").forEach((badge) => {
      badge.textContent = count > 0 ? count : "";
      badge.classList.toggle("has-items", count > 0);
      badge.hidden = count === 0;
    });
  };
  const pulseCartBadges = () => {
    document.querySelectorAll(".cart-badge, .cart-count").forEach((badge) => {
      badge.classList.remove("is-bumping");
      void badge.offsetWidth;
      badge.classList.add("is-bumping");
      setTimeout(() => badge.classList.remove("is-bumping"), 420);
    });
  };
  return {
    escapeHtml,
    formatCategory,
    getFoodPhoto: (food) => food?.imageUrl || "",
    peso: (amount) => `₱${amount}`,
    getCart,
    updateCartBadges,
    pulseCartBadges,
    updateOrderBadges,
    saveCart,
    loadCartFromDatabase,
    getFavorites: () => readArray(favoritesStorageKey(), []),
    saveFavorites: (value) => write(favoritesStorageKey(), value),
    syncFavoritesToDatabase,
    loadFavoritesFromDatabase,
    getOrders,
    saveOrders: (value) => { write("tambayts-orders", value); updateOrderBadges(); },
    getProfile: () => read("tambayts-profile", { name: "", course: "", gender: "" }),
    saveProfile: (value) => write("tambayts-profile", value),
    getAdminFoods: () => readArray("tambayts-menu", []).map((food) => ({ available: true, ...food })),
    saveAdminFoods: (value) => write("tambayts-menu", value),
  };
})();
