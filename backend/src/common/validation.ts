import { BadRequestException, type ValidationError } from '@nestjs/common';
import type { TransformFnParams } from 'class-transformer';

/** class-transformer helper: trim string inputs, leave other types untouched. */
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

function firstMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    const constraint = Object.values(error.constraints ?? {})[0];
    if (constraint) return constraint;
    const nested = firstMessage(error.children ?? []);
    if (nested) return nested;
  }
  return 'ข้อมูลไม่ถูกต้อง';
}

/** Keeps validation failures in the same `{ success, message }` shape the UI expects. */
export const validationExceptionFactory = (errors: ValidationError[]) =>
  new BadRequestException({ success: false, message: firstMessage(errors) });
