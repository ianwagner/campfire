import React from 'react';
import PropTypes from 'prop-types';

const VARIANT_CLASSNAMES = {
  default: 'border-gray-200',
  dashed: 'border-dashed border-gray-300 dark:border-gray-700',
  muted: 'border-gray-200 bg-gray-50 dark:bg-[var(--dark-sidebar-hover)]',
};

const BASE_CLASSNAME =
  'rounded-2xl border bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]';

/**
 * Renders a reusable surface wrapper with the shared card treatment used across review surfaces.
 *
 * @param {Object} props
 * @param {React.ElementType} [props.as='div'] - The element or component to render as the card wrapper.
 * @param {'default'|'dashed'|'muted'} [props.variant='default'] - Visual variant for alternate border/background treatments.
 *   Use `dashed` for empty states that need a dashed outline and `muted` for subdued backgrounds.
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
 */
const SurfaceCard = React.forwardRef(function SurfaceCard(
  { as: Component = 'div', variant = 'default', className = '', children, ...rest },
  ref,
) {
  const variantClassName = VARIANT_CLASSNAMES[variant] || VARIANT_CLASSNAMES.default;
  const mergedClassName = [BASE_CLASSNAME, variantClassName, className].filter(Boolean).join(' ');

  return (
    <Component ref={ref} className={mergedClassName} {...rest}>
      {children}
    </Component>
  );
});

SurfaceCard.displayName = 'SurfaceCard';

SurfaceCard.propTypes = {
  as: PropTypes.elementType,
  variant: PropTypes.oneOf(['default', 'dashed', 'muted']),
  className: PropTypes.string,
  children: PropTypes.node,
};

export default SurfaceCard;
