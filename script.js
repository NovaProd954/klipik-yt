(() => {
  const state = {
    currentView: 'onboarding',
    isMobile: window.matchMedia('(max-width: 900px)').matches,
    viewStatus: {},
  };

  const views = Array.from(document.querySelectorAll('.view'));
  const mobileTabs = Array.from(document.querySelectorAll('[data-mobile-view]'));
  const notificationEntry = document.getElementById('notificationEntry');
  const toastHost = document.getElementById('toastHost');

  const validViews = new Set([
    'onboarding', 'auth', 'home', 'shorts', 'player', 'creator', 'search', 'notifications', 'upload', 'library', 'settings'
  ]);

  function setViewStatus(viewName, status = 'empty') {
    const view = document.querySelector(`.view[data-view="${viewName}"]`);
    if (!view) return;
    state.viewStatus[viewName] = status;
    view.querySelectorAll('.state').forEach((el) => el.classList.remove('is-visible'));
    const statusEl = view.querySelector(`.state-${status}`);
    if (statusEl) statusEl.classList.add('is-visible');
  }

  function renderView() {
    views.forEach((v) => {
      const active = v.dataset.view === state.currentView;
      v.hidden = !active;
      v.classList.toggle('is-active', active);
    });

    mobileTabs.forEach((tab) => {
      const isActive = tab.dataset.mobileView === state.currentView;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastHost.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function switchView(nextView) {
    if (!validViews.has(nextView)) {
      showToast(`Route "${nextView}" is not available yet.`);
      return;
    }
    state.currentView = nextView;
    setViewStatus(nextView, state.viewStatus[nextView] || 'empty');
    renderView();
  }

  function switchDesktopView(nextView) {
    if (state.isMobile) return;
    switchView(nextView);
  }

  function switchMobileView(nextView) {
    if (!state.isMobile) return;
    if (nextView === 'subscriptions') {
      showToast('Subscriptions route is a placeholder in this shell.');
      return;
    }
    switchView(nextView);
  }

  function bindEvents() {
    mobileTabs.forEach((tab) => {
      tab.addEventListener('click', () => switchMobileView(tab.dataset.mobileView));
    });

    notificationEntry.addEventListener('click', () => {
      state.isMobile ? switchMobileView('notifications') : switchDesktopView('notifications');
    });

    window.matchMedia('(max-width: 900px)').addEventListener('change', (e) => {
      state.isMobile = e.matches;
      renderView();
    });
  }

  function init() {
    views.forEach((v) => setViewStatus(v.dataset.view, 'empty'));
    bindEvents();
    renderView();
  }

  window.appNavigation = {
    get currentView() { return state.currentView; },
    switchView,
    switchDesktopView,
    switchMobileView,
    setViewStatus,
  };

  init();
})();
