let documentClickHandler: ((e: MouseEvent) => void) | null = null

function setupBaseViewSelector() {
  const selectors = document.querySelectorAll("[data-base-view-selector]")

  if (selectors.length === 0) return

  if (!documentClickHandler) {
    documentClickHandler = (e: MouseEvent) => {
      document.querySelectorAll("[data-base-view-selector]").forEach((selector) => {
        if (selector.contains(e.target as Node)) return
        const trigger = selector.querySelector(".text-icon-button") as HTMLElement | null
        if (trigger?.getAttribute("aria-expanded") === "true") {
          selector.dispatchEvent(new CustomEvent("close-dropdown"))
        }
      })
    }
    document.addEventListener("click", documentClickHandler)
    window.addCleanup(() => {
      if (documentClickHandler) {
        document.removeEventListener("click", documentClickHandler)
        documentClickHandler = null
      }
    })
  }

  selectors.forEach((selector) => {
    if (selector.hasAttribute("data-initialized")) return
    selector.setAttribute("data-initialized", "true")

    const triggerEl = selector.querySelector(".text-icon-button") as HTMLElement | null
    const searchInputEl = selector.querySelector("[data-search-input]") as HTMLInputElement | null
    const clearButtonEl = selector.querySelector("[data-clear-search]") as HTMLElement | null
    const viewListEl = selector.querySelector("[data-view-list]") as HTMLElement | null

    if (!triggerEl || !searchInputEl || !clearButtonEl || !viewListEl) return

    const trigger = triggerEl
    const searchInput = searchInputEl
    const clearButton = clearButtonEl
    const viewList = viewListEl

    function toggleDropdown() {
      if (trigger.getAttribute("aria-expanded") === "true") {
        closeDropdown()
        return
      }
      openDropdown()
    }

    function openDropdown() {
      trigger.setAttribute("aria-expanded", "true")
      trigger.classList.add("has-active-menu")
      setTimeout(() => searchInput.focus(), 10)
    }

    function closeDropdown() {
      trigger.setAttribute("aria-expanded", "false")
      trigger.classList.remove("has-active-menu")
      searchInput.value = ""
      clearButton.hidden = true
      filterViews("")
    }

    function filterViews(query: string) {
      const items = viewList.querySelectorAll<HTMLElement>(".bases-toolbar-menu-item")
      const lowerQuery = query.toLowerCase()

      items.forEach((item) => {
        const viewName = (item.getAttribute("data-view-name") || "").toLowerCase()
        const viewType = (item.getAttribute("data-view-type") || "").toLowerCase()
        const matches = viewName.includes(lowerQuery) || viewType.includes(lowerQuery)
        item.style.display = matches ? "" : "none"
      })
    }

    function handleSearchInput() {
      const query = searchInput.value
      filterViews(query)
      clearButton.hidden = query.length === 0
    }

    function clearSearch() {
      searchInput.value = ""
      clearButton.hidden = true
      filterViews("")
      searchInput.focus()
    }

    const handleTriggerClick = (e: MouseEvent) => {
      e.stopPropagation()
      toggleDropdown()
    }

    const handleTriggerKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        toggleDropdown()
      }
    }

    const handleSearchKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchInput.value) {
          clearSearch()
        } else {
          closeDropdown()
        }
      }
    }

    const handleClearClick = (e: MouseEvent) => {
      e.stopPropagation()
      clearSearch()
    }

    trigger.addEventListener("click", handleTriggerClick)
    trigger.addEventListener("keydown", handleTriggerKeydown)
    searchInput.addEventListener("input", handleSearchInput)
    searchInput.addEventListener("keydown", handleSearchKeydown)
    clearButton.addEventListener("click", handleClearClick)

    const viewLinks = viewList.querySelectorAll(".bases-toolbar-menu-item")
    viewLinks.forEach((link) => {
      link.addEventListener("click", closeDropdown)
      window.addCleanup(() => link.removeEventListener("click", closeDropdown))
    })

    selector.addEventListener("close-dropdown", closeDropdown)

    window.addCleanup(() => {
      trigger.removeEventListener("click", handleTriggerClick)
      trigger.removeEventListener("keydown", handleTriggerKeydown)
      searchInput.removeEventListener("input", handleSearchInput)
      searchInput.removeEventListener("keydown", handleSearchKeydown)
      clearButton.removeEventListener("click", handleClearClick)
      selector.removeEventListener("close-dropdown", closeDropdown)
      selector.removeAttribute("data-initialized")
      closeDropdown()
    })
  })
}

document.addEventListener("nav", setupBaseViewSelector)
