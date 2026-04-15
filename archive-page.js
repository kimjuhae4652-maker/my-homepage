(function () {
  const config = window.APP_CONFIG;

  if (!config) {
    throw new Error("APP_CONFIG is missing. Check config.js.");
  }

  const state = {
    uiLanguage: getInitialLanguage(),
    archiveItems: [],
    supabaseClient: null,
    feedbackType: null,
    feedbackKey: null,
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindEvents();
    applyLanguage(state.uiLanguage);
    initialiseSupabase();
    await loadArchive();
  }

  function cacheDom() {
    dom.root = document.documentElement;
    dom.copyNodes = Array.from(document.querySelectorAll("[data-copy]"));
    dom.languageButtons = Array.from(document.querySelectorAll("[data-lang-switch]"));
    dom.count = document.getElementById("archive-wall-count");
    dom.list = document.getElementById("archive-wall-list");
    dom.setup = document.getElementById("archive-wall-setup");
    dom.feedback = document.getElementById("archive-wall-feedback");
  }

  function bindEvents() {
    dom.languageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextLanguage = button.dataset.langSwitch;
        if (!isValidLanguage(nextLanguage) || nextLanguage === state.uiLanguage) {
          return;
        }

        state.uiLanguage = nextLanguage;
        applyLanguage(nextLanguage);
        renderArchive();
      });
    });
  }

  function applyLanguage(language) {
    dom.root.lang = language;
    document.title = `${getProjectName(language)} - ${getCopy(language).archivePageTitle}`;

    dom.copyNodes.forEach((node) => {
      const key = node.dataset.copy;
      const value = getUiText(key, language);
      if (value) {
        node.textContent = value;
      }
    });

    dom.languageButtons.forEach((button) => {
      const isActive = button.dataset.langSwitch === language;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    updateCount(state.archiveItems.length);

    if (!dom.setup.classList.contains("is-hidden")) {
      showSetupNotice();
    }

    if (!dom.feedback.classList.contains("is-hidden") && state.feedbackKey) {
      showFeedback(state.feedbackType, getCopy(language)[state.feedbackKey], state.feedbackKey);
    }
  }

  function initialiseSupabase() {
    if (!isSupabaseConfigured() || !window.supabase || !window.supabase.createClient) {
      return;
    }

    state.supabaseClient = window.supabase.createClient(
      config.supabase.url,
      config.supabase.anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }

  async function loadArchive() {
    showFeedback("info", getCopy(state.uiLanguage).archiveLoading, "archiveLoading");

    if (!state.supabaseClient) {
      state.archiveItems = [...config.demoEntries];
      showSetupNotice();
      renderArchive();
      return;
    }

    try {
      const { data, error } = await state.supabaseClient
        .from(config.supabase.table)
        .select("*")
        .eq("status", "visible")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      state.archiveItems = Array.isArray(data) ? data : [];
      hideSetupNotice();
      hideFeedback();
      renderArchive();
    } catch (error) {
      console.error(error);
      state.archiveItems = [];
      hideSetupNotice();
      showFeedback("error", getCopy(state.uiLanguage).archiveError, "archiveError");
      renderArchive();
    }
  }

  function renderArchive() {
    updateCount(state.archiveItems.length);

    if (!state.archiveItems.length) {
      dom.list.innerHTML = `<div class="archive-wall__empty">${getCopy(state.uiLanguage).archivePageEmpty}</div>`;
      return;
    }

    dom.list.innerHTML = state.archiveItems.map(renderArchiveCard).join("");
  }

  function renderArchiveCard(item) {
    const copy = getCopy(state.uiLanguage);
    const authorName = item.is_anonymous || !item.author_name
      ? copy.authorAnonymous
      : item.author_name;
    const localeLabel = item.locale === "ko" ? copy.filterLocaleKo : copy.filterLocaleEn;
    const dateLabel = formatDate(item.created_at);
    const tagsMarkup = (item.tags || [])
      .map((tagId) => {
        const tagConfig = config.tags.find((tag) => tag.id === tagId);
        const label = tagConfig ? tagConfig.label[state.uiLanguage] : tagId;
        return `<span class="tag">${escapeHtml(label)}</span>`;
      })
      .join("");
    const imageMarkup = item.image_url
      ? `
        <div class="archive-card__image">
          <img src="${escapeAttribute(item.image_url)}" alt="">
        </div>
      `
      : "";

    return `
      <article class="archive-card">
        <div class="archive-card__meta">
          <span>${escapeHtml(localeLabel)}</span>
          <span>${escapeHtml(authorName)}</span>
          <span>${escapeHtml(dateLabel)}</span>
        </div>
        <p class="archive-card__body">${escapeHtml(item.body)}</p>
        ${imageMarkup}
        <div class="archive-card__footer">
          <div class="archive-card__tags">${tagsMarkup}</div>
        </div>
      </article>
    `;
  }

  function updateCount(count) {
    dom.count.textContent = interpolate(getCopy(state.uiLanguage).archivePageCount, {
      count: String(count),
    });
  }

  function showSetupNotice() {
    dom.setup.textContent = getCopy(state.uiLanguage).archiveSetupNotice;
    dom.setup.classList.remove("is-hidden");
    hideFeedback();
  }

  function hideSetupNotice() {
    dom.setup.classList.add("is-hidden");
  }

  function showFeedback(type, message, key) {
    state.feedbackType = type;
    state.feedbackKey = key || null;
    dom.feedback.textContent = message;
    dom.feedback.classList.remove("is-hidden");
  }

  function hideFeedback() {
    state.feedbackType = null;
    state.feedbackKey = null;
    dom.feedback.classList.add("is-hidden");
  }

  function getCopy(language) {
    return config.translations[language] || config.translations.ko;
  }

  function getProjectName(language) {
    return config.projectName[language] || config.projectName.ko;
  }

  function getUiText(key, language) {
    if (key === "brandName" || key === "pageTitle") {
      return getProjectName(language);
    }

    return getCopy(language)[key];
  }

  function isSupabaseConfigured() {
    return (
      typeof config.supabase.url === "string" &&
      typeof config.supabase.anonKey === "string" &&
      config.supabase.url.includes("supabase.co") &&
      !config.supabase.url.includes("YOUR_PROJECT") &&
      !config.supabase.anonKey.includes("YOUR_PUBLIC")
    );
  }

  function isValidLanguage(language) {
    return language === "ko" || language === "en";
  }

  function getInitialLanguage() {
    const browserLanguage =
      typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
    return browserLanguage.startsWith("ko") ? "ko" : "en";
  }

  function formatDate(dateString) {
    const locale = state.uiLanguage === "ko" ? "ko-KR" : "en-US";
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(dateString));
  }

  function interpolate(template, values) {
    return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }
})();
