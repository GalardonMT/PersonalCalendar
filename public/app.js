document.addEventListener('DOMContentLoaded', function() {
    const DEFAULT_COLOR = '#3b82f6';
    const PRESET_COLORS = [
        '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
        '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
        '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
        '#ec4899', '#f43f5e', '#64748b', '#334155'
    ];

    const calendarEl = document.getElementById('calendar');
    const authSection = document.getElementById('authSection');
    const appSection = document.getElementById('appSection');

    const loginView = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const showLoginBtn = document.getElementById('showLoginBtn');

    const loginForm = document.getElementById('loginForm');
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');

    const registerForm = document.getElementById('registerForm');
    const registerUsernameInput = document.getElementById('registerUsername');
    const registerPasswordInput = document.getElementById('registerPassword');

    const logoutBtn = document.getElementById('logoutBtn');
    const currentUserLabel = document.getElementById('currentUserLabel');
    const templateModal = document.getElementById('templateModal');
    const dayEventModal = document.getElementById('dayEventModal');
    const manageModal = document.getElementById('manageModal');
    const toast = document.getElementById('toast');

    const openTemplateModalBtn = document.getElementById('openTemplateModal');
    const openManageModalBtn = document.getElementById('openManageModal');
    const closeTemplateModalBtn = document.getElementById('closeTemplateModal');
    const cancelTemplateBtn = document.getElementById('cancelTemplate');
    const closeManageModalBtn = document.getElementById('closeManageModal');
    const cancelManageBtn = document.getElementById('cancelManage');

    const closeDayModalBtn = document.getElementById('closeDayModal');
    const cancelDayEventBtn = document.getElementById('cancelDayEvent');
    const saveDayEventBtn = document.getElementById('saveDayEventBtn');

    const templateForm = document.getElementById('templateForm');
    const templateTitleInput = document.getElementById('templateTitle');
    const tagInput = document.getElementById('tagInput');
    const addTagBtn = document.getElementById('addTagBtn');
    const tagList = document.getElementById('tagList');
    const templateColorOptions = document.getElementById('templateColorOptions');

    const dayEventForm = document.getElementById('dayEventForm');
    const dayEventTitle = document.getElementById('dayEventTitle');
    const eventDateInput = document.getElementById('eventDate');
    const templateSelect = document.getElementById('templateSelect');
    const tagSelect = document.getElementById('tagSelect');

    const manageTemplateList = document.getElementById('manageTemplateList');
    const manageTemplateForm = document.getElementById('manageTemplateForm');
    const manageTemplateTitleInput = document.getElementById('manageTemplateTitle');
    const manageTagInput = document.getElementById('manageTagInput');
    const addManageTagBtn = document.getElementById('addManageTagBtn');
    const manageTagList = document.getElementById('manageTagList');
    const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
    const manageColorOptions = document.getElementById('manageColorOptions');
    const dayPanelTitle = document.getElementById('dayPanelTitle');
    const dayPanelHint = document.getElementById('dayPanelHint');
    const dayPanelView = document.getElementById('dayPanelView');
    const dayPanelEdit = document.getElementById('dayPanelEdit');

    let templates = [];
    let workingTags = [];
    let selectedManageTemplateId = null;
    let manageWorkingTags = [];
    let selectedTemplateColor = DEFAULT_COLOR;
    let selectedManageColor = DEFAULT_COLOR;
    let selectedDate = null;
    let dayEvents = [];
    let dayEventDrafts = [];
    let dayEventMode = 'create';
    let editingEventId = null;
    let currentUser = null;
    let calendar = null;

    function normalizeHexColor(value) {
        const color = String(value || '').trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(color)) {
            return color;
        }
        return DEFAULT_COLOR;
    }

    function isPresetColor(color) {
        return PRESET_COLORS.includes(normalizeHexColor(color));
    }

    function renderColorOptions(container, selectedColor, onSelect) {
        const normalizedSelected = normalizeHexColor(selectedColor);
        container.innerHTML = '';

        for (const color of PRESET_COLORS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'color-bubble';
            if (normalizedSelected === color) {
                button.classList.add('active');
            }
            button.style.backgroundColor = color;
            button.title = color;
            button.addEventListener('click', function() {
                onSelect(color);
            });
            container.appendChild(button);
        }

        const customWrapper = document.createElement('label');
        customWrapper.className = 'color-bubble color-bubble-custom';
        const isCustomSelected = !isPresetColor(normalizedSelected);
        if (isCustomSelected) {
            customWrapper.classList.add('active');
        }

        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.className = 'color-bubble-picker';
        customInput.value = isCustomSelected ? normalizedSelected : DEFAULT_COLOR;

        const customLabel = document.createElement('span');
        customLabel.className = 'color-bubble-plus';
        customLabel.textContent = '+';

        customWrapper.style.backgroundColor = customInput.value;
        customInput.addEventListener('click', function(event) {
            event.stopPropagation();
        });
        customInput.addEventListener('mousedown', function(event) {
            event.stopPropagation();
        });
        customInput.addEventListener('change', function() {
            onSelect(customInput.value);
        });

        customWrapper.appendChild(customInput);
        customWrapper.appendChild(customLabel);
        container.appendChild(customWrapper);
    }

    function onTemplateColorSelect(color) {
        selectedTemplateColor = normalizeHexColor(color);
        renderColorOptions(templateColorOptions, selectedTemplateColor, onTemplateColorSelect);
    }

    function onManageColorSelect(color) {
        selectedManageColor = normalizeHexColor(color);
        renderColorOptions(manageColorOptions, selectedManageColor, onManageColorSelect);
    }

    function showToast(message, isError) {
        toast.textContent = message;
        toast.classList.remove('hidden', 'is-error');
        if (isError) {
            toast.classList.add('is-error');
        }

        window.clearTimeout(showToast.timeoutId);
        showToast.timeoutId = window.setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    function showAuthView() {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }

    function showAppView() {
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        if (currentUserLabel) {
            currentUserLabel.textContent = currentUser ? `Usuario: ${currentUser.username}` : '';
        }
        if (calendar) {
            window.setTimeout(() => calendar.updateSize(), 0);
        }
    }

    async function apiRequest(url, options) {
        const response = await fetch(url, options);
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (response.status === 401) {
            currentUser = null;
            showAuthView();
            throw new Error('Tu sesion expiro. Inicia sesion de nuevo.');
        }

        if (!response.ok) {
            throw new Error(payload?.message || 'Error en la solicitud.');
        }

        return payload;
    }

    function openModal(modal) {
        modal.classList.remove('hidden');
    }

    function closeModal(modal) {
        modal.classList.add('hidden');
    }

    function renderWorkingTags() {
        tagList.innerHTML = '';

        for (const tag of workingTags) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tag-chip';
            chip.textContent = `${tag} x`;
            chip.addEventListener('click', () => {
                workingTags = workingTags.filter((t) => t !== tag);
                renderWorkingTags();
            });
            tagList.appendChild(chip);
        }
    }

    function renderManageTags() {
        manageTagList.innerHTML = '';

        for (const tag of manageWorkingTags) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tag-chip';
            chip.textContent = `${tag} x`;
            chip.addEventListener('click', () => {
                manageWorkingTags = manageWorkingTags.filter((t) => t !== tag);
                renderManageTags();
            });
            manageTagList.appendChild(chip);
        }
    }

    function addTag() {
        const tag = tagInput.value.trim();
        if (!tag) {
            return;
        }

        if (workingTags.length >= 10) {
            showToast('Solo puedes agregar hasta 10 etiquetas por evento.', true);
            return;
        }

        const alreadyExists = workingTags.some((t) => t.toLowerCase() === tag.toLowerCase());
        if (alreadyExists) {
            showToast('Esa etiqueta ya fue agregada.', true);
            return;
        }

        workingTags.push(tag);
        tagInput.value = '';
        renderWorkingTags();
    }

    function addManageTag() {
        const tag = manageTagInput.value.trim();
        if (!tag) {
            return;
        }

        if (manageWorkingTags.length >= 10) {
            showToast('Solo puedes tener hasta 10 etiquetas.', true);
            return;
        }

        const alreadyExists = manageWorkingTags.some((t) => t.toLowerCase() === tag.toLowerCase());
        if (alreadyExists) {
            showToast('Esa etiqueta ya existe.', true);
            return;
        }

        manageWorkingTags.push(tag);
        manageTagInput.value = '';
        renderManageTags();
    }

    function resetTemplateForm() {
        templateForm.reset();
        workingTags = [];
        selectedTemplateColor = DEFAULT_COLOR;
        renderWorkingTags();
        renderColorOptions(templateColorOptions, selectedTemplateColor, onTemplateColorSelect);
    }

    function resetDayForm() {
        dayEventForm.reset();
        templateSelect.innerHTML = '';
        tagSelect.innerHTML = '';
    }

    function renderManageTemplateList() {
        manageTemplateList.innerHTML = '';

        if (!templates.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-message';
            empty.textContent = 'No hay eventos base todavía.';
            manageTemplateList.appendChild(empty);
            selectedManageTemplateId = null;
            manageTemplateForm.reset();
            manageWorkingTags = [];
            selectedManageColor = DEFAULT_COLOR;
            renderManageTags();
            renderColorOptions(manageColorOptions, selectedManageColor, onManageColorSelect);
            return;
        }

        for (const template of templates) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'manage-item';
            if (template.id === selectedManageTemplateId) {
                item.classList.add('active');
            }

            const itemContent = document.createElement('span');
            itemContent.className = 'manage-item-content';

            const colorBubble = document.createElement('span');
            colorBubble.className = 'manage-item-color';
            colorBubble.style.backgroundColor = normalizeHexColor(template.color);

            const itemText = document.createElement('span');
            itemText.className = 'manage-item-title';
            itemText.textContent = template.title;

            itemContent.appendChild(colorBubble);
            itemContent.appendChild(itemText);
            item.appendChild(itemContent);

            item.addEventListener('click', function() {
                selectedManageTemplateId = template.id;
                hydrateManageForm();
                renderManageTemplateList();
            });
            manageTemplateList.appendChild(item);
        }
    }

    function hydrateManageForm() {
        const current = templates.find((t) => t.id === selectedManageTemplateId);
        if (!current) {
            manageTemplateForm.reset();
            manageWorkingTags = [];
            renderManageTags();
            return;
        }

        manageTemplateTitleInput.value = current.title;
        manageWorkingTags = [...current.tags];
        selectedManageColor = normalizeHexColor(current.color);
        renderManageTags();
        renderColorOptions(manageColorOptions, selectedManageColor, onManageColorSelect);
    }

    async function fetchTemplates() {
        templates = await apiRequest('/api/plantillas');
    }

    async function fetchDayEvents(dateStr) {
        dayEvents = await apiRequest(`/api/eventos-dia/${dateStr}`);
        dayEventDrafts = dayEvents.map((eventItem) => ({
            id: eventItem.id,
            templateId: eventItem.templateId,
            selectedTag: eventItem.selectedTag || '',
            deleted: false,
            isNew: false
        }));
    }

    function getTemplateById(templateId) {
        return templates.find((template) => template.id === Number(templateId));
    }

    function getDateTitle(dateStr) {
        if (!dateStr) {
            return 'Selecciona un dia';
        }

        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }

    function renderDayPanelView() {
        dayPanelTitle.textContent = getDateTitle(selectedDate);
        dayPanelHint.textContent = '1 clic: seleccionar y ver eventos. 2 clics: abrir modal para agregar.';
        dayPanelView.classList.remove('hidden');
        dayPanelEdit.classList.add('hidden');
        dayPanelView.innerHTML = '';

        if (!selectedDate) {
            dayPanelView.innerHTML = '<p class="empty-message">Todavia no has seleccionado una fecha.</p>';
            return;
        }

        if (!dayEvents.length) {
            dayPanelView.innerHTML = '<p class="empty-message">No hay eventos para este dia.</p>';
            return;
        }

        for (const eventItem of dayEvents) {
            const card = document.createElement('article');
            card.className = 'day-event-card';
            card.style.borderLeftColor = normalizeHexColor(eventItem.color);
            card.dataset.eventId = String(eventItem.id);

            const title = document.createElement('p');
            title.className = 'day-event-title';
            title.textContent = eventItem.title;

            const tag = document.createElement('p');
            tag.className = 'day-event-tag';
            tag.textContent = eventItem.selectedTag ? `Etiqueta: ${eventItem.selectedTag}` : 'Sin etiqueta';

            const actions = document.createElement('div');
            actions.className = 'day-event-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn js-day-edit';
            editBtn.textContent = 'Editar';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-danger js-day-delete';
            deleteBtn.textContent = 'Eliminar';

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            card.appendChild(title);
            card.appendChild(tag);
            card.appendChild(actions);
            dayPanelView.appendChild(card);
        }
    }

    function openCreateDayEventModal() {
        dayEventMode = 'create';
        editingEventId = null;
        dayEventTitle.textContent = 'Agregar evento al dia';
        saveDayEventBtn.textContent = 'Guardar en calendario';
        eventDateInput.value = selectedDate || '';
        setTemplateOptions();
        openModal(dayEventModal);
    }

    function openEditDayEventModal(eventItem) {
        dayEventMode = 'edit';
        editingEventId = eventItem.id;
        dayEventTitle.textContent = 'Editar evento del dia';
        saveDayEventBtn.textContent = 'Guardar cambios';
        eventDateInput.value = eventItem.start;
        setTemplateOptions();
        templateSelect.value = String(eventItem.templateId);
        updateTagOptions();
        tagSelect.value = eventItem.selectedTag || '';
        if (tagSelect.value !== (eventItem.selectedTag || '')) {
            tagSelect.value = '';
        }
        openModal(dayEventModal);
    }

    function clearSelectedDayHighlight() {
        const selectedNodes = calendarEl.querySelectorAll('.selected-day-cell');
        selectedNodes.forEach((node) => node.classList.remove('selected-day-cell'));
    }

    function highlightSelectedDayFromClick(jsEvent) {
        clearSelectedDayHighlight();
        const dayCell = jsEvent?.target?.closest('[data-date]');
        if (dayCell) {
            dayCell.classList.add('selected-day-cell');
        }
    }

    function highlightSelectedDayByDate(dateStr) {
        clearSelectedDayHighlight();
        if (!dateStr) {
            return;
        }
        const dayCell = calendarEl.querySelector(`[data-date="${dateStr}"]`);
        if (dayCell) {
            dayCell.classList.add('selected-day-cell');
        }
    }

    function normalizeDateFromEventStart(startStr) {
        const raw = String(startStr || '').trim();
        if (!raw) {
            return '';
        }
        return raw.includes('T') ? raw.split('T')[0] : raw;
    }

    async function selectDateAndRender(dateStr, jsEvent, openModalOnDoubleClick) {
        await fetchTemplates();
        selectedDate = dateStr;
        await fetchDayEvents(selectedDate);

        renderDayPanelView();

        if (jsEvent) {
            highlightSelectedDayFromClick(jsEvent);
        } else {
            highlightSelectedDayByDate(selectedDate);
        }

        if (openModalOnDoubleClick) {
            openCreateDayEventModal();
        }
    }

    function buildTagOptions(select, templateId, selectedTag) {
        select.innerHTML = '';

        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'Sin etiqueta';
        select.appendChild(noneOption);

        const template = getTemplateById(templateId);
        if (!template || !Array.isArray(template.tags)) {
            select.value = '';
            return;
        }

        for (const tag of template.tags) {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            select.appendChild(option);
        }

        select.value = selectedTag || '';
        if (select.value !== (selectedTag || '')) {
            select.value = '';
        }
    }

    function renderDayPanelEdit() {
        dayPanelTitle.textContent = `Editando ${getDateTitle(selectedDate)}`;
        dayPanelHint.textContent = 'Modifica, agrega o elimina y luego guarda cambios.';
        dayPanelView.classList.add('hidden');
        dayPanelEdit.classList.remove('hidden');
        dayPanelEdit.innerHTML = '';

        if (!selectedDate) {
            dayPanelEdit.innerHTML = '<p class="empty-message">Selecciona una fecha primero.</p>';
            return;
        }

        const visibleDrafts = dayEventDrafts.filter((draft) => !draft.deleted);
        if (!visibleDrafts.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-message';
            empty.textContent = 'No hay eventos en este dia. Puedes agregar uno nuevo.';
            dayPanelEdit.appendChild(empty);
        }

        visibleDrafts.forEach((draft, index) => {
            const row = document.createElement('div');
            row.className = 'edit-event-row';
            row.dataset.index = String(index);

            const templateSelectEl = document.createElement('select');
            templateSelectEl.className = 'js-edit-template';
            for (const template of templates) {
                const option = document.createElement('option');
                option.value = String(template.id);
                option.textContent = template.title;
                templateSelectEl.appendChild(option);
            }
            templateSelectEl.value = String(draft.templateId || '');

            const tagSelectEl = document.createElement('select');
            tagSelectEl.className = 'js-edit-tag';
            buildTagOptions(tagSelectEl, Number(templateSelectEl.value), draft.selectedTag || '');

            const actions = document.createElement('div');
            actions.className = 'edit-event-actions';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn btn-danger js-remove-edit-event';
            removeBtn.textContent = 'Eliminar';
            actions.appendChild(removeBtn);

            row.appendChild(templateSelectEl);
            row.appendChild(tagSelectEl);
            row.appendChild(actions);
            dayPanelEdit.appendChild(row);
        });

        const footer = document.createElement('div');
        footer.className = 'day-panel-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn js-cancel-day-edit';
        cancelBtn.textContent = 'Cancelar';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn js-add-day-event';
        addBtn.textContent = '+ Agregar evento';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary js-save-day-edit';
        saveBtn.textContent = 'Guardar cambios del dia';

        footer.appendChild(cancelBtn);
        footer.appendChild(addBtn);
        footer.appendChild(saveBtn);
        dayPanelEdit.appendChild(footer);
    }

    function setTemplateOptions() {
        templateSelect.innerHTML = '';

        if (!templates.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Primero crea un evento base';
            templateSelect.appendChild(option);
            templateSelect.disabled = true;
            tagSelect.disabled = true;
            return;
        }

        templateSelect.disabled = false;
        tagSelect.disabled = false;

        for (const template of templates) {
            const option = document.createElement('option');
            option.value = String(template.id);
            option.textContent = template.title;
            templateSelect.appendChild(option);
        }

        updateTagOptions();
    }

    function updateTagOptions() {
        const selectedId = Number(templateSelect.value);
        const selectedTemplate = templates.find((t) => t.id === selectedId);

        tagSelect.innerHTML = '';

        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'Sin etiqueta';
        tagSelect.appendChild(noneOption);

        if (!selectedTemplate || !selectedTemplate.tags.length) {
            return;
        }

        for (const tag of selectedTemplate.tags) {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagSelect.appendChild(option);
        }
    }

    function initCalendar() {
        if (calendar) {
            return;
        }

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'es',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            dateClick: async function(info) {
                try {
                    await selectDateAndRender(
                        info.dateStr,
                        info.jsEvent,
                        Boolean(info.jsEvent && info.jsEvent.detail >= 2)
                    );
                } catch (error) {
                    showToast(error.message, true);
                }
            },
            eventClick: async function(info) {
                try {
                    const dateStr = normalizeDateFromEventStart(info.event.startStr);
                    if (!dateStr) {
                        return;
                    }
                    await selectDateAndRender(dateStr, null, false);
                } catch (error) {
                    showToast(error.message, true);
                }
            },
            events: function(fetchInfo, successCallback, failureCallback) {
                apiRequest('/api/eventos')
                    .then((data) => {
                        successCallback(data);
                    })
                    .catch((error) => {
                        console.error('Hubo un problema al cargar los eventos:', error);
                        failureCallback(error);
                    });
            }
        });

        calendar.render();
    }

    dayPanelEdit.addEventListener('change', function(event) {
        const row = event.target.closest('.edit-event-row');
        if (!row) {
            return;
        }

        const visibleDrafts = dayEventDrafts.filter((draft) => !draft.deleted);
        const index = Number(row.dataset.index);
        const draft = visibleDrafts[index];
        if (!draft) {
            return;
        }

        if (event.target.classList.contains('js-edit-template')) {
            draft.templateId = Number(event.target.value);
            const tagSelectEl = row.querySelector('.js-edit-tag');
            draft.selectedTag = '';
            buildTagOptions(tagSelectEl, draft.templateId, '');
            return;
        }

        if (event.target.classList.contains('js-edit-tag')) {
            draft.selectedTag = String(event.target.value || '');
        }
    });

    dayPanelEdit.addEventListener('click', async function(event) {
        if (event.target.classList.contains('js-remove-edit-event')) {
            const row = event.target.closest('.edit-event-row');
            if (!row) {
                return;
            }
            const visibleDrafts = dayEventDrafts.filter((draft) => !draft.deleted);
            const index = Number(row.dataset.index);
            const draft = visibleDrafts[index];
            if (!draft) {
                return;
            }
            if (draft.isNew) {
                dayEventDrafts = dayEventDrafts.filter((item) => item !== draft);
            } else {
                draft.deleted = true;
            }
            renderDayPanelEdit();
            return;
        }

        if (event.target.classList.contains('js-add-day-event')) {
            if (!templates.length) {
                showToast('Primero crea un evento base.', true);
                return;
            }
            dayEventDrafts.push({
                id: null,
                templateId: templates[0].id,
                selectedTag: '',
                deleted: false,
                isNew: true
            });
            renderDayPanelEdit();
            return;
        }

        if (event.target.classList.contains('js-cancel-day-edit')) {
            dayEventDrafts = dayEvents.map((eventItem) => ({
                id: eventItem.id,
                templateId: eventItem.templateId,
                selectedTag: eventItem.selectedTag || '',
                deleted: false,
                isNew: false
            }));
            renderDayPanelView();
            return;
        }

        if (event.target.classList.contains('js-save-day-edit')) {
            try {
                const draftsToDelete = dayEventDrafts.filter((draft) => draft.deleted && !draft.isNew && draft.id);
                const draftsToUpdate = dayEventDrafts.filter((draft) => !draft.deleted && !draft.isNew && draft.id);
                const draftsToCreate = dayEventDrafts.filter((draft) => !draft.deleted && draft.isNew);

                for (const draft of draftsToDelete) {
                    await apiRequest(`/api/eventos/${draft.id}`, { method: 'DELETE' });
                }

                for (const draft of draftsToUpdate) {
                    await apiRequest(`/api/eventos/${draft.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            templateId: Number(draft.templateId),
                            selectedTag: draft.selectedTag || ''
                        })
                    });
                }

                for (const draft of draftsToCreate) {
                    await apiRequest('/api/eventos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            templateId: Number(draft.templateId),
                            start: selectedDate,
                            selectedTag: draft.selectedTag || ''
                        })
                    });
                }

                await fetchDayEvents(selectedDate);
                if (calendar) {
                    calendar.refetchEvents();
                }
                renderDayPanelView();
                showToast('Eventos del dia actualizados.');
            } catch (error) {
                showToast(error.message, true);
            }
        }
    });

    dayPanelView.addEventListener('click', async function(event) {
        const card = event.target.closest('.day-event-card');
        if (!card) {
            return;
        }

        const eventId = Number(card.dataset.eventId);
        const eventItem = dayEvents.find((item) => item.id === eventId);
        if (!eventItem) {
            return;
        }

        if (event.target.classList.contains('js-day-delete')) {
            const ok = window.confirm('¿Seguro que quieres eliminar este evento del dia?');
            if (!ok) {
                return;
            }

            try {
                await apiRequest(`/api/eventos/${eventId}`, { method: 'DELETE' });

                await fetchDayEvents(selectedDate);
                if (calendar) {
                    calendar.refetchEvents();
                }
                renderDayPanelView();
                showToast('Evento eliminado.');
            } catch (error) {
                showToast(error.message, true);
            }
            return;
        }

        if (event.target.classList.contains('js-day-edit')) {
            try {
                await fetchTemplates();
                openEditDayEventModal(eventItem);
            } catch (error) {
                showToast(error.message, true);
            }
        }
    });

    openTemplateModalBtn.addEventListener('click', function() {
        resetTemplateForm();
        openModal(templateModal);
        templateTitleInput.focus();
    });

    openManageModalBtn.addEventListener('click', async function() {
        try {
            await fetchTemplates();
            selectedManageTemplateId = templates.length ? templates[0].id : null;
            renderManageTemplateList();
            hydrateManageForm();
            openModal(manageModal);
        } catch (error) {
            showToast(error.message, true);
        }
    });

    closeTemplateModalBtn.addEventListener('click', function() {
        closeModal(templateModal);
        resetTemplateForm();
    });

    cancelTemplateBtn.addEventListener('click', function() {
        closeModal(templateModal);
        resetTemplateForm();
    });

    closeManageModalBtn.addEventListener('click', function() {
        closeModal(manageModal);
    });

    cancelManageBtn.addEventListener('click', function() {
        closeModal(manageModal);
    });

    closeDayModalBtn.addEventListener('click', function() {
        closeModal(dayEventModal);
        resetDayForm();
        dayEventMode = 'create';
        editingEventId = null;
        dayEventTitle.textContent = 'Agregar evento al dia';
        saveDayEventBtn.textContent = 'Guardar en calendario';
    });

    cancelDayEventBtn.addEventListener('click', function() {
        closeModal(dayEventModal);
        resetDayForm();
        dayEventMode = 'create';
        editingEventId = null;
        dayEventTitle.textContent = 'Agregar evento al dia';
        saveDayEventBtn.textContent = 'Guardar en calendario';
    });

    addTagBtn.addEventListener('click', addTag);
    addManageTagBtn.addEventListener('click', addManageTag);

    tagInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            addTag();
        }
    });

    manageTagInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            addManageTag();
        }
    });

    templateSelect.addEventListener('change', updateTagOptions);

    templateForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const title = templateTitleInput.value.trim();
        if (!title) {
            showToast('Debes escribir un titulo.', true);
            return;
        }

        try {
            await apiRequest('/api/plantillas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, tags: workingTags, color: selectedTemplateColor })
            });

            closeModal(templateModal);
            resetTemplateForm();
            await fetchTemplates();
            showToast('Evento base guardado.');
        } catch (error) {
            showToast(error.message, true);
        }
    });

    dayEventForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        if (!templateSelect.value) {
            showToast('Debes elegir un evento base.', true);
            return;
        }

        try {
            const isEdit = dayEventMode === 'edit' && Number.isInteger(editingEventId);
            const requestUrl = isEdit ? `/api/eventos/${editingEventId}` : '/api/eventos';
            const requestMethod = isEdit ? 'PUT' : 'POST';
            const requestBody = isEdit
                ? {
                    templateId: Number(templateSelect.value),
                    selectedTag: tagSelect.value
                }
                : {
                    templateId: Number(templateSelect.value),
                    start: eventDateInput.value,
                    selectedTag: tagSelect.value
                };

            await apiRequest(requestUrl, {
                method: requestMethod,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            closeModal(dayEventModal);
            resetDayForm();
            dayEventMode = 'create';
            editingEventId = null;
            dayEventTitle.textContent = 'Agregar evento al dia';
            saveDayEventBtn.textContent = 'Guardar en calendario';
            if (selectedDate) {
                await fetchDayEvents(selectedDate);
                renderDayPanelView();
            }
            if (calendar) {
                calendar.refetchEvents();
            }
            showToast(isEdit ? 'Evento actualizado.' : 'Evento agregado al calendario.');
        } catch (error) {
            showToast(error.message, true);
        }
    });

    manageTemplateForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        if (!selectedManageTemplateId) {
            showToast('Selecciona un evento base.', true);
            return;
        }

        const title = manageTemplateTitleInput.value.trim();
        if (!title) {
            showToast('El titulo es obligatorio.', true);
            return;
        }

        try {
            await apiRequest(`/api/plantillas/${selectedManageTemplateId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, tags: manageWorkingTags, color: selectedManageColor })
            });

            await fetchTemplates();
            renderManageTemplateList();
            hydrateManageForm();
            closeModal(manageModal);
            showToast('Evento base actualizado.');
        } catch (error) {
            showToast(error.message, true);
        }
    });

    deleteTemplateBtn.addEventListener('click', async function() {
        if (!selectedManageTemplateId) {
            showToast('Selecciona un evento base.', true);
            return;
        }

        const ok = window.confirm('¿Seguro que quieres eliminar este evento base?');
        if (!ok) {
            return;
        }

        try {
            await apiRequest(`/api/plantillas/${selectedManageTemplateId}`, {
                method: 'DELETE'
            });

            await fetchTemplates();
            selectedManageTemplateId = templates.length ? templates[0].id : null;
            renderManageTemplateList();
            hydrateManageForm();
            showToast('Evento base eliminado.');
        } catch (error) {
            showToast(error.message, true);
        }
    });

    // Evita cierres accidentales al interactuar con el selector nativo de color.
    // El cierre queda controlado por botones X/Cancelar.

    showRegisterBtn.addEventListener('click', function() {
        loginView.classList.add('hidden');
        registerView.classList.remove('hidden');
        loginForm.reset();
    });

    showLoginBtn.addEventListener('click', function() {
        registerView.classList.add('hidden');
        loginView.classList.remove('hidden');
        registerForm.reset();
    });

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value;

        try {
            const payload = await apiRequest('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            currentUser = payload.user;
            initCalendar();
            if (calendar) {
                calendar.refetchEvents();
            }
            showAppView();
            loginForm.reset();
            showToast('Sesion iniciada.');
        } catch (error) {
            showToast(error.message, true);
        }
    });

    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const username = registerUsernameInput.value.trim();
        const password = registerPasswordInput.value;

        try {
            await apiRequest('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            showToast('Cuenta creada. Ahora inicia sesion.');
            showLoginBtn.click();
        } catch (error) {
            showToast(error.message, true);
        }
    });

    logoutBtn.addEventListener('click', async function() {
        try {
            await apiRequest('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            showToast(error.message, true);
        }

        currentUser = null;
        selectedDate = null;
        dayEvents = [];
        clearSelectedDayHighlight();
        renderDayPanelView();
        showAuthView();
    });

    renderColorOptions(templateColorOptions, selectedTemplateColor, onTemplateColorSelect);
    renderColorOptions(manageColorOptions, selectedManageColor, onManageColorSelect);

    (async function bootstrapAuth() {
        try {
            const payload = await apiRequest('/api/auth/me');
            currentUser = payload.user;
            initCalendar();
            showAppView();
        } catch (error) {
            showAuthView();
        }
    })();
});