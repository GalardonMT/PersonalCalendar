# Personal Calendar

Aplicacion web de calendario personal para gestionar eventos por dia con plantillas reutilizables.

Permite:
- Crear cuenta e iniciar sesion
- Definir eventos base (plantillas) con titulo, color y etiquetas
- Agregar eventos al calendario por fecha usando esas plantillas
- Editar y eliminar eventos
- Administrar usuarios (rol superusuario)

## Tecnologias utilizadas

Backend:
- Node.js
- Fastify
- SQLite (sqlite + sqlite3)

Frontend:
- HTML
- CSS
- JavaScript vanilla
- FullCalendar (cargado en el cliente)

Infraestructura:
- Docker (opcional)

## Requisitos previos

Instalar en tu maquina:
- Node.js 20 o superior
- npm (incluido con Node.js)

Verificar instalacion:

```bash
node -v
npm -v
```

## Instalacion y ejecucion local

1. Clonar o descargar el proyecto.
2. Entrar a la carpeta del proyecto.
3. Instalar dependencias.
4. Iniciar el servidor.

```bash
npm install
npm run dev
```

La app queda disponible en:
- http://localhost:3000

Notas:
- La base SQLite se crea automaticamente en `./database.sqlite`.
- Puedes cambiar la ruta de la base con la variable de entorno `DB_PATH`.

Ejemplo en Windows PowerShell:

```powershell
$env:DB_PATH="./database.sqlite"
npm run dev
```

## Scripts disponibles

```bash
npm run dev
npm start
```

## Crear superusuario

El proyecto incluye el script `make-admin.js` para convertir un usuario existente en superusuario.

Uso:

```bash
node make-admin.js <nombre_de_usuario>
```

Ejemplo:

```bash
node make-admin.js juan
```

## Ejecutar con Docker (opcional)

Construir imagen:

```bash
docker build -t personal-calendar .
```

Ejecutar contenedor:

```bash
docker run -p 3000:3000 -v ${PWD}/data:/data --name personal-calendar personal-calendar
```

La variable `DB_PATH` dentro del contenedor apunta a:
- `/data/database.sqlite`

## Solucion de problemas comunes

- Si `npm run dev` falla:
  - revisa que tengas Node.js 20+
  - ejecuta `npm install` nuevamente
  - verifica que el puerto 3000 no este en uso

- Si no ves cambios en frontend:
  - recarga el navegador con hard refresh (Ctrl + F5)

## Estructura principal del proyecto

- `server.js`: API y logica principal
- `public/index.html`: interfaz
- `public/app.js`: logica cliente
- `public/style.css`: estilos
- `make-admin.js`: utilidad para permisos de administrador
- `Dockerfile`: despliegue en contenedor
