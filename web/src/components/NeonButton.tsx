import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './NeonButton.css';

type Common = { children: ReactNode; size?: 'md' | 'lg'; className?: string; onClick?: () => void };
export type NeonButtonProps = Common & ({ to: string; href?: never } | { href: string; to?: never });

/** The sign-up/join CTA: lime text on dark, with a spinning neon border + bloom (CSS only). */
export function NeonButton({ children, size = 'md', className, onClick, ...target }: NeonButtonProps) {
  const cls = ['neon-btn', `neon-btn--${size}`, className].filter(Boolean).join(' ');
  if ('href' in target && target.href !== undefined) {
    return (
      <a className={cls} href={target.href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        <span className="neon-btn__label">{children}</span>
      </a>
    );
  }
  return (
    <Link className={cls} to={target.to as string} onClick={onClick}>
      <span className="neon-btn__label">{children}</span>
    </Link>
  );
}
