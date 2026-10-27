import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Profile } from "../lib/profiles.ts";
import { ProfileAvatar } from "./ProfileAvatar.tsx";
import { focusRing } from "./ui.tsx";

interface ProfileMenuProps {
  active: Profile;
  profiles: readonly Profile[];
  onEdit: () => void;
  onNew: () => void;
  onSwitch: (id: string) => void;
  onDelete: () => void;
  /** Focus the button when mounted (the app re-mounts after a profile switch). */
  autoFocus?: boolean;
}

const ITEM = `flex w-full min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus-visible:bg-slate-100 focus-visible:outline-2 focus-visible:outline-accent-600 dark:focus-visible:bg-slate-800 dark:focus-visible:outline-accent-400`;

const menuItems = (menu: HTMLElement | null): HTMLElement[] =>
  Array.from(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

/** Menu button (ARIA menu pattern): arrow keys move, Home/End jump, Esc closes and returns focus. */
export function ProfileMenu({ active, profiles, onEdit, onNew, onSwitch, onDelete, autoFocus = false }: ProfileMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");

  const items = () => menuItems(menuRef.current);

  useEffect(() => {
    if (autoFocus) buttonRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!open) return;
    const list = menuItems(menuRef.current);
    (focusOnOpen.current === "last" ? list[list.length - 1] : list[0])?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  /** Runs a menu action. Focus goes back to the menu button unless the action moves it itself. */
  const run = (action: () => void, refocus = false) => {
    close(refocus);
    action();
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusOnOpen.current = e.key === "ArrowUp" ? "last" : "first";
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case "ArrowDown":
        next = (i + 1) % list.length;
        break;
      case "ArrowUp":
        next = (i - 1 + list.length) % list.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = list.length - 1;
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${active.name}, profile menu`}
        onClick={() => {
          focusOnOpen.current = "first";
          setOpen((o) => !o);
        }}
        onKeyDown={onButtonKeyDown}
        className={`flex max-w-40 items-center gap-2 rounded-full p-0.5 pr-0.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 sm:pr-3 dark:text-slate-100 dark:hover:bg-slate-800 ${focusRing}`}
      >
        <ProfileAvatar profile={active} />
        <span className="hidden truncate sm:inline">{active.name}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Profile"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-40 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 px-3 py-2" role="presentation">
            <ProfileAvatar profile={active} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{active.name}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Saved on this device only</p>
            </div>
          </div>
          <div className="my-1 border-t border-slate-200 dark:border-slate-700" role="separator" />
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => run(onEdit)} className={`${ITEM} text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800`}>
            Edit profile
          </button>

          {profiles.length > 1 && (
            <>
              <div className="my-1 border-t border-slate-200 dark:border-slate-700" role="separator" />
              <div role="group" aria-labelledby={`${menuId}-switch`}>
                <p id={`${menuId}-switch`} className="px-3 pt-1 pb-0.5 text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400">
                  Switch profile
                </p>
                {profiles.map((p) => {
                  const current = p.id === active.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={current}
                      tabIndex={-1}
                      onClick={() => run(() => onSwitch(p.id), true)}
                      className={`${ITEM} text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800`}
                    >
                      <span aria-hidden="true" className="w-6 text-center text-lg">
                        {p.avatar}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {current && (
                        <span aria-hidden="true" className="text-accent-700 dark:text-accent-300">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="my-1 border-t border-slate-200 dark:border-slate-700" role="separator" />
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => run(onNew)} className={`${ITEM} text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800`}>
            New profile
          </button>
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => run(onDelete, true)} className={`${ITEM} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60`}>
            Delete profile
          </button>
        </div>
      )}
    </div>
  );
}
