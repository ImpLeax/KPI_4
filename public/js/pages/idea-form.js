import { ApiError, createIdea, getIdea, getMaterials, getTools, updateIdea } from '../api.js';
import { getLang, t } from '../i18n.js';
import { $, clear, el, show } from '../ui/dom.js';
import {
  DIFFICULTIES,
  IDEA_CATEGORIES,
  MATERIAL_CATEGORIES,
  PLACEHOLDER_PHOTO,
  safePhotoUrl,
  setPhoto,
} from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { bootPage } from '../ui/layout.js';

// Limits mirror the API contract (server/docs/openapi.yaml, IdeaForm).
const LIMITS = {
  titleMin: 3,
  titleMax: 120,
  descriptionMax: 1000,
  timeMin: 1,
  timeMax: 1440,
  materialsMin: 1,
  materialsMax: 20,
  quantityMax: 50,
  toolsMax: 15,
  stepsMin: 1,
  stepsMax: 30,
  stepMin: 3,
  stepMax: 1000,
  photoMaxBytes: 5 * 1024 * 1024,
  photoTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

/** Field key -> element that receives focus from the error summary. */
const FIELD_TARGETS = {
  title: '#title',
  category: '#category',
  difficulty: '#difficulty-easy',
  estimatedTime: '#estimatedTime',
  description: '#description',
  materials: '#err-materials',
  tools: '#err-tools',
  steps: '#err-steps',
  photo: '#photo',
};

const refs = {};
const model = {
  editId: null,
  materials: new Map(), // materialId -> { isRequired, quantity }
  tools: new Set(),
  steps: [''],
  photoFile: null,
  existingPhotoUrl: null,
};
let materialsDict = [];
let toolsDict = [];
let submitAttempted = false;
let submitting = false;

/* ---------- Materials ---------- */

function renderMaterials() {
  clear(refs.materialsList);
  for (const category of MATERIAL_CATEGORIES) {
    const items = materialsDict.filter((m) => m.category === category);
    if (!items.length) continue;
    const headingId = `form-matcat-${category}`;
    const rows = items.map((material) => {
      const selected = model.materials.get(material.id);
      const baseId = `mat-${material.id}`;
      const checkbox = el('input', {
        class: 'size-5 flex-none accent-forest',
        attrs: { type: 'checkbox', id: baseId, checked: Boolean(selected) },
        dataset: { materialId: String(material.id) },
      });
      const requiredToggle = el('input', {
        class: 'size-5 accent-forest',
        attrs: {
          type: 'checkbox',
          role: 'switch',
          id: `${baseId}-req`,
          checked: selected ? selected.isRequired : true,
          'aria-label': t('form.requiredLabel', { name: material.name }),
        },
        dataset: { requiredFor: String(material.id) },
      });
      const quantity = el('input', {
        class: 'input min-h-10 flex-1 basis-40 rounded-xl px-3 py-2 text-sm',
        attrs: {
          type: 'text',
          id: `${baseId}-qty`,
          maxlength: LIMITS.quantityMax,
          placeholder: t('form.quantityPlaceholder'),
          'aria-label': t('form.quantityLabel', { name: material.name }),
          value: selected?.quantity ?? '',
        },
        dataset: { quantityFor: String(material.id) },
      });
      const extra = el('div', { class: 'mt-3 flex flex-wrap items-center gap-3 pl-8' }, [
        el(
          'label',
          {
            class: 'inline-flex min-h-10 items-center gap-2 text-sm font-semibold',
            attrs: { for: `${baseId}-req` },
          },
          [requiredToggle, el('span', { text: t('form.materialRequired') })],
        ),
        quantity,
      ]);
      extra.hidden = !selected;
      return el(
        'div',
        {
          class: 'rounded-2xl bg-paper px-4 py-3',
          dataset: { testid: 'material-row', materialId: String(material.id) },
        },
        [
          el('div', { class: 'flex min-h-8 items-center gap-3' }, [
            checkbox,
            el('label', {
              class: 'flex-1 font-semibold',
              attrs: { for: baseId },
              text: material.name,
            }),
          ]),
          extra,
        ],
      );
    });
    refs.materialsList.append(
      el('div', { attrs: { role: 'group', 'aria-labelledby': headingId } }, [
        el('p', {
          class: 'mb-2 font-bold text-forest-dark',
          attrs: { id: headingId },
          text: t(`materialCategory.${category}`),
        }),
        el('div', { class: 'flex flex-col gap-2' }, rows),
      ]),
    );
  }
}

function onMaterialsInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.materialId) {
    const id = Number(target.dataset.materialId);
    const row = target.closest('[data-testid="material-row"]');
    const extra = row.lastElementChild;
    if (target.checked) {
      const required = row.querySelector('[data-required-for]');
      const qty = row.querySelector('[data-quantity-for]');
      model.materials.set(id, { isRequired: required.checked, quantity: qty.value });
      extra.hidden = false;
    } else {
      model.materials.delete(id);
      extra.hidden = true;
    }
  } else if (target.dataset.requiredFor) {
    const entry = model.materials.get(Number(target.dataset.requiredFor));
    if (entry) entry.isRequired = target.checked;
  } else if (target.dataset.quantityFor) {
    const entry = model.materials.get(Number(target.dataset.quantityFor));
    if (entry) entry.quantity = target.value;
  }
  revalidate();
}

