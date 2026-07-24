import type { ButtonHTMLAttributes } from 'react';
import { tv } from 'tailwind-variants';

const button = tv({
  base: 'rounded-lg border border-[#2c333d] bg-[#1b2027] px-2.5 py-1 text-neutral-200 cursor-pointer hover:enabled:bg-[#232a33] disabled:cursor-default disabled:opacity-50',
});

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={button({ class: className })} />;
}
