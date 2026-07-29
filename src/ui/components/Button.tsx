import type { ButtonHTMLAttributes } from 'react';
import { tv } from 'tailwind-variants';

const button = tv({
  base: 'control inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-1.5 text-neutral-100 cursor-pointer',
  variants: {
    disabled: { true: 'cursor-not-allowed opacity-45' },
  },
});

export function Button({ className, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled}
      aria-disabled={disabled}
      className={button({ disabled, class: className })}
    />
  );
}