/* ---------- Tools ---------- */

function renderTools() {
  clear(refs.toolsList);
  for (const tool of toolsDict) {
    refs.toolsList.append(
      el('label', { class: 'chip', dataset: { testid: 'tool-option' } }, [
        el('input', {
          attrs: {
            type: 'checkbox',
            name: 'tools',
            value: tool.id,
            checked: model.tools.has(tool.id),
          },
        }),
        icon('check', { class: 'chip-check size-4', strokeWidth: 2.5 }),
        el('span', { text: tool.name }),
      ]),
    );
  }
}

function onToolsChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.name !== 'tools') return;
  const id = Number(target.value);
  if (target.checked) model.tools.add(id);
  else model.tools.delete(id);
  revalidate();
}

/* ---------- Steps ---------- */

function syncStepsFromDom() {
  const areas = refs.stepsList.querySelectorAll('textarea');
  if (areas.length) model.steps = Array.from(areas, (area) => area.value);
}

function renderSteps(focus) {
  clear(refs.stepsList);
  const count = model.steps.length;
  model.steps.forEach((text, index) => {
    const n = index + 1;
    const areaId = `step-${n}`;
    const textarea = el('textarea', {
      class: 'input min-h-24',
      attrs: {
        id: areaId,
        rows: 3,
        maxlength: LIMITS.stepMax,
        placeholder: t('form.stepPlaceholder'),
      },
      dataset: { stepIndex: String(index) },
    });
    textarea.value = text;
    const actionButton = (name, labelKey, disabled, action) =>
      el(
        'button',
        {
          class: 'btn-icon',
          attrs: { type: 'button', 'aria-label': t(labelKey, { n }), disabled },
          dataset: { action, index: String(index) },
        },
        [icon(name, { class: 'size-5', strokeWidth: 2 })],
      );
    refs.stepsList.append(
      el('li', { class: 'flex gap-3 sm:gap-4', dataset: { testid: 'step-row' } }, [
        el('span', {
          class: 'step-number mt-1 hidden sm:inline-flex',
          attrs: { 'aria-hidden': 'true' },
          text: String(n),
        }),
        el('div', { class: 'min-w-0 flex-1' }, [
          el('label', {
            class: 'field-label',
            attrs: { for: areaId },
            text: t('form.stepLabel', { n }),
          }),
          textarea,
          el('div', { class: 'mt-2 flex flex-wrap gap-2' }, [
            actionButton('arrowUp', 'form.moveUp', index === 0, 'up'),
            actionButton('arrowDown', 'form.moveDown', index === count - 1, 'down'),
            actionButton('trash', 'form.removeStep', count === 1, 'remove'),
          ]),
        ]),
      ]),
    );
  });
  refs.addStep.disabled = count >= LIMITS.stepsMax;

  if (focus) {
    const selector =
      focus.type === 'textarea'
        ? `#step-${focus.index + 1}`
        : `[data-action="${focus.type}"][data-index="${focus.index}"]`;
    let target = refs.stepsList.querySelector(selector);
    if (!target || target.disabled)
      target = refs.stepsList.querySelector(`#step-${focus.index + 1}`);
    target?.focus();
  }
}

function onStepsClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  syncStepsFromDom();
  const index = Number(button.dataset.index);
  const steps = model.steps;
  if (button.dataset.action === 'up' && index > 0) {
    [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
    renderSteps({ type: 'up', index: index - 1 });
  } else if (button.dataset.action === 'down' && index < steps.length - 1) {
    [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]];
    renderSteps({ type: 'down', index: index + 1 });
  } else if (button.dataset.action === 'remove' && steps.length > 1) {
    steps.splice(index, 1);
    renderSteps({ type: 'textarea', index: Math.min(index, steps.length - 1) });
  }
  revalidate();
}

function addStep() {
  syncStepsFromDom();
  if (model.steps.length >= LIMITS.stepsMax) return;
  model.steps.push('');
  renderSteps({ type: 'textarea', index: model.steps.length - 1 });
}

/* ---------- Photo ---------- */

function showPhotoPreview(src) {
  if (src) {
    refs.photoPreview.alt = t('form.photoPreviewAlt');
    if (src.startsWith('data:')) refs.photoPreview.src = src;
    else setPhoto(refs.photoPreview, src);
  }
  show(refs.photoPreview, Boolean(src));
  show(refs.photoEmpty, !src);
}

function onPhotoChange() {
  const file = refs.photo.files?.[0] || null;
  model.photoFile = file;
  refs.photoFileName.textContent = file ? file.name : '';
  show(refs.photoFileName, Boolean(file));
  updatePhotoLabels();
  const error = file ? photoError(file) : null;
  if (!file || error) {
    showPhotoPreview(model.existingPhotoUrl);
    revalidate(true);
    return;
  }
  // Data URLs are allowed by the CSP img-src directive, blob: URLs are not.
  const reader = new FileReader();
  reader.addEventListener('load', () => showPhotoPreview(String(reader.result)));
  reader.readAsDataURL(file);
  revalidate(true);
}

function photoError(file) {
  if (!LIMITS.photoTypes.includes(file.type)) return t('validation.photoType');
  if (file.size > LIMITS.photoMaxBytes) return t('validation.photoSize');
  return null;
}

function updatePhotoLabels() {
  const hasPhoto = Boolean(model.photoFile || model.existingPhotoUrl);
  refs.photoButtonLabel.dataset.i18n = hasPhoto ? 'form.photoReplace' : 'form.photoChoose';
  refs.photoButtonLabel.textContent = t(refs.photoButtonLabel.dataset.i18n);
}

/* ---------- Validation ---------- */

function collectValues() {
  syncStepsFromDom();
  return {
    title: refs.title.value.trim(),
    category: refs.category.value,
    difficulty: refs.form.querySelector('input[name="difficulty"]:checked')?.value || '',
    estimatedTime: refs.time.value.trim(),
    description: refs.description.value.trim(),
    materials: [...model.materials].map(([materialId, entry]) => {
      const item = { materialId, isRequired: entry.isRequired };
      const quantity = entry.quantity.trim();
      if (quantity) item.quantity = quantity;
      return item;
    }),
    tools: [...model.tools],
    steps: model.steps.map((s) => s.trim()),
  };
}

/** Returns { field: message } for every invalid field. */
function validate(values) {
  const errors = {};
  if (values.title.length < LIMITS.titleMin || values.title.length > LIMITS.titleMax) {
    errors.title = t('validation.titleLength');
  }
  if (!IDEA_CATEGORIES.includes(values.category))
    errors.category = t('validation.categoryRequired');
  if (!DIFFICULTIES.includes(values.difficulty))
    errors.difficulty = t('validation.difficultyRequired');
  const time = Number(values.estimatedTime);
  if (!/^\d+$/.test(values.estimatedTime) || time < LIMITS.timeMin || time > LIMITS.timeMax) {
    errors.estimatedTime = t('validation.timeRange');
  }
  if (values.description.length > LIMITS.descriptionMax)
    errors.description = t('validation.descriptionLength');

  if (values.materials.length < LIMITS.materialsMin)
    errors.materials = t('validation.materialsRequired');
  else if (values.materials.length > LIMITS.materialsMax)
    errors.materials = t('validation.materialsTooMany');
  else if (!values.materials.some((m) => m.isRequired))
    errors.materials = t('validation.materialsNeedRequired');
  else {
    const tooLong = values.materials.find((m) => (m.quantity || '').length > LIMITS.quantityMax);
    if (tooLong) {
      const name = materialsDict.find((m) => m.id === tooLong.materialId)?.name ?? '';
      errors.materials = t('validation.quantityLength', { name });
    }
  }

  if (values.tools.length > LIMITS.toolsMax) errors.tools = t('validation.toolsTooMany');

  if (values.steps.length < LIMITS.stepsMin) errors.steps = t('validation.stepsRequired');
  else if (values.steps.length > LIMITS.stepsMax) errors.steps = t('validation.stepsTooMany');
  else {
    const messages = values.steps
      .map((text, i) =>
        text.length < LIMITS.stepMin || text.length > LIMITS.stepMax
          ? t('validation.stepLength', { n: i + 1 })
          : null,
      )
      .filter(Boolean);
    if (messages.length) errors.steps = messages.join(' ');
  }

  if (model.photoFile) {
    const error = photoError(model.photoFile);
    if (error) errors.photo = error;
  } else if (!model.editId) {
    errors.photo = t('validation.photoRequired');
  }
  return errors;
}

