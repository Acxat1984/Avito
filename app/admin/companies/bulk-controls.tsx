'use client';

import type { ReactNode } from 'react';

/** Чекбокс «выделить все»: переключает все input[name=ids] внутри своей формы. */
export function SelectAllCheckbox() {
  return (
    <input
      type="checkbox"
      title="Выделить все на странице"
      onChange={(e) => {
        const checked = e.currentTarget.checked;
        const form = e.currentTarget.closest('form');
        form
          ?.querySelectorAll<HTMLInputElement>('input[name="ids"]')
          .forEach((cb) => {
            cb.checked = checked;
          });
      }}
    />
  );
}

/**
 * Submit-кнопка с confirm() для массовых операций.
 * formAction позволяет отправить ту же форму в другой server action —
 * так одна таблица с чекбоксами обслуживает и смену статуса, и удаление.
 */
export function ConfirmButton({
  message,
  className,
  children,
  formAction,
}: {
  message: string;
  className?: string;
  children: ReactNode;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  return (
    <button
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
