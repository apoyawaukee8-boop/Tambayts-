(() => {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  const items = [...nav.querySelectorAll(".nav-item")];
  const currentFile = location.pathname.split("/").pop() || "index.html";
  const favoriteView = currentFile === "favorites.html"
    || (currentFile === "profile.html" && new URLSearchParams(location.search).get("view") === "favorites");
  const activeLabel = favoriteView
    ? "Favorites"
    : ({
        "stalls.html": "Stalls",
        "profile.html": "Profile",
        "orders.html": "Orders",
        "cart.html": "Cart",
      }[currentFile] || "Foods");

  items.forEach((item) => {
    const active = item.getAttribute("aria-label") === activeLabel;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  const toggle = nav.querySelector(".nav-toggle");
  const desktop = window.matchMedia("(min-width: 1100px)");
  const setCollapsed = (collapsed, persist = false) => {
    document.body.classList.toggle("nav-collapsed", collapsed && desktop.matches);
    toggle?.setAttribute("aria-expanded", String(!collapsed));
    toggle?.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
    toggle?.setAttribute("title", collapsed ? "Expand navigation" : "Collapse navigation");
    if (persist) {
      try { localStorage.setItem("tambayts-nav-collapsed", String(collapsed)); } catch {}
    }
  };

  let savedCollapsed = false;
  try { savedCollapsed = localStorage.getItem("tambayts-nav-collapsed") === "true"; } catch {}
  setCollapsed(savedCollapsed);
  toggle?.addEventListener("click", () => {
    setCollapsed(!document.body.classList.contains("nav-collapsed"), true);
  });
  desktop.addEventListener("change", () => {
    let collapsed = false;
    try { collapsed = localStorage.getItem("tambayts-nav-collapsed") === "true"; } catch {}
    setCollapsed(collapsed);
  });
})();