function setFieldError(field, message) {
  const node = refs.form.querySelector(`#err-${field}`);
  if (!node) return false;
  node.textContent = message || '';
  show(node, Boolean(message));
  const control = {
    title: refs.title,
    category: refs.category,
    estimatedTime: refs.time,
    description: refs.description,
    photo: refs.photo,
  }[field];
  if (control) control.setAttribute('aria-invalid', String(Boolean(message)));
  if (field === 'difficulty')
    refs.difficultyGroup.setAttribute('aria-invalid', String(Boolean(message)));
  return true;
}

function showErrors(errors) {
  for (const field of Object.keys(FIELD_TARGETS)) setFieldError(field, errors[field]);
}

function renderSummary(errors, extra = []) {
  clear(refs.summaryList);
  const entries = Object.entries(errors);
  for (const [field, message] of entries) {
    const target = FIELD_TARGETS[field];
    const link = el('a', {
      class: 'font-semibold underline underline-offset-4',
      attrs: { href: target && target.startsWith('#') ? target : '#idea-form' },
      text: message,
      on: {
        click: (event) => {
          event.preventDefault();
          const node = target ? refs.form.querySelector(target) : null;
          node?.focus();
          node?.scrollIntoView({ block: 'center' });
        },
      },
    });
    refs.summaryList.append(el('li', {}, [link]));
  }
  for (const message of extra) refs.summaryList.append(el('li', { text: message }));
  show(refs.summary, entries.length + extra.length > 0);
}

function revalidate(force = false) {
  if (!submitAttempted && !force) return;
  const errors = validate(collectValues());
  if (submitAttempted) {
    showErrors(errors);
    if (!refs.summary.hidden) renderSummary(errors);
  } else if (force) {
    // Before the first submit, only report a wrong file type/size right after picking a file.
    setFieldError('photo', model.photoFile ? errors.photo : null);
  }
}

/* ---------- Submit ---------- */

function buildFormData(values) {
  const data = new FormData();
  data.append('lang', getLang());
  data.append('title', values.title);
  data.append('description', values.description);
  data.append('category', values.category);
  data.append('difficulty', values.difficulty);
  data.append('estimatedTime', String(Number(values.estimatedTime)));
  data.append('materials', JSON.stringify(values.materials));
  data.append('tools', JSON.stringify(values.tools));
  data.append('steps', JSON.stringify(values.steps));
  if (model.photoFile) data.append('photo', model.photoFile);
  return data;
}

function fieldFromDetail(detail) {
  const raw = String(detail?.field || '');
  return raw.split(/[.[\]]/)[0];
}

