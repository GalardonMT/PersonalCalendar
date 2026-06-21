/**
 * components.js
 * Carga los componentes HTML definidos en public/components/
 * e inyecta su contenido en el body antes de inicializar la app.
 *
 * Los componentes se cargan de forma síncrona-in-order usando fetch + innerHTML
 * para garantizar que todos los IDs existen cuando app.js los busca.
 */

const COMPONENTS = [
    '/components/auth.html',
    '/components/modal-template.html',
    '/components/modal-day-event.html',
    '/components/modal-view-events.html',
    '/components/modal-dialog.html',
    '/components/modal-admin.html',
    '/components/modal-admin-edit.html',
    '/components/modal-whatsapp.html',
    '/components/modal-manage.html',
];

(async function loadComponents() {
    const container = document.getElementById('app-components');
    if (!container) return;

    for (const url of COMPONENTS) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to load component: ${url} (${res.status})`);
            const html = await res.text();
            container.insertAdjacentHTML('beforeend', html);
        } catch (err) {
            console.error('[components.js]', err);
        }
    }

    // Dispatch custom event so app.js knows DOM is ready
    document.dispatchEvent(new Event('components:ready'));
})();
