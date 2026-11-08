import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface SpagbolCanvasMenuProps {
  children: ReactNode;
  label?: ReactNode;
  ariaLabel?: string;
  className?: string;
  menuClassName?: string;
  triggerClassName?: string;
}
/** Controller-independent menu mechanics; the host owns actions and styling. */
export function SpagbolCanvasMenu({
  children,
  label = "MORE ˆ",
  ariaLabel = "More actions",
  className,
  menuClassName,
  triggerClassName,
}: SpagbolCanvasMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  function close(restoreFocus = false) {
    if (restoreFocus) trigger.current?.focus();
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !wrapper.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  return (
    <div
      ref={wrapper}
      className={`spagbol-canvas-menu ${className ?? ""}`}
      data-open={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          close(true);
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
          const key = event.key;
          requestAnimationFrame(() => {
            const buttons = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) ?? [],
            );
            const current = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const index =
              key === "Home"
                ? 0
                : key === "End"
                  ? buttons.length - 1
                  : current < 0
                    ? key === "ArrowDown"
                      ? 0
                      : buttons.length - 1
                    : (current +
                        (key === "ArrowDown" ? 1 : -1) +
                        buttons.length) %
                      buttons.length;
            buttons[index]?.focus();
          });
        }
      }}
    >
      <button
        ref={trigger}
        className={`spagbol-canvas-menu-trigger ${triggerClassName ?? ""}`}
        type="button"
        aria-haspopup="menu"
        aria-controls={id}
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <div
        ref={menu}
        id={id}
        className={`spagbol-canvas-menu-items ${menuClassName ?? ""}`}
        role="menu"
        aria-label={ariaLabel}
        hidden={!open}
        onClick={(event) => {
          const button =
            event.target instanceof Element
              ? event.target.closest("button")
              : null;
          if (button && !button.disabled) close(true);
        }}
      >
        {children}
      </div>
    </div>
  );
}
