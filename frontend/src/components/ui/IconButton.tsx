import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';
import type { ButtonSize, ButtonVariant } from './Button';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  success: 'btn-success',
  danger: 'btn-danger',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Pflicht: aria-label, da kein sichtbares Label. */
  'aria-label': string;
  /** Sichtbarer Tooltip — fällt sonst auf aria-label zurück. */
  title?: string;
  children: ReactNode;
  className?: string;
};

type IconButtonAsButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title' | 'children' | 'className'> & {
    as?: 'button';
  };

type IconButtonAsLinkProps = CommonProps &
  Omit<LinkProps, 'aria-label' | 'title' | 'children' | 'className'> & {
    as: 'link';
  };

export type IconButtonProps = IconButtonAsButtonProps | IconButtonAsLinkProps;

const buildClass = (variant: ButtonVariant, size: ButtonSize, className?: string) =>
  cn('btn btn-icon', VARIANT_CLASS[variant], SIZE_CLASS[size], className);

export const IconButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, IconButtonProps>(
  (props, ref) => {
    const { variant = 'ghost', size = 'sm', children, className, title } = props;
    const ariaLabel = props['aria-label'];
    const klass = buildClass(variant, size, className);
    const titleProp = title ?? ariaLabel;

    if (props.as === 'link') {
      const { as: _as, variant: _v, size: _s, children: _c, className: _cl, title: _t, ...rest } =
        props;
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          {...(rest as LinkProps)}
          aria-label={ariaLabel}
          title={titleProp}
          className={klass}
        >
          {children}
        </Link>
      );
    }

    const { as: _as, variant: _v, size: _s, children: _c, className: _cl, title: _t, ...rest } =
      props as IconButtonAsButtonProps;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={rest.type ?? 'button'}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        aria-label={ariaLabel}
        title={titleProp}
        className={klass}
      >
        {children}
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';
