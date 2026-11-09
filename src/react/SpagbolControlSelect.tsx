import type { SelectHTMLAttributes } from 'react';

export type SpagbolControlSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Native dropdown with the same dimensions as the shared numeric port control. */
export function SpagbolControlSelect({ className, ...props }: SpagbolControlSelectProps) {
  return <select
    onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()}
    {...props}
    className={`spagbol-control-select nodrag nopan${className ? ` ${className}` : ''}`}
  />;
}
