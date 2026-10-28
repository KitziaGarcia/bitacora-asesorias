# Configuración para desarrollo

Cómo ejecutar la aplicación de registro de clases con QR en tu propia computadora. Los comandos son para PowerShell en Windows; funcionan igual desde la raíz del repositorio en cualquier otra terminal, salvo que se indique lo contrario.

## Requisitos

- Node.js 20 o superior (el proyecto se construyó con Node 24) y npm
- Git

## Configuración inicial

Desde la raíz del repositorio:

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env     # macOS/Linux: cp apps/api/.env.example apps/api/.env
npm run db:setup
```

- `npm install` instala los tres workspaces (`packages/shared`, `apps/api`, `apps/web`).
- `apps/api/.env` no se sube a git. Cambia `JWT_SECRET` y `QR_SECRET` (por defecto `change-me`) si otras personas van a poder acceder a la aplicación.
- `npm run db:setup` crea la base de datos SQLite en `apps/api/prisma/dev.db`, genera el cliente de Prisma y carga las 6 clases. Se puede ejecutar varias veces sin problema: solo agrega o actualiza filas, nunca borra.
- En Windows, `db:setup` puede mostrar un error `EPERM` de Prisma al renombrar el archivo del motor de consultas. Si de todos modos aparecen el esquema aplicado y la línea "Seeded 6 classes", ignóralo. Normalmente significa que otro proceso de Node (por ejemplo, un servidor en ejecución) tiene el archivo abierto; deténlo y vuelve a ejecutar el comando.

## Ejecutar

Abre dos terminales en la raíz del repositorio:

```powershell
npm run dev:api    # API en http://localhost:3000
npm run dev:web    # web en http://localhost:5173 (redirige /api a la API)
```

Después abre http://localhost:5173 e inicia sesión con cualquier matrícula, por ejemplo la tuya de 7 dígitos. El primer inicio de sesión con una matrícula nueva crea al estudiante, así que no hay que registrar nada antes.

Si cambias `apps/api/.env`, **reinicia la API** (Ctrl+C en su terminal y vuelve a ejecutar `npm run dev:api`). La API lee ese archivo solo al arrancar y no se reinicia sola cuando cambia.

### Probar el flujo sin teléfono

1. Inicia sesión, haz clic en una clase y aparece el código QR.
2. Haz clic derecho sobre el QR, abre su enlace (se ve como `http://localhost:5173/scan?c=oop&sig=...`) en una pestaña nueva o en una ventana privada e inicia sesión si te lo pide. Debes ver "✓ Registrado".
3. En la primera pestaña, la nueva fila aparece en "Tus registros" en unos 3 segundos.

### Probar el flujo con teléfono

1. Conecta el teléfono y la computadora a la misma red Wi-Fi y busca la dirección IPv4 de la computadora (`ipconfig` en Windows). Más abajo la llamamos `<IP-DE-TU-PC>`; usa la dirección real que te muestre `ipconfig`, no un ejemplo.
2. En `apps/api/.env` escribe `APP_BASE_URL=http://<IP-DE-TU-PC>:5173` y **reinicia la API**. Los códigos QR solo usan la nueva dirección después de reiniciar.
3. Abre `http://<IP-DE-TU-PC>:5173` en la computadora, inicia sesión y haz clic en una clase.
4. Escanea el QR con la aplicación de cámara normal del teléfono. El teléfono abre el enlace, te pide la matrícula la primera vez y luego muestra "✓ Registrado".

El teléfono solo necesita el puerto 5173, porque el servidor web redirige `/api` a la API. Si el teléfono no logra conectarse, permite Node.js en el Firewall de Windows para redes privadas (o agrega una regla de entrada para el puerto 5173).

La página no usa la cámara directamente, así que no se necesita HTTPS.

## Pruebas y compilación

```powershell
npm test                        # pruebas de shared, api y web
npm -w apps/api test            # un solo workspace
npm -w apps/web run build       # revisión de tipos + compilación de producción de la web
```

- Las pruebas de la API usan una base de datos desechable, `apps/api/prisma/test.db`. La preparación de las pruebas la borra y la vuelve a crear en cada ejecución. Nunca toca `dev.db`.
- `apps/web` fija TypeScript 5.9 y revisa los tipos mediante `apps/web/typecheck.cjs`, porque la raíz del repositorio usa TypeScript 7, con el que `vue-tsc` falla.

## Trabajar con la base de datos compartida

El archivo de la base de datos no se sube a git. Las clases se comparten mediante código; los estudiantes se crean al iniciar sesión, por lo que cada desarrollador tiene los suyos:

- Clases: edita `CLASSES` en `packages/shared/src/index.ts`.
- Esquema: `apps/api/prisma/schema.prisma`. El lado del profesor está pensado para extender este archivo, así que coordinen los cambios.

Después de que subas un cambio, un compañero ejecuta:

```powershell
git pull
npm install
npm run db:setup
```

y obtiene las mismas clases. Las filas que un compañero haya agregado directamente en su base de datos se conservan, porque el seed nunca borra.

Para empezar de cero con una base de datos vacía, detén los servidores, borra `apps/api/prisma/dev.db` y vuelve a ejecutar `npm run db:setup`.

## Configuración (variables de entorno)

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `PORT` | `3000` | Puerto de la API |
| `DATABASE_URL` | `file:./dev.db` | Archivo SQLite, relativo a `apps/api/prisma/` |
| `JWT_SECRET` | respaldo `dev-secret` | Firma los tokens de inicio de sesión |
| `QR_SECRET` | respaldo `dev-secret` | Firma los enlaces de los códigos QR |
| `APP_BASE_URL` | `http://localhost:5173` | Dirección que se codifica en el QR; ponla con la IP de tu red local para probar con teléfono |

## Solución de problemas

- **El inicio de sesión creó un estudiante que no quería:** la matrícula tenía un error de escritura. Nada valida el formato, así que cualquier matrícula nueva se convierte en estudiante. Borra la fila o reinicia la base de datos (ver arriba).
- **El QR abre una dirección a la que el teléfono no llega (por ejemplo `localhost`):** `APP_BASE_URL` todavía dice `localhost`, o cambiaste `.env` y no reiniciaste la API. Corrígelo, reinicia la API y vuelve a abrir el QR de la clase.
- **La página de clases está vacía o muestra un error:** la API no está en ejecución. Inicia `npm run dev:api` y revisa http://localhost:3000/api/classes.
- **El puerto ya está en uso (`EADDRINUSE`):** detén el otro proceso (`netstat -ano | findstr :3000`), o cambia `PORT` en la API (y el destino del proxy en `apps/web/vite.config.ts`).

## Limitaciones conocidas

El inicio de sesión usa solo la matrícula (sin contraseña), la imagen del QR es pública y nunca caduca, y los registros son autodeclarados: cualquier estudiante con sesión iniciada puede registrarse en cualquier clase, por lo que no prueban presencia. El candado contra escaneos duplicados funciona por proceso, así que ejecuta una sola instancia de la API. Consulta `README.md` para más detalles.
