# Continuar el portal de administración

## Punto de partida

`apps/web/src/pages/AdminPage.vue` contiene el menú lateral. `apps/web/src/router.ts` define las rutas protegidas por rol. `/admin/materias` y `/admin/maestros` usan `AdminPlaceholder.vue`. Cada ruta puede apuntar a su propio formulario cuando se implemente.

La vista de registros usa `TeacherPage.vue` con el rol correspondiente. Consulta `GET /api/admin/registrations` para el total y `GET /api/teacher/registrations` para los registros del maestro autenticado. El filtrado y ordenamiento se aplican en el navegador a los registros que devuelve la API.

## Datos y altas

- `Class` representa la materia. Su clave es `code`. El nombre puede editarse sin cambiar el código.
- `Staff` representa cuentas con rol `teacher` o `admin`. El usuario es único. Normaliza el usuario a minúsculas y reutiliza `hashPassword` de `staff-auth.ts` para crear cuentas. Nunca devuelvas `passwordHash` al navegador.
- `TeachingAssignment` relaciona un maestro con una materia. La pareja `teacherId + classCode` es única. Una materia puede corresponder a varios maestros. Valida que el usuario asignado tenga rol `teacher`.
- `Registration` guarda `assignmentId` junto con `classCode`. Las filas anteriores tienen `assignmentId = null`. Conserva el historial. Si se necesita dar de baja una asignación usada, agrega un estado inactivo en lugar de borrar o reasignar la fila histórica.

Para implementar las altas, agrega rutas de escritura con `requireStaff('admin')`, valida los datos en el servidor y devuelve mensajes claros si el código, el usuario o la pareja ya existen. Para crear un maestro con sus asignaciones en una sola operación, usa una transacción. El catálogo del estudiante ya consulta las relaciones en la base de datos mediante `GET /api/teachers`, así que las asignaciones nuevas aparecerán sin cambiar las tarjetas.

## QR y permisos

La ruta `GET /api/classes/:code/qr?a=<assignmentId>` emite un QR firmado con el código de materia y el ID de la asignación. El escaneo llega a `/scan?c=…&a=…&sig=…`. `POST /api/registrations` verifica la firma, la relación y la sesión de estudiante antes de guardar. El bloqueo de duplicados usa matrícula y asignación, por lo que dos maestros de la misma materia generan registros distintos.

Los QR viejos carecen de asignación y se rechazan. Los registros históricos siguen visibles para el alumno correspondiente y el administrador. La API filtra al maestro con su identidad autenticada, independientemente de los filtros de la tabla.

Al terminar las altas, prueba crear un maestro y una materia, relacionarlos, registrar una asesoría con el nuevo QR y comprobar que solo el alumno, ese maestro y el administrador puedan consultarla.
