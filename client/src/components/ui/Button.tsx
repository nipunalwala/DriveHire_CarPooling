import type { ButtonHTMLAttributes, ReactNode } from 'react';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  children: ReactNode;
};
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      className={`button ${variant}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span aria-hidden="true">◌ </span>}
      {children}
    </button>
  );
}
