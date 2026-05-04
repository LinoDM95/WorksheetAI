import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

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
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
  className?: string;
};

export type ButtonAsButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    as?: 'button';
  };

export type ButtonAsLinkProps = CommonProps &
  Omit<LinkProps, 'children' | 'className'> & {
    as: 'link';
  };

export type ButtonAsAnchorProps = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    as: 'a';
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps | ButtonAsAnchorProps;

const buildClass = (
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  className?: string,
) =>
  cn(
    'btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth && 'w-full',
    className,
  );

const Spinner = () => (
  <span className="loading-dots" aria-hidden>
    <span className="loading-dots__dot" />
    <span className="loading-dots__dot" />
    <span className="loading-dots__dot" />
  </span>
);

const renderInner = (
  leftIcon: ReactNode,
  children: ReactNode,
  rightIcon: ReactNode,
  loading: boolean,
) => (
  <>
    {leftIcon}
    {children}
    {loading ? <Spinner /> : rightIcon}
  </>
);

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (props, ref) => {
    const {
      variant = 'primary',
      size = 'md',
      leftIcon,
      rightIcon,
      loading = false,
      fullWidth = false,
      className,
      children,
    } = props;
    const klass = buildClass(variant, size, fullWidth, className);

    if (props.as === 'link') {
      const { as: _as, ...rest } = props;
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          {...(rest as LinkProps)}
          className={klass}
        >
          {renderInner(leftIcon, children, rightIcon, loading)}
        </Link>
      );
    }

    if (props.as === 'a') {
      const { as: _as, ...rest } = props;
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
          className={klass}
        >
          {renderInner(leftIcon, children, rightIcon, loading)}
        </a>
      );
    }

    const { as: _as, ...rest } = props as ButtonAsButtonProps;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={rest.type ?? 'button'}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        disabled={rest.disabled || loading}
        className={klass}
      >
        {renderInner(leftIcon, children, rightIcon, loading)}
      </button>
    );
  },
);
Button.displayName = 'Button';
