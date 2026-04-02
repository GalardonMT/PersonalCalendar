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
    const openAdminModalBtn = document.getElementById('openAdminModal');
    const adminModal = document.getElementById('adminModal');
    const closeAdminModal = document.getElementById('closeAdminModal');
    const adminUserList = document.getElementById('adminUserList');
    const adminEditUserForm = document.getElementById('adminEditUserForm');
    const adminEditUserId = document.getElementById('adminEditUserId');
    const adminEditUsername = document.getElementById('adminEditUsername');
    const adminEditPassword = document.getElementById('adminEditPassword');
    const adminCancelEditBtn = document.getElementById('adminCancelEditBtn');
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
    const openViewEventsModalBtn = document.getElementById('openViewEventsModal');
    const closeTemplateModalBtn = document.getElementById('closeTemplateModal');
    const cancelTemplateBtn = document.getElementById('cancelTemplate');
    const closeManageModalBtn = document.getElementById('closeManageModal');
    const cancelManageBtn = document.getElementById('cancelManage');
    const viewEventsModal = document.getElementById('viewEventsModal');
    const closeViewEventsModalBtn = document.getElementById('closeViewEventsModal');
    const closeViewEventsFooterBtn = document.getElementById('closeViewEventsFooter');
    const eventsFilterSelect = document.getElementById('eventsFilterSelect');
    const eventsPreviewList = document.getElementById('eventsPreviewList');

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
    const templateVisualSelect = document.getElementById('templateVisualSelect');
    const tagSelect = document.getElementById('tagSelect');

    const manageTemplateList = document.getElementById('manageTemplateList');
    const manageTemplateForm = document.getElementById('manageTemplateForm');
    const manageTemplateTitleInput = document.getElementById('manageTemplateTitle');
    const manageTagInput = document.getElementById('manageTagInput');
    const addManageTagBtn = document.getElementById('addManageTagBtn');
    const manageTagList = document.getElementById('manageTagList');
    const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
    const duplicateTemplateBtn = document.getElementById('duplicateTemplateBtn');
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
    let detailedEvents = [];
    const DOUBLE_TAP_DELAY_MS = 350;
    let lastTapDateStr = '';
    let lastTapTimestamp = 0;

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
        if (currentUser?.is_superuser) {
            openAdminModalBtn.classList.remove('hidden');
        } else {
            openAdminModalBtn.classList.add('hidden');
        }
        if (calendar) {
            window.setTimeout(() => calendar.updateSize(), 0);
        }
    }

    async function apiRequest(url, options) {
        if (window.location.protocol === 'file:') {
            throw new Error('Por favor, abre la aplicacion desde http://localhost:3000 para que funcione correctamente, no desde el archivo local.');
        }
        const requestOptions = { ...(options || {}) };
        const method = String(requestOptions.method || 'GET').toUpperCase();
        if (method === 'GET' && !Object.prototype.hasOwnProperty.call(requestOptions, 'cache')) {
            requestOptions.cache = 'no-store';
        }

        const response = await fetch(url, requestOptions);
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
            throw new Error(payload?.message || `Error del servidor (${response.status}). Asegurate de que el servidor este encendido.`);
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

    async function fetchDetailedEvents() {
        try {
            detailedEvents = await apiRequest('/api/eventos-detalle');
            return;
        } catch (error) {
            // Compatibilidad con versiones anteriores del backend que no tienen /api/eventos-detalle
            const message = String(error?.message || '');
            if (!message.includes('Route GET:/api/eventos-detalle not found')) {
                throw error;
            }
        }

        const basicEvents = await apiRequest('/api/eventos');
        detailedEvents = basicEvents.map((eventItem) => {
            const rawTitle = String(eventItem.title || '');
            const match = rawTitle.match(/^(.*)\s\[(.*)\]$/);
            const title = match ? match[1].trim() : rawTitle;
            const selectedTag = match ? match[2].trim() : '';
            const template = templates.find((t) => t.title === title);

            return {
                id: eventItem.id,
                templateId: template ? template.id : null,
                title,
                start: eventItem.start,
                selectedTag,
                color: eventItem.backgroundColor || DEFAULT_COLOR
            };
        });
    }

    function formatEventDateParts(dateStr) {
        const date = new Date(`${dateStr}T00:00:00`);
        const month = new Intl.DateTimeFormat('es', { month: 'long' }).format(date);
        const day = new Intl.DateTimeFormat('es', { day: '2-digit' }).format(date);
        return { month, day };
    }

    function renderEventsPreview() {
        const selectedTemplateId = Number(eventsFilterSelect.value);
        const filtered = Number.isInteger(selectedTemplateId) && selectedTemplateId > 0
            ? detailedEvents.filter((eventItem) => eventItem.templateId === selectedTemplateId)
            : detailedEvents;

        eventsPreviewList.innerHTML = '';

        if (!filtered.length) {
            eventsPreviewList.innerHTML = '<p class="empty-message">No hay eventos para ese filtro.</p>';
            return;
        }

        for (const eventItem of filtered) {
            const dateParts = formatEventDateParts(eventItem.start);
            const row = document.createElement('div');
            row.className = 'event-preview-item';
            row.style.borderLeftColor = eventItem.color || DEFAULT_COLOR;

            row.innerHTML = `
                <div class="event-preview-date">
                    <span class="event-preview-month">${dateParts.month}</span>
                    <strong class="event-preview-day">${dateParts.day}</strong>
                </div>
                <div class="event-preview-info">
                    <p class="event-preview-title">${eventItem.title}</p>
                    <p class="event-preview-tag">Etiqueta: ${eventItem.selectedTag || 'Sin etiqueta'}</p>
                </div>
            `;

            eventsPreviewList.appendChild(row);
        }
    }

    function fillEventsFilterOptions() {
        eventsFilterSelect.innerHTML = '<option value="">Todos los eventos</option>';
        for (const template of templates) {
            const option = document.createElement('option');
            option.value = String(template.id);
            option.textContent = template.title;
            eventsFilterSelect.appendChild(option);
        }
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

    function shouldOpenModalFromInteraction(dateStr, jsEvent) {
        if (Boolean(jsEvent && jsEvent.detail >= 2)) {
            return true;
        }

        if (!dateStr || !jsEvent) {
            return false;
        }

        const eventType = String(jsEvent.type || '');
        const pointerType = String(jsEvent.pointerType || '');
        const isTouchLikeInteraction = pointerType === 'touch' || eventType.startsWith('touch') || (eventType === 'click' && window.matchMedia('(hover: none)').matches);
        if (!isTouchLikeInteraction) {
            return false;
        }

        const now = Date.now();
        const isSameDate = lastTapDateStr === dateStr;
        const isWithinDelay = now - lastTapTimestamp <= DOUBLE_TAP_DELAY_MS;
        lastTapDateStr = dateStr;
        lastTapTimestamp = now;

        if (isSameDate && isWithinDelay) {
            lastTapDateStr = '';
            lastTapTimestamp = 0;
            return true;
        }

        return false;
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
        if (templateVisualSelect) {
            templateVisualSelect.innerHTML = '';
        }

        if (!templates.length) {
            templateSelect.value = '';
            if (templateVisualSelect) {
                templateVisualSelect.textContent = 'Primero crea un evento base';
            }
            tagSelect.disabled = true;
            return;
        }

        tagSelect.disabled = false;

        for (const template of templates) {
            const option = document.createElement('option');
            option.value = String(template.id);
            option.textContent = template.title;
            templateSelect.appendChild(option);

            if (templateVisualSelect) {
                const btn = document.createElement('div');
                btn.className = 'visual-select-item';
                const dot = document.createElement('div');
                dot.className = 'visual-select-dot';
                dot.style.backgroundColor = template.color;
                
                const span = document.createElement('span');
                span.textContent = template.title;
                
                btn.appendChild(dot);
                btn.appendChild(span);
                
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.visual-select-item').forEach(el => el.classList.remove('selected'));
                    btn.classList.add('selected');
                    templateSelect.value = String(template.id);
                    updateTagOptions();
                });
                
                templateVisualSelect.appendChild(btn);
            }
        }
        
        if (templates.length > 0) {
            templateSelect.value = String(templates[0].id);
            if (templateVisualSelect) {
                templateVisualSelect.children[0].classList.add('selected');
            }
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
            firstDay: 1,
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana',
                day: 'Dia'
            },
            dayHeaderFormat: { weekday: 'short' },
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
                        shouldOpenModalFromInteraction(info.dateStr, info.jsEvent)
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
                    await selectDateAndRender(
                        dateStr,
                        info.jsEvent,
                        shouldOpenModalFromInteraction(dateStr, info.jsEvent)
                    );
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

    openViewEventsModalBtn?.addEventListener('click', async function() {
        try {
            await fetchTemplates();
            await fetchDetailedEvents();
            fillEventsFilterOptions();
            renderEventsPreview();
            openModal(viewEventsModal);
        } catch (error) {
            showToast(error.message, true);
        }
    });

    closeViewEventsModalBtn?.addEventListener('click', function() {
        closeModal(viewEventsModal);
    });

    closeViewEventsFooterBtn?.addEventListener('click', function() {
        closeModal(viewEventsModal);
    });

    eventsFilterSelect?.addEventListener('change', renderEventsPreview);

    async function loadAdminUsers() {
        const users = await apiRequest('/api/admin/users');
        adminUserList.innerHTML = '';
        for (const u of users) {
            const li = document.createElement('li');
            li.className = 'admin-user-item';
            
            const info = document.createElement('span');
            info.className = 'admin-user-info';
            info.innerHTML = `<strong>${u.username}</strong> <small>(ID: ${u.id} | Creado: ${new Date(u.created_at).toLocaleDateString()})</small>`;
            li.appendChild(info);

            const actions = document.createElement('div');
            actions.className = 'admin-user-actions';
            
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn';
            editBtn.textContent = 'Editar';
            editBtn.onclick = () => {
                adminEditUserForm.classList.remove('hidden');
                adminEditUserId.value = u.id;
                adminEditUsername.value = u.username;
                adminEditPassword.value = '';
                adminEditUserForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                window.setTimeout(() => adminEditUsername.focus(), 150);
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.textContent = 'Eliminar';
            deleteBtn.onclick = async () => {
                if (!confirm(`¿Eliminar al usuario ${u.username} y todos sus eventos?`)) return;
                try {
                    await apiRequest(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                    showToast('Usuario eliminado.');
                    await loadAdminUsers();
                } catch(e) {
                    showToast(e.message, true);
                }
            };
            
            actions.appendChild(editBtn);
            if (u.id !== currentUser?.id) {
                actions.appendChild(deleteBtn);
            }
            li.appendChild(actions);
            adminUserList.appendChild(li);
        }
    }

    openAdminModalBtn?.addEventListener('click', async function() {
        try {
            adminEditUserForm.classList.add('hidden');
            await loadAdminUsers();
            openModal(adminModal);
        } catch (error) {
            showToast(error.message, true);
        }
    });

    closeAdminModal?.addEventListener('click', function() {
        closeModal(adminModal);
        adminEditUserForm.classList.add('hidden');
    });

    adminCancelEditBtn?.addEventListener('click', function() {
        adminEditUserForm.classList.add('hidden');
    });

    adminEditUserForm?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = adminEditUserId.value;
        const username = adminEditUsername.value.trim();
        const password = adminEditPassword.value;
        try {
            await apiRequest(`/api/admin/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            showToast('Usuario editado correctamente.');
            adminEditUserForm.classList.add('hidden');
            await loadAdminUsers();
        } catch(err) {
            showToast(err.message, true);
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

    templateSelect.addEventListener('change', () => {
        updateTagOptions();
        if (templateVisualSelect) {
            Array.from(templateVisualSelect.children).forEach(child => {
                child.classList.remove('selected');
                if (child.textContent === templateSelect.options[templateSelect.selectedIndex].textContent) {
                     child.classList.add('selected');
                }
            });
        }
    });

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
            await fetchDetailedEvents();
            if (selectedDate) {
                await fetchDayEvents(selectedDate);
                renderDayPanelView();
            }
            if (calendar) {
                calendar.refetchEvents();
            }
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

    duplicateTemplateBtn.addEventListener('click', async function() {
        if (!selectedManageTemplateId) {
            showToast('Selecciona un evento base.', true);
            return;
        }

        const currentTemplate = templates.find(t => t.id === selectedManageTemplateId);
        if (!currentTemplate) return;

        const titleInput = document.getElementById('manageTemplateTitle').value.trim();

        try {
            const body = {
                title: (titleInput || currentTemplate.title) + ' (Copia)',
                color: selectedManageColor || currentTemplate.color,
                tags: [...manageWorkingTags]
            };

            await apiRequest('/api/plantillas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            await fetchTemplates();
            if (templates.length > 0) {
                selectedManageTemplateId = templates[0].id; // Es ordenado por ID descendente en el backend
            }
            renderManageTemplateList();
            hydrateManageForm();
            showToast('Evento base duplicado.');
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