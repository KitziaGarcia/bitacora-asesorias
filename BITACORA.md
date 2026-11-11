# Bitácora de asesorías académicas

La aplicación registra asesorías de la UABC mediante códigos QR. Una asesoría nueva identifica al alumno, al maestro, a la materia y al momento del registro.

| Portal | Flujo |
| --- | --- |
| Estudiante | Entra con su matrícula, elige al maestro que lo atendió y abre el QR de una de sus materias. Al escanearlo o pulsar **Probar desde esta laptop**, registra la visita. **Tus registros** muestra su historial. |
| Maestro | Entra con usuario y contraseña. Consulta únicamente sus asesorías y puede filtrar por alumno, materia y fechas. |
| Administrador | Entra con usuario y contraseña. Ve todos los registros y puede filtrar también por maestro. El menú lateral permite ir a **Registros**, **Dar de alta materia** y **Dar de alta maestro**. Las dos altas están en construcción. |

Los registros anteriores conservan su matrícula, materia y fecha y se muestran como **Sin maestro asignado**. Los QR anteriores están retirados. Para una visita nueva, abre un QR desde la materia del maestro que te atendió.

## Prueba local

Desde la raíz del repositorio, aplica el esquema y carga los datos de demo con `npm run db:setup`. Si ya estaban corriendo los servidores, reinicia la API y abre `http://localhost:5173/inicio`. Consulta [DEVELOPMENT.md](DEVELOPMENT.md) para instalar y ejecutar el proyecto desde cero.

| Usuario de demo | Materias |
| --- | --- |
| `gael` | OOP, IoT |
| `diego` | OOP, Embedded Systems |
| `juan` | Advanced Electronics |
| `kitzia` | Software Engineering |
| `curlango` | AI |
| `admin` | Acceso al portal administrador |

La contraseña inicial de las cuentas de demo es `asesorias-demo`, salvo que se haya definido `DEMO_STAFF_PASSWORD` antes de crearlas. Para comprobar el alcance por rol, registra una asesoría de OOP con Gael y otra con Diego usando la misma matrícula. El alumno y el administrador verán ambas. Cada maestro verá solo la suya.

El proyecto usa Vue, Express, Prisma y SQLite. Consulta [CONTINUAR_ADMIN.md](CONTINUAR_ADMIN.md) para extender la administración.
