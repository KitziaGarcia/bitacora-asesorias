import type { Prisma } from '@prisma/client';
import type { RegistrationDto } from '@bitacora/shared';

export const registrationInclude = {
  class: true,
  assignment: { include: { teacher: { select: { id: true, name: true } } } },
} satisfies Prisma.RegistrationInclude;

export function toRegistrationDto(row: Prisma.RegistrationGetPayload<{ include: typeof registrationInclude }>): RegistrationDto {
  return {
    id: row.id,
    studentId: row.studentId,
    classCode: row.classCode,
    className: row.class.name,
    registeredAt: row.registeredAt.toISOString(),
    teacherId: row.assignment?.teacher.id ?? null,
    teacherName: row.assignment?.teacher.name ?? null,
  };
}