function handleServerError(error) {
  const fieldErrors = {};
  const extra = [];
  if (error instanceof ApiError) {
    if (error.code === 'PAYLOAD_TOO_LARGE') fieldErrors.photo = t('errors.PAYLOAD_TOO_LARGE');
    else if (error.code === 'UNSUPPORTED_MEDIA_TYPE')
      fieldErrors.photo = t('errors.UNSUPPORTED_MEDIA_TYPE');
    else if (error.code === 'VALIDATION_ERROR' && error.details.length) {
      for (const detail of error.details) {
        const field = fieldFromDetail(detail);
        const message = t('validation.server', { message: detail.message || error.message });
        // hasOwn: a server field such as "constructor" must not match Object.prototype members.
        if (Object.hasOwn(FIELD_TARGETS, field))
          fieldErrors[field] = fieldErrors[field] ? `${fieldErrors[field]} ${message}` : message;
        else extra.push(message);
      }
    } else if (error.code === 'NOT_FOUND' && model.editId) {
      setView('not-found');
      return;
    } else {
      const key = `errors.${error.code}`;
      extra.push(t(key) !== key ? t(key) : t('errors.generic'));
    }
  } else {
    extra.push(t('errors.generic'));
  }
  showErrors(fieldErrors);
  renderSummary(fieldErrors, extra);
  refs.summary.focus();
}

function setSubmitting(value) {
  submitting = value;
  refs.submit.disabled = value;
  refs.submit.setAttribute('aria-busy', String(value));
  refs.submitLabel.textContent = value ? t('form.saving') : t(refs.submitLabel.dataset.i18n);
}

async function onSubmit(event) {
  event.preventDefault();
  if (submitting) return;
  submitAttempted = true;
  const values = collectValues();
  const errors = validate(values);
  showErrors(errors);
  if (Object.keys(errors).length) {
    renderSummary(errors);
    refs.summary.focus();
    return;
  }
  renderSummary({});
  setSubmitting(true);
  try {
    const formData = buildFormData(values);
    const saved = model.editId
      ? await updateIdea(model.editId, formData)
      : await createIdea(formData);
    window.location.assign(`/idea.html?id=${encodeURIComponent(saved.id)}`);
  } catch (error) {
    setSubmitting(false);
    handleServerError(error);
  }
}

/* ---------- Page setup ---------- */

function setView(view) {
  show(refs.loading, view === 'loading');
  show(refs.notFound, view === 'not-found');
  show(refs.form, view === 'form');
  if (view === 'not-found') {
    document.querySelector('title').dataset.i18n = 'meta.notFoundTitle';
    document.title = t('meta.notFoundTitle');
  }
}

function setMode() {
  const editing = Boolean(model.editId);
  const keys = editing
    ? {
        title: 'form.editTitle',
        lead: 'form.editLead',
        submit: 'form.submitEdit',
        meta: 'meta.formEditTitle',
        back: 'idea.back',
        hint: 'form.photoHintEdit',
      }
    : {
        title: 'form.createTitle',
        lead: 'form.createLead',
        submit: 'form.submitCreate',
        meta: 'meta.formCreateTitle',
        back: 'idea.back',
        hint: 'form.photoHint',
      };
  const assign = (node, key) => {
    node.dataset.i18n = key;
    node.textContent = t(key);
  };
  assign(refs.pageTitle, keys.title);
  assign(refs.lead, keys.lead);
  assign(refs.submitLabel, keys.submit);
  assign(refs.photoHint, keys.hint);
  assign(document.querySelector('title'), keys.meta);
  show(refs.photoRequiredMark, !editing);
  show(refs.langNote, editing);
  if (editing) {
    const back = `/idea.html?id=${encodeURIComponent(model.editId)}`;
    refs.back.href = back;
    refs.cancel.href = back;
  }
}

function prefill(idea) {
  refs.title.value = idea.title || '';
  refs.category.value = idea.category || '';
  // Only whitelisted values reach the selector, so an unexpected API value cannot break it.
  const radio = DIFFICULTIES.includes(idea.difficulty)
    ? refs.form.querySelector(`input[name="difficulty"][value="${idea.difficulty}"]`)
    : null;
  if (radio) radio.checked = true;
  refs.time.value = String(idea.estimatedTime ?? '');
  refs.description.value = idea.description || '';
  model.materials = new Map(
    (idea.materials || []).map((m) => [
      m.id,
      { isRequired: Boolean(m.isRequired), quantity: m.quantity || '' },
    ]),
  );
  model.tools = new Set((idea.tools || []).map((tool) => tool.id));
  model.steps = (idea.steps || []).sort((a, b) => a.number - b.number).map((s) => s.text);
  if (!model.steps.length) model.steps = [''];
  // Sanitised here because showPhotoPreview() assigns data: URLs directly.
  model.existingPhotoUrl = safePhotoUrl(idea.photoUrl) || PLACEHOLDER_PHOTO;
  showPhotoPreview(model.existingPhotoUrl);
  updatePhotoLabels();
}

