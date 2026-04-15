(function () {
  const config = window.APP_CONFIG;

  if (!config) {
    throw new Error("APP_CONFIG is missing. Check config.js.");
  }

  const state = {
    uiLanguage: getInitialLanguage(),
    archiveItems: [],
    filters: {
      locale: "all",
      tag: "all",
      query: "",
    },
    supabaseClient: null,
    usingDemoData: false,
    submitting: false,
    archiveFeedbackType: null,
    archiveFeedbackKey: null,
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindEvents();
    renderStaticStructure();
    applyLanguage(state.uiLanguage);
    initialiseSupabase();
    await loadArchive();
  }

  function cacheDom() {
    dom.root = document.documentElement;
    dom.copyNodes = Array.from(document.querySelectorAll("[data-copy]"));
    dom.copyHtmlNodes = Array.from(document.querySelectorAll("[data-copy-html]"));
    dom.languageButtons = Array.from(document.querySelectorAll("[data-lang-switch]"));
    dom.localeFilter = document.getElementById("locale-filter");
    dom.tagFilter = document.getElementById("tag-filter");
    dom.searchInput = document.getElementById("search-input");
    dom.archiveCount = document.getElementById("archive-count");
    dom.archiveList = document.getElementById("archive-list");
    dom.archiveFeedback = document.getElementById("archive-feedback");
    dom.setupBanner = document.getElementById("setup-banner");
    dom.form = document.getElementById("manifesto-form");
    dom.bodyInput = document.getElementById("body-input");
    dom.bodyCount = document.getElementById("body-count");
    dom.submissionLocale = document.getElementById("submission-locale");
    dom.authorInput = document.getElementById("author-input");
    dom.anonymousInput = document.getElementById("anonymous-input");
    dom.tagOptions = document.getElementById("tag-options");
    dom.imageInput = document.getElementById("image-input");
    dom.imageHelp = document.getElementById("image-help");
    dom.honeypotInput = document.getElementById("website-input");
    dom.formStatus = document.getElementById("form-status");
    dom.submitButton = document.getElementById("submit-button");
  }

  function bindEvents() {
    dom.languageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextLanguage = button.dataset.langSwitch;
        if (!isValidUiLanguage(nextLanguage) || nextLanguage === state.uiLanguage) {
          return;
        }
        state.uiLanguage = nextLanguage;
        applyLanguage(nextLanguage);
        renderArchive();
      });
    });

    dom.localeFilter.addEventListener("change", (event) => {
      state.filters.locale = event.target.value;
      renderArchive();
    });

    dom.tagFilter.addEventListener("change", (event) => {
      state.filters.tag = event.target.value;
      renderArchive();
    });

    dom.searchInput.addEventListener("input", (event) => {
      state.filters.query = event.target.value.trim();
      renderArchive();
    });

    dom.bodyInput.addEventListener("input", updateBodyCount);
    dom.imageInput.addEventListener("change", updateImageHelp);
    dom.form.addEventListener("submit", handleSubmit);
  }

  function renderStaticStructure() {
    renderFilterOptions();
    renderLocaleOptions();
    renderTagOptions();
    updateBodyCount();
  }

  function applyLanguage(language) {
    const copy = getCopy(language);
    dom.root.lang = language;
    document.title = getUiText("pageTitle", language);

    dom.copyNodes.forEach((node) => {
      const key = node.dataset.copy;
      const value = getUiText(key, language);
      if (value) {
        node.textContent = value;
      }
    });

    dom.copyHtmlNodes.forEach((node) => {
      const key = node.dataset.copyHtml;
      if (copy[key]) {
        node.innerHTML = copy[key];
      }
    });

    dom.languageButtons.forEach((button) => {
      const isActive = button.dataset.langSwitch === language;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    dom.searchInput.placeholder = copy.filterSearchPlaceholder;
    dom.bodyInput.placeholder = language === "ko"
      ? "우리는 무엇을 바꾸고 싶은가요?"
      : "What must change now?";

    renderFilterOptions();
    renderLocaleOptions();
    renderTagOptions();
    updateImageHelp();
    updateArchiveCount(getFilteredArchive().length);
    setSubmitting(state.submitting);

    if (!dom.setupBanner.classList.contains("is-hidden")) {
      showSetupNotice();
    }

    if (!dom.archiveFeedback.classList.contains("is-hidden") && state.archiveFeedbackKey) {
      showArchiveFeedback(
        state.archiveFeedbackType,
        getCopy(language)[state.archiveFeedbackKey],
        state.archiveFeedbackKey
      );
    }
  }

  function renderFilterOptions() {
    const copy = getCopy(state.uiLanguage);
    const localeValue = state.filters.locale;
    const tagValue = state.filters.tag;

    dom.localeFilter.innerHTML = [
      `<option value="all">${copy.filterAllLocales}</option>`,
      `<option value="ko">${copy.filterLocaleKo}</option>`,
      `<option value="en">${copy.filterLocaleEn}</option>`,
    ].join("");
    dom.localeFilter.value = localeValue;

    dom.tagFilter.innerHTML = [
      `<option value="all">${copy.filterAllTags}</option>`,
      ...config.tags.map(
        (tag) => `<option value="${tag.id}">${tag.label[state.uiLanguage]}</option>`
      ),
    ].join("");
    dom.tagFilter.value = tagValue;
  }

  function renderLocaleOptions() {
    const copy = getCopy(state.uiLanguage);
    const currentValue = dom.submissionLocale.value || state.uiLanguage;

    dom.submissionLocale.innerHTML = [
      `<option value="ko">${copy.filterLocaleKo}</option>`,
      `<option value="en">${copy.filterLocaleEn}</option>`,
    ].join("");

    dom.submissionLocale.value = isValidLocale(currentValue) ? currentValue : state.uiLanguage;
  }

  function renderTagOptions() {
    const selected = new Set(getSelectedTags());

    dom.tagOptions.innerHTML = config.tags
      .map((tag) => {
        const checked = selected.has(tag.id) ? "checked" : "";
        return `
          <label class="tag-option">
            <input type="checkbox" name="tags" value="${tag.id}" ${checked}>
            <span>${tag.label[state.uiLanguage]}</span>
          </label>
        `;
      })
      .join("");

    Array.from(dom.tagOptions.querySelectorAll("input[type='checkbox']")).forEach((input) => {
      input.addEventListener("change", handleTagSelectionLimit);
    });
  }

  function handleTagSelectionLimit(event) {
    const selected = getSelectedTags();
    if (selected.length > config.constraints.maxTags) {
      event.target.checked = false;
      setFormStatus("error", getCopy(state.uiLanguage).formErrorTags);
      return;
    }
    clearFormStatus();
  }

  function updateBodyCount() {
    dom.bodyCount.textContent = `${dom.bodyInput.value.trim().length} / ${config.constraints.bodyMaxLength}`;
  }

  function updateImageHelp() {
    const copy = getCopy(state.uiLanguage);
    const file = dom.imageInput.files && dom.imageInput.files[0];
    dom.imageHelp.textContent = file
      ? interpolate(copy.formImageSelected, { name: file.name })
      : copy.formImageHint;
  }

  function initialiseSupabase() {
    if (!isSupabaseConfigured() || !window.supabase || !window.supabase.createClient) {
      state.usingDemoData = true;
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
    showArchiveFeedback("info", getCopy(state.uiLanguage).archiveLoading, "archiveLoading");

    if (!state.supabaseClient) {
      state.archiveItems = [...config.demoEntries];
      state.usingDemoData = true;
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
      state.usingDemoData = false;
      hideSetupNotice();
      hideArchiveFeedback();
      renderArchive();
    } catch (error) {
      console.error(error);
      state.archiveItems = [];
      hideSetupNotice();
      showArchiveFeedback("error", getCopy(state.uiLanguage).archiveError, "archiveError");
      renderArchive();
    }
  }

  function renderArchive() {
    const filtered = getFilteredArchive();
    updateArchiveCount(filtered.length);

    if (!filtered.length) {
      dom.archiveList.innerHTML = `<div class="archive-list__empty">${getCopy(state.uiLanguage).archiveEmpty}</div>`;
      return;
    }

    dom.archiveList.innerHTML = filtered.map(renderArchiveCard).join("");
  }

  function renderArchiveCard(item) {
    const authorName = item.is_anonymous || !item.author_name
      ? getCopy(state.uiLanguage).authorAnonymous
      : item.author_name;
    const localeLabel = item.locale === "ko"
      ? getCopy(state.uiLanguage).filterLocaleKo
      : getCopy(state.uiLanguage).filterLocaleEn;
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
          <span class="locale-pill">${escapeHtml(localeLabel)}</span>
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

  function getFilteredArchive() {
    const query = state.filters.query.toLowerCase();

    return state.archiveItems.filter((item) => {
      const matchesLocale =
        state.filters.locale === "all" || item.locale === state.filters.locale;
      const matchesTag =
        state.filters.tag === "all" || (item.tags || []).includes(state.filters.tag);
      const author = item.author_name || "";
      const searchable = `${item.body} ${author}`.toLowerCase();
      const matchesQuery = !query || searchable.includes(query);

      return matchesLocale && matchesTag && matchesQuery;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (state.submitting) {
      return;
    }

    const copy = getCopy(state.uiLanguage);
    const payload = collectFormData();
    const validationError = validateSubmission(payload);

    if (validationError) {
      setFormStatus("error", validationError);
      return;
    }

    if (!state.supabaseClient) {
      setFormStatus("error", copy.archiveSetupNotice);
      return;
    }

    setSubmitting(true);
    setFormStatus("info", copy.formSubmitting);

    try {
      let imageUrl = null;

      if (payload.image) {
        imageUrl = await uploadImage(payload.image);
      }

      const insertPayload = {
        body: payload.body,
        locale: payload.locale,
        author_name: payload.isAnonymous ? null : payload.authorName || null,
        is_anonymous: payload.isAnonymous,
        tags: payload.tags,
        image_url: imageUrl,
        status: "visible",
      };

      const { data, error } = await state.supabaseClient
        .from(config.supabase.table)
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      state.archiveItems = [data, ...state.archiveItems];
      renderArchive();
      dom.form.reset();
      dom.submissionLocale.value = state.uiLanguage;
      updateBodyCount();
      updateImageHelp();
      renderTagOptions();
      setFormStatus("success", copy.formSuccess);
      document.getElementById("archive").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      setFormStatus("error", copy.formErrorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  function collectFormData() {
    return {
      body: dom.bodyInput.value.trim(),
      locale: dom.submissionLocale.value,
      authorName: dom.authorInput.value.trim(),
      isAnonymous: dom.anonymousInput.checked,
      tags: getSelectedTags(),
      image: dom.imageInput.files && dom.imageInput.files[0] ? dom.imageInput.files[0] : null,
      honeypot: dom.honeypotInput.value.trim(),
    };
  }

  function validateSubmission(payload) {
    const copy = getCopy(state.uiLanguage);

    if (payload.honeypot) {
      return copy.formErrorSpam;
    }

    if (
      payload.body.length < config.constraints.bodyMinLength ||
      payload.body.length > config.constraints.bodyMaxLength
    ) {
      return copy.formErrorBody;
    }

    if (!isValidLocale(payload.locale)) {
      return copy.formErrorGeneric;
    }

    if (!payload.isAnonymous && payload.authorName.length > config.constraints.authorMaxLength) {
      return copy.formErrorAuthor;
    }

    if (
      payload.tags.length < 1 ||
      payload.tags.length > config.constraints.maxTags ||
      !payload.tags.every((tag) => config.tags.some((allowedTag) => allowedTag.id === tag))
    ) {
      return copy.formErrorTags;
    }

    if (payload.image) {
      if (!config.constraints.allowedImageTypes.includes(payload.image.type)) {
        return copy.formErrorImageType;
      }

      if (payload.image.size > config.constraints.maxImageBytes) {
        return copy.formErrorImageSize;
      }
    }

    return null;
  }

  async function uploadImage(file) {
    const extension = getFileExtension(file.name);
    const date = new Date();
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const fileName = `${createUploadId()}.${extension}`;
    const path = `uploads/${year}/${month}/${fileName}`;

    const { error } = await state.supabaseClient.storage
      .from(config.supabase.bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (error) {
      throw error;
    }

    const {
      data: { publicUrl },
    } = state.supabaseClient.storage.from(config.supabase.bucket).getPublicUrl(path);

    return publicUrl;
  }

  function showSetupNotice() {
    dom.setupBanner.textContent = getCopy(state.uiLanguage).archiveSetupNotice;
    dom.setupBanner.classList.remove("is-hidden");
    hideArchiveFeedback();
  }

  function hideSetupNotice() {
    dom.setupBanner.classList.add("is-hidden");
  }

  function showArchiveFeedback(type, message, key) {
    state.archiveFeedbackType = type;
    state.archiveFeedbackKey = key || null;
    dom.archiveFeedback.textContent = message;
    dom.archiveFeedback.classList.remove("is-hidden");
    dom.archiveFeedback.classList.toggle("notice--error", type !== "info");
    dom.archiveFeedback.classList.toggle("notice--setup", type === "info");
  }

  function hideArchiveFeedback() {
    state.archiveFeedbackType = null;
    state.archiveFeedbackKey = null;
    dom.archiveFeedback.classList.add("is-hidden");
    dom.archiveFeedback.classList.remove("notice--setup");
    dom.archiveFeedback.classList.add("notice--error");
  }

  function updateArchiveCount(count) {
    dom.archiveCount.textContent = interpolate(getCopy(state.uiLanguage).archiveCount, {
      count: String(count),
    });
  }

  function setFormStatus(type, message) {
    dom.formStatus.textContent = message;
    dom.formStatus.classList.remove("is-error", "is-success");
    if (type === "error") {
      dom.formStatus.classList.add("is-error");
    }
    if (type === "success") {
      dom.formStatus.classList.add("is-success");
    }
  }

  function clearFormStatus() {
    dom.formStatus.textContent = "";
    dom.formStatus.classList.remove("is-error", "is-success");
  }

  function setSubmitting(isSubmitting) {
    state.submitting = isSubmitting;
    const copy = getCopy(state.uiLanguage);
    dom.submitButton.disabled = isSubmitting;
    dom.submitButton.setAttribute("aria-busy", String(isSubmitting));
    dom.submitButton.querySelector("[data-copy='formSubmitButton']").textContent = isSubmitting
      ? copy.formSubmitting
      : copy.formSubmitButton;
  }

  function getSelectedTags() {
    return Array.from(dom.tagOptions.querySelectorAll("input[type='checkbox']:checked")).map(
      (input) => input.value
    );
  }

  function getInitialLanguage() {
    const browserLanguage =
      typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
    return browserLanguage.startsWith("ko") ? "ko" : "en";
  }

  function getCopy(language) {
    return config.translations[language] || config.translations.ko;
  }

  function getUiText(key, language) {
    if (key === "brandName" || key === "pageTitle") {
      return config.projectName[language] || config.projectName.ko;
    }

    const copy = getCopy(language);
    return copy[key];
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

  function isValidUiLanguage(language) {
    return ["ko", "en"].includes(language);
  }

  function isValidLocale(locale) {
    return ["ko", "en"].includes(locale);
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

  function getFileExtension(fileName) {
    const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
    if (extension === "jpg" || extension === "jpeg") {
      return "jpg";
    }
    if (extension === "png") {
      return "png";
    }
    return "webp";
  }

  function createUploadId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();