function updateDescriptionCount() {
  refs.descriptionCount.textContent = t('form.charCount', {
    count: refs.description.value.length,
    max: LIMITS.descriptionMax,
  });
}

async function loadDictionaries() {
  const lang = getLang();
  [materialsDict, toolsDict] = await Promise.all([getMaterials(lang), getTools(lang)]);
}

function bindEvents() {
  refs.form.addEventListener('submit', onSubmit);
  refs.materialsList.addEventListener('change', onMaterialsInput);
  refs.materialsList.addEventListener('input', onMaterialsInput);
  refs.toolsList.addEventListener('change', onToolsChange);
  refs.stepsList.addEventListener('click', onStepsClick);
  refs.stepsList.addEventListener('input', () => revalidate());
  refs.addStep.addEventListener('click', addStep);
  refs.photo.addEventListener('change', onPhotoChange);
  refs.description.addEventListener('input', updateDescriptionCount);
  for (const node of [refs.title, refs.category, refs.time, refs.description]) {
    node.addEventListener('input', () => revalidate());
    node.addEventListener('change', () => revalidate());
  }
  refs.form
    .querySelectorAll('input[name="difficulty"]')
    .forEach((radio) => radio.addEventListener('change', () => revalidate()));

  document.addEventListener('langchange', async () => {
    syncStepsFromDom();
    try {
      await loadDictionaries();
    } catch {
      // Keep the previous names; the form still works with them.
    }
    renderMaterials();
    renderTools();
    renderSteps();
    updateDescriptionCount();
    updatePhotoLabels();
    if (submitting) refs.submitLabel.textContent = t('form.saving');
    if (submitAttempted) {
      const errors = validate(collectValues());
      showErrors(errors);
      if (!refs.summary.hidden) renderSummary(errors);
    }
  });
}

async function init() {
  await bootPage(new URLSearchParams(window.location.search).has('id') ? 'edit' : 'add');
  Object.assign(refs, {
    loading: $('#form-loading'),
    notFound: $('#form-not-found'),
    dictError: $('#form-dict-error'),
    form: $('#idea-form'),
    pageTitle: $('#form-title'),
    lead: $('#form-lead'),
    langNote: $('#lang-note'),
    back: $('#form-back'),
    cancel: $('#form-cancel'),
    summary: $('#error-summary'),
    summaryList: $('#error-summary-list'),
    title: $('#title'),
    category: $('#category'),
    time: $('#estimatedTime'),
    description: $('#description'),
    descriptionCount: $('#description-count'),
    difficultyGroup: $('#difficulty-group'),
    materialsList: $('#materials-list'),
    toolsList: $('#tools-list'),
    stepsList: $('#steps-list'),
    addStep: $('#add-step'),
    photo: $('#photo'),
    photoPreview: $('#photo-preview'),
    photoEmpty: $('#photo-empty'),
    photoFileName: $('#photo-file-name'),
    photoButtonLabel: $('#photo-button-label'),
    photoHint: $('#photo-hint'),
    photoRequiredMark: $('#photo-required-mark'),
    submit: $('#form-submit'),
    submitLabel: $('#form-submit-label'),
  });

  const rawId = new URLSearchParams(window.location.search).get('id');
  if (rawId !== null) {
    if (!/^[1-9]\d*$/.test(rawId)) {
      setView('not-found');
      return;
    }
    model.editId = rawId;
  }
  setMode();
  setView('loading');

  try {
    const [, idea] = await Promise.all([
      loadDictionaries(),
      model.editId ? getIdea(model.editId, getLang()) : null,
    ]);
    if (idea) prefill(idea);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400) &&
      model.editId
    ) {
      setView('not-found');
      return;
    }
    show(refs.loading, false);
    refs.dictError.textContent =
      error?.code === 'NETWORK_ERROR' ? t('errors.NETWORK_ERROR') : t('form.dictError');
    show(refs.dictError, true);
    return;
  }

  renderMaterials();
  renderTools();
  renderSteps();
  updateDescriptionCount();
  updatePhotoLabels();
  bindEvents();
  setView('form');
}

init();
